// enclawed adapter kit: repository configuration a contained git checked out
// mid-session (containment-repo-config-changed) is not used until Enclawed
// admits it again.
//
//   on the notice     the session is HELD at once: every further tool call
//                     is denied (repo-config-held) until admission passes.
//   re-admission      each reported file must still hold the digest the
//                     containment reported (else repo-config-digest-mismatch);
//                     a conflicted checkout waits for a person
//                     (repo-config-conflicted); then the adapter's launch-time
//                     repository admission runs again (repository hooks, env,
//                     .mcp.json servers, command settings, skills, workflow
//                     files: the kit's existing rules, over the host's files).
//   outcome           admitted: the hold is released. Inadmissible: the
//                     session keeps holding, and the adapter reverts or
//                     quarantines the files per policy (onInadmissible).
//   refused run       containment-repo-config-refused stopped the contained
//                     run: the session holds (a person decides).
//
// The hold lives in a HoldStore the adapter keeps in its session directory,
// so every hook process sees it.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  ApprovalGrantLedger,
  resolveFsResource,
  type ApprovalSubject,
  type FsResourceIdentity,
} from "../approval-binding.js";
import type { ContainmentEvent } from "../containment/index.js";
import { APPROVAL_TIMEOUT_MS } from "./approval.js";
import { isPersonHeldMode, personHeldModes, type HostModeOrder } from "./host-modes.js";

export type RepoConfigChange = Readonly<{
  path: string;
  sha256: string;
  blob?: string;
  /** checked-out, conflicted (git's own merge with markers), git-config (.git/config saved by git), resolved (a person's approved write). */
  state?: "checked-out" | "conflicted" | "git-config" | "resolved";
  /** git-config: the entries git added (none can run or load anything). */
  added?: readonly string[];
}>;

export type RepoConfigHoldState = Readonly<{
  reason: "repo-config-changed" | "repo-config-refused";
  since: number;
  paths: readonly RepoConfigChange[];
  /** Why re-admission did not pass (the hold stays). */
  refusals?: readonly string[];
}>;

export interface HoldStore {
  get(): RepoConfigHoldState | null | Promise<RepoConfigHoldState | null>;
  set(s: RepoConfigHoldState | null): void | Promise<void>;
}

export function memoryHoldStore(): HoldStore {
  let s: RepoConfigHoldState | null = null;
  return {
    get: () => s,
    set: (v) => {
      s = v;
    },
  };
}

/** A hold kept in one file of the session directory (mode 0600). A file that cannot be read is a hold. */
export function fileHoldStore(file: string): HoldStore {
  return {
    get: () => {
      let text: string;
      try {
        text = fs.readFileSync(file, "utf8");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          return null;
        }
        return {
          reason: "repo-config-changed",
          since: Date.now(),
          paths: [],
          refusals: ["the session's hold could not be read"],
        };
      }
      try {
        const v = JSON.parse(text) as RepoConfigHoldState | null;
        return v && typeof v === "object" ? v : null;
      } catch {
        // Fail closed: a torn hold file still holds.
        return {
          reason: "repo-config-changed",
          since: Date.now(),
          paths: [],
          refusals: ["the session's hold is unreadable"],
        };
      }
    },
    set: (v) => {
      if (v === null) {
        fs.rmSync(file, { force: true });
      } else {
        const tmp = `${file}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(v), { mode: 0o600 });
        fs.renameSync(tmp, file);
      }
    },
  };
}

/** The adapter's repository admission, re-run over the host's files (the kit's launch rules). */
export type RepoConfigAdmission = (
  paths: readonly string[],
) => Promise<Readonly<{ ok: true } | { ok: false; refusals: readonly string[] }>>;

export type RepoConfigOutcome =
  | Readonly<{ action: "none" }>
  | Readonly<{
      action: "resumed";
      paths: readonly string[];
      /** .git/config entries git added (for the audit log). */
      gitConfigAdded?: readonly string[];
    }>
  | Readonly<{
      action: "held";
      code: "repo-config-digest-mismatch" | "repo-config-conflicted" | "repo-config-inadmissible";
      refusals: readonly string[];
      paths: readonly string[];
    }>
  | Readonly<{ action: "stopped"; code: "repo-config-refused"; paths: readonly string[] }>;

function changesOf(e: Readonly<Record<string, unknown>>): RepoConfigChange[] {
  const raw = Array.isArray(e.paths) ? e.paths : [];
  return raw.flatMap((p: unknown) => {
    const o = p as Record<string, unknown>;
    return o && typeof o.path === "string" && typeof o.sha256 === "string"
      ? [
          {
            path: o.path,
            sha256: o.sha256,
            ...(typeof o.blob === "string" ? { blob: o.blob } : {}),
            ...(o.state === "conflicted" ||
            o.state === "git-config" ||
            o.state === "resolved" ||
            o.state === "checked-out"
              ? { state: o.state }
              : {}),
            ...(Array.isArray(o.added)
              ? { added: o.added.filter((x): x is string => typeof x === "string") }
              : {}),
          },
        ]
      : [];
  });
}

const digestOf = (p: string): string | null => {
  try {
    return createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  } catch {
    return null;
  }
};

/**
 * Handle a containment event for the session's repository configuration.
 * Returns what happened; the hold store says what every later decision sees.
 */
export async function handleRepoConfigEvent(
  event: ContainmentEvent,
  o: Readonly<{
    hold: HoldStore;
    admit: RepoConfigAdmission;
    /** Inadmissible files: revert or quarantine them per the adapter's policy. */
    onInadmissible?: (
      paths: readonly string[],
      refusals: readonly string[],
    ) => void | Promise<void>;
    now?: () => number;
  }>,
): Promise<RepoConfigOutcome> {
  const e = event as Readonly<Record<string, unknown>>;
  const now = (o.now ?? Date.now)();
  if (e.code === "containment-repo-config-refused") {
    const paths = Array.isArray(e.quarantined)
      ? (e.quarantined as { path?: unknown }[]).flatMap((q) =>
          typeof q.path === "string" ? [q.path] : [],
        )
      : [];
    await o.hold.set({
      reason: "repo-config-refused",
      since: now,
      paths: paths.map((p) => ({ path: p, sha256: "" })),
      refusals: [typeof e.message === "string" ? e.message : "the contained run was stopped"],
    });
    return { action: "stopped", code: "repo-config-refused", paths };
  }
  if (e.code !== "containment-repo-config-changed") {
    return { action: "none" };
  }
  // Hold first: nothing runs while the new configuration is unadmitted.
  const prev = await o.hold.get();
  const merged = new Map<string, RepoConfigChange>();
  for (const c of [...(prev?.paths ?? []), ...changesOf(e)]) {
    merged.set(c.path, c);
  }
  const changes = [...merged.values()];
  const paths = changes.map((c) => c.path);
  await o.hold.set({
    reason: prev?.reason ?? "repo-config-changed",
    since: prev?.since ?? now,
    paths: changes,
  });
  if (prev?.reason === "repo-config-refused") {
    return {
      action: "held",
      code: "repo-config-inadmissible",
      refusals: prev.refusals ?? [],
      paths,
    };
  }
  const keep = async (
    code: "repo-config-digest-mismatch" | "repo-config-conflicted" | "repo-config-inadmissible",
    refusals: string[],
  ): Promise<RepoConfigOutcome> => {
    await o.hold.set({
      reason: "repo-config-changed",
      since: prev?.since ?? now,
      paths: changes,
      refusals,
    });
    if (code !== "repo-config-conflicted") {
      await o.onInadmissible?.(paths, refusals);
    }
    return { action: "held", code, refusals, paths };
  };
  const conflicted = changes.filter((c) => c.state === "conflicted").map((c) => c.path);
  if (conflicted.length) {
    return keep("repo-config-conflicted", [
      `a checkout left a conflict in ${conflicted.join(", ")}; a person resolves it before the session goes on`,
    ]);
  }
  const mismatched = changes.filter((c) => digestOf(c.path) !== c.sha256).map((c) => c.path);
  if (mismatched.length) {
    return keep("repo-config-digest-mismatch", [
      `${mismatched.join(", ")} changed again after the containment reported it, so what would be admitted is not what git checked out`,
    ]);
  }
  let r: Awaited<ReturnType<RepoConfigAdmission>>;
  try {
    r = await o.admit(paths);
  } catch (err) {
    r = { ok: false, refusals: [`the admission could not run (${(err as Error).message})`] };
  }
  if (!r.ok) {
    return keep("repo-config-inadmissible", [...r.refusals]);
  }
  await o.hold.set(null);
  const added = changes.flatMap((c) => (c.state === "git-config" ? [...(c.added ?? [])] : []));
  return { action: "resumed", paths, ...(added.length ? { gitConfigAdded: added } : {}) };
}

/** The subject a conflict resolution is approved for: one write of exactly this path. */
async function resolutionSubject(p: string): Promise<ApprovalSubject> {
  // Bound to the path, to the inode, and to the conflicted content the person saw.
  return {
    tool: "repo-config-write",
    args: { path: p, sha256: digestOf(p) },
    resources: [await resolveFsResource(p)],
  };
}

/**
 * A person resolves a conflicted repository-configuration file: the adapter's
 * approval UI asks (`ask`), the grant is issued, approved and spent through
 * the framework's ApprovalGrantLedger (single use, bound to this path and to
 * the file as it is when asked), and only then is the containment told to let
 * the contained process write it (`approveWrite`, the containment's
 * approveRepoConfigWrite). The write is reported again as "resolved" and
 * admitted like any other change.
 */
export async function approveConflictResolution(
  o: Readonly<{
    path: string;
    ledger: ApprovalGrantLedger;
    ask: (question: string) => Promise<boolean>;
    approveWrite: (path: string) => void | boolean;
    ttlMs?: number;
  }>,
): Promise<Readonly<{ ok: true } | { ok: false; code: string; reason: string }>> {
  const subject = await resolutionSubject(o.path);
  const grant = o.ledger.issue(subject, { ttlMs: o.ttlMs ?? APPROVAL_TIMEOUT_MS });
  let yes = false;
  try {
    yes = await o.ask(
      `a git checkout left a conflict in ${o.path} (repository configuration). Approve one write that resolves it; the result is checked again before the session goes on.`,
    );
  } catch {
    yes = false;
  }
  if (!yes || !o.ledger.approve(grant.id)) {
    o.ledger.revoke(grant.id);
    return { ok: false, code: "not-approved", reason: "no person approved the resolution" };
  }
  const used = o.ledger.consume(grant.id, await resolutionSubject(o.path));
  if (!used.ok) {
    return { ok: false, code: used.code, reason: used.reason };
  }
  try {
    if (o.approveWrite(o.path) === false) {
      return {
        ok: false,
        code: "not-conflicted",
        reason: `${o.path} is not a conflicted file of this session`,
      };
    }
  } catch (err) {
    return { ok: false, code: "not-conflicted", reason: (err as Error).message };
  }
  return { ok: true };
}

/** Why the session is held, for a denial (null when it is not). */
export async function repoConfigHoldReason(
  hold: HoldStore | null | undefined,
): Promise<string | null> {
  if (!hold) {
    return null;
  }
  const s = await hold.get();
  if (!s) {
    return null;
  }
  const what = s.paths.map((p) => p.path).join(", ") || "the repository's configuration";
  return s.reason === "repo-config-refused"
    ? `a contained git wrote repository configuration that is not the tracked content (${what}); the run was stopped and this session holds until a person decides${s.refusals?.length ? `: ${s.refusals.join("; ")}` : ""}`
    : `the repository's configuration changed in this session (${what}) and Enclawed has not admitted it yet${s.refusals?.length ? `: ${s.refusals.join("; ")}` : ""}`;
}

// ─── Conflicts resolved through the host's own prompt (no launcher) ─────
//
// A session with no launcher prompt (a host's managed mode) has only the
// host's permission prompt. While the session holds on a conflict, a write
// tool call to exactly one conflicted file, a file that is still what the
// containment reported (its content) and the same file (path, inode, parent),
// is ASKED there instead of denied; every other call is still denied. The ask
// issues a grant in the framework's ApprovalGrantLedger (kept in one file of
// the session directory, so the post-tool hook process finds it), bound to the
// path, the conflicted content, the file's identity and the call id. The host
// runs the call only after the person's answer; its post-tool event spends the
// grant (once, for that call, before it expires), and the file as it is then is
// admitted like any other change (handleRepoConfigEvent, state "resolved").
// A grant that is never spent resolves nothing.

/** A file-backed ApprovalGrantLedger and the call each grant was issued for. */
/**
 * Where the grants live, and what the host's prompt guarantees (host data
 * the adapter declares): the host modes in which an ask reaches a person and
 * the host does not approve it by itself (`personModes`; in another mode, a
 * mode switch while the prompt is open lets the host re-check and approve the
 * pending call). The conflict write is asked only in such a mode, and its
 * grant is spent only when the host ran the call in such a mode.
 */
export type ConflictGrants = Readonly<{
  file: string;
  personModes: readonly string[];
  /** The order of the host's modes: a declared person mode counts only when it is the narrowest prompting rank (isPersonHeldMode). */
  modeOrder?: HostModeOrder | null;
}>;

/** Why the host's prompt cannot stand for a person in this mode, or null. */
function hostPromptProblem(
  grants: ConflictGrants,
  hostMode: string | null | undefined,
): string | null {
  if (!isPersonHeldMode(hostMode, grants.personModes, grants.modeOrder)) {
    return `the host's ${JSON.stringify(hostMode ?? null)} mode can approve the write without the person's answer (switch to ${
      personHeldModes(grants.personModes, grants.modeOrder)
        .map((m) => JSON.stringify(m))
        .join(" or ") || "a mode in which the host asks the person"
    } to resolve it)`;
  }
  return null;
}

type ConflictGrantFile = {
  ledger: unknown;
  calls: Record<string, { id: string; path: string; sha256: string; resource: FsResourceIdentity }>;
};

function readGrants(g: ConflictGrants): ConflictGrantFile {
  try {
    const v = JSON.parse(fs.readFileSync(g.file, "utf8")) as ConflictGrantFile;
    return { ledger: v.ledger, calls: v.calls && typeof v.calls === "object" ? v.calls : {} };
  } catch {
    return { ledger: [], calls: {} };
  }
}

function writeGrants(g: ConflictGrants, v: ConflictGrantFile): void {
  const tmp = `${g.file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(v), { mode: 0o600 });
  fs.renameSync(tmp, g.file);
}

const subjectOf = (
  callId: string,
  p: string,
  sha256: string,
  resource: FsResourceIdentity,
): ApprovalSubject => ({
  tool: "repo-config-write",
  args: { path: p, sha256, callId },
  resources: [resource],
});

export type ConflictWriteCall = Readonly<{
  callId: string | null;
  /** Absolute paths the call writes. */
  writes: readonly string[];
  /** A person answers the host's prompt in this session. */
  person: boolean;
  /** The host's mode word for this call (ConflictGrants.personModes). */
  hostMode?: string | null;
}>;

/**
 * Is this call the write that resolves a held conflict? Returns the question
 * for the host's prompt (the grant is issued), or why not (null: not a write
 * of a conflicted file at all, and the hold's denial stands).
 */
export async function askConflictResolution(
  hold: HoldStore,
  grants: ConflictGrants,
  call: ConflictWriteCall,
  o: Readonly<{ now?: () => number }> = {},
): Promise<Readonly<{ ask: true; question: string } | { ask: false; reason: string }> | null> {
  const s = await hold.get();
  const conflicted = (s?.reason === "repo-config-changed" ? s.paths : []).filter(
    (c) => c.state === "conflicted",
  );
  if (conflicted.length === 0 || call.writes.length === 0) {
    return null;
  }
  const real = (p: string) => {
    try {
      return fs.realpathSync(p);
    } catch {
      return path.resolve(p);
    }
  };
  const target = conflicted.find(
    (c) => call.writes.length === 1 && real(call.writes[0]) === real(c.path),
  );
  if (!target) {
    return null;
  }
  if (!call.person || !call.callId) {
    return {
      ask: false,
      reason: `the conflict in ${target.path} needs a person, and this session cannot ask one`,
    };
  }
  const prompt = hostPromptProblem(grants, call.hostMode);
  if (prompt) {
    return { ask: false, reason: `the conflict in ${target.path} needs a person: ${prompt}` };
  }
  const resource = await resolveFsResource(target.path);
  if (
    resource.kind !== "file" ||
    resource.nlink !== 1 ||
    resource.realPath !== path.resolve(target.path) ||
    digestOf(target.path) !== target.sha256
  ) {
    return {
      ask: false,
      reason: `${target.path} is no longer the conflicted file git left; it is not resolved this way`,
    };
  }
  const now = o.now ?? Date.now;
  const g = readGrants(grants);
  const ledger = ApprovalGrantLedger.fromState(g.ledger, now);
  const grant = ledger.issue(subjectOf(call.callId, target.path, target.sha256, resource), {
    ttlMs: APPROVAL_TIMEOUT_MS,
  });
  writeGrants(grants, {
    ledger: ledger.exportState(),
    calls: {
      ...g.calls,
      [call.callId]: { id: grant.id, path: target.path, sha256: target.sha256, resource },
    },
  });
  return {
    ask: true,
    question: `a git checkout left a conflict in ${target.path} (repository configuration). Approve this one write to resolve it; the result is checked again before the session goes on, and every other tool call waits.`,
  };
}

/**
 * The host ran the call a conflict question was asked for (its post-tool
 * event): spend the grant, then admit the file as it is now. `null`: this
 * call had no grant (nothing happens).
 */
export async function completeConflictResolution(
  o: Readonly<{
    hold: HoldStore;
    grants: ConflictGrants;
    callId: string | null;
    /** The host's mode word when it ran the call (its post-tool event). */
    hostMode: string | null;
    admit: RepoConfigAdmission;
    onInadmissible?: (
      paths: readonly string[],
      refusals: readonly string[],
    ) => void | Promise<void>;
    now?: () => number;
  }>,
): Promise<
  RepoConfigOutcome | Readonly<{ action: "refused"; code: string; reason: string }> | null
> {
  if (!o.callId) {
    return null;
  }
  const g = readGrants(o.grants);
  const entry = g.calls[o.callId];
  if (!entry) {
    return null;
  }
  const now = o.now ?? Date.now;
  const ledger = ApprovalGrantLedger.fromState(g.ledger, now);
  // The host runs the call only after the person's answer: its post-tool
  // event is that answer. The grant is spent here, once.
  ledger.approve(entry.id);
  const used = ledger.consume(
    entry.id,
    subjectOf(o.callId, entry.path, entry.sha256, entry.resource),
  );
  const { [o.callId]: _spent, ...rest } = g.calls;
  writeGrants(o.grants, { ledger: ledger.exportState(), calls: rest });
  if (!used.ok) {
    return { action: "refused", code: used.code, reason: used.reason };
  }
  // The host ran the call in a mode where its own re-check (a mode switched
  // while the prompt was open) may have approved it: no person's answer is
  // proven, so the written file is not admitted; it goes to the adapter's
  // quarantine and the session stays held.
  const prompt = hostPromptProblem(o.grants, o.hostMode);
  if (prompt) {
    await o.onInadmissible?.([entry.path], [prompt]);
    return { action: "refused", code: "no-person-answer", reason: prompt };
  }
  // The same file: the path still resolves to itself, under the same directory.
  const after = await resolveFsResource(entry.path);
  if (
    after.kind !== "file" ||
    after.realPath !== entry.resource.realPath ||
    after.parent.dev !== entry.resource.parent.dev ||
    after.parent.ino !== entry.resource.parent.ino ||
    // A directory recreated under the same name can reuse the inode number; its birth time is
    // new (compared when both sides have one, as in describeResourceChange).
    (typeof after.parent.born === "string" &&
      typeof entry.resource.parent.born === "string" &&
      after.parent.born !== entry.resource.parent.born)
  ) {
    return {
      action: "refused",
      code: "resource-changed",
      reason: `${entry.path} is not the file the person was asked about`,
    };
  }
  const sha256 = digestOf(entry.path);
  if (!sha256 || sha256 === entry.sha256) {
    return {
      action: "refused",
      code: "not-resolved",
      reason: `${entry.path} still holds the conflict`,
    };
  }
  return handleRepoConfigEvent(
    {
      code: "containment-repo-config-changed",
      paths: [{ path: entry.path, sha256, state: "resolved" }],
    } as unknown as ContainmentEvent,
    {
      hold: o.hold,
      admit: o.admit,
      ...(o.onInadmissible ? { onInadmissible: o.onInadmissible } : {}),
      ...(o.now ? { now: o.now } : {}),
    },
  );
}
