// enclawed adapter kit: which policy governs a session. The organization's
// managed policy, the user's own policy file, and the flavor's default,
// layered tighten-only.
//
//   managed   The organization's policy. It must pass the framework's
//             root-owned file check; a managed file that exists but fails
//             the check, or is not valid, REFUSES the start (a policy an
//             unprivileged user could have written is never used). Only this
//             file may set the flavor.
//   user      The user's own policy (the first that exists of the adapter's
//             candidates: its own file, the gateway's config, ...).
//
// The flavor is the managed policy's (open without one), raised to enclaved
// when the user's shell asks for it, never lowered. With a managed policy, or
// in the enclaved flavor, the user's policy is layered TIGHTEN-ONLY over the
// base (the managed policy, or the flavor default) with the framework's own
// tightenPolicy: a user value that would widen the base is refused (the base
// value stays) and reported. One exception: in the enclaved flavor WITHOUT a
// managed policy the user's allowlists are taken as written, with enforcement
// on (the flavor default allows no tool, and there is no organization's list
// to protect). In the open flavor without a managed policy the user's file is
// the policy.
//
// The adapter options (AdapterOptions) are layered the same way: a user value
// that weakens the base (the input cleaner off, no credential erase on a halt,
// a longer unlock, bundled skills on, more connectors or overwritable paths,
// replacing an organization's workflow) is refused.
//
// Ported from codenclawed's policy.mjs.

import fs from "node:fs";
import path from "node:path";
import { parsePolicyJson, extractPolicyBlock } from "../policy-loader.js";
import { tightenPolicy } from "../policy-tighten.js";
import {
  createPolicy,
  defaultEnclavedPolicy,
  defaultOpenPolicy,
  HISTORY_MAX_AGE_DAYS,
  HISTORY_MIN_AGE_DAYS,
  type Policy,
} from "../policy.js";
import type { AdminFileCheck } from "./admin-grants.js";
import { rootOwnedFileCheck } from "./admin-grants.js";
import { stricterFlavor, type Flavor } from "./session.js";
import type { CleanerMode } from "./types.js";
import { parseWorkflowOptions } from "./workflow.js";

// ─── Adapter options ────────────────────────────────────────────────────

export type AdapterOptions = Readonly<{
  /** Hidden characters removed from tool results ("on"), only recorded ("audit"), or neither ("off"). */
  inputCleaner: CleanerMode;
  /** Erase the host's login on a hardware halt. */
  eraseCredentialsOnHalt: boolean;
  /** How long one activation unlocks, in minutes (1 to 480). */
  unlockMinutes: number;
  /** The second-factor method ("fido2", or "auto" to pick the enrolled one); null: the default. */
  authMethod: "auto" | "fido2" | null;
  skills: Readonly<{ unverified: "refuse" | "exclude"; bundled: "off" | "on" }>;
  /** The host's account-level connectors' tools the policy turns on (off unless listed). */
  connectors: readonly string[];
  /** Paths the agent may overwrite although git does not track them. */
  overwritablePaths: readonly string[];
  workflows: Readonly<Record<string, unknown>>;
  projectWorkflows: Readonly<Record<string, string>>;
  /** Set only by the managed policy. */
  flavor: Flavor | null;
}>;

export const DEFAULT_ADAPTER_OPTIONS: AdapterOptions = Object.freeze({
  inputCleaner: "on",
  eraseCredentialsOnHalt: true,
  unlockMinutes: 10,
  authMethod: null,
  skills: Object.freeze({ unverified: "refuse", bundled: "off" }),
  connectors: [],
  overwritablePaths: [],
  workflows: {},
  projectWorkflows: {},
  flavor: null,
});

const CLEANER_MODES: readonly CleanerMode[] = ["on", "audit", "off"];
const AUTH_METHODS = ["auto", "fido2"] as const;
/** Methods whose secret or key lives on the host: they no longer count as a second factor. */
const RETIRED_AUTH_METHODS: ReadonlySet<string> = new Set([
  "windows-hello",
  "macos",
  "sudo",
  "passphrase",
]);

/** How the adapter's options block names the kit's options (host data). */
export type AdapterOptionNames = Readonly<{
  /** The block's name, for messages ("codenclawed"). */
  block: string;
  /** The key under onHardwareHalt that erases the host's login ("eraseClaudeCredentials"). */
  eraseKey?: string;
  /** The key that lists account connectors ("claudeAiConnectors"). */
  connectorsKey?: string;
  /** What a connector tool name must look like. */
  connectorPattern?: RegExp;
}>;

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** An overwritable path entry: not empty, not a root, no ".." segment. */
function badOverwritable(e: unknown): boolean {
  if (typeof e !== "string" || e.trim() === "" || e.includes("\0")) {
    return true;
  }
  if (e.split(/[\\/]+/).includes("..")) {
    return true;
  }
  const r = path.resolve("/x", e);
  return r === "/x" || path.parse(r).root === r;
}

/** Parse the adapter's options block; throws on anything not as documented. */
export function parseAdapterOptions(
  block: unknown,
  o: AdapterOptionNames & { managed: boolean },
): AdapterOptions {
  const eraseKey = o.eraseKey ?? "eraseCredentials";
  const connectorsKey = o.connectorsKey ?? "connectors";
  const at = (k: string) => `${o.block}.${k}`;
  if (block === undefined) {
    return DEFAULT_ADAPTER_OPTIONS;
  }
  if (!isObject(block)) {
    throw new Error(`the top-level ${o.block} block must be an object`);
  }
  const known: ReadonlySet<string> = new Set([
    "onHardwareHalt",
    "auth",
    "inputCleaner",
    "workflows",
    "projectWorkflows",
    "skills",
    connectorsKey,
    "overwritablePaths",
    "flavor",
  ]);
  for (const k of Object.keys(block)) {
    if (!known.has(k)) {
      throw new Error(`unknown key ${at(k)}`);
    }
  }
  let flavor: Flavor | null = null;
  if (block.flavor !== undefined) {
    if (!o.managed) {
      throw new Error(
        `${at("flavor")} is set only by the organization's managed policy (root-owned); remove it from this file`,
      );
    }
    if (block.flavor !== "open" && block.flavor !== "enclaved") {
      throw new Error(`${at("flavor")} must be exactly one of open, enclaved`);
    }
    flavor = block.flavor;
  }
  const wf = parseWorkflowOptions(block);
  let connectors: string[] = [];
  const c = block[connectorsKey];
  if (c !== undefined) {
    if (
      !Array.isArray(c) ||
      c.some(
        (t: unknown) =>
          typeof t !== "string" || (o.connectorPattern ? !o.connectorPattern.test(t) : t === ""),
      )
    ) {
      throw new Error(`${at(connectorsKey)} must be a list of the host's connector tool names`);
    }
    connectors = [...(c as string[])];
  }
  let overwritablePaths: string[] = [];
  const ow = block.overwritablePaths;
  if (ow !== undefined) {
    if (!Array.isArray(ow) || ow.some(badOverwritable)) {
      throw new Error(
        `${at("overwritablePaths")} must be a list of paths (absolute, or relative to the project); "", ".", a filesystem root and ".." segments are refused`,
      );
    }
    overwritablePaths = [...(ow as string[])];
  }
  const skills = { ...DEFAULT_ADAPTER_OPTIONS.skills };
  if (block.skills !== undefined) {
    if (!isObject(block.skills)) {
      throw new Error(`${at("skills")} must be an object`);
    }
    for (const [k, v] of Object.entries(block.skills)) {
      if (k === "unverified") {
        if (v !== "refuse" && v !== "exclude") {
          throw new Error(`${at("skills.unverified")} must be one of refuse, exclude`);
        }
        skills.unverified = v;
      } else if (k === "bundled") {
        if (v !== "off" && v !== "on") {
          throw new Error(`${at("skills.bundled")} must be one of off, on`);
        }
        skills.bundled = v;
      } else {
        throw new Error(`unknown key ${at(`skills.${k}`)}`);
      }
    }
  }
  let inputCleaner = DEFAULT_ADAPTER_OPTIONS.inputCleaner;
  if (block.inputCleaner !== undefined) {
    const m = CLEANER_MODES.find((x) => x === block.inputCleaner);
    if (!m) {
      throw new Error(`${at("inputCleaner")} must be one of ${CLEANER_MODES.join(", ")}`);
    }
    inputCleaner = m;
  }
  let eraseCredentialsOnHalt = DEFAULT_ADAPTER_OPTIONS.eraseCredentialsOnHalt;
  const h = block.onHardwareHalt;
  if (h !== undefined) {
    if (!isObject(h)) {
      throw new Error(`${at("onHardwareHalt")} must be an object`);
    }
    for (const [k, v] of Object.entries(h)) {
      if (k !== eraseKey) {
        throw new Error(`unknown key ${at(`onHardwareHalt.${k}`)}`);
      }
      if (typeof v !== "boolean") {
        throw new Error(`${at(`onHardwareHalt.${eraseKey}`)} must be true or false`);
      }
      eraseCredentialsOnHalt = v;
    }
  }
  let unlockMinutes = DEFAULT_ADAPTER_OPTIONS.unlockMinutes;
  let authMethod: AdapterOptions["authMethod"] = null;
  const a = block.auth;
  if (a !== undefined) {
    if (!isObject(a)) {
      throw new Error(`${at("auth")} must be an object`);
    }
    for (const [k, v] of Object.entries(a)) {
      if (k === "method") {
        if (typeof v === "string" && RETIRED_AUTH_METHODS.has(v)) {
          throw new Error(
            `${at("auth.method")} "${v}" no longer satisfies two-factor authentication (its secret or key lives on this computer); use "fido2" and enroll a security key`,
          );
        }
        const m = AUTH_METHODS.find((x) => x === v);
        if (!m) {
          throw new Error(`${at("auth.method")} must be one of ${AUTH_METHODS.join(", ")}`);
        }
        authMethod = m;
      } else if (k === "required") {
        if (v !== true) {
          throw new Error(
            `${at("auth.required")} can only be true: two-factor authentication is mandatory`,
          );
        }
      } else if (k === "unlockMinutes") {
        if (!(typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 480)) {
          throw new Error(
            `${at("auth.unlockMinutes")} must be a whole number of minutes from 1 to 480`,
          );
        }
        unlockMinutes = v;
      } else {
        throw new Error(`unknown key ${at(`auth.${k}`)}`);
      }
    }
  }
  return {
    inputCleaner,
    eraseCredentialsOnHalt,
    unlockMinutes,
    authMethod,
    skills,
    connectors,
    overwritablePaths,
    workflows: wf.workflows,
    projectWorkflows: wf.projectWorkflows,
    flavor,
  };
}

const CLEANER_RANK: Readonly<Record<CleanerMode, number>> = { off: 0, audit: 1, on: 2 };

/**
 * Tighten-only layering of the user's options over the base's. `set`: which
 * of the user's options the user's block actually set (an unset one keeps
 * the base's).
 */
export function tightenAdapterOptions(
  base: AdapterOptions,
  user: AdapterOptions,
  set: ReadonlySet<keyof AdapterOptions | "skills.unverified" | "skills.bundled">,
  o: { userLists?: boolean; block?: string } = {},
): { options: AdapterOptions; refused: string[] } {
  const b = o.block ?? "options";
  const refused: string[] = [];
  let inputCleaner = base.inputCleaner;
  if (set.has("inputCleaner")) {
    if (CLEANER_RANK[user.inputCleaner] < CLEANER_RANK[base.inputCleaner]) {
      refused.push(`${b}.inputCleaner=${user.inputCleaner}`);
    } else {
      inputCleaner = user.inputCleaner;
    }
  }
  let eraseCredentialsOnHalt = base.eraseCredentialsOnHalt;
  if (set.has("eraseCredentialsOnHalt")) {
    if (base.eraseCredentialsOnHalt && !user.eraseCredentialsOnHalt) {
      refused.push(`${b}.onHardwareHalt (credential erase off)`);
    } else {
      eraseCredentialsOnHalt = user.eraseCredentialsOnHalt;
    }
  }
  let unlockMinutes = base.unlockMinutes;
  if (set.has("unlockMinutes")) {
    if (user.unlockMinutes > base.unlockMinutes) {
      refused.push(`${b}.auth.unlockMinutes=${user.unlockMinutes} (base ${base.unlockMinutes})`);
    } else {
      unlockMinutes = user.unlockMinutes;
    }
  }
  const authMethod = set.has("authMethod") ? user.authMethod : base.authMethod;
  const skills = { ...base.skills };
  if (set.has("skills.unverified")) {
    // "refuse" and "exclude" both keep an unverified skill out of the session.
    skills.unverified = user.skills.unverified;
  }
  if (set.has("skills.bundled")) {
    if (user.skills.bundled === "on" && base.skills.bundled === "off") {
      refused.push(`${b}.skills.bundled="on"`);
    } else {
      skills.bundled = user.skills.bundled;
    }
  }
  const narrow = (key: "connectors" | "overwritablePaths"): readonly string[] => {
    if (!set.has(key)) {
      return base[key];
    }
    const allowed = new Set(base[key]);
    return user[key].filter((v) => {
      if (allowed.has(v)) {
        return true;
      }
      refused.push(`${b}.${key} += ${JSON.stringify(v)}`);
      return false;
    });
  };
  const connectors = narrow("connectors");
  // No organization's list to protect (enclaved flavor, no managed policy):
  // the user's own project declarations, like their allowlists.
  const overwritablePaths =
    o.userLists && set.has("overwritablePaths")
      ? [...user.overwritablePaths]
      : narrow("overwritablePaths");
  // Workflow profiles only narrow a session; the base's own profiles and
  // project bindings stay as they are.
  const workflows: Record<string, unknown> = { ...base.workflows };
  for (const [name, prof] of Object.entries(user.workflows)) {
    if (Object.hasOwn(base.workflows, name)) {
      refused.push(`${b}.workflows.${name} (replaces the organization's profile)`);
    } else {
      workflows[name] = prof;
    }
  }
  const projectWorkflows: Record<string, string> = { ...base.projectWorkflows };
  for (const [dir, name] of Object.entries(user.projectWorkflows)) {
    if (Object.hasOwn(base.projectWorkflows, dir) && base.projectWorkflows[dir] !== name) {
      refused.push(`${b}.projectWorkflows[${JSON.stringify(dir)}] (bound by the organization)`);
    } else {
      projectWorkflows[dir] = name;
    }
  }
  return {
    options: {
      inputCleaner,
      eraseCredentialsOnHalt,
      unlockMinutes,
      authMethod,
      skills,
      connectors,
      overwritablePaths,
      workflows,
      projectWorkflows,
      flavor: base.flavor,
    },
    refused,
  };
}

/** Which kit options a raw options block sets. */
export function optionsSet(
  block: unknown,
  names: AdapterOptionNames,
): Set<keyof AdapterOptions | "skills.unverified" | "skills.bundled"> {
  const s = new Set<keyof AdapterOptions | "skills.unverified" | "skills.bundled">();
  if (!isObject(block)) {
    return s;
  }
  const eraseKey = names.eraseKey ?? "eraseCredentials";
  if (block.inputCleaner !== undefined) {
    s.add("inputCleaner");
  }
  if (isObject(block.onHardwareHalt) && block.onHardwareHalt[eraseKey] !== undefined) {
    s.add("eraseCredentialsOnHalt");
  }
  if (isObject(block.auth) && block.auth.unlockMinutes !== undefined) {
    s.add("unlockMinutes");
  }
  if (isObject(block.auth) && block.auth.method !== undefined) {
    s.add("authMethod");
  }
  if (isObject(block.skills) && block.skills.unverified !== undefined) {
    s.add("skills.unverified");
  }
  if (isObject(block.skills) && block.skills.bundled !== undefined) {
    s.add("skills.bundled");
  }
  if (block[names.connectorsKey ?? "connectors"] !== undefined) {
    s.add("connectors");
  }
  if (block.overwritablePaths !== undefined) {
    s.add("overwritablePaths");
  }
  if (block.workflows !== undefined) {
    s.add("workflows");
  }
  if (block.projectWorkflows !== undefined) {
    s.add("projectWorkflows");
  }
  return s;
}

// ─── The policy ─────────────────────────────────────────────────────────

const ALLOWLISTS = ["allowedChannels", "allowedProviders", "allowedTools", "allowedHosts"] as const;

function flavorDefault(flavor: Flavor): Policy {
  return flavor === "enclaved" ? defaultEnclavedPolicy() : defaultOpenPolicy();
}

// ─── History limits ─────────────────────────────────────────────────────

/**
 * The bounds of a policy's history limits (internal constants, never
 * settings): maxAgeDays a whole number of days from 7 to 365 (the framework's
 * own floor and ceiling), maxFileBytes up to 256 MiB, maxTotalBytes up to
 * 64 GiB. A value outside them refuses the policy: a huge cap would let one
 * write fill the disk with history, a tiny one would make every write
 * irreversible.
 */
export const HISTORY_LIMIT_BOUNDS = Object.freeze({
  maxAgeDays: Object.freeze({ min: HISTORY_MIN_AGE_DAYS, max: HISTORY_MAX_AGE_DAYS, unit: "days" }),
  maxFileBytes: Object.freeze({ min: 1, max: 256 * 1024 * 1024, unit: "bytes" }),
  maxTotalBytes: Object.freeze({ min: 1, max: 64 * 1024 * 1024 * 1024, unit: "bytes" }),
});

/** Throw when a history block's limits are outside HISTORY_LIMIT_BOUNDS. `where` names it in the message. */
export function checkHistoryLimits(history: unknown, where = "enclawed.policy.history"): void {
  if (!isObject(history)) {
    return;
  }
  for (const [k, b] of Object.entries(HISTORY_LIMIT_BOUNDS)) {
    const v = history[k];
    if (
      v !== undefined &&
      !(Number.isSafeInteger(v) && (v as number) >= b.min && (v as number) <= b.max)
    ) {
      throw new Error(
        `${where}.${k} must be a whole number of ${b.unit} from ${b.min} to ${b.max}`,
      );
    }
  }
}

function parseOver(base: Policy, block: unknown): Policy {
  if (isObject(block)) {
    checkHistoryLimits(block.history);
  }
  return parsePolicyJson(block, {
    maxOutputClearance: base.maxOutputClearance,
    defaultDataLabel: base.defaultDataLabel,
    enforceAllowlists: base.enforceAllowlists,
  });
}

/** A policy document's `enclawed.policy` block over the flavor's default (history limits bounded). */
export function parsePolicyDocument(doc: unknown, flavor: Flavor): Policy {
  return parseOver(flavorDefault(flavor), extractPolicyBlock(doc));
}

/**
 * The user's `enclawed.policy` block over an authoritative base, tighten-only
 * (the framework's tightenPolicy). `userAllowlists`: the base is the enclaved
 * flavor default with no managed policy, so the user's allowlists are taken
 * as written; everything else stays tighten-only and enforcement stays on.
 */
export function layerUserPolicy(
  base: Policy,
  userBlock: unknown,
  o: { userAllowlists?: boolean } = {},
): { policy: Policy; refused: readonly string[] } {
  if (userBlock === undefined || userBlock === null) {
    return { policy: base, refused: [] };
  }
  if (isObject(userBlock)) {
    checkHistoryLimits(userBlock.history);
  }
  if (!o.userAllowlists) {
    return tightenPolicy(base, userBlock);
  }
  if (!isObject(userBlock)) {
    throw new TypeError("enclawed.policy must be an object");
  }
  const user = parseOver(base, userBlock);
  const rest: Record<string, unknown> = { ...userBlock };
  for (const k of ALLOWLISTS) {
    delete rest[k];
  }
  const t = tightenPolicy(base, rest);
  const p = t.policy;
  const pick = (k: (typeof ALLOWLISTS)[number]) => (userBlock[k] === undefined ? p[k] : user[k]);
  return {
    policy: createPolicy({
      enforceAllowlists: true,
      allowedChannels: pick("allowedChannels"),
      allowedProviders: pick("allowedProviders"),
      allowedTools: pick("allowedTools"),
      allowedHosts: pick("allowedHosts"),
      commandNetwork: p.commandNetwork,
      preApprovedIrreversibleTools: p.preApprovedIrreversibleTools,
      scratchPaths: p.scratchPaths,
      history: p.history,
      maxOutputClearance: p.maxOutputClearance,
      defaultDataLabel: p.defaultDataLabel,
    }),
    refused: t.refused,
  };
}

/** A policy file candidate: `kind` names where it comes from (host data); "managed" is the organization's. */
export type PolicyCandidate = Readonly<{ kind: string; path: string }>;

export type LayeredPolicy = Readonly<{
  policy: Policy;
  options: AdapterOptions;
  flavor: Flavor;
  /** The file the user's policy came from, or the base's description. */
  source: string;
  kind: string | null;
  baseSource: string;
  /** Widening values of the user's file that were refused (and must be reported and audited). */
  refused: readonly string[];
  /** A user file that was not read (shared with another program and not plain JSON). */
  note: string | null;
}>;

/** Read the options block of a policy document (the adapter's block name, and a legacy one if it has one). */
function optionsBlockOf(doc: unknown, names: readonly string[]): unknown {
  if (!isObject(doc)) {
    return undefined;
  }
  const present = names.filter((n) => Object.hasOwn(doc, n));
  if (present.length > 1) {
    throw new Error(
      `the policy file has more than one options block (${present.join(", ")}); merge them into ${names[0]}`,
    );
  }
  return present.length ? doc[present[0]] : undefined;
}

/**
 * The session's policy and options. `candidates`: "managed" (the
 * organization's), then the user's files in order (the first that exists is
 * read). `shellFlavor`: what the user's shell asks for (it can only raise the
 * managed policy's). `sharedKinds`: candidate kinds shared with another
 * program; in the open flavor a broken one falls back to the base instead of
 * refusing the start. Throws (the start is refused) on an untrusted or
 * invalid managed policy and on an invalid user policy.
 */
export function layerPolicies(o: {
  candidates: readonly PolicyCandidate[];
  shellFlavor: Flavor | null;
  names: AdapterOptionNames & { legacyBlocks?: readonly string[] };
  sharedKinds?: readonly string[];
  check?: AdminFileCheck;
}): LayeredPolicy {
  const check = o.check ?? rootOwnedFileCheck();
  const blocks = [o.names.block, ...(o.names.legacyBlocks ?? [])];
  const managedPath = o.candidates.find((c) => c.kind === "managed")?.path ?? null;
  let managed: { doc: unknown; options: AdapterOptions; path: string } | null = null;
  if (managedPath && lexists(managedPath)) {
    const c = check(managedPath);
    if (!c.ok) {
      throw new Error(
        `the managed policy ${managedPath} cannot be trusted (${c.reason}); a policy file an unprivileged user could have written is not used, and the start is refused`,
      );
    }
    let doc: unknown;
    try {
      doc = JSON.parse(fs.readFileSync(managedPath, "utf8"));
    } catch (err) {
      throw new Error(
        `the managed policy ${managedPath} is not valid JSON: ${(err as Error).message}`,
        {
          cause: err,
        },
      );
    }
    try {
      managed = {
        doc,
        options: parseAdapterOptions(optionsBlockOf(doc, blocks), { ...o.names, managed: true }),
        path: managedPath,
      };
    } catch (err) {
      throw new Error(`the managed policy ${managedPath} is invalid: ${(err as Error).message}`, {
        cause: err,
      });
    }
  }
  const flavor = stricterFlavor(managed?.options.flavor ?? "open", o.shellFlavor);
  let basePolicy = flavorDefault(flavor);
  if (managed) {
    try {
      basePolicy = parseOver(basePolicy, extractPolicyBlock(managed.doc));
    } catch (err) {
      throw new Error(`the managed policy ${managed.path} is invalid: ${(err as Error).message}`, {
        cause: err,
      });
    }
  }
  const baseOptions = managed ? managed.options : DEFAULT_ADAPTER_OPTIONS;
  const baseSource = managed ? managed.path : `${flavor} default`;
  const base = {
    policy: basePolicy,
    options: baseOptions,
    flavor,
    refused: [] as string[],
    baseSource,
  };
  const found = o.candidates.find((c) => c.kind !== "managed" && fs.existsSync(c.path));
  if (!found) {
    return managed
      ? { ...base, source: managed.path, kind: "managed", note: null }
      : { ...base, source: `${flavor} default (no policy file)`, kind: null, note: null };
  }
  const layered = managed !== null || flavor === "enclaved";
  const tolerant = (o.sharedKinds ?? []).includes(found.kind) && flavor !== "enclaved";
  const fallback = (note: string): LayeredPolicy => ({
    ...base,
    source: managed ? managed.path : `${flavor} default`,
    kind: managed ? "managed" : found.kind,
    note,
  });
  let raw: string;
  try {
    raw = fs.readFileSync(found.path, "utf8");
  } catch (err) {
    throw new Error(
      `cannot read the ${found.kind} policy ${found.path}: ${(err as Error).message}`,
      {
        cause: err,
      },
    );
  }
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch (err) {
    if (!tolerant) {
      throw new Error(`${found.path} is not valid JSON: ${(err as Error).message}`, { cause: err });
    }
    return fallback(`${found.path} is not plain JSON; its enclawed.policy block was not read`);
  }
  try {
    const block = optionsBlockOf(doc, blocks);
    const userOptions = parseAdapterOptions(block, { ...o.names, managed: false });
    const policyBlock = extractPolicyBlock(doc);
    if (!layered) {
      return {
        policy: parseOver(basePolicy, policyBlock),
        options: userOptions,
        flavor,
        source: found.path,
        kind: found.kind,
        note: null,
        refused: [],
        baseSource,
      };
    }
    const p = layerUserPolicy(basePolicy, policyBlock, { userAllowlists: managed === null });
    const t = tightenAdapterOptions(baseOptions, userOptions, optionsSet(block, o.names), {
      userLists: managed === null,
      block: o.names.block,
    });
    return {
      policy: p.policy,
      options: t.options,
      flavor,
      source: found.path,
      kind: found.kind,
      note: null,
      refused: [...p.refused, ...t.refused],
      baseSource,
    };
  } catch (err) {
    if (!tolerant) {
      throw new Error(`the policy in ${found.path} is invalid: ${(err as Error).message}`, {
        cause: err,
      });
    }
    return fallback(`ignoring invalid enclawed.policy in ${found.path}: ${(err as Error).message}`);
  }
}

function lexists(p: string): boolean {
  try {
    fs.lstatSync(p);
    return true;
  } catch {
    return false;
  }
}
