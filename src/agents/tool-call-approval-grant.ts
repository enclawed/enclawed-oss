// The approval grant of one gated tool call (see ../enclawed/approval-binding.ts):
// issued when a person is asked, bound to the tool, its exact arguments and
// the resources it touches; consumed once, right before the call runs, against
// the call as it is then, with every resource re-resolved. A grant that does
// not match refuses the call, which must then be asked about again.

import {
  ApprovalGrantLedger,
  approvalArgsDigest,
  resolveFsResource,
  resolveUrlResource,
  type ApprovalConsumeResult,
  type ApprovalGrant,
  type ResourceIdentity,
} from "../enclawed/approval-binding.js";
import type { SandboxTarget } from "../enclawed/fs-reversibility.js";
import { isPlainObject } from "../utils.js";
import { DEFAULT_TOOL_CALL_APPROVAL_TIMEOUT_MS } from "./tool-call-approval.js";
import { resolveFsCallTargets } from "./tool-call-fs-targets.js";

// The approval request's own timeout plus the gateway's RPC buffer: a grant
// never outlives the question it answers.
const GRANT_SLACK_MS = 10_000;

const ledger = new ApprovalGrantLedger();

type Where = { fsRoot?: string; fsSandbox?: SandboxTarget };

/**
 * The resources a call touches, resolved now: the host files a file tool
 * writes, and the URL a tool fetches or posts to. Sandboxed file targets are
 * bound by their arguments only (the sandbox's own file bridge resolves them).
 */
export async function resolveToolCallResources(
  toolName: string,
  params: unknown,
  where: Where,
): Promise<ResourceIdentity[]> {
  const resources: ResourceIdentity[] = [];
  const fs = resolveFsCallTargets(toolName, params, where);
  if (fs?.targets && !fs.sandbox) {
    for (const target of fs.targets) {
      if (target.absPath) {
        resources.push(await resolveFsResource(target.absPath));
      }
    }
  }
  if (isPlainObject(params)) {
    for (const key of ["url", "targetUrl"]) {
      const value = params[key];
      const url = typeof value === "string" ? resolveUrlResource(value) : null;
      if (url) {
        resources.push(url);
      }
    }
  }
  return resources;
}

export async function issueToolCallGrant(params: {
  toolName: string;
  args: unknown;
  where: Where;
  timeoutMs?: number;
}): Promise<ApprovalGrant> {
  const resources = await resolveToolCallResources(params.toolName, params.args, params.where);
  return ledger.issue(
    { tool: params.toolName, args: params.args, resources },
    { ttlMs: (params.timeoutMs ?? DEFAULT_TOOL_CALL_APPROVAL_TIMEOUT_MS) + GRANT_SLACK_MS },
  );
}

export function approveToolCallGrant(id: string): boolean {
  return ledger.approve(id);
}

export function revokeToolCallGrant(id: string): void {
  ledger.revoke(id);
}

/** Spend the grant on the call as it is now; refused unless it is the approved call. */
export async function consumeToolCallGrant(params: {
  grantId: string;
  toolName: string;
  args: unknown;
  where: Where;
}): Promise<ApprovalConsumeResult> {
  const resources = await resolveToolCallResources(params.toolName, params.args, params.where);
  return ledger.consume(params.grantId, { tool: params.toolName, args: params.args, resources });
}

const PREVIEW_MAX = 300;

/** The lines added to an approval request so the person sees what they approve. */
export function describeGrantForApproval(grant: ApprovalGrant, args: unknown): string {
  const lines: string[] = [];
  for (const r of grant.resources) {
    lines.push(r.type === "fs" ? `Target: ${r.absPath}` : `Target: ${r.url}`);
  }
  let preview: string;
  try {
    preview = JSON.stringify(args ?? null) ?? "null";
  } catch {
    preview = "(not serializable)";
  }
  if (preview.length > PREVIEW_MAX) {
    preview = `${preview.slice(0, PREVIEW_MAX)}…`;
  }
  lines.push(`Arguments: ${preview}`);
  lines.push(
    `This approval is for this exact call only (arguments ${approvalArgsDigest(args).slice(0, 12)}).`,
  );
  return lines.join("\n");
}

export const __testing = { ledger };
