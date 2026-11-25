// Helpers that apply the text pipeline to structured payloads: tool-call
// arguments (any JSON-like value) and agent tool results (content blocks).
//
// Tool-call arguments are mediated once per call (`mediateArguments`): every
// string leaf is joined into one payload with per-call random boundary
// markers, the pipeline runs once over it, and a rewrite is split back into
// the same leaves. So one tool call is one send to the stateful stages (rate
// limit, replay history, ledger) and gets one timing delay, however many
// string arguments it has. Object keys are never changed. A rewrite that
// loses a boundary marker cannot be reassembled and blocks the call (fail
// closed).
//
// Tool results keep per-block mediation (`mediateTextBlocks`): they are model
// input, never delayed, and each block is a separate piece of content.

import { randomBytes } from "node:crypto";

/** Network clients whose invocation makes a shell command an egress path. */
const NETWORK_COMMAND =
  /(^|[\s;&|(`$])(curl|wget|nc|ncat|netcat|socat|ssh|scp|sftp|rsync|ftp|tftp|telnet|http|https|xh|httpie|aria2c|openssl\s+s_client|dig|nslookup|host|ping|mail|sendmail|mutt|git\s+push|npm\s+publish|gh)\b|\/dev\/(tcp|udp)\/|https?:\/\//i;

/** Whether a shell command reaches the network (and so can carry a covert payload out). */
export function isNetworkCommand(command: string): boolean {
  return NETWORK_COMMAND.test(command);
}

export type LeafOutcome =
  | { cancelled: true; reason: string }
  | { cancelled: false; content: string };

/** `segmentBoundary` is set when `text` joins several tool arguments. */
export type LeafMediator = (text: string, segmentBoundary?: string) => Promise<LeafOutcome>;

const MAX_DEPTH = 32;

/** Path-ordered string leaves of a JSON-like value (non-empty strings only). */
function collectLeaves(value: unknown, out: string[], depth = 0): string[] {
  if (typeof value === "string") {
    if (value.length > 0) {
      out.push(value);
    }
    return out;
  }
  if (depth >= MAX_DEPTH || value === null || typeof value !== "object") {
    return out;
  }
  for (const item of Array.isArray(value) ? value : Object.values(value)) {
    collectLeaves(item, out, depth + 1);
  }
  return out;
}

/** Rebuild `value`, replacing its string leaves in the order `collectLeaves` saw them. */
function replaceLeaves(value: unknown, next: () => string, depth = 0): unknown {
  if (typeof value === "string") {
    return value.length > 0 ? next() : value;
  }
  if (depth >= MAX_DEPTH || value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceLeaves(item, next, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = replaceLeaves(item, next, depth + 1);
  }
  return out;
}

/** 20 random decimal digits: unaffected by case changes and homoglyph folding. */
function randomDigits(): string {
  return randomBytes(8).readBigUInt64BE().toString().padStart(20, "0");
}

/**
 * Boundary marker between leaves. The unit separator (U+001F) is a control
 * character none of the stages strips or folds, the newlines keep each leaf's
 * line ends (trailing-whitespace removal applies per leaf as before), and the
 * per-call random nonce means argument text cannot forge a boundary.
 */
export function argumentBoundary(nonce: string): string {
  return `\n\u001f${nonce}\u001f\n`;
}

export type ArgumentsOutcome =
  | { cancelled: true; reason: string }
  | { cancelled: false; changed: boolean; value: unknown };

/**
 * Mediate every string leaf of a tool call's arguments in ONE pipeline run.
 * `mediate` is called at most once.
 */
export async function mediateArguments(
  value: unknown,
  mediate: LeafMediator,
  nonce: () => string = randomDigits,
): Promise<ArgumentsOutcome> {
  const leaves = collectLeaves(value, []);
  if (leaves.length === 0) {
    return { cancelled: false, changed: false, value };
  }
  let boundary = argumentBoundary(nonce());
  while (leaves.some((leaf) => leaf.includes(boundary))) {
    boundary = argumentBoundary(nonce());
  }
  const joined = leaves.join(boundary);
  const out = await mediate(joined, leaves.length > 1 ? boundary : undefined);
  if (out.cancelled) {
    return out;
  }
  if (out.content === joined) {
    return { cancelled: false, changed: false, value };
  }
  const parts = out.content.split(boundary);
  if (parts.length !== leaves.length) {
    return {
      cancelled: true,
      reason: "a stage rewrite lost the tool-argument boundaries; call blocked",
    };
  }
  let i = 0;
  return { cancelled: false, changed: true, value: replaceLeaves(value, () => parts[i++]!) };
}

type ContentBlock = { type: string; text?: unknown };

/**
 * Mediate the text blocks of a tool result's `content` array. Non-text blocks
 * (images) pass through. Returns the new array, or null when nothing changed.
 */
export async function mediateTextBlocks<T extends ContentBlock>(
  content: readonly T[],
  mediate: LeafMediator,
): Promise<{ cancelled: true; reason: string } | { cancelled: false; content: T[] | null }> {
  let changed = false;
  const next: T[] = [];
  for (const block of content) {
    if (block.type !== "text" || typeof block.text !== "string" || block.text.length === 0) {
      next.push(block);
      continue;
    }
    const out = await mediate(block.text);
    if (out.cancelled) {
      return out;
    }
    if (out.content !== block.text) {
      changed = true;
      next.push({ ...block, text: out.content });
    } else {
      next.push(block);
    }
  }
  return { cancelled: false, content: changed ? next : null };
}
