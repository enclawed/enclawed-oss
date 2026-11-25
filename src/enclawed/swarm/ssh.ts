// Reaching a swarm on a cluster through SSH alone.
//
// Regulated sites expose one thing: SSH on the login nodes, often behind a
// bastion and two-factor authentication, often with port forwarding turned
// off. So nothing here forwards a port. The operator authenticates once; that
// connection becomes an OpenSSH control master, and every later session rides
// on it without logging in again. Each swarm peer is one such session running
// `swarm relay` on the login node, which pipes its stdin and stdout to one
// address the swarm directory lists (a coordinator, or the declared model
// endpoint) and nothing else.
//
// Authentication is entirely the site's and the operator's ssh configuration:
// the one interactive login runs plain ssh in the operator's terminal, with no
// authentication option overridden, so a PIN plus a token code, a password
// plus a one-time code, keyboard-interactive prompts, security keys, smart
// cards (PKCS#11) and certificates all work as they do by hand. Sites that
// need a Kerberos ticket first get one: with `kerberos` set, attach runs kinit
// in the terminal when klist finds no valid ticket, then logs in with GSSAPI,
// and forwards the ticket only when the site requires it (forwardTicket).
//
// The master listens on the ControlPath the operator's ssh configuration
// already names for that host (read with ssh -G), so the agent's own plain
// `ssh login1 sbatch ...` commands ride the same authenticated session and
// never prompt. Without one, a private path is used and attach prints the
// lines to add.

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { Duplex, type Readable, type Writable } from "node:stream";
import type { HostPort } from "./daemon.js";
import type { StreamDialer } from "./net.js";

export type SshTargetOptions = {
  /** user@host of the login node. */
  host: string;
  /** Bastion hosts, as for ssh -J. */
  jump?: string;
  /** The ssh client; tests substitute a stand-in. */
  sshBin?: string;
  /** How to run the swarm command on the login node, e.g. ["enclawed", "swarm"]. */
  remoteSwarm: string[];
  /** The swarm directory on the cluster. */
  remoteDir: string;
  /** Sites that need a Kerberos ticket before ssh. */
  kerberos?: { principal?: string; forwardTicket?: boolean };
  /** Kerberos tools; tests substitute stand-ins. */
  klistBin?: string;
  kinitBin?: string;
};

/** A private, short control socket path; ssh expands %C per user, host and port. */
function privateControlPath(): string {
  const dir = path.join(
    process.env.XDG_RUNTIME_DIR ?? "/tmp",
    `enclawed-${process.getuid?.() ?? "u"}`,
  );
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return path.join(dir, "cm-%C");
}

const controlPaths = new Map<string, { path: string; fromUserConfig: boolean }>();

/**
 * The control socket for this host: the one the operator's ssh configuration
 * names, so their own ssh commands share the session, else a private one.
 */
export async function resolveControlPath(
  o: SshTargetOptions,
): Promise<{ path: string; fromUserConfig: boolean }> {
  const cached = controlPaths.get(o.host);
  if (cached) {
    return cached;
  }
  const g = await run(o.sshBin ?? "ssh", ["-G", ...(o.jump ? ["-J", o.jump] : []), o.host], false);
  const line = g.out.split("\n").find((l) => /^controlpath\s/i.test(l));
  const configured = line?.replace(/^controlpath\s+/i, "").trim();
  const resolved =
    g.code === 0 && configured && configured.toLowerCase() !== "none"
      ? { path: configured, fromUserConfig: true }
      : { path: privateControlPath(), fromUserConfig: false };
  controlPaths.set(o.host, resolved);
  return resolved;
}

export function controlPath(host: string): string {
  return controlPaths.get(host)?.path ?? privateControlPath();
}

/** The lines that make the operator's own ssh commands share the session. */
export function controlPathSnippet(o: SshTargetOptions): string {
  const host = o.host.replace(/^.*@/, "");
  return [
    `Host ${host}`,
    `    ControlPath ${privateControlPath()}`,
    "    ControlMaster auto",
    "    ControlPersist 8h",
  ].join("\n");
}

/** Options for every session that rides on the master: no forwarding of any kind. */
function sessionArgs(o: SshTargetOptions): string[] {
  return [
    "-o",
    `ControlPath=${controlPath(o.host)}`,
    "-o",
    "ControlMaster=no",
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=yes",
    "-o",
    "ClearAllForwardings=yes",
    "-a",
    "-x",
    ...(o.jump ? ["-J", o.jump] : []),
  ];
}

/** POSIX single-quoting, for the command string the remote shell will parse. */
export function shq(s: string): string {
  return /^[A-Za-z0-9_./:=@%+-]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`;
}

function remoteCommand(o: SshTargetOptions, args: string[]): string {
  return [...o.remoteSwarm, ...args].map(shq).join(" ");
}

function run(
  bin: string,
  args: string[],
  interactive: boolean,
): Promise<{ code: number; out: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      stdio: interactive ? "inherit" : ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout?.on("data", (d: Buffer) => {
      out += d.toString("utf8");
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code: code ?? 1, out }));
  });
}

/** Whether a control master to this host is already up (never prompts). */
export async function masterRunning(o: SshTargetOptions): Promise<boolean> {
  const cp = await resolveControlPath(o);
  const r = await run(
    o.sshBin ?? "ssh",
    ["-o", `ControlPath=${cp.path}`, "-O", "check", o.host],
    false,
  );
  return r.code === 0;
}

/** Gets a Kerberos ticket first when the site needs one and there is none. */
async function ensureKerberos(o: SshTargetOptions): Promise<void> {
  if (!o.kerberos) {
    return;
  }
  const valid = await run(o.klistBin ?? "klist", ["-s"], false).catch(() => ({ code: 1, out: "" }));
  if (valid.code === 0) {
    return;
  }
  // kinit prompts for the password (or drives a token) in the terminal.
  const k = await run(
    o.kinitBin ?? "kinit",
    o.kerberos.principal ? [o.kerberos.principal] : [],
    true,
  );
  if (k.code !== 0) {
    throw new Error(`kinit failed (exit ${k.code}); no Kerberos ticket for ${o.host}`);
  }
}

/**
 * Makes sure a control master is up, starting one if needed. Starting it is
 * the one interactive step: the site's login prompts (password, token code,
 * security key touch, host key) happen here, in the operator's terminal. It
 * returns where the master listens and whether that came from the operator's
 * ssh configuration.
 */
export async function ensureMaster(
  o: SshTargetOptions,
): Promise<{ path: string; fromUserConfig: boolean }> {
  const bin = o.sshBin ?? "ssh";
  const cp = await resolveControlPath(o);
  const check = await run(bin, ["-o", `ControlPath=${cp.path}`, "-O", "check", o.host], false);
  if (check.code === 0) {
    return cp;
  }
  await ensureKerberos(o);
  const start = await run(
    bin,
    [
      "-M",
      "-o",
      `ControlPath=${cp.path}`,
      "-o",
      "ControlPersist=8h",
      "-o",
      "StrictHostKeyChecking=yes",
      "-o",
      "ClearAllForwardings=yes",
      ...(o.kerberos ? ["-o", "GSSAPIAuthentication=yes"] : []),
      ...(o.kerberos?.forwardTicket ? ["-o", "GSSAPIDelegateCredentials=yes"] : []),
      "-a",
      "-x",
      "-N",
      "-f",
      ...(o.jump ? ["-J", o.jump] : []),
      o.host,
    ],
    true,
  );
  if (start.code !== 0) {
    throw new Error(`ssh to ${o.host} failed (exit ${start.code})`);
  }
  return cp;
}

const lastEndedWarning = new Map<string, number>();

/** Said once a minute at most: the swarm cannot reach the cluster until attach runs again. */
function warnSessionEnded(o: SshTargetOptions): void {
  const now = Date.now();
  if (now - (lastEndedWarning.get(o.host) ?? 0) < 60_000) {
    return;
  }
  lastEndedWarning.set(o.host, now);
  process.stderr.write(
    `enclawed: the SSH session to ${o.host} has ended or was never opened. ` +
      `Run \`enclawed swarm attach --ssh ${o.host}\` in a terminal; until then no lease ` +
      "is renewed through it, and ranks that depend on it pause.\n",
  );
}

/** Runs `swarm <args>` on the login node and returns its stdout. */
export async function remoteSwarmOutput(o: SshTargetOptions, args: string[]): Promise<string> {
  const r = await run(
    o.sshBin ?? "ssh",
    [...sessionArgs(o), o.host, remoteCommand(o, args)],
    false,
  );
  if (r.code !== 0) {
    throw new Error(`remote swarm ${args[0]} failed (exit ${r.code})`);
  }
  return r.out;
}

/** One duplex stream over a child's stdout (in) and stdin (out). */
class ChildStream extends Duplex {
  constructor(
    private readonly input: Readable,
    private readonly output: Writable,
  ) {
    super();
    input.on("data", (chunk: Buffer) => {
      if (!this.push(chunk)) {
        input.pause();
      }
    });
    input.on("end", () => this.push(null));
    output.on("error", () => this.destroy());
  }
  override _read(): void {
    this.input.resume();
  }
  override _write(chunk: Buffer, _enc: BufferEncoding, cb: (err?: Error | null) => void): void {
    this.output.write(chunk, cb);
  }
  override _final(cb: (err?: Error | null) => void): void {
    this.output.end(cb);
  }
}

/** A stream to `target` on the cluster, through an SSH session running swarm relay. */
export function sshStream(o: SshTargetOptions, target: "coordinator" | "model", index = 0): Duplex {
  const args = [
    "relay",
    "--dir",
    o.remoteDir,
    target === "model" ? "--model" : "--index",
    ...(target === "model" ? [] : [String(index)]),
  ];
  const child = spawn(o.sshBin ?? "ssh", [...sessionArgs(o), o.host, remoteCommand(o, args)], {
    stdio: ["pipe", "pipe", "ignore"],
  });
  const stream = new ChildStream(child.stdout, child.stdin);
  child.on("exit", (code) => {
    // 255 is ssh's own failure: here, almost always no master to ride on.
    if (code === 255) {
      warnSessionEnded(o);
    }
    stream.destroy();
  });
  child.on("error", () => stream.destroy());
  stream.on("close", () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
    }
  });
  return stream;
}

export function sshDialers(o: SshTargetOptions, coordinators: number): StreamDialer[] {
  return Array.from({ length: coordinators }, (_, i) => ({
    key: `${o.host}#${i}`,
    open: () => sshStream(o, "coordinator", i),
  }));
}

/**
 * A loopback listener on the laptop for a model server inside the cluster:
 * each connection becomes one SSH session to `swarm relay --model`. Local
 * tools talk to 127.0.0.1:port as if the model ran here.
 */
export async function bridgeModel(o: SshTargetOptions, listen: HostPort): Promise<net.Server> {
  const server = net.createServer((sock) => {
    const remote = sshStream(o, "model");
    sock.pipe(remote).pipe(sock);
    const end = () => {
      sock.destroy();
      remote.destroy();
    };
    sock.on("close", end);
    remote.on("close", end);
    sock.on("error", end);
    remote.on("error", end);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(listen.port, listen.host === "localhost" ? "127.0.0.1" : listen.host, () =>
      resolve(),
    );
  });
  return server;
}
