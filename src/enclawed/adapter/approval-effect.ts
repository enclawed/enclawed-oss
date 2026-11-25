// enclawed adapter kit: approvals that cannot be rubber-stamped.
//
// When a call is put to the person, the prompt states its EFFECT in plain
// words (what cannot be taken back, and which path, host, program or tool
// it acts on), and the confirmation the person types is derived from that
// effect: the name of what it acts on (a short word taken from the target's
// last path component, the host's registrable name, the program or the
// tool) followed by a random code shown next to it. So:
//
//   - the person cannot approve without reading what is affected: the word
//     to type is the target's own name, and it differs from call to call
//     (and so does the answer's length);
//   - keys typed before the prompt, or injected by a process that cannot see
//     it, still cannot approve: the code is random (three letters, as
//     before), so knowing the call (and so the word) is not enough;
//   - it stays fast: one short word, separators and case ignored
//     ("config kqr", "config-kqr" and "CONFIGKQR" all approve).
//
// Generic (host-neutral): the adapter shows `effect.summary` and
// `confirmation.prompt` on the prompt it owns and passes what the person
// typed to the ledger (./approval.ts), which compares it with
// `confirmation.answer`.
//
// With an Enclaweder bound, an approval of an irreversible call could also be
// verified by the device (the typed answer MACed by the device and checked
// against the code the device issued). That is not done here: it would put
// the device on every approval's path (latency, a device-unlock use per
// approval, no approval when the device is away), which changes the default
// experience; it stays a decision for the operator's product owner.

import { randomInt } from "node:crypto";
import path from "node:path";
import { registrableDomain } from "../containment/remote-mcp.js";
import type { ApprovalEffect, ApprovalTarget, Decision, PreActionEvent } from "./types.js";

export type { ApprovalEffect, ApprovalTarget };

const LETTERS = "abcdefghjkmnpqrstuvwxyz"; // no look-alike i, l, o

/** A random approval code (three letters). */
export function approvalCode(): string {
  let c = "";
  for (let i = 0; i < 3; i++) {
    c += LETTERS[randomInt(LETTERS.length)];
  }
  return c;
}

export type ApprovalConfirmation = Readonly<{
  /** The word taken from the target's name. */
  word: string;
  /** The random part, shown next to the effect. */
  code: string;
  /** What approves (compared with separators and case ignored): word + code. */
  answer: string;
  /** The instruction line for the prompt. */
  prompt: string;
}>;

const MAX_WORD = 8;
const MAX_SHOWN = 160;

const clip = (s: string, n = MAX_SHOWN) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
/** Only printable characters of a name shown on the prompt (no control or escape characters). */
const shown = (s: string, n = MAX_SHOWN) => clip(s.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, "?"), n);

/** The confirmation word of a target: letters and digits of its name, lowercase, at most 8. */
export function effectWord(target: ApprovalTarget | null): string {
  if (!target) {
    return "";
  }
  let base = target.name;
  if (target.kind === "path") {
    const b = path.basename(base.replace(/[/\\]+$/, ""));
    const stem = b.replace(/^\.+/, "");
    const dot = stem.indexOf(".");
    // "config.yaml" -> config; ".env" -> env; "archive.tar.gz" -> archive
    base = dot > 0 ? stem.slice(0, dot) : stem;
  } else if (target.kind === "host") {
    const h = base.toLowerCase();
    base = (registrableDomain(h) ?? h).split(".")[0] ?? h;
  } else if (target.kind === "tool") {
    base = base.split(/__|[.:/]/).findLast((x) => x.length > 0) ?? base;
  } else {
    base = path.basename(base);
  }
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, MAX_WORD);
}

/** Normalize what a person typed (or an answer) for comparison: letters and digits, lowercase. */
export function normalizeConfirmation(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** The confirmation for an effect: its word and a fresh random code. */
export function approvalConfirmation(
  effect: ApprovalEffect,
  code: string = approvalCode(),
): ApprovalConfirmation {
  const word = effectWord(effect.target) || "yes";
  const what =
    effect.target?.kind === "path"
      ? "the file's name"
      : effect.target?.kind === "host"
        ? "the host's name"
        : effect.target?.kind === "program"
          ? "the program's name"
          : effect.target?.kind === "tool"
            ? "the tool's name"
            : "yes";
  return {
    word,
    code,
    answer: `${word}${code}`,
    prompt: `To approve, type ${word} ${code} (${what}, then the code) and Enter; anything else denies`,
  };
}

const URL_HOST = /\b(?:https?|wss?|ftp):\/\/([A-Za-z0-9.-]+)/;

const opWord = (op: string, irreversible: boolean | null) =>
  op === "delete"
    ? "deletes"
    : op === "edit"
      ? "edits"
      : irreversible === false
        ? "writes"
        : "overwrites or creates";

/**
 * The effect of a call, in plain words, from the call and the decision made
 * for it: the files it changes (and whether each change can be taken back),
 * the host it reaches, the program it runs, or the tool it calls.
 */
export function approvalEffect(
  event: Pick<
    PreActionEvent,
    "tool" | "kind" | "params" | "writes" | "command" | "url" | "mcp" | "skill"
  >,
  decision: Pick<Decision, "reversible" | "targets"> | null = null,
): ApprovalEffect {
  const irreversible =
    decision?.reversible === true ? false : decision?.reversible === false ? true : null;
  const lead =
    irreversible === true
      ? "cannot be undone"
      : irreversible === false
        ? "can be undone (a copy is kept)"
        : "may not be undoable";
  // Files: the first one that cannot be taken back, else the first.
  const targets = decision?.targets ?? [];
  const writes = event.writes ?? [];
  if (targets.length > 0 || writes.length > 0) {
    const t = targets.find((x) => !x.reversible) ?? targets[0] ?? null;
    const p = t?.realPath ?? t?.path ?? writes[0]?.path ?? "";
    const op = t?.op ?? writes[0]?.op ?? "write";
    const n = Math.max(targets.length, writes.length);
    const fileIrrev = t ? !t.reversible : irreversible;
    return {
      summary: `${fileIrrev ? "cannot be undone" : lead}: ${opWord(op, fileIrrev)} ${shown(p)}${n > 1 ? ` and ${n - 1} other file(s)` : ""}`,
      irreversible: fileIrrev,
      target: { kind: "path", name: p },
    };
  }
  if (event.url) {
    const host = URL_HOST.exec(event.url)?.[1] ?? event.url;
    return {
      summary: `${lead}: sends a request to ${shown(host)}`,
      irreversible,
      target: { kind: "host", name: host },
    };
  }
  if (event.command) {
    const text = event.command.text;
    const host = URL_HOST.exec(text)?.[1];
    if (host) {
      return {
        summary: `${lead}: runs a command that reaches ${shown(host)}: ${shown(text, 120)}`,
        irreversible,
        target: { kind: "host", name: host },
      };
    }
    const first =
      text
        .trim()
        .split(/\s+/)
        .find((w) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) ?? "";
    return {
      summary: `${lead}: runs ${shown(text, 120)}`,
      irreversible,
      target: first ? { kind: "program", name: first.replace(/^['"]|['"]$/g, "") } : null,
    };
  }
  if (event.mcp) {
    return {
      summary: `${lead}: calls the tool ${shown(event.mcp.tool)} of the MCP server ${shown(event.mcp.server)}, which acts outside this machine`,
      irreversible,
      target: { kind: "tool", name: event.mcp.tool },
    };
  }
  if (event.skill) {
    return {
      summary: `${lead}: runs the skill ${shown(event.skill)}`,
      irreversible,
      target: { kind: "tool", name: event.skill },
    };
  }
  return {
    summary: `${lead}: runs the tool ${shown(event.tool)}`,
    irreversible,
    target: { kind: "tool", name: event.tool },
  };
}
