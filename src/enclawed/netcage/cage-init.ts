// First process inside a network cage (see ./cage.ts). It runs as root of a
// fresh user namespace, in its own network, mount and PID namespaces, and:
//
//   1. brings up loopback and a dead-end interface (a dummy device with no
//      peer) that carries the default routes, so a packet for any host is
//      dropped inside this namespace;
//   2. makes the nameservers, a DNS sinkhole and the cloud credential
//      endpoints local, and listens there: a lookup is answered with the
//      sinkhole, so the connection that follows lands on a trap and shows
//      what it meant to send;
//   3. watches the dead-end interface, whose packet counter moves only when
//      something tries to leave, and the kernel's connection table, which
//      names the destination of each such TCP attempt;
//   4. hides the host's Unix sockets (Docker, D-Bus, WSL interop, tmux,
//      SSH agent), which would otherwise be a way out that needs no network;
//   5. relays the ports the caged command serves (a model server's API) to
//      Unix sockets the host connects to;
//   6. runs the command and exits with its status. As PID 1 of the cage, its
//      exit ends every process left inside.
//
// The kernel is what blocks: the namespace has no interface that leads off
// the machine, so nothing sent here can leave. The traps only report.
// Reports go as JSON lines to the host's event socket, connected before the
// host's sockets are hidden.

import { execFileSync, spawn } from "node:child_process";
import dgram from "node:dgram";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { dnsSinkholeAnswer, summarizeCapture } from "./sniff.js";

export type CageInitConfig = {
  command: string;
  args: string[];
  cwd?: string;
  /** Ports the command serves inside the cage, relayed to `${sockDir}/<port>.sock`. */
  expose: number[];
  sockDir: string;
  /** The host's event socket (inside sockDir). */
  eventSock: string;
  /** Directories scanned for Unix sockets to hide, besides /tmp. */
  socketScanRoots: string[];
};

export const SINKHOLE_IPV4 = "198.18.0.1";
// Addresses made local inside the cage so attempts on them are captured:
// the sinkhole, and the instance metadata endpoints that hand out cloud
// credentials (AWS/GCP/Azure/OCI, AWS ECS and IPv6, Alibaba Cloud).
export const TRAPPED_ADDRESSES = [
  "198.18.0.0/24",
  "169.254.169.254/32",
  "169.254.170.2/32",
  "100.100.100.200/32",
  "fd00:ec2::254/128",
];
const SINK_DEV = "enclawed-sink";
const POLL_MS = 100;
// Ephemeral ports for the cage's own loopback clients; never trapped.
export const CAGE_EPHEMERAL = [61000, 61999] as const;
const CAPTURE_BYTES = 4096;
const CAPTURE_MS = 1500;
// TCP attempts still being captured; the cage waits for them before exiting.
const inflight = new Set<() => void>();

// Ports an uploader or beacon is likely to use: every privileged port, plus
// the common high ones (proxies, alt-HTTP(S), brokers, databases, C2 kits).
const COMMON_HIGH = [
  1080, 1194, 1433, 1521, 1883, 2049, 2375, 2376, 3000, 3128, 3306, 3389, 4443, 4444, 5000, 5222,
  5432, 5555, 5671, 5672, 5900, 6000, 6379, 6443, 6667, 7000, 7443, 8000, 8008, 8080, 8081, 8088,
  8443, 8883, 8888, 9000, 9001, 9090, 9200, 9443, 10000, 11211, 27017, 50000, 50050, 51820,
];

export function trapPortList(exclude: Iterable<number>): number[] {
  const skip = new Set(exclude);
  const out: number[] = [];
  const add = (p: number) => {
    if (!skip.has(p) && !(p >= CAGE_EPHEMERAL[0] && p <= CAGE_EPHEMERAL[1])) {
      out.push(p);
    }
  };
  for (let p = 1; p <= 1023; p++) {
    add(p);
  }
  COMMON_HIGH.forEach(add);
  return out;
}

// Environment entries that point at a way out of the cage that is not the
// network: agents, buses, interop, container engines, proxies.
const SCRUBBED_ENV = [
  "SSH_AUTH_SOCK",
  "GPG_AGENT_INFO",
  "DBUS_SESSION_BUS_ADDRESS",
  "DBUS_SYSTEM_BUS_ADDRESS",
  "WSL_INTEROP",
  "DOCKER_HOST",
  "CONTAINER_HOST",
  "TMUX",
  "WAYLAND_DISPLAY",
  "PULSE_SERVER",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
];

export function scrubCageEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out = { ...env };
  for (const k of SCRUBBED_ENV) {
    delete out[k];
  }
  delete out.ENCLAWED_NETCAGE;
  return out;
}

type Emit = (event: Record<string, unknown>) => void;

type Emitter = { emit: Emit; close: () => Promise<void> };

async function connectEmitter(sockPath: string): Promise<Emitter> {
  const sock = await new Promise<net.Socket | null>((resolve) => {
    const s = net.connect(sockPath);
    s.once("connect", () => resolve(s));
    s.once("error", () => resolve(null));
  });
  if (!sock) {
    process.stderr.write("enclawed netcage: no event socket; blocking without reporting\n");
    return { emit: () => {}, close: async () => {} };
  }
  let open = true;
  sock.on("error", () => {
    open = false; // host went away; the cage still blocks, it just stops reporting
  });
  return {
    emit: (event) => {
      if (open) {
        sock.write(`${JSON.stringify({ ...event, at: new Date().toISOString() })}\n`);
      }
    },
    close: () => new Promise((resolve) => (open ? sock.end(() => resolve()) : resolve())),
  };
}

function run(cmd: string, args: string[]): boolean {
  try {
    execFileSync(cmd, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Nameserver addresses from resolv.conf text. */
export function parseNameservers(resolvConf: string): string[] {
  const out: string[] = [];
  for (const line of resolvConf.split("\n")) {
    const m = /^\s*nameserver\s+([0-9a-fA-F.:]+)(?:%\S+)?\s*$/.exec(line);
    if (m && net.isIP(m[1])) {
      out.push(m[1]);
    }
  }
  return out;
}

function setUpNetwork(emit: Emit): { watching: boolean; local: Set<string> } {
  let nameservers: string[] = [];
  try {
    nameservers = parseNameservers(fs.readFileSync("/etc/resolv.conf", "utf8"));
  } catch {
    /* no resolv.conf: lookups go to the default nameserver, 127.0.0.1 */
  }
  const ok =
    run("ip", ["link", "set", "lo", "up"]) &&
    run("ip", ["link", "add", SINK_DEV, "type", "dummy"]) &&
    run("ip", ["link", "set", SINK_DEV, "up"]) &&
    run("ip", ["addr", "add", "10.199.0.1/30", "dev", SINK_DEV]) &&
    run("ip", ["neigh", "add", "10.199.0.2", "lladdr", "02:00:00:00:00:02", "dev", SINK_DEV]) &&
    run("ip", ["route", "add", "default", "via", "10.199.0.2", "dev", SINK_DEV]);
  if (ok) {
    run("ip", ["-6", "addr", "add", "fd99::1/64", "dev", SINK_DEV, "nodad"]);
    run("ip", ["-6", "neigh", "add", "fd99::2", "lladdr", "02:00:00:00:00:02", "dev", SINK_DEV]);
    run("ip", ["-6", "route", "add", "default", "via", "fd99::2", "dev", SINK_DEV]);
    for (const cidr of [...TRAPPED_ADDRESSES, ...nameservers]) {
      const v6 = cidr.includes(":");
      run("ip", [...(v6 ? ["-6"] : []), "route", "add", "local", cidr, "dev", "lo"]);
    }
  }
  try {
    fs.writeFileSync(
      "/proc/sys/net/ipv4/ip_local_port_range",
      `${CAGE_EPHEMERAL[0]} ${CAGE_EPHEMERAL[1]}`,
    );
  } catch {
    /* default range: those ports are simply not trapped */
  }
  if (!ok) {
    // Without iproute2 the namespace has no interface at all: still nothing
    // can leave, but attempts fail before they can be seen, so say so.
    emit({
      type: "notice",
      message: "network cage is blocking but cannot record attempts (iproute2 missing)",
    });
  }
  return { watching: ok, local: new Set(nameservers) };
}

/** Transmitted-packet count of an interface, from /proc/net/dev text. */
export function txPackets(procNetDev: string, dev: string): number | null {
  for (const line of procNetDev.split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0 && line.slice(0, idx).trim() === dev) {
      const cols = line
        .slice(idx + 1)
        .trim()
        .split(/\s+/);
      const n = Number(cols[9]);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

function hexToIp(hex: string): string {
  if (hex.length === 8) {
    const b = Buffer.from(hex, "hex");
    return `${b[3]}.${b[2]}.${b[1]}.${b[0]}`;
  }
  // IPv6: four little-endian 32-bit words.
  const words = hex.match(/.{8}/g) ?? [];
  const bytes = Buffer.concat(words.map((w) => Buffer.from(Buffer.from(w, "hex").toReversed())));
  const groups = bytes.toString("hex").match(/.{4}/g) ?? [];
  if (groups.slice(0, 5).every((g) => g === "0000") && groups[5] === "ffff") {
    return hexToIp(hex.slice(24)); // IPv4-mapped
  }
  // The URL parser prints the canonical compressed form ("::1"), the form
  // the local-address checks compare against.
  try {
    return new URL(`http://[${groups.join(":")}]/`).hostname.slice(1, -1);
  } catch {
    return groups.join(":");
  }
}

/**
 * Remote endpoints of sockets that are connecting or connected to an
 * address off the machine, from /proc/net/{tcp,tcp6,udp,udp6} text. A socket
 * whose peer is local (loopback, or an address the cage made local) is not
 * an attempt to leave and is skipped by the caller's `isLocal`.
 */
export function remoteEndpoints(
  procNetText: string,
  isLocal: (ip: string) => boolean,
): { dst: string; port: number; inode: string }[] {
  const out: { dst: string; port: number; inode: string }[] = [];
  for (const line of procNetText.split("\n").slice(1)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 10) {
      continue;
    }
    const [hex, portHex] = (cols[2] ?? "").split(":");
    if (!hex || !portHex) {
      continue;
    }
    const port = parseInt(portHex, 16);
    if (port === 0) {
      continue; // listening or unconnected
    }
    const dst = hexToIp(hex);
    if (!isLocal(dst)) {
      out.push({ dst, port, inode: cols[9] });
    }
  }
  return out;
}

function isCageLocal(ip: string, extra: Set<string>): boolean {
  if (extra.has(ip)) {
    return true;
  }
  if (ip === "::1" || ip.startsWith("127.") || ip === "0.0.0.0" || ip === "::") {
    return true;
  }
  if (ip.startsWith("198.18.0.") || ip.startsWith("10.199.0.")) {
    return true;
  }
  return ["169.254.169.254", "169.254.170.2", "100.100.100.200", "fd00:ec2::254"].includes(ip);
}

// Report every attempt that reached the dead-end interface. Each TCP attempt
// is named from the connection table (a connect to nowhere waits for its
// answer for seconds, so a 100 ms poll sees it); a packet with no TCP socket
// behind it (UDP sendto, ICMP, raw IP) is reported from the counter alone.
function watchSink(emit: Emit, local: Set<string>): () => void {
  const read = (p: string) => {
    try {
      return fs.readFileSync(p, "utf8");
    } catch {
      return "";
    }
  };
  let last = txPackets(read("/proc/net/dev"), SINK_DEV) ?? 0;
  const reported = new Set<string>();
  const tick = () => {
    const tx = txPackets(read("/proc/net/dev"), SINK_DEV) ?? last;
    if (tx === last) {
      return;
    }
    const packets = tx - last;
    last = tx;
    // A pending TCP attempt resends its SYN at most once per poll (its
    // retransmit timer starts at a second), so each one explains at most one
    // new packet; a connected UDP socket may explain any number. Packets left
    // unexplained (unconnected UDP, ICMP, raw IP) are reported by count.
    let explained = 0;
    for (const [file, transport] of [
      ["/proc/net/tcp", "tcp"],
      ["/proc/net/tcp6", "tcp"],
      ["/proc/net/udp", "udp"],
      ["/proc/net/udp6", "udp"],
    ] as const) {
      for (const ep of remoteEndpoints(read(file), (ip) => isCageLocal(ip, local))) {
        explained += transport === "tcp" ? 1 : Number.POSITIVE_INFINITY;
        const key = `${transport}:${ep.inode}:${ep.dst}:${ep.port}`;
        if (reported.has(key)) {
          continue;
        }
        reported.add(key);
        emit({
          type: "attempt",
          transport,
          dst: ep.dst,
          port: ep.port,
          bytes: 0,
          protocol: "unknown",
          name: null,
          request: null,
          sample: "",
        });
      }
    }
    if (packets > explained) {
      emit({
        type: "attempt",
        transport: "ip",
        dst: null,
        port: 0,
        bytes: 0,
        packets: packets - explained,
        protocol: "unknown",
        name: null,
        request: null,
        sample: "",
      });
    }
  };
  const timer = setInterval(tick, POLL_MS);
  timer.unref();
  return () => {
    tick();
    clearInterval(timer);
  };
}

// Hide host Unix sockets reachable through the shared filesystem: a private
// /run (and /dev/shm, WSLg), and every socket file under /tmp and the scan
// roots covered by /dev/null.
export function findSocketFiles(roots: string[], limit = 50_000): string[] {
  const found: string[] = [];
  let seen = 0;
  const walk = (dir: string, depth: number) => {
    if (depth < 0 || seen > limit) {
      return;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      seen++;
      const p = path.join(dir, e.name);
      if (e.isSocket()) {
        found.push(p);
      } else if (e.isDirectory() && e.name !== "node_modules" && e.name !== ".git") {
        walk(p, depth - 1);
      }
    }
  };
  for (const r of roots) {
    walk(r, 4);
  }
  return found;
}

function hideHostSockets(cfg: CageInitConfig, emit: Emit): void {
  for (const dir of ["/run", "/dev/shm", "/mnt/wslg"]) {
    if (fs.existsSync(dir) && !run("mount", ["-t", "tmpfs", "-o", "mode=755", "tmpfs", dir])) {
      emit({ type: "notice", message: `could not hide ${dir}` });
    }
  }
  const xdg = process.env.XDG_RUNTIME_DIR;
  const roots = ["/tmp", ...cfg.socketScanRoots, ...(xdg && !xdg.startsWith("/run/") ? [xdg] : [])];
  const own = path.resolve(cfg.sockDir);
  for (const sock of findSocketFiles(roots)) {
    if (path.dirname(path.resolve(sock)) === own) {
      continue;
    }
    if (!run("mount", ["--bind", "/dev/null", sock])) {
      emit({ type: "notice", message: `could not hide socket ${sock}` });
    }
  }
}

function startTraps(ports: number[], emit: Emit): Promise<void> {
  const pending: Promise<void>[] = [];
  for (const port of ports) {
    pending.push(
      new Promise((resolve) => {
        const server = net.createServer((sock) => {
          const dst = sock.localAddress?.replace(/^::ffff:/, "") ?? "";
          const chunks: Buffer[] = [];
          let size = 0;
          let done = false;
          const finish = () => {
            if (done) {
              return;
            }
            done = true;
            inflight.delete(finish);
            const sample = Buffer.concat(chunks).subarray(0, CAPTURE_BYTES);
            emit({
              type: "attempt",
              transport: "tcp",
              dst,
              port,
              bytes: size,
              ...summarizeCapture(sample, "tcp", port),
              sample: sample.toString("base64"),
            });
            sock.destroy();
          };
          inflight.add(finish);
          sock.on("data", (d: Buffer) => {
            size += d.length;
            if (Buffer.concat(chunks).length < CAPTURE_BYTES) {
              chunks.push(d);
            }
            if (size >= CAPTURE_BYTES) {
              finish();
            }
          });
          sock.on("error", finish);
          sock.on("end", finish);
          setTimeout(finish, CAPTURE_MS).unref();
        });
        server.on("error", () => resolve());
        server.listen({ port, host: "::", ipv6Only: false, backlog: 16 }, () => resolve());
      }),
    );
    pending.push(
      new Promise((resolve) => {
        const udp = dgram.createSocket({ type: "udp6", ipv6Only: false });
        udp.on("error", () => resolve());
        udp.on("message", (msg, rinfo) => {
          const summary = summarizeCapture(msg, "udp", port);
          emit({
            type: "attempt",
            transport: "udp",
            dst: null,
            port,
            bytes: msg.length,
            ...summary,
            sample: msg.subarray(0, CAPTURE_BYTES).toString("base64"),
          });
          // Answer DNS with the sinkhole so the follow-up connection is
          // trapped too and shows its payload.
          if (summary.protocol === "dns") {
            const answer = dnsSinkholeAnswer(msg, SINKHOLE_IPV4);
            if (answer) {
              udp.send(answer, rinfo.port, rinfo.address);
            }
          }
        });
        udp.bind({ port, address: "::" }, () => resolve());
      }),
    );
  }
  return Promise.all(pending).then(() => undefined);
}

function startRelays(cfg: CageInitConfig): Promise<void> {
  return Promise.all(
    cfg.expose.map(
      (port) =>
        new Promise<void>((resolve, reject) => {
          const sockPath = path.join(cfg.sockDir, `${port}.sock`);
          fs.rmSync(sockPath, { force: true });
          const server = net.createServer((client) => {
            const upstream = net.connect(port, "127.0.0.1");
            client.pipe(upstream).pipe(client);
            const close = () => {
              client.destroy();
              upstream.destroy();
            };
            client.on("error", close);
            upstream.on("error", close);
          });
          server.on("error", reject);
          server.listen(sockPath, () => resolve());
        }),
    ),
  ).then(() => undefined);
}

export async function cageInit(cfg: CageInitConfig): Promise<{ code: number; emitter: Emitter }> {
  const emitter = await connectEmitter(cfg.eventSock);
  const emit = emitter.emit;
  const { watching, local } = setUpNetwork(emit);
  // Relay sockets first: their listening descriptors outlive the mounts
  // that hide the host's sockets.
  await startRelays(cfg);
  hideHostSockets(cfg, emit);
  await startTraps(trapPortList(cfg.expose), emit);
  const stopWatch = watching ? watchSink(emit, local) : () => {};
  emit({ type: "ready" });

  const child = spawn(cfg.command, cfg.args, {
    cwd: cfg.cwd,
    env: scrubCageEnv(process.env),
    stdio: ["inherit", "inherit", "inherit"],
  });
  for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"] as const) {
    process.on(sig, () => child.kill(sig));
  }
  const code = await new Promise<number>((resolve) => {
    child.on("error", (err) => {
      process.stderr.write(`enclawed netcage: ${err.message}\n`);
      resolve(127);
    });
    child.on("exit", (c, signal) =>
      resolve(c ?? (signal ? 128 + (os.constants.signals[signal] ?? 0) : 1)),
    );
  });
  stopWatch();
  return { code, emitter };
}

// Entry point when run as a script by the host (config in ENCLAWED_NETCAGE).
const raw = process.env.ENCLAWED_NETCAGE;
if (raw && process.argv[1] && path.basename(process.argv[1]).startsWith("cage-init")) {
  cageInit(JSON.parse(raw) as CageInitConfig).then(
    async ({ code, emitter }) => {
      // Report attempts still being captured before PID 1 exits.
      // Snapshot: finish() deletes from the set as it runs.
      for (const finish of Array.from(inflight)) {
        finish();
      }
      await emitter.close();
      process.exit(code);
    },
    (err: unknown) => {
      process.stderr.write(
        `enclawed netcage: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      process.exit(126);
    },
  );
}
