// Biconditional correctness check (paper §5).
//
// Given a corpus delta D = delta(s_0, s_1) observed between two corpus
// snapshots and the audit log L for the same agent run, the run "passes
// the biconditional" iff:
//
//     multiset(D, by (op,target)) == multiset(S, by (op,target))
//
// where S = { r in L | r.type == "irreversible.executed" && r.ok == true }.
//
// Failure modes detected (paper Proposition 5.3):
//   F1: gate bypass        — corpus change with no matching audit record
//   F2: audit forgery      — audit record with no matching corpus change
//   F3: approved-but-failed-without-note — captured because S restricts to
//                            ok=true; a silent host failure that still
//                            mutated the corpus produces F1 instead
//   F4: wrong-target       — caught because the projection includes target
//
// Failure modes outside scope (paper §5.4): read-only exfiltration, TOCTOU
// races on the corpus, overlap with a malicious actor.

import { open } from "node:fs/promises";

import { projectionKey } from "./skill-capabilities.js";
import type { AuditRecord } from "./audit-log.js";

// A single corpus-delta observation. The "op" string is mapped onto the
// capability vocabulary by the caller — typically "fs.write.irrev" for
// destructive file ops, "publish" for outbound messages, etc. The
// biconditional is agnostic to corpus type.
export type CorpusDeltaEntry = Readonly<{
  op: string;
  target: string;
  count?: number;
}>;

export type BiconditionalReport =
  | { ok: true; matched: number }
  | {
      ok: false;
      f1Bypass: ReadonlyArray<{ op: string; target: string; count: number }>;
      f2Forgery: ReadonlyArray<{ op: string; target: string; count: number }>;
    };

function multisetFromDelta(delta: ReadonlyArray<CorpusDeltaEntry>): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of delta) {
    const key = projectionKey({ cap: e.op, target: e.target });
    m.set(key, (m.get(key) ?? 0) + (e.count ?? 1));
  }
  return m;
}

function multisetFromAudit(records: ReadonlyArray<AuditRecord>): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of records) {
    if (r.type !== "irreversible.executed") continue;
    const payload = r.payload as { ok?: unknown; call?: { cap?: unknown; target?: unknown } };
    if (payload?.ok !== true) continue;
    const cap = payload.call?.cap;
    const target = payload.call?.target;
    if (typeof cap !== "string" || typeof target !== "string") continue;
    const key = projectionKey({ cap, target });
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return m;
}

export function checkBiconditional(input: {
  delta: ReadonlyArray<CorpusDeltaEntry>;
  audit: ReadonlyArray<AuditRecord>;
}): BiconditionalReport {
  const dMap = multisetFromDelta(input.delta);
  const sMap = multisetFromAudit(input.audit);

  const f1: { op: string; target: string; count: number }[] = [];
  const f2: { op: string; target: string; count: number }[] = [];

  for (const [key, dCount] of dMap) {
    const sCount = sMap.get(key) ?? 0;
    if (dCount > sCount) {
      f1.push({ ...splitKey(key), count: dCount - sCount });
    }
  }
  for (const [key, sCount] of sMap) {
    const dCount = dMap.get(key) ?? 0;
    if (sCount > dCount) {
      f2.push({ ...splitKey(key), count: sCount - dCount });
    }
  }

  if (f1.length === 0 && f2.length === 0) {
    let matched = 0;
    for (const v of dMap.values()) matched += v;
    return { ok: true, matched };
  }
  return { ok: false, f1Bypass: f1, f2Forgery: f2 };
}

function splitKey(key: string): { op: string; target: string } {
  try {
    const arr = JSON.parse(key) as unknown;
    if (Array.isArray(arr) && arr.length === 2 && typeof arr[0] === "string" && typeof arr[1] === "string") {
      return { op: arr[0], target: arr[1] };
    }
  } catch {
    // fall through
  }
  return { op: key, target: "" };
}

// Read an audit log file (JSONL written by AuditLogger) into an array of
// AuditRecord. Used by integration tests and the post-hoc verifier.
export async function readAuditRecords(filePath: string): Promise<AuditRecord[]> {
  const fh = await open(filePath, "r");
  try {
    const data = await fh.readFile("utf8");
    const lines = data.split("\n").filter(Boolean);
    return lines.map((l) => JSON.parse(l) as AuditRecord);
  } finally {
    await fh.close();
  }
}
