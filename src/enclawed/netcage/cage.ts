// Network cage: run a command so that nothing it does can reach the network,
// and report every attempt it makes. Used for the shell commands a model asks
// the exec tool to run, and for a local model server (`enclawed netcage
// serve`). The model may produce output and ask for a request; Enclawed makes
// the request, through its own checks. What the model runs never connects.
//
// Linux only: an unprivileged user namespace with its own network, mount and
// PID namespaces (`unshare`, util-linux). The cage's first process is
// ./cage-init.ts; it reports attempts over a Unix socket in a private
// directory that this side listens on.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CageInitConfig } from "./cage-init.js";

export type NetCageAttempt = {
  type: "attempt";
  /** "ip" when only the dead-end interface's packet counter saw it. */
  transport: "tcp" | "udp" | "ip";
  /** Destination address, when the kernel kept it (TCP). */
  dst: string | null;
  port: number;
  bytes: number;
  /** Packets counted on the dead-end interface (transport "ip"). */
  packets?: number;
  protocol: "dns" | "tls" | "http" | "unknown";
  /** The name it tried to reach (DNS question, TLS server name, HTTP Host). */
  name: string | null;
  request: string | null;
  /** First bytes sent, base64. */
  sample: string;
  at: string;
};

export type NetCageEvent =
  | NetCageAttempt
  | { type: "ready"; at: string }
  | { type: "notice"; message: string; at: string };

export type NetCageSupport = { ok: true } | { ok: false; reason: string };

let support: NetCageSupport | null = null;

/** Whether this host can cage a process (cached after the first probe). */
export function netCageSupport(): NetCageSupport {
  if (support) {
    return support;
  }
  if (process.platform !== "linux") {
    support = {
      ok: false,
      reason: `network cage needs Linux namespaces (platform ${process.platform})`,
    };
    return support;
  }
  const probe = spawnSync("unshare", [...UNSHARE_FLAGS, "true"], {
    stdio: "ignore",
    timeout: 10_000,
  });
  support =
    probe.status === 0
      ? { ok: true }
      : {
          ok: false,
          reason:
            probe.error && (probe.error as NodeJS.ErrnoException).code === "ENOENT"
              ? "unshare (util-linux) is not installed"
              : "unprivileged user namespaces are disabled on this host",
        };
  return support;
}

/** For tests: forget the cached probe. */
export function resetNetCageSupportForTest(): void {
  support = null;
}

const UNSHARE_FLAGS = [
  "--user",
  "--map-root-user",
  "--net",
  "--mount",
  "--pid",
  "--fork",
  "--mount-proc",
  "--kill-child",
];

// How to run ./cage-init: the built file in an installed package (its dist
// entry is enclawed/netcage/cage-init.js), the TypeScript source (through
// tsx) in a checkout.
function cageInitCommand(): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const roots = [here, path.join(here, ".."), path.join(here, "..", "..")];
  const relatives = ["cage-init.js", path.join("enclawed", "netcage", "cage-init.js")];
  for (const root of roots) {
    for (const rel of relatives) {
      const c = path.join(root, rel);
      if (fs.existsSync(c)) {
        return [process.execPath, c];
      }
    }
  }
  const src = path.join(here, "cage-init.ts");
  if (fs.existsSync(src)) {
    return [process.execPath, "--import", fileURLToPath(import.meta.resolve("tsx")), src];
  }
  throw new Error("enclawed netcage: cage-init is missing from this install");
}

export type NetCage = {
  /** argv and env that run `command args` inside the cage. */
  wrap(
    command: string,
    args: string[],
    cwd?: string,
  ): { argv: string[]; env: Record<string, string> };
  /** The Unix socket the host connects to for a port the caged command serves. */
  exposedSocket(port: number): string;
  /** Stop listening for reports and remove the private directory. */
  close(): Promise<void>;
};

/**
 * Set up the host side of a cage: a private directory with the event socket
 * that cage-init reports to. One NetCage can wrap one command.
 */
export async function openNetCage(opts: {
  expose?: number[];
  /** Extra directories to clear of Unix sockets (the home directory by default). */
  socketScanRoots?: string[];
  onEvent: (event: NetCageEvent) => void;
}): Promise<NetCage> {
  const sup = netCageSupport();
  if (!sup.ok) {
    throw new Error(`enclawed netcage: ${sup.reason}`);
  }
  const sockDir = fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-netcage-"));
  fs.chmodSync(sockDir, 0o700);
  const eventSock = path.join(sockDir, "events.sock");
  const conns = new Set<net.Socket>();
  const server = net.createServer((sock) => {
    conns.add(sock);
    let buf = "";
    sock.setEncoding("utf8");
    sock.on("data", (chunk: string) => {
      buf += chunk;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        let event: NetCageEvent;
        try {
          event = JSON.parse(line) as NetCageEvent;
        } catch {
          continue; // a caged process cannot reach this socket; still, never crash on input
        }
        try {
          opts.onEvent(event);
        } catch {
          /* a failing reporter must not stop the next report */
        }
      }
    });
    sock.on("error", () => {});
    sock.on("close", () => conns.delete(sock));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(eventSock, () => resolve());
  });
  const init = cageInitCommand();
  return {
    wrap(command, args, cwd) {
      const cfg: CageInitConfig = {
        command,
        args,
        cwd,
        expose: opts.expose ?? [],
        sockDir,
        eventSock,
        socketScanRoots: opts.socketScanRoots ?? [os.homedir()],
      };
      return {
        argv: ["unshare", ...UNSHARE_FLAGS, ...init],
        env: { ENCLAWED_NETCAGE: JSON.stringify(cfg) },
      };
    },
    exposedSocket(port) {
      return path.join(sockDir, `${port}.sock`);
    },
    async close() {
      // Let reports already sent arrive before closing.
      await new Promise((r) => setTimeout(r, 50));
      for (const c of conns) {
        c.destroy();
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
      fs.rmSync(sockDir, { recursive: true, force: true });
    },
  };
}

/** Quote one argument for a POSIX shell. */
export function shellQuote(arg: string): string {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`;
}
