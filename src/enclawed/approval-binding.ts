// enclawed: binding a person's approval to the exact action it was given for.
//
// An approval is a grant with these properties:
//
//   - single use: it authorizes one execution. Consuming it twice is refused
//     ("replayed"), whoever presents it;
//   - bound to the tool, to the exact arguments (SHA-256 of their canonical
//     JSON) and to the resources the action touches, as they were resolved
//     when the person was asked;
//   - short-lived: it expires with the approval request, and an expired
//     grant is refused even if its answer arrives late.
//
// The resources are re-resolved at execution time and compared with what
// was approved. For a file path the identity is what the path designates on
// disk: whether it exists, its type, where it really resolves (every symlink
// on the way followed), its device and inode, its link count and the
// identity of its parent directory. A path swapped for a symlink to another
// file, a file replaced by another one or by a hard link, a parent directory
// renamed or replaced: each is a different resource, and the grant is
// refused, so the action must be asked about again. A file whose content
// changed in place is the same resource (the approval named the target, not
// its bytes). For a URL the identity is its canonical form.
//
// What is NOT a replay: a second execution of the same action that a person
// approves again, and calls covered by a standing grant the person chose
// explicitly ("allow always" for a tool in a session, or an operator's
// pre-approval). Those are new decisions, not reuse of an old one.

import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { canonicalJson } from "./mcp-tool-pins.js";

export type FsResourceKind = "missing" | "file" | "dir" | "symlink" | "other";

export type FsResourceIdentity = Readonly<{
  type: "fs";
  /** The path as the action names it, absolute. */
  absPath: string;
  kind: FsResourceKind;
  /** Where the path really resolves (nearest existing ancestor + rest when missing). */
  realPath: string;
  /** readlink() of the path itself when it is a symlink. */
  linkTarget: string | null;
  dev: number | null;
  ino: number | null;
  nlink: number | null;
  /**
   * The birth time (statx btime, nanoseconds, decimal) of what the path reaches, or null where
   * the filesystem keeps none. An inode number is reused as soon as a file is deleted, so a file
   * removed and recreated under the same name can carry the approved (dev, ino); its birth time
   * is new. An in-place write keeps it.
   */
  born: string | null;
  parent: Readonly<{
    realPath: string;
    dev: number | null;
    ino: number | null;
    born: string | null;
  }>;
}>;

export type UrlResourceIdentity = Readonly<{ type: "url"; url: string }>;

export type ResourceIdentity = FsResourceIdentity | UrlResourceIdentity;

async function realpathNearest(abs: string): Promise<string> {
  let current = abs;
  const rest: string[] = [];
  for (;;) {
    try {
      const real = await fs.realpath(current);
      return rest.length > 0 ? path.join(real, ...rest.toReversed()) : real;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) {
        return abs;
      }
      rest.push(path.basename(current));
      current = parent;
    }
  }
}

function kindOf(st: import("node:fs").Stats): FsResourceKind {
  if (st.isSymbolicLink()) {
    return "symlink";
  }
  if (st.isFile()) {
    return "file";
  }
  if (st.isDirectory()) {
    return "dir";
  }
  return "other";
}

function bornOf(st: import("node:fs").BigIntStats | null): string | null {
  return st && st.birthtimeNs > 0n ? st.birthtimeNs.toString() : null;
}

/** What `absPath` designates on disk right now. */
export async function resolveFsResource(absPath: string): Promise<FsResourceIdentity> {
  const abs = path.resolve(absPath);
  const st = await fs.lstat(abs).catch(() => null);
  const kind: FsResourceKind = st ? kindOf(st) : "missing";
  const linkTarget = kind === "symlink" ? await fs.readlink(abs).catch(() => null) : null;
  // The identity of what the path reaches, following symlinks.
  const target = st ? await fs.stat(abs, { bigint: true }).catch(() => null) : null;
  const parentAbs = path.dirname(abs);
  const parentSt = await fs.stat(parentAbs, { bigint: true }).catch(() => null);
  return Object.freeze({
    type: "fs",
    absPath: abs,
    kind,
    realPath: await realpathNearest(abs),
    linkTarget,
    dev: target ? Number(target.dev) : null,
    ino: target ? Number(target.ino) : null,
    nlink: target ? Number(target.nlink) : null,
    born: bornOf(target),
    parent: Object.freeze({
      realPath: await realpathNearest(parentAbs),
      dev: parentSt ? Number(parentSt.dev) : null,
      ino: parentSt ? Number(parentSt.ino) : null,
      born: bornOf(parentSt),
    }),
  });
}

/** The canonical form of a URL target; null when it is not a URL. */
export function resolveUrlResource(raw: string): UrlResourceIdentity | null {
  try {
    const u = new URL(raw);
    u.hash = "";
    return Object.freeze({ type: "url", url: u.href });
  } catch {
    return null;
  }
}

/**
 * A birth time decides only when both sides have one: a filesystem without btime, or an identity
 * recorded before birth times were (a stored hold), falls back to (dev, ino) alone.
 */
function bornChanged(a: string | null | undefined, b: string | null | undefined): boolean {
  return typeof a === "string" && typeof b === "string" && a !== b;
}

/** Why `now` is not the resource that was approved; null when it is the same. */
export function describeResourceChange(
  approved: ResourceIdentity,
  now: ResourceIdentity,
): string | null {
  if (approved.type !== now.type) {
    return "the target is a different kind of resource";
  }
  if (approved.type === "url" || now.type === "url") {
    return approved.type === "url" && now.type === "url" && approved.url === now.url
      ? null
      : "the URL is not the one approved";
  }
  const a = approved;
  const b = now;
  const where = JSON.stringify(a.absPath);
  if (a.absPath !== b.absPath) {
    return `the target ${JSON.stringify(b.absPath)} is not the approved ${where}`;
  }
  if (a.kind !== b.kind) {
    return `${where} changed from ${a.kind} to ${b.kind}`;
  }
  if (a.linkTarget !== b.linkTarget) {
    return `the symlink ${where} now points elsewhere`;
  }
  if (a.realPath !== b.realPath) {
    return `${where} now resolves to ${JSON.stringify(b.realPath)}, not ${JSON.stringify(a.realPath)}`;
  }
  if (a.dev !== b.dev || a.ino !== b.ino || bornChanged(a.born, b.born)) {
    return `${where} was replaced by another file`;
  }
  if (a.nlink !== b.nlink) {
    return `the link count of ${where} changed (${a.nlink} to ${b.nlink})`;
  }
  if (
    a.parent.realPath !== b.parent.realPath ||
    a.parent.dev !== b.parent.dev ||
    a.parent.ino !== b.parent.ino ||
    bornChanged(a.parent.born, b.parent.born)
  ) {
    return `the directory holding ${where} was renamed or replaced`;
  }
  return null;
}

/** SHA-256 (hex) of the canonical JSON of an action's arguments. */
export function approvalArgsDigest(args: unknown): string {
  return createHash("sha256")
    .update(canonicalJson(args ?? null))
    .digest("hex");
}

export type ApprovalSubject = Readonly<{
  tool: string;
  args: unknown;
  resources?: readonly ResourceIdentity[];
}>;

export type ApprovalGrant = Readonly<{
  id: string;
  tool: string;
  argsDigest: string;
  resources: readonly ResourceIdentity[];
  issuedAtMs: number;
  expiresAtMs: number;
}>;

export type ApprovalRefusalCode =
  | "unknown-grant"
  | "replayed"
  | "expired"
  | "not-approved"
  | "tool-mismatch"
  | "args-mismatch"
  | "resource-changed";

export type ApprovalConsumeResult =
  | { ok: true; grant: ApprovalGrant }
  | { ok: false; code: ApprovalRefusalCode; reason: string };

type GrantState = { grant: ApprovalGrant; approved: boolean; consumedAtMs: number | null };

/** A ledger's grants as plain data (a file-backed ledger shared by processes keeps this). */
export type ApprovalLedgerState = readonly Readonly<GrantState>[];

const MAX_GRANTS = 4096;

/**
 * The grants of one process. A grant is issued when a person is asked,
 * marked approved when the person allows the action, and consumed exactly
 * once, at execution, against the action as it is then.
 */
export class ApprovalGrantLedger {
  private readonly grants = new Map<string, GrantState>();

  constructor(private readonly clock: () => number = () => Date.now()) {}

  /** The grants, for a ledger kept in a file between processes (see fromState). */
  exportState(): ApprovalLedgerState {
    return [...this.grants.values()].map((s) => ({ ...s }));
  }

  /** A ledger with the grants exportState returned (malformed entries are dropped: fail closed). */
  static fromState(state: unknown, clock: () => number = () => Date.now()): ApprovalGrantLedger {
    const l = new ApprovalGrantLedger(clock);
    for (const s of Array.isArray(state) ? (state as unknown[]) : []) {
      const g = (s as GrantState | null)?.grant;
      if (
        g &&
        typeof g.id === "string" &&
        typeof g.tool === "string" &&
        typeof g.argsDigest === "string" &&
        Array.isArray(g.resources) &&
        typeof g.issuedAtMs === "number" &&
        typeof g.expiresAtMs === "number"
      ) {
        // Read from a file: the flags are checked, not trusted.
        const st = s as { approved?: unknown; consumedAtMs?: unknown };
        l.grants.set(g.id, {
          grant: Object.freeze({ ...g, resources: Object.freeze([...g.resources]) }),
          approved: st.approved === true,
          consumedAtMs: typeof st.consumedAtMs === "number" ? st.consumedAtMs : null,
        });
      }
    }
    return l;
  }

  issue(subject: ApprovalSubject, opts: { ttlMs: number }): ApprovalGrant {
    const now = this.clock();
    const grant: ApprovalGrant = Object.freeze({
      id: randomUUID(),
      tool: subject.tool,
      argsDigest: approvalArgsDigest(subject.args),
      resources: Object.freeze([...(subject.resources ?? [])]),
      issuedAtMs: now,
      expiresAtMs: now + Math.max(0, opts.ttlMs),
    });
    this.prune(now);
    this.grants.set(grant.id, { grant, approved: false, consumedAtMs: null });
    return grant;
  }

  /** Record that a person allowed the action. Returns false for an unknown or expired grant. */
  approve(id: string): boolean {
    const state = this.grants.get(id);
    if (!state || state.consumedAtMs !== null || this.clock() > state.grant.expiresAtMs) {
      return false;
    }
    state.approved = true;
    return true;
  }

  /** Drop a grant whose request was denied or abandoned. */
  revoke(id: string): void {
    this.grants.delete(id);
  }

  /**
   * Use the grant for one execution of `current`. The grant is spent by the
   * first attempt, whatever its outcome: a refused attempt must be asked
   * about again.
   */
  consume(id: string, current: ApprovalSubject): ApprovalConsumeResult {
    const state = this.grants.get(id);
    if (!state) {
      return { ok: false, code: "unknown-grant", reason: "the approval is unknown" };
    }
    if (state.consumedAtMs !== null) {
      return { ok: false, code: "replayed", reason: "the approval was already used once" };
    }
    const now = this.clock();
    state.consumedAtMs = now;
    const { grant } = state;
    if (now > grant.expiresAtMs) {
      return { ok: false, code: "expired", reason: "the approval expired before the action ran" };
    }
    if (!state.approved) {
      return { ok: false, code: "not-approved", reason: "no person approved this action" };
    }
    if (current.tool !== grant.tool) {
      return {
        ok: false,
        code: "tool-mismatch",
        reason: `the approval was for ${JSON.stringify(grant.tool)}, not ${JSON.stringify(current.tool)}`,
      };
    }
    if (approvalArgsDigest(current.args) !== grant.argsDigest) {
      return {
        ok: false,
        code: "args-mismatch",
        reason: "the action's arguments are not the ones approved",
      };
    }
    const nowResources = current.resources ?? [];
    if (nowResources.length !== grant.resources.length) {
      return {
        ok: false,
        code: "resource-changed",
        reason: "the action's targets are not the ones approved",
      };
    }
    for (let i = 0; i < grant.resources.length; i += 1) {
      const change = describeResourceChange(grant.resources[i], nowResources[i]);
      if (change) {
        return { ok: false, code: "resource-changed", reason: `${change} after it was approved` };
      }
    }
    return { ok: true, grant };
  }

  private prune(now: number): void {
    for (const [id, state] of this.grants) {
      // A spent grant stays until it expires, so a replay is reported as one.
      if (now > state.grant.expiresAtMs) {
        this.grants.delete(id);
      }
    }
    while (this.grants.size >= MAX_GRANTS) {
      const oldest = this.grants.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.grants.delete(oldest);
    }
  }
}
