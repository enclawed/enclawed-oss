// The name guard's exceptions, checked once the process that made them has
// exited (inside ./contain-init.ts, on the host's side of the sandbox):
//
//   G  the contained git checked an exec-config file out: it must be what
//      git checks out or merges there (./repo-config.ts). Reported as
//      containment-repo-config-changed, state "checked-out" or
//      "conflicted";
//   C  the contained git saved .git/config: the entries it added must not
//      make git run or load anything (./git-config-check.ts). Reported with
//      state "git-config";
//   A  a write the session approved (a person resolving a conflicted
//      file): reported with state "resolved", for admission.
// Anything that fails is moved to quarantine, the previous content is put
// back, and the run is stopped (containment-repo-config-refused).

import fs from "node:fs";
import path from "node:path";
import { introducedExecution, readConfigEntries, type ConfigEntry } from "./git-config-check.js";
import { readJournal } from "./name-guard.js";
import {
  readGitWrites,
  restoreTracked,
  sha256Of,
  verifyTracked,
  workTreeOf,
  type GuardWrite,
} from "./repo-config.js";
import { quarantine } from "./view-guard.js";

type Emit = (e: Record<string, unknown> & { type: string }) => void;

export type ChangedPath = Readonly<{
  path: string;
  state: "checked-out" | "conflicted" | "git-config" | "resolved";
  sha256: string | null;
  blob?: string;
  added?: readonly ConfigEntry[];
}>;

/** Does any process (of this PID namespace) hold `p` open? */
function heldOpen(p: string): boolean {
  let pids: string[] = [];
  try {
    pids = fs.readdirSync("/proc").filter((n) => /^\d+$/.test(n));
  } catch {
    return false;
  }
  for (const pid of pids) {
    let fds: string[] = [];
    try {
      fds = fs.readdirSync(`/proc/${pid}/fd`);
    } catch {
      continue;
    }
    for (const fd of fds) {
      try {
        if (fs.readlinkSync(`/proc/${pid}/fd/${fd}`) === p) {
          return true;
        }
      } catch {
        /* closed meanwhile */
      }
    }
  }
  return false;
}

function processGone(pid: number): boolean {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    return "ZX".includes(stat.slice(stat.lastIndexOf(")") + 2, stat.lastIndexOf(")") + 3));
  } catch {
    return true;
  }
}

export function createGuardWriteChecker(o: {
  journal: string;
  quarantineDir: string;
  /** .git/config files of the read-write roots, read before anything ran. */
  configs: readonly string[];
  emit: Emit;
  /** Called once when a check fails: the run must stop. */
  refuse: () => void;
}) {
  let offset = 0;
  const pending = new Map<number, GuardWrite[]>();
  // Approved writes: settled once nothing holds the file open any more (the
  // writer may be a long-lived server).
  const approvedPending = new Set<string>();
  const configs = new Map<string, { bytes: Buffer; entries: ConfigEntry[] }>();
  for (const c of o.configs) {
    const top = path.dirname(path.dirname(c));
    try {
      configs.set(c, { bytes: fs.readFileSync(c), entries: readConfigEntries(top, c) });
    } catch {
      /* unreadable: checked as new */
    }
  }
  let failed = false;

  const checkConfig = (file: string): { ok: ChangedPath | null; bad: string | null } => {
    const top = path.dirname(path.dirname(file));
    const before = configs.get(file) ?? { bytes: Buffer.alloc(0), entries: [] };
    let after: ConfigEntry[];
    try {
      after = readConfigEntries(top, file);
    } catch (err) {
      return {
        ok: null,
        bad: `the new ${file} cannot be read: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    const added = introducedExecution(before.entries, after);
    if (added.length > 0) {
      return { ok: null, bad: added.map((a) => a.why).join("; ") };
    }
    const bytes = fs.readFileSync(file);
    configs.set(file, { bytes, entries: after });
    const prior = new Set(before.entries.map((e) => `${e.key}\n${e.value}`));
    return {
      ok: {
        path: file,
        state: "git-config",
        sha256: sha256Of(file),
        added: after.filter((e) => !prior.has(`${e.key}\n${e.value}`)),
      },
      bad: null,
    };
  };

  const settle = (writes: GuardWrite[]) => {
    const changed: ChangedPath[] = [];
    const bad: Array<{ path: string; reason: string; restore: () => boolean }> = [];
    const paths = new Map<string, GuardWrite["kind"]>();
    const argvs = new Map<string, readonly string[]>();
    for (const w of writes) {
      paths.set(w.path, w.kind);
      if (w.argv) {
        argvs.set(w.path, w.argv);
      }
    }
    for (const [p, kind] of paths) {
      if (kind === "C") {
        const r = checkConfig(p);
        if (r.ok) {
          changed.push(r.ok);
        } else if (r.bad) {
          const prior = configs.get(p)?.bytes ?? null;
          bad.push({
            path: p,
            reason: r.bad,
            restore: () => {
              if (prior === null) {
                return false;
              }
              fs.writeFileSync(p, prior, { flag: "wx", mode: 0o644 });
              return true;
            },
          });
        }
        continue;
      }
      const v = verifyTracked(p, { argv: argvs.get(p), written: readJournal(o.journal) });
      if (!v.ok) {
        const tracked = v.tracked;
        bad.push({
          path: p,
          reason: v.reason,
          restore: () => (tracked ? restoreTracked(p, tracked) : false),
        });
      } else if ("state" in v) {
        changed.push({ path: p, state: v.state, sha256: v.sha256, blob: v.blob });
      }
    }
    if (changed.length > 0) {
      o.emit({
        type: "notice",
        code: "containment-repo-config-changed",
        message: `repository configuration changed: ${changed.map((c) => `${c.path} (${c.state})`).join(", ")}; it must be admitted before it is used`,
        paths: changed,
      });
    }
    if (bad.length > 0 && !failed) {
      failed = true;
      const quarantined = bad.map((b) => {
        const to = quarantine(b.path, o.quarantineDir);
        let restored = false;
        try {
          restored = b.restore();
        } catch {
          restored = false;
        }
        return { path: b.path, to, restored };
      });
      o.emit({
        type: "refused",
        code: "containment-repo-config-refused",
        message: `repository configuration that git does not produce: ${bad
          .map((b) => `${b.path} (${b.reason})`)
          .join(", ")}; moved to quarantine, the previous content restored, the process stopped`,
        quarantined,
        restore: [],
      });
      process.stderr.write(
        `enclawed containment: refused repository configuration (${bad.map((b) => `${b.path}: ${b.reason}`).join("; ")}); the process was stopped\n`,
      );
      o.refuse();
    }
  };

  return {
    /** Check what exited processes wrote (`all`: every process is gone). */
    check(all: boolean) {
      const r = readGitWrites(o.journal, offset);
      offset = r.offset;
      for (const e of r.entries) {
        if (e.kind === "A") {
          if (!approvedPending.has(e.path)) {
            approvedPending.add(e.path);
            // The approval is used: the launcher ends it now (one write session per approval).
            o.emit({
              type: "notice",
              code: "containment-repo-config-approved-write",
              path: e.path,
            });
          }
          continue;
        }
        pending.set(e.pid, [...(pending.get(e.pid) ?? []), e]);
      }
      for (const p of approvedPending) {
        if (all || !heldOpen(p)) {
          approvedPending.delete(p);
          if (fs.existsSync(p)) {
            o.emit({
              type: "notice",
              code: "containment-repo-config-changed",
              message: `an approved write resolved ${p}; it must be admitted before it is used`,
              paths: [{ path: p, state: "resolved", sha256: sha256Of(p) }],
            });
          }
        }
      }
      const done: GuardWrite[] = [];
      for (const [pid, writes] of pending) {
        if (all || processGone(pid)) {
          pending.delete(pid);
          done.push(...writes);
        }
      }
      if (done.length > 0) {
        settle(done);
      }
    },
    /** Every path an exception let through so far (the host-change watch leaves them to this checker). */
    excepted(): Set<string> {
      const set = new Set<string>();
      for (const e of readGitWrites(o.journal, 0).entries) {
        set.add(e.path);
        set.add(`${e.path}.lock`);
      }
      return set;
    },
  };
}

/** The .git/config files of the read-write roots. */
export function rootConfigs(roots: readonly string[]): string[] {
  const out: string[] = [];
  for (const r of roots) {
    const top = workTreeOf(path.join(r, "x")) ?? r;
    const c = path.join(top, ".git", "config");
    if (fs.existsSync(c)) {
      out.push(c);
    }
  }
  return out;
}
