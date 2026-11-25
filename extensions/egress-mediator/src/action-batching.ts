// Tool-call side of the action batcher (`@enclawed/egress-core`
// action-batcher): maps a gateway tool call to a chokepoint-independent
// action, detects causal dependencies on earlier results, and renders a
// collapsed or cached repeat as a legible refusal that carries the earlier
// identical call's result.

import type { EgressAction } from "@enclawed/egress-core";

/**
 * Map a tool call to the action that leaves the host. The batcher keys,
 * sorts and collapses on this, so it must be the outbound request, not the
 * tool call: `web_fetch` is a plain GET of its URL (the batcher keys it on
 * the request line actually sent: no fragment, no bare "?"), and its other
 * parameters (`extractMode`, `maxChars`) only shape the text returned to the
 * model.
 * Keying on them would let two identical requests escape collapse, and would
 * let a sender vary them to choose the sort order. `write` with a path and
 * content is a file write.
 */
export function toolCallToAction(toolName: string, params: Record<string, unknown>): EgressAction {
  const name = toolName.trim().toLowerCase();
  if (name === "web_fetch" && typeof params.url === "string") {
    return { type: "http", method: "GET", url: params.url };
  }
  if (name === "write" && typeof params.path === "string" && typeof params.content === "string") {
    return { type: "file-write", path: params.path, content: params.content };
  }
  if (name === "message" || name === "sessions_send") {
    const target = [params.target, params.to, params.channel, params.sessionKey]
      .filter((v): v is string => typeof v === "string")
      .join("|");
    return { type: "send", target, content: JSON.stringify(params) };
  }
  return { type: "tool", toolName: name, params };
}

/** Text of an agent tool result (its text blocks), or a bounded JSON rendering. */
export function toolResultText(result: unknown): string | undefined {
  if (result === undefined || result === null) {
    return undefined;
  }
  if (typeof result === "string") {
    return result;
  }
  const content = (result as { content?: unknown }).content;
  if (Array.isArray(content)) {
    const texts = content
      .filter(
        (b): b is { type: string; text: string } =>
          !!b && typeof b === "object" && b.type === "text" && typeof b.text === "string",
      )
      .map((b) => b.text);
    if (texts.length > 0) {
      return texts.join("\n");
    }
  }
  try {
    return JSON.stringify(result);
  } catch {
    return undefined;
  }
}

const TOKEN = /[A-Za-z0-9][A-Za-z0-9._~:/?#@!$&'()*+,;=%-]{11,}/g;
const MAX_TOKENS_PER_SCOPE = 256;
const MAX_SCOPES = 64;

function stringLeaves(value: unknown, out: string[], depth = 0): string[] {
  if (typeof value === "string") {
    out.push(value);
  } else if (value && typeof value === "object" && depth < 16) {
    for (const v of Array.isArray(value) ? value : Object.values(value)) {
      stringLeaves(v, out, depth + 1);
    }
  }
  return out;
}

/**
 * Deterministic data-flow provenance. Distinctive tokens (12+ characters:
 * URLs, ids, paths) of each completed action's result are remembered per
 * scope; a later action whose parameters contain one of them was built from
 * that action's result. This is recorded for audit only: a data-flow
 * dependent is concurrent with the rest of its window (see the batcher), so
 * it does not make a barrier.
 */
export function createDependencyTracker() {
  const scopes = new Map<string, Map<string, string>>();
  return {
    record(scope: string, actionId: string, resultText: string | undefined): void {
      if (!resultText) {
        return;
      }
      let tokens = scopes.get(scope);
      if (!tokens) {
        if (scopes.size >= MAX_SCOPES) {
          const oldest = scopes.keys().next().value;
          if (oldest !== undefined) {
            scopes.delete(oldest);
          }
        }
        tokens = new Map();
        scopes.set(scope, tokens);
      }
      for (const token of resultText.slice(0, 65_536).match(TOKEN) ?? []) {
        tokens.delete(token);
        tokens.set(token, actionId);
        if (tokens.size > MAX_TOKENS_PER_SCOPE) {
          const oldest = tokens.keys().next().value;
          if (oldest !== undefined) {
            tokens.delete(oldest);
          }
        }
      }
    },
    dependsOn(scope: string, params: unknown): string[] {
      const tokens = scopes.get(scope);
      if (!tokens || tokens.size === 0) {
        return [];
      }
      const leaves = stringLeaves(params, []);
      const deps = new Set<string>();
      for (const [token, id] of tokens) {
        if (leaves.some((leaf) => leaf.includes(token))) {
          deps.add(id);
        }
      }
      return [...deps].toSorted();
    },
  };
}

// Fallback path only (a host without the tool replay seam): the refusal
// carries the earlier result. Bounded so a refusal stays a refusal; web_fetch
// results are far below this (maxCharsCap).
const MAX_REPEAT_TEXT = 200_000;

/** Refusal text for a repeat the batcher answered without re-sending. */
export function repeatBlockReason(
  toolName: string,
  how: "collapsed" | "cached",
  resultText: string | undefined,
  failed = false,
): string {
  const head =
    how === "collapsed"
      ? `egress-action-batcher: an identical ${toolName} call in the same window was sent once; this repeat was not re-sent`
      : `egress-action-batcher: an identical ${toolName} call was answered from its recorded outcome and not re-sent`;
  if (resultText === undefined) {
    return `${head}. Reuse the earlier call's result.`;
  }
  const body =
    resultText.length > MAX_REPEAT_TEXT
      ? `${resultText.slice(0, MAX_REPEAT_TEXT)}\n[truncated]`
      : resultText;
  return failed ? `${head}. It failed:\n${body}` : `${head}. Its result:\n${body}`;
}
