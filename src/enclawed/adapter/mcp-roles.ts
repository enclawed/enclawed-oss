// enclawed adapter kit: declared MCP argument roles.
//
// The admission record declares, per tool argument, what the argument is.
// The record is signed, so a role map cannot be changed without a new
// admission, and a server whose arguments change drifts its tool definition
// and is revoked. The engine checks every role before the call:
//
//   git-rev     a revision or ref: never begins with "-" (an option such as
//               `--output=/path` would make git write a file; git forbids
//               refs that begin with "-"), no whitespace or control characters
//   positional  an operand: never begins with "-" (`./-x` names such a file)
//   path-ro     a file the server reads: not a secret, not a credential store
//   path-rw     a file the server changes: also not Enclawed's own files
//   url         http or https, to a host the policy allows (when it lists hosts)
//   opaque      not checked; the approval says so
//
// A value that violates its role is denied ("mcp-argument-role") before the
// server sees the call. An argument the record gives no role is opaque.

import path from "node:path";
import { MCP_ARGUMENT_ROLES, type McpArgumentRole, type McpArgumentRoles } from "./contracts.js";
import { credentialPathOf } from "./credentials.js";
import { expandHome, isProtectedPath } from "./fs-probe.js";
import { meetsSecret } from "./path-rules.js";
import { hostOf, type Ctx } from "./rule-kit.js";
import { quoteUntrusted as q } from "./untrusted.js";

export { MCP_ARGUMENT_ROLES, type McpArgumentRole, type McpArgumentRoles } from "./contracts.js";

export function isArgumentRoles(v: unknown): v is McpArgumentRoles {
  return (
    !!v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.values(v).every(
      (m) =>
        !!m &&
        typeof m === "object" &&
        !Array.isArray(m) &&
        Object.values(m).every((r) => (MCP_ARGUMENT_ROLES as readonly unknown[]).includes(r)),
    )
  );
}

/** Role maps for the reference servers (the operator reviews them at pin time). */
export const REFERENCE_ARGUMENT_ROLES: Readonly<Record<string, McpArgumentRoles>> = {
  git: {
    git_status: { repo_path: "path-ro" },
    git_diff_unstaged: { repo_path: "path-ro" },
    git_diff_staged: { repo_path: "path-ro" },
    git_diff: { repo_path: "path-ro", target: "git-rev" },
    git_commit: { repo_path: "path-rw", message: "opaque" },
    git_add: { repo_path: "path-rw", files: "positional" },
    git_reset: { repo_path: "path-rw" },
    git_log: { repo_path: "path-ro", start_timestamp: "positional", end_timestamp: "positional" },
    git_create_branch: { repo_path: "path-rw", branch_name: "git-rev", base_branch: "git-rev" },
    git_checkout: { repo_path: "path-rw", branch_name: "git-rev" },
    git_show: { repo_path: "path-ro", revision: "git-rev" },
    git_branch: { repo_path: "path-ro", contains: "git-rev", not_contains: "git-rev" },
  },
  filesystem: {
    read_file: { path: "path-ro" },
    read_text_file: { path: "path-ro" },
    read_media_file: { path: "path-ro" },
    read_multiple_files: { paths: "path-ro" },
    write_file: { path: "path-rw", content: "opaque" },
    edit_file: { path: "path-rw" },
    create_directory: { path: "path-rw" },
    list_directory: { path: "path-ro" },
    list_directory_with_sizes: { path: "path-ro" },
    directory_tree: { path: "path-ro" },
    move_file: { source: "path-rw", destination: "path-rw" },
    search_files: { path: "path-ro", pattern: "opaque" },
    get_file_info: { path: "path-ro" },
  },
  fetch: { fetch: { url: "url" } },
};

export type RoleVerdict =
  | Readonly<{ ok: true; unchecked: readonly string[] }>
  | Readonly<{ ok: false; arg: string; reason: string }>;

function valuesOf(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [v];
}

/** Check one call's arguments against the roles the record declared for its tool. */
export function checkArgumentRoles(
  roles: Readonly<Record<string, McpArgumentRole>> | null,
  params: Readonly<Record<string, unknown>>,
  ctx: Ctx,
): RoleVerdict {
  const unchecked: string[] = [];
  for (const [arg, value] of Object.entries(params)) {
    const role: McpArgumentRole = roles?.[arg] ?? "opaque";
    if (role === "opaque") {
      if (typeof value === "string" || Array.isArray(value)) {
        unchecked.push(arg);
      }
      continue;
    }
    for (const v of valuesOf(value)) {
      if (v === null || v === undefined) {
        continue;
      }
      if (typeof v !== "string") {
        return {
          ok: false,
          arg,
          reason: `the ${role} argument ${q(arg, { max: 60 })} is not a string`,
        };
      }
      const bad = (why: string) => ({
        ok: false as const,
        arg,
        reason: `the ${role} argument ${q(arg, { max: 60 })} (value as given: ${q(v, { max: 200 })}) ${why}`,
      });
      switch (role) {
        case "git-rev":
          if (v.startsWith("-")) {
            return bad(
              'begins with "-", so git would read it as an option; no revision begins with "-"',
            );
          }
          if (
            v === "" ||
            /\s/.test(v) ||
            Array.from(v).some((ch) => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f)
          ) {
            return bad(
              "is empty or holds whitespace or control characters, which no revision does",
            );
          }
          break;
        case "positional":
          if (v.startsWith("-")) {
            return bad(
              'begins with "-", so the program would read it as an option (name such a file ./-name)',
            );
          }
          break;
        case "path-ro":
        case "path-rw": {
          if (v.startsWith("-")) {
            return bad(
              'begins with "-", so the program would read it as an option (name such a file ./-name)',
            );
          }
          const abs = path.resolve(ctx.opts.projectDir, expandHome(v, ctx.home));
          const real = ctx.fs.realpathNearest(abs);
          const secret = meetsSecret(ctx, abs, ctx.opts.secretPaths ?? [], role === "path-ro");
          if (secret) {
            return bad(`${secret.how} a file that holds secrets of Enclawed or of the agent CLI`);
          }
          const cred = credentialPathOf(abs, ctx.home) ?? credentialPathOf(real, ctx.home);
          if (cred) {
            return bad(`names ${cred.what}`);
          }
          if (
            role === "path-rw" &&
            ctx.opts.protected &&
            isProtectedPath(ctx.opts.protected, [abs, real])
          ) {
            return bad("names Enclawed's own state, policy, audit log or code");
          }
          break;
        }
        case "url": {
          let u: URL;
          try {
            u = new URL(v);
          } catch {
            return bad("is not a URL");
          }
          if (u.protocol !== "https:" && u.protocol !== "http:") {
            return bad("is not an http or https URL");
          }
          const host = hostOf(v);
          const policy = ctx.opts.policy;
          if (
            (policy.enforceAllowlists || policy.allowedHosts.size > 0) &&
            (host === null || !policy.allowedHosts.has(host))
          ) {
            return bad("goes to a host that is not on enclawed.policy.allowedHosts");
          }
          break;
        }
      }
    }
  }
  return { ok: true, unchecked };
}
