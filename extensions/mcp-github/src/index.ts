// Bundled bridge: GitHub's first-party MCP server.
//
// GitHub ships an MCP server at github/github-mcp-server (npm + Docker
// image). Operators run it locally (stdio or HTTP) and the agent talks
// to it with a personal-access token (or fine-grained token) as bearer.
//
// Default endpoint: http://127.0.0.1:8744/mcp/v1
//   The github-mcp-server binary, when started with `--http :8744`,
//   serves JSON-RPC at /mcp/v1 . Override with ENCLAWED_GITHUB_MCP_ENDPOINT
//   if you run it elsewhere.
//
// Required env (legacy ENCLAWED_* aliases honored via brand-env.ts):
//   - ENCLAWED_GITHUB_TOKEN          PAT or fine-grained token (bearer)
//   - ENCLAWED_GITHUB_REPO           "owner/repo" — used by callers; not
//                                    sent automatically by the bridge.
//
// Optional env:
//   - ENCLAWED_GITHUB_MCP_ENDPOINT   override default localhost endpoint
//
// Required PAT scopes (operator-side):
//   - repo (or fine-grained: pull_requests read+write, contents read,
//     issues read+write if you keep github.issues.* in the allowlist)

import {
  HttpJsonRpcTransport,
  registerServer,
  type RegisteredServer,
} from "../../mcp-attested/src/index.js";

const DEFAULT_GITHUB_MCP_ENDPOINT = "http://127.0.0.1:8744/mcp/v1";

// Canonical tool list the bridge admits. Mirrors the names GitHub's
// MCP server exposes (github/github-mcp-server). This is the closed
// list the admission gate enforces — anything outside is denied before
// the network call.
export const GITHUB_MCP_TOOLS: ReadonlyArray<string> = Object.freeze([
  // Pull requests (the most common code-review surface).
  "github.pulls.get",
  "github.pulls.list",
  "github.pulls.list_files",
  "github.pulls.list_reviews",
  "github.pulls.create_review",
  "github.pulls.create_review_comment",
  "github.pulls.update_branch",
  // Issues.
  "github.issues.get",
  "github.issues.list",
  "github.issues.create",
  "github.issues.create_comment",
  "github.issues.update",
  // Repos / contents (read-only by default — write paths require explicit
  // operator policy).
  "github.repos.get",
  "github.repos.get_content",
  "github.repos.list_commits",
  // Search.
  "github.search.code",
  "github.search.issues",
  "github.search.repos",
]);

export type GithubBridgeOptions = Readonly<{
  endpoint?: string;
  requiredClearance?: string;
  /** Closed tool list; defaults to GITHUB_MCP_TOOLS. Trim to your scope. */
  allowedTools?: ReadonlyArray<string>;
  /** Test seam: override fetch. */
  fetchImpl?: typeof fetch;
  /** Test seam: process.env override. */
  env?: NodeJS.ProcessEnv;
}>;

export type LoadResult = Readonly<{ registered: RegisteredServer }>;

function readToken(env: NodeJS.ProcessEnv): string | undefined {
  const e = env.ENCLAWED_GITHUB_TOKEN;
  if (e && e.length > 0) return e;
  const o = env.ENCLAWED_GITHUB_TOKEN;
  if (o && o.length > 0) return o;
  return undefined;
}

function readEndpoint(env: NodeJS.ProcessEnv, fallback: string): string {
  const e = env.ENCLAWED_GITHUB_MCP_ENDPOINT;
  if (e && e.length > 0) return e;
  const o = env.ENCLAWED_GITHUB_MCP_ENDPOINT;
  if (o && o.length > 0) return o;
  return fallback;
}

/**
 * Load the GitHub bridge: read the PAT from env, build one HTTP transport
 * bound to a static-bearer auth provider, register the endpoint with the
 * mcp-attested server registry. Throws if no token is configured — the
 * operator must have ENCLAWED_GITHUB_TOKEN set before loading this bridge.
 */
export function loadGithubBridge(opts: GithubBridgeOptions = {}): LoadResult {
  const env = opts.env ?? process.env;
  const token = readToken(env);
  if (!token) {
    throw new Error(
      "mcp-github: ENCLAWED_GITHUB_TOKEN (or ENCLAWED_GITHUB_TOKEN) is required. " +
        "Generate a PAT scoped to the repos you need and export it before loading.",
    );
  }
  const endpoint = opts.endpoint ?? readEndpoint(env, DEFAULT_GITHUB_MCP_ENDPOINT);
  const requiredClearance = opts.requiredClearance ?? "internal";
  const allowedTools = opts.allowedTools ?? GITHUB_MCP_TOOLS;

  const transport = new HttpJsonRpcTransport({
    endpoint,
    authProvider: () => token,
    fetchImpl: opts.fetchImpl,
  });
  const entry: RegisteredServer = Object.freeze({
    id: "mcp.github",
    bridge: "mcp-github",
    endpoint,
    requiredClearance,
    allowedTools: Object.freeze([...allowedTools]),
    transport,
  });
  registerServer(entry);
  return Object.freeze({ registered: entry });
}

export { DEFAULT_GITHUB_MCP_ENDPOINT };
