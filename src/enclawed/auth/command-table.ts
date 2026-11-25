// Which CLI commands need the second factor. A command matches when its path
// starts with an entry's path; the first match wins. Read-only commands
// (status, list, show, verify, logs) are not gated; everything that starts a
// session, changes policy, recovers or re-baselines, disables a protection,
// restores protected history, or acts as operator/admin is.
//
// `enclawed auth ...` is not in this table: its subcommands call the gate
// themselves with the purpose that fits (enroll/remove: auth-change, unlock,
// test), and `auth status` / `auth lock` only read or narrow.

import type { AuthPurpose } from "./gate.js";

export type GateEntry = {
  path: readonly string[];
  purpose: AuthPurpose;
  when?: (argv: string[]) => boolean;
};

const hasAny = (flags: string[]) => (argv: string[]) => argv.some((a) => flags.includes(a));

export const GATED_COMMANDS: readonly GateEntry[] = [
  // Starting a session: the gateway / agent runtime and its service forms.
  { path: ["gateway", "run"], purpose: "session-start" },
  { path: ["gateway", "start"], purpose: "session-start" },
  { path: ["gateway", "restart"], purpose: "session-start" },
  { path: ["gateway", "install"], purpose: "session-start" },
  { path: ["daemon", "start"], purpose: "session-start" },
  { path: ["daemon", "restart"], purpose: "session-start" },
  { path: ["daemon", "install"], purpose: "session-start" },
  { path: ["node", "run"], purpose: "session-start" },
  { path: ["node", "install"], purpose: "session-start" },
  { path: ["node", "restart"], purpose: "session-start" },
  { path: ["agent"], purpose: "session-start" },
  { path: ["run"], purpose: "session-start" },
  { path: ["swarm"], purpose: "session-start" },
  // `infer model run` (alias of `capability model run`) runs an embedded agent turn in this
  // process unless it goes through the (already gated) gateway.
  {
    path: ["infer", "model", "run"],
    purpose: "session-start",
    when: (a) => !a.includes("--gateway"),
  },
  {
    path: ["capability", "model", "run"],
    purpose: "session-start",
    when: (a) => !a.includes("--gateway"),
  },
  // Policy changes.
  { path: ["config", "set"], purpose: "policy-change" },
  // The `models` commands that write the config: which model and provider receive the
  // session's data, and the provider credentials. Listing and status only read.
  { path: ["models", "set"], purpose: "policy-change" },
  { path: ["models", "set-image"], purpose: "policy-change" },
  { path: ["models", "scan"], purpose: "policy-change" },
  { path: ["models", "aliases", "add"], purpose: "policy-change" },
  { path: ["models", "aliases", "remove"], purpose: "policy-change" },
  { path: ["models", "fallbacks", "add"], purpose: "policy-change" },
  { path: ["models", "fallbacks", "remove"], purpose: "policy-change" },
  { path: ["models", "fallbacks", "clear"], purpose: "policy-change" },
  { path: ["models", "image-fallbacks", "add"], purpose: "policy-change" },
  { path: ["models", "image-fallbacks", "remove"], purpose: "policy-change" },
  { path: ["models", "image-fallbacks", "clear"], purpose: "policy-change" },
  { path: ["models", "auth", "add"], purpose: "policy-change" },
  { path: ["models", "auth", "login"], purpose: "policy-change" },
  { path: ["models", "auth", "setup-token"], purpose: "policy-change" },
  { path: ["models", "auth", "paste-token"], purpose: "policy-change" },
  { path: ["models", "auth", "login-github-copilot"], purpose: "policy-change" },
  { path: ["models", "auth", "order", "set"], purpose: "policy-change" },
  { path: ["models", "auth", "order", "clear"], purpose: "policy-change" },
  { path: ["config", "unset"], purpose: "policy-change" },
  { path: ["configure"], purpose: "policy-change" },
  { path: ["onboard"], purpose: "policy-change" },
  { path: ["setup"], purpose: "policy-change" },
  { path: ["trust", "add"], purpose: "policy-change" },
  { path: ["trust", "remove"], purpose: "policy-change" },
  { path: ["exec-policy", "set"], purpose: "policy-change" },
  { path: ["exec-policy", "preset"], purpose: "policy-change" },
  { path: ["approvals", "set"], purpose: "policy-change" },
  { path: ["approvals", "allowlist"], purpose: "policy-change" },
  { path: ["plugins", "install"], purpose: "policy-change" },
  { path: ["plugins", "enable"], purpose: "policy-change" },
  { path: ["plugins", "disable"], purpose: "policy-change" },
  { path: ["plugins", "uninstall"], purpose: "policy-change" },
  { path: ["plugins", "update"], purpose: "policy-change" },
  { path: ["hooks", "enable"], purpose: "policy-change" },
  { path: ["hooks", "disable"], purpose: "policy-change" },
  { path: ["hooks", "install"], purpose: "policy-change" },
  { path: ["hooks", "update"], purpose: "policy-change" },
  { path: ["skills", "install"], purpose: "policy-change" },
  { path: ["skills", "update"], purpose: "policy-change" },
  { path: ["mcp", "set"], purpose: "policy-change" },
  { path: ["mcp", "unset"], purpose: "policy-change" },
  { path: ["secrets", "configure"], purpose: "policy-change" },
  { path: ["secrets", "apply"], purpose: "policy-change" },
  { path: ["agents", "add"], purpose: "policy-change" },
  { path: ["agents", "delete"], purpose: "policy-change" },
  { path: ["agents", "bind"], purpose: "policy-change" },
  { path: ["agents", "unbind"], purpose: "policy-change" },
  { path: ["update"], purpose: "admin", when: (argv) => !argv.includes("status") },
  // Repairs rewrite config and state.
  { path: ["doctor"], purpose: "policy-change", when: hasAny(["--fix", "--repair", "--yes"]) },
  // Disabling protections.
  { path: ["reset"], purpose: "disable-protection" },
  { path: ["uninstall"], purpose: "disable-protection" },
  { path: ["gateway", "uninstall"], purpose: "disable-protection" },
  { path: ["daemon", "uninstall"], purpose: "disable-protection" },
  { path: ["node", "uninstall"], purpose: "disable-protection" },
  // Restoring (or discarding) protected history.
  { path: ["history", "restore"], purpose: "history-restore" },
  { path: ["history", "prune"], purpose: "history-restore" },
  // Operator and admin commands.
  { path: ["devices", "approve"], purpose: "admin" },
  { path: ["devices", "reject"], purpose: "admin" },
  { path: ["devices", "remove"], purpose: "admin" },
  { path: ["devices", "clear"], purpose: "admin" },
  { path: ["devices", "rotate"], purpose: "admin" },
  { path: ["devices", "revoke"], purpose: "admin" },
  { path: ["pairing", "approve"], purpose: "admin" },
  { path: ["nodes", "approve"], purpose: "admin" },
  { path: ["nodes", "reject"], purpose: "admin" },
  { path: ["sandbox", "recreate"], purpose: "admin" },
];

/** The purpose a command needs the second factor for, or null when it is not gated. */
export function gatedPurposeForCommand(
  commandPath: readonly string[],
  argv: string[] = [],
): AuthPurpose | null {
  for (const entry of GATED_COMMANDS) {
    if (entry.path.length > commandPath.length) {
      continue;
    }
    if (!entry.path.every((seg, i) => commandPath[i] === seg)) {
      continue;
    }
    if (entry.when && !entry.when(argv.slice(2))) {
      continue;
    }
    return entry.purpose;
  }
  return null;
}

/** Flags that only print (help, version): such an invocation never starts anything. */
const PRINT_ONLY_FLAGS = new Set(["--help", "-h", "--version", "-V"]);

/**
 * True when this invocation starts a session (the table's "session-start" entries), the only
 * kind of command that binds the hardware root. Help, version, status and every other read-only
 * or configuration command never opens the Enclaweder and never writes its latch state: running
 * `enclawed auth --help` once bound the founder's real device and wrote its latch.
 */
export function invocationStartsSession(argv: string[], commandPath: readonly string[]): boolean {
  const args = argv.slice(2);
  if (args.some((a) => PRINT_ONLY_FLAGS.has(a)) || commandPath[0] === "help") {
    return false;
  }
  return gatedPurposeForCommand(commandPath, argv) === "session-start";
}
