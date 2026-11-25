// First process inside a containment (see ./host.ts). Runs as root of a
// fresh user namespace with its own network, mount and PID namespaces, set
// up exactly like the network cage (../netcage/cage-init.ts), and then:
//
//   1. network: the cage's dead-end interface, DNS sinkhole and traps, with
//      one change: each looked-up name is answered with its own address
//      (198.18.0.N), so a connection tells which name it meant;
//   2. relay: on every port a declared destination uses, connections are
//      forwarded to the host's relay socket with the name and port they
//      were made to; the host decides (./relay.ts). Nothing here decides;
//   3. view: an empty tmpfs root, populated with exactly the plan's mount
//      operations (./plan.ts), then made read-only. Any failure stops here:
//      the command is never started uncontained;
//   4. sandbox: the command runs under bubblewrap in a NESTED user and PID
//      namespace, as an unprivileged uid with no capabilities, with no new
//      privileges, user namespaces disabled, the view as its root
//      (pivot_root, so nothing of the host is left reachable), a cleared
//      environment and, for strict exec, the memfd seccomp filter. The
//      mounts it inherits are locked: it cannot unmount or remount them;
//   5. guard (./view-guard.ts): the host side of every protected path is
//      watched; a change freezes the sandbox before it is handled. For a
//      package install, the cage's post-run check (./install-guard.ts) runs
//      before the exit status is returned.

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import {
  connectEmitter,
  inflight,
  setUpNetwork,
  SINKHOLE_IPV4,
  startTraps,
  trapPortList,
  watchSink,
  type Emit,
} from "../netcage/cage-init.js";
import { nameGuardUnchanged } from "../prebuilt/name-guard.js";
import { createGuardWriteChecker } from "./guard-writes.js";
import { captureInstallBaseline, checkInstall } from "./install-guard.js";
import { readJournal } from "./name-guard.js";
import { NAME_GUARD_VIEW_PATH, type InstallGuard, type MountOp } from "./plan.js";
import { strictExecSeccompFilter } from "./seccomp.js";
import {
  changedIdentities,
  freezeSandbox,
  handleViewLoss,
  killSandbox,
  thawSandbox,
  watchProtected,
  type Anchor,
  type WatchedPath,
} from "./view-guard.js";

export type ContainInitConfig = {
  sockDir: string;
  eventSock: string;
  relaySock: string;
  /** Ports of declared destinations; their connections go to the relay. */
  relayPorts: number[];
  /** Where the view's tmpfs root is mounted (inside sockDir). */
  viewRoot: string;
  ops: MountOp[];
  /** An empty directory and an empty file in sockDir, used as mask sources. */
  emptyDir: string;
  emptyFile: string;
  bwrap: string;
  mount: string;
  uid: number;
  gid: number;
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  strictExec: boolean;
  /** Protected paths and anchors with their identity at start (watched on the host). */
  protect: WatchedPath[];
  anchors: Anchor[];
  /** Where anything found on a protected path after a host-side change is moved. */
  quarantineDir: string;
  /** Package installs: the cage checked after the run. */
  installGuards: InstallGuard[];
  /** The name guard (./name-guard.c): the supervisor started here, the shim as the command. */
  nameGuard: { binary: string; sha256: string; socket: string; config: string; journal: string };
};

export const NAME_BASE = "198.18.0.";

/** Per-name DNS answers: 198.18.0.2 .. .254; the shared sinkhole after that. */
export function createNameAllocator() {
  const byName = new Map<string, string>();
  const byIp = new Map<string, string>();
  let next = 2;
  return {
    answer(name: string): string {
      const key = name.toLowerCase().replace(/\.$/, "");
      if (!key) {
        return SINKHOLE_IPV4;
      }
      const have = byName.get(key);
      if (have) {
        return have;
      }
      if (next > 254) {
        return SINKHOLE_IPV4;
      }
      const ip = `${NAME_BASE}${next++}`;
      byName.set(key, ip);
      byIp.set(ip, key);
      return ip;
    },
    nameOf(ip: string): string | null {
      return byIp.get(ip.replace(/^::ffff:/, "")) ?? null;
    },
  };
}

function startRelayListeners(
  cfg: ContainInitConfig,
  names: ReturnType<typeof createNameAllocator>,
): Promise<void> {
  return Promise.all(
    cfg.relayPorts.map(
      (port) =>
        new Promise<void>((resolve, reject) => {
          const server = net.createServer({ pauseOnConnect: true }, (client) => {
            const name = names.nameOf(client.localAddress ?? "");
            const upstream = net.connect(cfg.relaySock);
            const close = () => {
              client.destroy();
              upstream.destroy();
            };
            client.on("error", close);
            client.on("close", close);
            upstream.on("error", close);
            // The host refusing (closing) ends the client's connection too.
            upstream.on("close", close);
            upstream.once("connect", () => {
              upstream.write(`${JSON.stringify({ name, port })}\n`);
              // Wait for the host's go-ahead before any client byte flows,
              // so the header is the only thing the host reads first.
              upstream.once("data", (ack: Buffer) => {
                if (ack[0] !== 0x01) {
                  close();
                  return;
                }
                if (ack.length > 1) {
                  client.write(ack.subarray(1));
                }
                client.pipe(upstream).pipe(client);
                client.resume();
              });
            });
          });
          server.on("error", reject);
          server.listen({ port, host: "::", ipv6Only: false }, () => resolve());
        }),
    ),
  ).then(() => undefined);
}

class ViewError extends Error {}

function mountOrThrow(cfg: ContainInitConfig, args: string[], what: string): void {
  const r = spawnSync(cfg.mount, args, { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" });
  if (r.status !== 0) {
    throw new ViewError(`${what}: ${(r.stderr ?? "").trim() || `mount exited ${r.status}`}`);
  }
}

/** Build the view. Throws ViewError on any failure (the caller then refuses to start). */
export function buildView(cfg: ContainInitConfig): void {
  const V = cfg.viewRoot;
  fs.mkdirSync(V, { recursive: true });
  mountOrThrow(cfg, ["-t", "tmpfs", "-o", "mode=755,nosuid,nodev", "tmpfs", V], "view root");
  const rootDev = fs.statSync(V).dev;
  // Filesystems the cage itself created: the view root and its scratch tmpfs
  // mounts (/tmp, the sandbox home). A declared root under /tmp gets its mount
  // point on the scratch tmpfs, which is as much the cage's own as the root.
  const ownDevs = new Set<number>([rootDev]);
  const inView = (p: string) => path.join(V, p);
  // Mount points are only ever created on the cage's own tmpfs mounts, never in
  // a bound host directory: a missing target inside a host bind is an error.
  const ensure = (p: string, file: boolean) => {
    const target = inView(p);
    if (fs.existsSync(target)) {
      return;
    }
    const parent = path.dirname(target);
    if (!fs.existsSync(parent) || !ownDevs.has(fs.statSync(parent).dev)) {
      throw new ViewError(`mount point ${p} is missing and its parent is not the view's own`);
    }
    if (file) {
      fs.writeFileSync(target, "", { mode: 0o644 });
    } else {
      fs.mkdirSync(target, { mode: 0o755 });
    }
  };
  const flags = (ro: boolean, exec: boolean, dev = false) =>
    [
      "bind",
      "remount",
      ro ? "ro" : "rw",
      "nosuid",
      ...(dev ? [] : ["nodev"]),
      ...(exec ? [] : ["noexec"]),
    ].join(",");
  for (const op of cfg.ops) {
    switch (op.op) {
      case "dir": {
        // Each missing component, each on the view's own tmpfs.
        let cur = "";
        for (const part of op.path.split("/").filter(Boolean)) {
          cur += `/${part}`;
          ensure(cur, false);
        }
        break;
      }
      case "symlink": {
        const target = inView(op.path);
        if (
          !fs.existsSync(path.dirname(target)) ||
          fs.statSync(path.dirname(target)).dev !== rootDev
        ) {
          throw new ViewError(`symlink ${op.path} outside the view's own tmpfs`);
        }
        fs.symlinkSync(op.target, target);
        break;
      }
      case "file": {
        const target = inView(op.path);
        if (fs.existsSync(target)) {
          // Replacing a bound file would write to the host: refuse.
          if (fs.statSync(target).dev !== rootDev) {
            throw new ViewError(`generated file ${op.path} would overwrite a bound path`);
          }
        } else if (fs.statSync(path.dirname(target)).dev !== rootDev) {
          throw new ViewError(`generated file ${op.path} outside the view's own tmpfs`);
        }
        fs.writeFileSync(target, op.content, { mode: op.mode === 0o755 ? 0o755 : 0o644 });
        break;
      }
      case "bind":
        ensure(op.path, op.file);
        mountOrThrow(cfg, ["--bind", op.src, inView(op.path)], `bind ${op.src}`);
        mountOrThrow(cfg, ["-o", flags(op.ro, op.exec), inView(op.path)], `restrict ${op.path}`);
        break;
      case "mask":
        ensure(op.path, op.file);
        mountOrThrow(
          cfg,
          ["--bind", op.file ? cfg.emptyFile : cfg.emptyDir, inView(op.path)],
          `mask ${op.path}`,
        );
        mountOrThrow(cfg, ["-o", flags(true, false), inView(op.path)], `restrict mask ${op.path}`);
        break;
      case "tmpfs":
        ensure(op.path, false);
        mountOrThrow(
          cfg,
          [
            "-t",
            "tmpfs",
            "-o",
            `mode=1777,nosuid,nodev${op.exec ? "" : ",noexec"}`,
            "tmpfs",
            inView(op.path),
          ],
          `tmpfs ${op.path}`,
        );
        ownDevs.add(fs.statSync(inView(op.path)).dev);
        break;
      case "device":
        ensure(op.path, true);
        mountOrThrow(cfg, ["--bind", op.src, inView(op.path)], `device ${op.path}`);
        mountOrThrow(
          cfg,
          ["-o", flags(false, false, true), inView(op.path)],
          `restrict device ${op.path}`,
        );
        break;
    }
  }
  mountOrThrow(cfg, ["-o", "bind,remount,ro,nosuid,nodev", V], "view root read-only");
}

/** Mount points at or below `root`, from /proc/self/mountinfo text. */
export function mountPointsUnder(mountinfo: string, root: string): Set<string> {
  const out = new Set<string>();
  for (const line of mountinfo.split("\n")) {
    const mp = line.split(" ")[4];
    if (!mp) {
      continue;
    }
    // mountinfo escapes space, tab, newline and backslash as octal.
    const p = mp.replace(/\\([0-7]{3})/g, (_, o: string) => String.fromCharCode(parseInt(o, 8)));
    if (p === root || p.startsWith(`${root}/`)) {
      out.add(p);
    }
  }
  return out;
}

// A host path bound into the view stays protected only while it exists:
// unlinking or renaming it on the host lazily detaches the bind in every
// namespace. The protected paths are watched by inotify (./view-guard.ts);
// the mount table is polled as well, as a backstop for every other mount
// of the view (a declared root, a program). Either one freezes the sandbox
// first and then stops it.
const VIEW_WATCH_MS = 100;

function watchView(root: string, onChange: (missing: string[]) => boolean): () => void {
  const read = () => {
    try {
      return fs.readFileSync("/proc/self/mountinfo", "utf8");
    } catch {
      return "";
    }
  };
  let initial = mountPointsUnder(read(), root);
  const timer = setInterval(() => {
    const now = mountPointsUnder(read(), root);
    const missing = [...initial].filter((m) => !now.has(m));
    if (missing.length > 0) {
      if (onChange(missing)) {
        initial = now; // handled: the host's own change is the new baseline
      } else {
        clearInterval(timer);
      }
    }
  }, VIEW_WATCH_MS);
  timer.unref();
  return () => clearInterval(timer);
}

export function bwrapArgs(cfg: ContainInitConfig, seccompFd: number | null): string[] {
  const args = [
    "--unshare-user",
    "--uid",
    String(cfg.uid),
    "--gid",
    String(cfg.gid),
    "--disable-userns",
    "--unshare-pid",
    "--unshare-ipc",
    "--unshare-uts",
    "--unshare-cgroup-try",
    "--die-with-parent",
    "--new-session",
    "--dev-bind",
    cfg.viewRoot,
    "/",
    "--proc",
    "/proc",
    "--chdir",
    cfg.cwd,
    "--clearenv",
  ];
  for (const [k, v] of Object.entries(cfg.env)) {
    args.push("--setenv", k, v);
  }
  if (seccompFd !== null) {
    args.push("--seccomp", String(seccompFd));
  }
  args.push("--", NAME_GUARD_VIEW_PATH, "shim", cfg.nameGuard.socket, cfg.command, ...cfg.args);
  return args;
}

export async function containInit(
  cfg: ContainInitConfig,
): Promise<{ code: number; emit: Emit; close: () => Promise<void> }> {
  const emitter = await connectEmitter(cfg.eventSock);
  const emit = emitter.emit;
  const fail = async (message: string) => {
    emit({ type: "refused", code: "containment-setup-failed", message });
    process.stderr.write(`enclawed containment: ${message}; the process was not started\n`);
    return { code: 126, emit, close: emitter.close };
  };
  const names = createNameAllocator();
  const { watching, local } = setUpNetwork(emit);
  try {
    await startRelayListeners(cfg, names);
  } catch (err) {
    return fail(`relay listener: ${err instanceof Error ? err.message : String(err)}`);
  }
  await startTraps(trapPortList(cfg.relayPorts), emit, (name) => names.answer(name));
  const stopWatch = watching ? watchSink(emit, local) : () => {};
  try {
    buildView(cfg);
  } catch (err) {
    stopWatch();
    return fail(`view: ${err instanceof Error ? err.message : String(err)}`);
  }
  let seccomp: Buffer | null = null;
  if (cfg.strictExec) {
    seccomp = strictExecSeccompFilter();
    if (!seccomp) {
      stopWatch();
      return fail(
        `strict exec needs a seccomp filter for ${process.arch}, which this build does not have`,
      );
    }
  }
  // The name guard's supervisor, before anything runs.
  // What runs is what was verified: checked before each exec of the guard.
  const guardChanged = nameGuardUnchanged(cfg.nameGuard.binary, cfg.nameGuard.sha256);
  if (guardChanged) {
    stopWatch();
    return fail(guardChanged);
  }
  const supervisor = spawn(
    cfg.nameGuard.binary,
    ["supervise", cfg.nameGuard.socket, cfg.nameGuard.config, cfg.nameGuard.journal],
    { env: {}, stdio: ["ignore", "pipe", "inherit"] },
  );
  const supervisorReady = await new Promise<boolean>((resolve) => {
    const t = setTimeout(() => resolve(false), 10_000);
    supervisor.stdout.once("data", (d: Buffer) => {
      clearTimeout(t);
      resolve(d.toString().startsWith("ready"));
    });
    supervisor.once("exit", () => {
      clearTimeout(t);
      resolve(false);
    });
  });
  if (!supervisorReady) {
    supervisor.kill("SIGKILL");
    stopWatch();
    return fail("the name guard did not start");
  }
  const keep = () => [supervisor.pid ?? -1];

  // The host side of every protected path, watched before anything runs.
  let stopProtectWatch: () => void = () => {};
  let lost = false;
  let childRef: ReturnType<typeof spawn> | null = null;
  const stop = () => {
    killSandbox(keep());
    childRef?.kill("SIGKILL");
  };
  // A clean exit (0) means no contained process is left; any other is a guard failure.
  supervisor.once("exit", (code) => {
    if (code !== 0 && childRef && childRef.exitCode === null && !lost) {
      lost = true;
      emit({
        type: "refused",
        code: "containment-guard-stopped",
        message: "the name guard stopped; the process was stopped",
      });
      stop();
    }
  });
  // The name guard's exceptions (git checkouts, git config saves, approved
  // writes): checked once the writing process is gone, then reported.
  const writes = createGuardWriteChecker({
    journal: cfg.nameGuard.journal,
    quarantineDir: cfg.quarantineDir,
    configs: cfg.protect.filter((w) => w.path.endsWith("/.git/config")).map((w) => w.path),
    emit,
    refuse: () => {
      if (!lost) {
        lost = true;
        freezeSandbox(keep());
        stop();
      }
    },
  });
  const checkGitWrites = (all: boolean) => writes.check(all);
  /** A host-side change: freeze, decide with the journal, then go on or stop. Returns true to keep watching. */
  const onChange = (why: string): boolean => {
    if (lost) {
      return false;
    }
    // Freeze first: nothing in the sandbox runs while the change is handled.
    // The supervisor keeps running; its journal entry for any write precedes
    // the write's completion, so the journal read below is complete.
    const frozen = freezeSandbox(keep());
    const written = readJournal(cfg.nameGuard.journal);
    const r = handleViewLoss(
      cfg.protect,
      cfg.anchors,
      cfg.quarantineDir,
      written,
      writes.excepted(),
    );
    if (frozen && r.quarantined.length === 0) {
      // Every change is the host's own (no object the sandbox wrote): the
      // protected paths now are what the host put there. Go on.
      emit({
        type: "notice",
        code: "containment-host-change",
        message: `protected path changed on the host by the host: ${r.changed.join(", ") || why}; the run continues`,
        changed: r.changed,
      });
      thawSandbox(keep());
      return true;
    }
    lost = true;
    const shown = r.changed.length > 0 ? r.changed.join(", ") : why;
    emit({
      type: "refused",
      code: "containment-view-changed",
      message: `a protected path now holds what the contained process wrote: ${shown}; the process was frozen and stopped`,
      frozen,
      changed: r.changed,
      quarantined: r.quarantined,
      restore: r.restore,
    });
    process.stderr.write(
      `enclawed containment: a protected path now holds what the contained process wrote (${shown}); the process was stopped` +
        (r.quarantined.length > 0
          ? `; moved to quarantine: ${r.quarantined.map((q) => q.path).join(", ")}`
          : "") +
        "\n",
    );
    stop();
    return false;
  };
  try {
    stopProtectWatch = watchProtected(cfg.protect, cfg.anchors, (changed) =>
      onChange(changed.join(", ")),
    );
  } catch (err) {
    supervisor.kill("SIGKILL");
    stopWatch();
    return fail(
      `cannot watch the protected paths: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const before = changedIdentities(cfg.protect, cfg.anchors);
  if (before.length > 0) {
    supervisor.kill("SIGKILL");
    stopProtectWatch();
    stopWatch();
    return fail(`protected path changed before start: ${before.join(", ")}`);
  }
  const baselines = cfg.installGuards.map((g) => captureInstallBaseline(g));
  emit({ type: "ready" });
  const shimChanged = nameGuardUnchanged(cfg.nameGuard.binary, cfg.nameGuard.sha256);
  if (shimChanged) {
    supervisor.kill("SIGKILL");
    stopProtectWatch();
    stopWatch();
    return fail(shimChanged);
  }
  const child = spawn(cfg.bwrap, bwrapArgs(cfg, seccomp ? 3 : null), {
    env: {},
    stdio: ["inherit", "inherit", "inherit", ...(seccomp ? (["pipe"] as const) : [])],
  });
  childRef = child;
  if (seccomp && child.stdio[3]) {
    (child.stdio[3] as NodeJS.WritableStream).end(seccomp);
  }
  for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"] as const) {
    process.on(sig, () => child.kill(sig));
  }
  const gitTimer = setInterval(() => checkGitWrites(false), 50);
  gitTimer.unref();
  const stopViewWatch = watchView(cfg.viewRoot, (missing) => {
    const shown = missing.map((m) => m.slice(cfg.viewRoot.length) || "/");
    return onChange(`mount removed: ${shown.join(", ")}`);
  });
  const code = await new Promise<number>((resolve) => {
    child.on("error", (err) => {
      process.stderr.write(`enclawed containment: ${err.message}\n`);
      resolve(127);
    });
    child.on("exit", (c, signal) =>
      resolve(c ?? (signal ? 128 + (os.constants.signals[signal] ?? 0) : 1)),
    );
  });
  stopViewWatch();
  stopProtectWatch();
  stopWatch();
  supervisor.kill("SIGKILL");
  // Every contained process is gone: verify what git checked out, before the status goes back.
  clearInterval(gitTimer);
  checkGitWrites(true);
  if (lost) {
    return { code: code === 0 ? 125 : code, emit, close: emitter.close };
  }
  // The install cage's post-run check, before the status goes back.
  const violations = baselines.flatMap((b) => checkInstall(b, cfg.quarantineDir));
  if (violations.length > 0) {
    emit({
      type: "refused",
      code: "containment-install-cage",
      message: `the install wrote outside its outputs: ${violations.map((v) => `${v.path} (${v.what})`).join(", ")}; moved to quarantine and restored`,
      violations,
    });
    process.stderr.write(
      `enclawed containment: the install wrote outside node_modules and its lockfiles (${violations
        .map((v) => path.basename(v.path))
        .join(", ")}); those changes were moved to quarantine and the project restored\n`,
    );
    return { code: code === 0 ? 125 : code, emit, close: emitter.close };
  }
  return { code, emit, close: emitter.close };
}

const raw = process.env.ENCLAWED_CONTAIN;
if (raw && process.argv[1] && path.basename(process.argv[1]).startsWith("contain-init")) {
  containInit(JSON.parse(raw) as ContainInitConfig).then(
    async ({ code, close }) => {
      for (const finish of Array.from(inflight)) {
        finish();
      }
      await close();
      process.exit(code);
    },
    (err: unknown) => {
      process.stderr.write(
        `enclawed containment: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      process.exit(126);
    },
  );
}
