// enclawed adapter kit: skill admission. Before a session starts, every skill
// the host would load is verified against its signed formal bundle by the
// biconditional criterion (the framework's proof-carrying skill bundle,
// enclawed/src/skill-formal-bundle.mjs, Methods A/B/C).
//
// A skill's declared specification is its capability set, given in its
// SKILL.md frontmatter (`enclawed-capabilities: [fs.read, spawn.proc]`; none
// declared means none). Its implementation is every file in its directory.
// The skill is admissible only when the effects its scripts can produce
// (Method A, the framework's sound static effect analysis) EQUAL the declared
// set, in both directions:
//
//   (=>) every effect the implementation can produce is declared (no
//        undeclared side effect, no reflective construct that lifts the
//        analysis to TOP, no file the analysis cannot read);
//   (<=) every declared capability is produced by the implementation.
//
// The bundle is a cache, not a trust source: at every launch the skill's
// manifest is recomputed from disk (its content digest pins every file,
// SKILL.md included), the attestation's manifest hash and signature are
// checked against the trust list (./trust.ts), Methods A, B and C are re-run
// and the biconditional is checked again. A skill whose files changed after
// signing is "tampered"; one that no longer reproduces its evidence is
// "drifted"; one with no bundle is "unverified". None of them is admitted.
//
// What stays in the adapter: WHERE its host loads skills from (the skill
// roots: project, user, plugin directories) and how it switches one off.
// The kit enumerates the skills under the roots it is given.
//
// Ported from codenclawed's skills.mjs and formal.mjs.

import fs from "node:fs";
import path from "node:path";
import {
  produceFormalBundle,
  readFormalBundle,
  verifyFormalBundle,
  writeFormalBundle,
  type FormalBundle,
  type FormalManifest,
  type FormalVerdict,
} from "../../../enclawed/src/skill-formal-bundle.mjs";
import { analyzeSkillUses, type SkillUses } from "../../../enclawed/src/skill-formal-uses.mjs";

/** The second pass of Method A over a skill directory (what an adapter shows before signing). */
export { analyzeSkillUses, type SkillUses };
import { canonicalEgressTarget } from "../egress-target.js";
import { canonicalJson } from "../mcp-tool-pins.js";
import { ALL_CAPABILITIES, CAPABILITY } from "../skill-capabilities.js";
import { comparablePath, realpathNearestSync } from "./fs-probe.js";
import { contentDigest } from "./skill-digest.js";

export { contentDigest } from "./skill-digest.js";
import type { SkillSet } from "./rule-kit.js";
import {
  findSigner,
  readSigners,
  sha256Hex,
  type LocalSigner,
  type TrustAuthorizer,
} from "./trust.js";

export const SKILL_CAPS: readonly string[] = ALL_CAPABILITIES;

// ─── The framework's formal pipeline (a seam, so tests can count calls) ──

export type FormalVerifier = Readonly<{
  produceFormalBundle: typeof produceFormalBundle;
  readFormalBundle: typeof readFormalBundle;
  verifyFormalBundle: typeof verifyFormalBundle;
  writeFormalBundle: typeof writeFormalBundle;
}>;

export const frameworkFormal: FormalVerifier = {
  produceFormalBundle,
  readFormalBundle,
  verifyFormalBundle,
  writeFormalBundle,
};

// The bundle's own canonical form (skill-formal-bundle.mjs canonicalize):
// sorted keys, no whitespace, undefined object values left out, undefined
// array elements as null.
function canonicalize(value: unknown): string {
  if (value === undefined) {
    throw new TypeError("cannot canonicalize undefined");
  }
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("cannot canonicalize non-finite number");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalize(v === undefined ? null : v)).join(",")}]`;
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .toSorted()
      .map((k) => `${JSON.stringify(k)}:${canonicalize(o[k])}`)
      .join(",")}}`;
  }
  throw new TypeError(`cannot canonicalize value of type ${typeof value}`);
}

/** SHA-256 of the bundle's canonical form: what an attestation's manifestHash is. */
export function sha256OfCanonical(value: unknown): string {
  return sha256Hex(Buffer.from(canonicalize(value), "utf8"));
}

// ─── Frontmatter ────────────────────────────────────────────────────────

/** The SKILL.md frontmatter as flat key -> string | string[] (the small YAML subset skills use). */
export function parseFrontmatter(
  text: string | null | undefined,
): Record<string, string | string[]> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text ?? "");
  const out: Record<string, string | string[]> = {};
  if (!m) {
    return out;
  }
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(lines[i]);
    if (!kv) {
      continue;
    }
    const [, key, rawValue] = kv;
    const value = rawValue.trim();
    if (value.startsWith("[")) {
      out[key] = value
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((x) => x.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else if (value === "") {
      const list: string[] = [];
      while (i + 1 < lines.length && /^\s+-\s+/.test(lines[i + 1])) {
        list.push(
          lines[++i]
            .replace(/^\s+-\s+/, "")
            .trim()
            .replace(/^["']|["']$/g, ""),
        );
      }
      out[key] = list.length ? list : "";
    } else {
      out[key] = value.replace(/^["']|["']$/g, "");
    }
  }
  return out;
}

/** The declared capability set of a skill (sorted, validated). Throws on an unknown capability. */
export function declaredCaps(front: Record<string, string | string[]>): string[] {
  const raw = front["enclawed-capabilities"];
  const list = raw === undefined || raw === "" ? [] : Array.isArray(raw) ? raw : [raw];
  for (const c of list) {
    if (!SKILL_CAPS.includes(c)) {
      throw new Error(
        `unknown capability ${JSON.stringify(c)} in enclawed-capabilities (known: ${SKILL_CAPS.join(", ")})`,
      );
    }
  }
  return [...new Set(list)].toSorted();
}

/**
 * The declared egress targets of a skill (`enclawed-egress: [...]`), each a
 * destination profile in canonical form (../egress-target.ts), sorted. A
 * bare host still parses (https, 443, no request shape). Throws on a target
 * that does not parse, or on targets declared without net.egress.
 */
export function declaredEgress(
  front: Record<string, string | string[]>,
  caps: readonly string[],
): string[] {
  const raw = front["enclawed-egress"];
  const list = raw === undefined || raw === "" ? [] : Array.isArray(raw) ? raw : [raw];
  const out = [...new Set(list.map((t) => canonicalEgressTarget(t)))].toSorted();
  if (out.length && !caps.includes(CAPABILITY.NET_EGRESS)) {
    throw new Error(
      "enclawed-egress names targets, but enclawed-capabilities does not declare net.egress",
    );
  }
  return out;
}

// ─── Discovery under the roots the adapter names ────────────────────────

/** A directory the host loads skills from: each child with a SKILL.md is a skill. */
export type SkillRoot = Readonly<{
  dir: string;
  /** Where the host takes it from (project, user, plugin, ...): part of the skill's identity. */
  scope: string;
  /** Name prefix the host gives skills of this root (a plugin's "<plugin>:"). */
  prefix?: string;
}>;

export type DiscoveredSkill = Readonly<{
  name: string;
  scope: string;
  /** Real directory. */
  dir: string;
  /** The entry under the root is a symbolic link (its content is not pinned to one place). */
  linkedDir: boolean;
  root: string;
  skillFile: string;
}>;

export type Discovery = Readonly<{ skills: readonly DiscoveredSkill[]; roots: readonly string[] }>;

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function childSkills(root: SkillRoot): DiscoveredSkill[] {
  const out: DiscoveredSkill[] = [];
  let names: fs.Dirent[];
  try {
    names = fs.readdirSync(root.dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const d of names) {
    const dir = path.join(root.dir, d.name);
    if (!(d.isDirectory() || (d.isSymbolicLink() && isDir(dir)))) {
      continue;
    }
    const file = path.join(dir, "SKILL.md");
    if (!fs.existsSync(file)) {
      continue;
    }
    let front: Record<string, string | string[]> = {};
    try {
      front = parseFrontmatter(fs.readFileSync(file, "utf8"));
    } catch {
      front = {};
    }
    const base = typeof front.name === "string" && front.name ? front.name : d.name;
    out.push({
      name: `${root.prefix ?? ""}${base}`,
      scope: root.scope,
      dir: realpathNearestSync(dir),
      linkedDir: d.isSymbolicLink(),
      root: realpathNearestSync(root.dir),
      skillFile: file,
    });
  }
  return out;
}

/**
 * Directories named `segs` (one name, or a directory and a child) below
 * `base`, up to `depth` levels, skipping node_modules and .git (an adapter
 * uses it to find nested skill roots, such as `.claude/skills` below a project).
 */
export function findNestedDirs(
  base: string,
  segs: readonly [string] | readonly [string, string],
  depth: number,
  out: string[] = [],
  budget = { n: 20000 },
): string[] {
  let names: fs.Dirent[];
  try {
    names = fs.readdirSync(base, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const d of names) {
    if (budget.n-- <= 0 || !d.isDirectory() || d.name === "node_modules" || d.name === ".git") {
      continue;
    }
    const p = path.join(base, d.name);
    if (segs.length === 2 && d.name === segs[0] && isDir(path.join(p, segs[1]))) {
      out.push(path.join(p, segs[1]));
    } else if (segs.length === 1 && d.name === segs[0]) {
      out.push(p);
    }
    if (depth > 0) {
      findNestedDirs(p, segs, depth - 1, out, budget);
    }
  }
  return out;
}

/** Every skill under the given roots, one entry per (name, real directory), sorted. */
export function discoverSkills(roots: readonly SkillRoot[]): Discovery {
  const realRoots: string[] = [];
  const skills: DiscoveredSkill[] = [];
  for (const r of roots) {
    if (!isDir(r.dir)) {
      continue;
    }
    realRoots.push(realpathNearestSync(r.dir));
    skills.push(...childSkills(r));
  }
  const seen = new Set<string>();
  const unique = skills.filter((s) => {
    const k = `${s.name}\0${comparablePath(s.dir)}`;
    if (seen.has(k)) {
      return false;
    }
    seen.add(k);
    return true;
  });
  return {
    skills: unique.toSorted((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : a.dir < b.dir ? -1 : 1,
    ),
    roots: [...new Set(realRoots)].toSorted(),
  };
}

// ─── Manifest ───────────────────────────────────────────────────────────

export type SkillManifest = Readonly<{
  id: string;
  version: string;
  caps: readonly string[];
  scope: string;
  dir: string;
  contentDigest: string;
  files: Readonly<Record<string, string>>;
  spec: string;
  /**
   * Declared net.egress targets (canonical destination profiles). Present
   * only when the skill declares some, so a manifest signed before targets
   * existed still compares equal.
   */
  egress?: readonly string[];
  /**
   * Declared write folders (`enclawed-write-roots`), relative to where the
   * skill runs: every write Method A finds must name a literal path inside
   * one. Present only when declared.
   */
  writeRoots?: readonly string[];
}>;

/** The manifest of a skill as it is on disk now: what a bundle attests. Throws when SKILL.md is unreadable or declares an unknown capability. */
export function skillManifest(skill: Pick<DiscoveredSkill, "name" | "scope" | "dir">): {
  manifest: SkillManifest;
  problems: string[];
} {
  const text = fs.readFileSync(path.join(skill.dir, "SKILL.md"), "utf8");
  const front = parseFrontmatter(text);
  const caps = declaredCaps(front);
  const egress = declaredEgress(front, caps);
  const rawRoots = front["enclawed-write-roots"];
  const writeRoots = [
    ...new Set(
      (rawRoots === undefined || rawRoots === ""
        ? []
        : Array.isArray(rawRoots)
          ? rawRoots
          : [rawRoots]
      ).map((r) => {
        if (path.isAbsolute(r) || r.split(/[\\/]/).includes("..")) {
          throw new Error(
            `enclawed-write-roots: ${JSON.stringify(r)} must be a relative folder without ..`,
          );
        }
        return r.replace(/^\.\//, "").replace(/\/+$/, "");
      }),
    ),
  ].toSorted();
  const c = contentDigest(skill.dir);
  return {
    manifest: {
      id: skill.name,
      version: typeof front.version === "string" && front.version ? front.version : "0",
      caps,
      scope: skill.scope,
      dir: skill.dir,
      contentDigest: c.digest,
      files: c.files,
      spec: "SKILL.md frontmatter enclawed-capabilities",
      ...(egress.length ? { egress } : {}),
      ...(writeRoots.length ? { writeRoots } : {}),
    },
    problems: c.problems,
  };
}

type MethodA = {
  unionEffects?: readonly string[];
  opaqueFiles?: readonly string[];
  anyTop?: boolean;
  reason?: string;
  escapingWrites?: readonly { script: string; value: string }[];
  perScript?: Readonly<Record<string, { top?: boolean; reason?: string }>>;
};

/**
 * The biconditional on a fresh Method-A result: implementation effects ==
 * declared capabilities. `uses` is the second pass over the same files
 * (enclawed/src/skill-formal-uses.mjs: every program a script runs and every
 * library member it names, with what it cannot bound): its effects join the
 * implementation's, a script it cannot bound fails the (=>) direction, and its
 * writes are held to the declared write folders like Method A's.
 */
export function biconditional(
  methodA: MethodA,
  declared: readonly string[],
  uses: SkillUses | null = null,
): {
  pass: boolean;
  escaping: string[];
  unrealized: string[];
  opaque: string[];
  top: boolean;
  reasons: string[];
} {
  const effects = new Set([...(methodA.unionEffects ?? []), ...(uses?.unionEffects ?? [])]);
  const decl = new Set(declared);
  const escaping = [...effects].filter((c) => !decl.has(c)).toSorted();
  const unrealized = [...decl].filter((c) => !effects.has(c)).toSorted();
  const opaque = [...(methodA.opaqueFiles ?? [])];
  const top = methodA.anyTop === true;
  const reasons: string[] = [];
  if (top) {
    const where = Object.entries(methodA.perScript ?? {})
      .filter(([, r]) => r.top)
      .map(([f, r]) => `${f}: ${r.reason ?? "reflective"}`);
    reasons.push(
      `a script uses a reflective construct (eval, exec, dynamic import, deserialization into live objects), so its effects cannot be bounded${where.length ? ` (${where.slice(0, 4).join("; ")})` : ""}`,
    );
  }
  const unbounded = uses?.unbounded ?? [];
  if (unbounded.length) {
    reasons.push(
      `a script reaches effects the analysis cannot bound (${unbounded
        .slice(0, 4)
        .map((u) => `${u.script}: ${u.reason}`)
        .join("; ")}${unbounded.length > 4 ? "; ..." : ""})`,
    );
  }
  if (opaque.length) {
    reasons.push(
      `files the analysis cannot read, so their effects are unknown: ${opaque.slice(0, 8).join(", ")}${opaque.length > 8 ? ", ..." : ""}`,
    );
  }
  const writes = [...(methodA.escapingWrites ?? []), ...(uses?.escapingWrites ?? [])].filter(
    (w, i, all) => all.findIndex((x) => x.script === w.script && x.value === w.value) === i,
  );
  if (writes.length) {
    reasons.push(
      `a write can leave the declared folders: ${writes
        .slice(0, 4)
        .map(
          (w) =>
            `${w.script} writes ${w.value === "*" ? "a path it computes" : JSON.stringify(w.value)}`,
        )
        .join(", ")}`,
    );
  }
  if (escaping.length) {
    reasons.push(
      `the implementation produces effects the specification does not declare: ${escaping.join(", ")}`,
    );
  }
  if (unrealized.length) {
    reasons.push(
      `the specification declares capabilities the implementation does not have: ${unrealized.join(", ")}`,
    );
  }
  return {
    pass: reasons.length === 0,
    escaping,
    unrealized,
    opaque,
    top: top || unbounded.length > 0,
    reasons,
  };
}

/** Where a skill's bundle is kept: one directory per (scope, real directory, name). */
export function bundleDirFor(
  skill: Pick<DiscoveredSkill, "name" | "scope" | "dir">,
  storeDir: string,
): string {
  return path.join(
    storeDir,
    sha256Hex(`${skill.scope}\0${comparablePath(skill.dir)}\0${skill.name}`).slice(0, 32),
  );
}

function readJson(f: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return null;
  }
}

export type SkillStatus = "verified" | "unverified" | "tampered" | "drifted" | "failed";

export type SkillResult = Readonly<{
  name: string;
  scope: string;
  dir: string;
  status: SkillStatus;
  reasons: readonly string[];
  caps?: readonly string[];
  contentDigest?: string;
  /** Verified: the per-file digests the attestation pins (relative path -> sha256). */
  files?: Readonly<Record<string, string>>;
  /** Verified: the declared egress targets. */
  egress?: readonly string[];
  signer?: string;
}>;

/** Where bundles are kept (Enclawed's own state: a protected path) and whose signatures count. */
export type SkillStore = Readonly<{
  storeDir: string;
  trustDir: string;
  formal?: FormalVerifier;
}>;

/** Verify one discovered skill against its bundle. */
export function verifySkill(store: SkillStore, skill: DiscoveredSkill): SkillResult {
  const formal = store.formal ?? frameworkFormal;
  const base = { name: skill.name, scope: skill.scope, dir: skill.dir };
  if (skill.linkedDir) {
    return {
      ...base,
      status: "failed",
      reasons: ["the skill directory is a symbolic link; its content is not pinned to one place"],
    };
  }
  let now: ReturnType<typeof skillManifest>;
  try {
    now = skillManifest(skill);
  } catch (err) {
    return {
      ...base,
      status: "failed",
      reasons: [`its specification cannot be read: ${(err as Error).message}`],
    };
  }
  if (now.problems.length) {
    return {
      ...base,
      status: "failed",
      reasons: now.problems.map((p) => `content not pinnable: ${p}`),
    };
  }
  const bdir = bundleDirFor(skill, store.storeDir);
  const stored = readJson(path.join(bdir, "manifest.json")) as SkillManifest | null;
  let bundle: FormalBundle | null = null;
  try {
    bundle = stored ? formal.readFormalBundle(bdir) : null;
  } catch {
    bundle = null;
  }
  if (!stored || !bundle) {
    return {
      ...base,
      status: "unverified",
      reasons: ["no signed formal bundle (a person signs it after review)"],
      caps: now.manifest.caps,
      contentDigest: now.manifest.contentDigest,
    };
  }
  // 1. The attestation pins the stored manifest, and the stored manifest is the skill on disk.
  let storedHash: string | null;
  try {
    storedHash = sha256OfCanonical(stored);
  } catch {
    storedHash = null;
  }
  if (storedHash === null || bundle.attestation?.manifestHash !== storedHash) {
    return {
      ...base,
      status: "tampered",
      reasons: [
        "the bundle's manifest does not match the attestation's manifest hash (the bundle was edited)",
      ],
    };
  }
  if (stored.contentDigest !== now.manifest.contentDigest) {
    const storedFiles = (stored.files ?? {}) as Record<string, string>;
    const changed = [...new Set([...Object.keys(storedFiles), ...Object.keys(now.manifest.files)])]
      .filter((f) => storedFiles[f] !== now.manifest.files[f])
      .toSorted();
    return {
      ...base,
      status: "tampered",
      reasons: [
        `its files changed after it was signed: ${changed.slice(0, 8).join(", ")}${changed.length > 8 ? ", ..." : ""}`,
      ],
    };
  }
  if (canonicalJson(stored) !== canonicalJson(now.manifest)) {
    return {
      ...base,
      status: "tampered",
      reasons: [
        "its manifest (name, version, scope, directory or declared capabilities) changed after it was signed",
      ],
    };
  }
  // 2. Signed by a trusted signer; Methods A, B, C reproduce (the bundle is a cache).
  const keyId = bundle.attestation?.signerKeyId ?? null;
  const signer = keyId ? findSigner(store.trustDir, keyId) : null;
  if (!bundle.attestation?.signature) {
    return { ...base, status: "failed", reasons: ["the bundle's attestation is not signed"] };
  }
  if (!signer) {
    return {
      ...base,
      status: "failed",
      reasons: [`the bundle is signed by ${JSON.stringify(keyId)}, which is not on the trust list`],
    };
  }
  let v: FormalVerdict;
  try {
    v = formal.verifyFormalBundle({
      skillDir: skill.dir,
      manifest: stored as unknown as FormalManifest,
      bundle,
      signerPublicKeyPem: signer.publicKeyPem,
      authorisedFormalSigners: readSigners(store.trustDir).map((s) => s.keyId),
    });
  } catch (err) {
    return {
      ...base,
      status: "failed",
      reasons: [`the bundle cannot be checked: ${(err as Error).message}`],
    };
  }
  if (!v.admit) {
    const drift = v.reasons.some((r) => /cache-miss|drifted/.test(r));
    return {
      ...base,
      status: drift ? "drifted" : "failed",
      reasons: v.reasons.filter((r) => r !== "attestation-unsigned-warning-only"),
    };
  }
  // 3. The biconditional, on the freshly computed Method-A result.
  const fresh = (v.freshlyComputed as { static?: MethodA } | null)?.static ?? {};
  const bi = biconditional(
    fresh,
    stored.caps,
    analyzeSkillUses(skill.dir, stored.writeRoots ?? null),
  );
  if (!bi.pass) {
    return { ...base, status: "failed", reasons: bi.reasons };
  }
  return {
    ...base,
    status: "verified",
    reasons: [],
    caps: stored.caps,
    contentDigest: stored.contentDigest,
    files: stored.files,
    egress: stored.egress ?? [],
    signer: signer.keyId,
  };
}

/**
 * Produce, verify and store a skill's signed formal bundle, after the person
 * is verified. Refuses a skill that does not satisfy the biconditional, and
 * removes a bundle that does not verify once written.
 */
export async function signSkill(
  store: SkillStore,
  skill: DiscoveredSkill,
  signer: Pick<LocalSigner, "keyId" | "privateKeyPem">,
  authorize: TrustAuthorizer,
): Promise<{ manifest: SkillManifest; bundleDir: string; effects: readonly string[] }> {
  const formal = store.formal ?? frameworkFormal;
  if (skill.linkedDir) {
    throw new Error(
      `${skill.name}: the skill directory is a symbolic link; sign the real directory`,
    );
  }
  const { manifest, problems } = skillManifest(skill);
  if (problems.length) {
    throw new Error(`${skill.name}: content not pinnable: ${problems.join("; ")}`);
  }
  // The bundle carries Method A's result as its static evidence; nothing is
  // written before the biconditional holds on it.
  const bundle = formal.produceFormalBundle({
    skillDir: skill.dir,
    manifest: manifest as unknown as FormalManifest,
    signerKeyId: signer.keyId,
    privateKeyPem: signer.privateKeyPem,
  });
  const a = (bundle.evidence?.static ?? {}) as MethodA;
  const uses = analyzeSkillUses(skill.dir, manifest.writeRoots ?? null);
  const bi = biconditional(a, manifest.caps, uses);
  if (!bi.pass) {
    throw new Error(
      `${skill.name} does not satisfy the biconditional criterion, so it is not signed: ${bi.reasons.join("; ")}`,
    );
  }
  if (!bundle.attestation.contained) {
    throw new Error(
      `${skill.name}: the formal bundle does not establish containment (Methods A/B/C), so it is not signed`,
    );
  }
  await authorize(`skills sign ${skill.name}`);
  const dir = bundleDirFor(skill, store.storeDir);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  formal.writeFormalBundle(bundle, dir);
  fs.writeFileSync(path.join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, {
    mode: 0o600,
  });
  const check = verifySkill(store, skill);
  if (check.status !== "verified") {
    fs.rmSync(dir, { recursive: true, force: true });
    throw new Error(
      `${skill.name}: the bundle just written does not verify (${check.reasons.join("; ")})`,
    );
  }
  return {
    manifest,
    bundleDir: dir,
    effects: [...new Set([...(a.unionEffects ?? []), ...uses.unionEffects])].toSorted(),
  };
}

/** Remove a skill's bundle (it is unverified again), after the person is verified. */
export async function unsignSkill(
  store: SkillStore,
  skill: DiscoveredSkill,
  authorize: TrustAuthorizer,
): Promise<boolean> {
  const dir = bundleDirFor(skill, store.storeDir);
  if (!fs.existsSync(dir)) {
    return false;
  }
  await authorize(`skills unsign ${skill.name}`);
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

// ─── The session's skills ───────────────────────────────────────────────

export type SessionSkills = SkillSet &
  Readonly<{
    verified: readonly {
      name: string;
      scope: string;
      dir: string;
      contentDigest: string;
      caps: readonly string[];
      files: Readonly<Record<string, string>>;
      egress: readonly string[];
    }[];
    excluded: readonly { name: string; scope: string; dir: string; status: SkillStatus }[];
  }>;

export type SkillAdmission =
  | Readonly<{
      ok: true;
      session: SessionSkills;
      results: readonly SkillResult[];
      warnings: readonly string[];
    }>
  | Readonly<{ ok: false; message: string; results: readonly SkillResult[] }>;

/**
 * The launch's skill decision. "refuse" (the default): any skill that is not
 * verified refuses the launch. "exclude": unverified skills are listed in
 * `excluded`, for the adapter to switch off, and the rest start.
 */
export function admitSkills(
  store: SkillStore,
  discovered: Discovery,
  mode: "refuse" | "exclude" = "refuse",
): SkillAdmission {
  const results = discovered.skills.map((s) => verifySkill(store, s));
  const bad = results.filter((r) => r.status !== "verified");
  if (bad.length && mode !== "exclude") {
    const list = bad
      .slice(0, 5)
      .map((r) => `${r.name} (${r.scope}, ${r.status}: ${r.reasons[0] ?? ""})`)
      .join("; ");
    return {
      ok: false,
      results,
      message: `${bad.length} skill(s) the agent CLI would load are not admissible, so the session is not started: ${list}${bad.length > 5 ? "; ..." : ""}. A skill is admitted only when its implementation does exactly what its declared specification states, in both directions, and a trusted signer attested it. After review, a person signs it, or removes it`,
    };
  }
  const verified = results.filter((r) => r.status === "verified");
  return {
    ok: true,
    results,
    warnings: bad.map(
      (r) =>
        `skill ${r.name} (${r.scope}) is ${r.status} and is switched off for this session: ${r.reasons[0] ?? ""}`,
    ),
    session: {
      verified: verified.map((r) => ({
        name: r.name,
        scope: r.scope,
        dir: r.dir,
        contentDigest: r.contentDigest ?? "",
        caps: r.caps ?? [],
        files: r.files ?? {},
        egress: r.egress ?? [],
      })),
      excluded: bad.map((r) => ({ name: r.name, scope: r.scope, dir: r.dir, status: r.status })),
      roots: discovered.roots,
    },
  };
}

/**
 * Has the session's set of skills drifted? A verified skill whose files
 * changed, or a skill that appeared (or reappeared) that was not seen at
 * launch. Returns the reason, or null. `rediscover` re-reads the host's
 * skill roots.
 */
export function skillDrift(session: SessionSkills, rediscover: () => Discovery): string | null {
  for (const s of session.verified) {
    let d: { digest: string | null; problems: string[] };
    try {
      d = contentDigest(s.dir);
    } catch {
      d = { digest: null, problems: ["gone"] };
    }
    if (d.digest !== s.contentDigest || d.problems.length) {
      return `the files of the verified skill ${s.name} changed during the session`;
    }
  }
  const known = new Set(
    [...session.verified, ...session.excluded].map((s) => `${s.name}\0${comparablePath(s.dir)}`),
  );
  const added = rediscover().skills.find((s) => !known.has(`${s.name}\0${comparablePath(s.dir)}`));
  return added
    ? `a skill appeared during the session that was not verified at launch: ${added.name} (${added.scope}, ${added.dir})`
    : null;
}

/** Poll skillDrift; `onDrift(reason)` once. */
export function watchSkills(
  session: SessionSkills,
  rediscover: () => Discovery,
  onDrift: (reason: string) => void,
  intervalMs = 1000,
): { check: () => string | null; stop: () => void } {
  let fired = false;
  const check = () => {
    if (fired) {
      return null;
    }
    const why = skillDrift(session, rediscover);
    if (why) {
      fired = true;
    }
    return why;
  };
  const t = setInterval(() => {
    const why = check();
    if (why) {
      clearInterval(t);
      onDrift(why);
    }
  }, intervalMs);
  t.unref?.();
  return { check, stop: () => clearInterval(t) };
}
