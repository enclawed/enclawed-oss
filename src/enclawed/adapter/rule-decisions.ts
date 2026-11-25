// enclawed adapter kit: the decision helpers and the exec-config path rules,
// a leaf module (types and helpers only, no adapter module above it) so rule
// modules such as ./file-integrity.ts use them without importing ./rule-kit.ts,
// which re-exports everything here.

import type { Policy } from "../policy.js";
import type { CapabilityToken } from "../skill-capabilities.js";
import { REASON_PREFIX, type Decision, type PreActionEvent, type ReasonCode } from "./types.js";
import { quoteUntrusted as q } from "./untrusted.js";

/** Extra exec-config names an operator adds (EngineOptions.execConfig). */
export type ExecConfigOption =
  | Readonly<{ segments?: readonly string[]; files?: readonly string[] }>
  | undefined;

// ─── Files that configure what runs later ───────────────────────────────

// Their old content is kept, but undoing the file does not undo what already
// ran because of it, so writes to them wait for a person. Agent-CLI config
// directories of every known host are listed: a write to any of them changes
// what runs later, whichever host is active. Names compare case-insensitively
// after NFC (on macOS and Windows `.GIT/config` is `.git/config`).
const EXEC_CONFIG_SEGMENTS = [
  ".git",
  ".husky",
  ".githooks",
  ".devcontainer",
  ".direnv",
  ".claude",
  ".codex",
  ".gemini",
  ".cursor",
  ".kiro",
  ".opencode",
  ".amp",
  ".clinerules",
];
const EXEC_CONFIG_FILES = [
  ".mcp.json",
  ".envrc",
  ".gitmodules",
  ".gitattributes",
  ".npmrc",
  ".yarnrc",
  ".yarnrc.yml",
  ".pnpmfile.cjs",
  "package.json",
  "makefile",
  "gnumakefile",
  ".pre-commit-config.yaml",
  ".pre-commit-config.yml",
  "pyproject.toml",
  "setup.py",
  "setup.cfg",
];
const EXEC_CONFIG_PAIRS: ReadonlyArray<readonly [string, string]> = [
  [".vscode", "tasks.json"],
  [".vscode", "launch.json"],
  [".vscode", "settings.json"],
  [".cargo", "config"],
  [".cargo", "config.toml"],
];

export function isExecConfigPath(absPath: string, extra: ExecConfigOption = {}): boolean {
  const parts = absPath
    .normalize("NFC")
    .toLowerCase()
    .split(/[\\/]+/);
  const segs = new Set([
    ...EXEC_CONFIG_SEGMENTS,
    ...(extra?.segments ?? []).map((s) => s.toLowerCase()),
  ]);
  if (parts.some((p) => segs.has(p))) {
    return true;
  }
  // .github/hooks: a host's repository hooks directory.
  if (parts.some((p, i) => i > 0 && parts[i - 1] === ".github" && p === "hooks")) {
    return true;
  }
  const base = parts[parts.length - 1];
  const dir = parts[parts.length - 2];
  const files = [...EXEC_CONFIG_FILES, ...(extra?.files ?? []).map((s) => s.toLowerCase())];
  return files.includes(base) || EXEC_CONFIG_PAIRS.some(([d, f]) => d === dir && f === base);
}

/**
 * A directory whose files configure what runs later: one named by an
 * exec-config segment (.git, .claude, ...) or the directory of an exec-config
 * pair (.vscode, .cargo). Removing it removes that configuration.
 */
export function isExecConfigDir(absDir: string, extra: ExecConfigOption = {}): boolean {
  const base =
    absDir
      .normalize("NFC")
      .toLowerCase()
      .split(/[\\/]+/)
      .findLast(Boolean) ?? "";
  return (
    isExecConfigPath(absDir, extra) ||
    isExecConfigPath(`${absDir}/x`, extra) ||
    EXEC_CONFIG_PAIRS.some(([d]) => d === base)
  );
}

// ─── Decision helpers ───────────────────────────────────────────────────

export function allow(
  codes: ReasonCode[],
  why: string,
  capability: CapabilityToken | null,
): Decision {
  return {
    outcome: "allow",
    reason: `${REASON_PREFIX}reversible (${why})`,
    codes,
    capability,
    reversible: true,
  };
}

export function deny(
  codes: ReasonCode[],
  why: string,
  capability: CapabilityToken | null,
): Decision {
  return { outcome: "deny", reason: `${REASON_PREFIX}${why}`, codes, capability, reversible: null };
}

export const upperFirst = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

/**
 * An irreversible action: pre-approved by the operator, refused where no
 * person can be asked, otherwise asked.
 */
export function irreversible(
  codes: ReasonCode[],
  why: string,
  capability: CapabilityToken | null,
  event: PreActionEvent,
  policy: Policy,
): Decision {
  if (event.policyIds.some((id) => policy.preApprovedIrreversibleTools.has(id))) {
    return {
      outcome: "allow",
      reason: `${REASON_PREFIX}irreversible, pre-approved by enclawed.policy.preApprovedIrreversibleTools: ${why}`,
      codes: [...codes, "pre-approved"],
      capability,
      reversible: false,
    };
  }
  if (event.approvalRoute === "no-person") {
    const mode = event.hostMode ?? "headless";
    return {
      outcome: "deny",
      reason: `${REASON_PREFIX}irreversible action needs a person, and this session (${q(mode, { max: 40 })}) cannot ask one: ${why}`,
      codes: [...codes, `no-person:${mode}`],
      capability,
      reversible: false,
    };
  }
  return {
    outcome: "ask",
    reason: `${REASON_PREFIX}irreversible action, approve only if intended. ${upperFirst(why)}`,
    codes,
    capability,
    reversible: false,
  };
}

/**
 * An action only a person may approve, each time: never pre-approved by
 * policy, refused where no person can be asked, otherwise asked.
 */
export function personOnly(
  codes: ReasonCode[],
  why: string,
  capability: CapabilityToken | null,
  event: PreActionEvent,
): Decision {
  if (event.approvalRoute === "no-person") {
    const mode = event.hostMode ?? "headless";
    return {
      outcome: "deny",
      reason: `${REASON_PREFIX}this needs a person, and this session (${q(mode, { max: 40 })}) cannot ask one: ${why}`,
      codes: [...codes, `no-person:${mode}`],
      capability,
      reversible: false,
    };
  }
  return {
    outcome: "ask",
    reason: `${REASON_PREFIX}approve only if you asked for this. ${upperFirst(why)}`,
    codes,
    capability,
    reversible: false,
  };
}
