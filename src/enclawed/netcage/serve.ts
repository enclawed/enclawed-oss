// `enclawed netcage serve -- <model server>`: run a local model server
// (ollama, llama.cpp, vLLM, LM Studio) so it serves its API to this machine
// but cannot itself reach the network. This is the Z.ai / ZCode case — a tool
// that silently uploaded a workspace — applied to the server process: the
// model answers requests and never phones home.
//
// The server runs in a network cage. Its API port is served back to the host
// at the SAME 127.0.0.1:<port> the provider config already expects: the cage
// relays the port to a Unix socket, and this host side forwards 127.0.0.1:
// <port> to that socket. So `enclawed config` needs no change. Every attempt
// the server makes to reach anything else is dropped by the kernel and
// reported, exactly as for exec commands.

import net from "node:net";
import { createNetCageReporter, type NetCageAlert } from "./alert.js";
import { netCageSupport, openNetCage } from "./cage.js";

export type ServeOptions = {
  /** API ports the server listens on inside the cage, served back on the host. */
  ports: number[];
  command: string;
  args: string[];
  cwd?: string;
  label?: string;
  onAlert?: (alert: NetCageAlert) => void;
  /** Defaults to process.stderr. */
  log?: (line: string) => void;
};

export type ServeHandle = {
  /** Resolves with the server's exit code once it stops. */
  done: Promise<number>;
  /** Stop the server and tear the cage down. */
  stop: () => Promise<void>;
  /** Blocked-egress destinations with their counts, for a final report. */
  summary: () => string[];
};

// Forward 127.0.0.1:<port> on the host to the cage's Unix socket for that port.
function forwardPortToSocket(port: number, sockPath: string): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const server = net.createServer((client) => {
      const upstream = net.connect(sockPath);
      const close = () => {
        client.destroy();
        upstream.destroy();
      };
      client.pipe(upstream).on("error", close);
      upstream.pipe(client).on("error", close);
      client.on("error", close);
      upstream.on("error", close);
    });
    server.on("error", reject);
    // Loopback only: the host reaches the model, the LAN does not.
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

export async function serveCaged(opts: ServeOptions): Promise<ServeHandle> {
  const support = netCageSupport();
  if (!support.ok) {
    throw new Error(`enclawed netcage serve: ${support.reason}`);
  }
  const log = opts.log ?? ((line) => process.stderr.write(`${line}\n`));
  const label = opts.label ?? opts.command;
  const reporter = createNetCageReporter({
    source: "model-server",
    label,
    notify: (alert) => {
      log(`[enclawed] ${alert.message}`);
      opts.onAlert?.(alert);
    },
  });
  const cage = await openNetCage({ expose: opts.ports, onEvent: reporter.onEvent });

  // Host forwarders first, so the port is reachable the moment the server binds.
  const forwarders: net.Server[] = [];
  try {
    for (const port of opts.ports) {
      forwarders.push(await forwardPortToSocket(port, cage.exposedSocket(port)));
      log(`[enclawed] model server reachable at http://127.0.0.1:${port} (caged)`);
    }
  } catch (err) {
    for (const f of forwarders) {
      f.close();
    }
    await cage.close();
    throw err;
  }

  const { spawn } = await import("node:child_process");
  const { argv, env } = cage.wrap(opts.command, opts.args, opts.cwd);
  // `detached` puts the cage in its own process group, so stop() can signal
  // the whole tree (unshare + the namespace's PID 1 + the server) at once —
  // the server runs in its own PID namespace and is not individually killable
  // from the host by PID.
  const child = spawn(argv[0], argv.slice(1), {
    env: { ...process.env, ...env },
    stdio: ["inherit", "inherit", "inherit"],
    detached: true,
  });
  const killGroup = (signal: NodeJS.Signals) => {
    try {
      if (child.pid !== undefined) {
        process.kill(-child.pid, signal);
      }
    } catch {
      /* already gone */
    }
  };

  let stopped = false;
  const teardown = async () => {
    for (const f of forwarders) {
      f.close();
    }
    await cage.close();
    const repeats = reporter.summary().filter((l) => !l.startsWith("1 × "));
    if (repeats.length > 0) {
      log(`[enclawed] ${label} was blocked from the network repeatedly: ${repeats.join("; ")}`);
    }
  };

  const done = new Promise<number>((resolve) => {
    child.on("error", (err) => {
      log(`[enclawed] model server failed to start: ${err.message}`);
      resolve(127);
    });
    child.on("exit", async (code, signal) => {
      await teardown();
      resolve(code ?? (signal ? 1 : 0));
    });
  });

  return {
    done,
    stop: async () => {
      if (stopped) {
        return;
      }
      stopped = true;
      killGroup("SIGTERM");
      // Escalate if the server ignores SIGTERM.
      const forced = setTimeout(() => killGroup("SIGKILL"), 2000);
      forced.unref();
      await done;
      clearTimeout(forced);
    },
    summary: reporter.summary,
  };
}
