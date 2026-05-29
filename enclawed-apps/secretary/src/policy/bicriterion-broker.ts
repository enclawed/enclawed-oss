// Bicriterion-calibrated HITL broker for the secretary demo.
//
// "Bicriterion" because the routing decision uses the same (cap, target)
// projection the paper's biconditional checker uses to close F1–F4 (paper
// §5.2, multiset equality of audit S vs corpus D). The broker treats each
// of the published failure modes differently:
//
//   F1 (gate bypass):       structurally impossible if every irreversible
//                           write goes through the gate. The broker is
//                           only ever invoked on the gate path, so its job
//                           here is just to NOT deny by default — anything
//                           that reaches it has already left the bypass
//                           class. No HITL needed.
//
//   F2 (audit forgery):     a post-hoc property of the audit log (the
//                           hash chain plus verifyChain). The broker does
//                           not police F2 directly; it does, however,
//                           refuse decisions on malformed requests so the
//                           audit-log record carries a clean reason
//                           string.
//
//   F3 (silent failure):    handled in the tool wrappers (a 2xx with no
//                           expected echo field becomes irreversible.error,
//                           not irreversible.executed). Nothing for the
//                           broker to add here.
//
//   F4 (wrong-target):      the target string the broker sees IS the
//                           projection key. If the wrapper later observes
//                           a different echo target, that's a wrapper-side
//                           error, not a broker-side denial. The broker
//                           still inspects the target to make sure it
//                           matches one of the known shapes (so a free-
//                           form "publish" call with an arbitrary target
//                           is denied — defense in depth).
//
//   F5 (wrong content):     this IS the broker's main job. The wrapper
//                           attaches DLP severity to call.args.dlpSummary
//                           before dispatching, and the broker routes:
//                             null/low      -> auto-approve
//                             medium/high   -> keypress (interactive)
//                             critical      -> deny outright
//
// In "always" mode the broker upgrades every non-deny decision to a
// keypress. In "off" mode it never asks (still denies on critical DLP
// hits — that's a hard floor, not a courtesy).

import {
  type Broker,
  type BrokerDecision,
  type BrokerRequest,
  CAPABILITY,
} from "enclawed/framework";
import type { SecretarySeverity } from "./dlp-secretary.js";

export type HitlMode = "bicriterion" | "always" | "off";

export type SecretaryBrokerOptions = Readonly<{
  hitl: HitlMode;
  /**
   * Prompt function called when the bicriterion router decides keypress is
   * required. The function MUST be the only path that can hand back
   * "approve"; the LLM has no way to author this.
   */
  prompt: (req: BrokerRequest) => Promise<BrokerDecision>;
  /** Hard timeout on the keypress prompt. Default 5 min. */
  keypressTimeoutMs?: number;
  /**
   * Principal's own email address(es). Used to recognize the EOD-summary
   * self-send pattern and auto-approve it.
   */
  principalSelfAddresses: ReadonlySet<string>;
  /** Logger for non-fatal warnings (default: console.warn). */
  warn?: (msg: string) => void;
}>;

// Target-string shapes the secretary tool wrappers produce. The broker
// parses these to extract the F-class-relevant fields. Any target that
// doesn't match one of these shapes is denied — a defense-in-depth
// against a wrapper that tries to route around the contract.
const TARGET_PATTERNS = Object.freeze({
  // gmail:send/<draftId>#sha256=<hash>;to=<recipientEmail>
  gmailSend: /^gmail:send\/[A-Za-z0-9_-]+#sha256=[0-9a-f]{64};to=([^;]+)$/,
  // gmail:draft/<draftId>#sha256=<hash>
  gmailDraft: /^gmail:draft\/[A-Za-z0-9_-]+#sha256=[0-9a-f]{64}$/,
  // gmail:labels/<threadId>#add=<labelsHash>;remove=<labelsHash>
  gmailLabels: /^gmail:labels\/[A-Za-z0-9_-]+#add=[0-9a-f]{16};remove=[0-9a-f]{16}$/,
});

const SEVERITY_BLOCKS_AUTO: ReadonlySet<SecretarySeverity> = new Set(["medium", "high"]);

export function buildSecretaryBroker(opts: SecretaryBrokerOptions): Broker {
  const timeout = opts.keypressTimeoutMs ?? 5 * 60_000;
  const warn = opts.warn ?? ((m: string) => process.stderr.write(`${m}\n`));

  return {
    id: `secretary-bicriterion(${opts.hitl})`,
    decide: async (req): Promise<BrokerDecision> => {
      const verdict = classify(req, opts.principalSelfAddresses, warn);

      // Critical findings are a hard floor — never approved, regardless of
      // HITL mode. This protects against an operator running --hitl=off
      // for convenience and silently green-lighting a contact-list leak.
      if (verdict.kind === "deny") {
        return { decision: "deny", reason: verdict.reason };
      }

      if (verdict.kind === "auto-approve") {
        if (opts.hitl === "always") {
          // Operator asked for keypress on every write. Honor it.
          return promptWithTimeout(opts.prompt, req, timeout, "always-mode");
        }
        return { decision: "approve", reason: verdict.reason };
      }

      // verdict.kind === "needs-keypress"
      if (opts.hitl === "off") {
        // Operator asked us not to prompt. Without a human in the loop
        // we deny — the only thing worse than burning a keypress is a
        // silent-approve on a flagged draft.
        return {
          decision: "deny",
          reason: `bicriterion: keypress required (${verdict.reason}) but --hitl=off`,
        };
      }
      return promptWithTimeout(opts.prompt, req, timeout, verdict.reason);
    },
  };
}

type Classification =
  | { kind: "auto-approve"; reason: string }
  | { kind: "needs-keypress"; reason: string }
  | { kind: "deny"; reason: string };

function classify(
  req: BrokerRequest,
  principalSelf: ReadonlySet<string>,
  warn: (m: string) => void,
): Classification {
  const { cap, target, args } = req.call;
  const dlp = readDlpSummary(args);

  // Critical-severity DLP is an unconditional deny, full stop.
  if (dlp && dlp.maxSeverity === "critical") {
    return {
      kind: "deny",
      reason: `bicriterion: F5 critical DLP finding (${dlp.findingCount} findings)`,
    };
  }

  switch (cap) {
    case CAPABILITY.PUBLISH: {
      // The only PUBLISH path the secretary uses is gmail send_draft.
      const m = target.match(TARGET_PATTERNS.gmailSend);
      if (!m) {
        warn(`bicriterion: unknown PUBLISH target shape (${target.slice(0, 80)}); denying`);
        return { kind: "deny", reason: "bicriterion: unrecognized publish target shape" };
      }
      const recipient = decodeRecipient(m[1] ?? "");

      // EOD summary self-send (to principal) — only fully auto-approved
      // when the broker is in bicriterion mode AND DLP is clean.
      if (principalSelf.has(recipient.toLowerCase())) {
        if (dlp && SEVERITY_BLOCKS_AUTO.has(dlp.maxSeverity)) {
          return {
            kind: "needs-keypress",
            reason: `bicriterion: F5 ${dlp.maxSeverity} DLP on self-send`,
          };
        }
        return {
          kind: "auto-approve",
          reason: "bicriterion: self-addressed EOD summary, DLP clean",
        };
      }

      // Reply to a contact: auto-approve only if DLP is clean.
      if (dlp && SEVERITY_BLOCKS_AUTO.has(dlp.maxSeverity)) {
        return {
          kind: "needs-keypress",
          reason: `bicriterion: F5 ${dlp.maxSeverity} DLP on contact reply`,
        };
      }
      return {
        kind: "auto-approve",
        reason: "bicriterion: contact reply, DLP clean",
      };
    }

    case CAPABILITY.FS_WRITE_IRREV:
    case CAPABILITY.MUTATE_SCHEMA:
    case CAPABILITY.PAY:
    case CAPABILITY.SPAWN_PROC: {
      // The secretary never uses these. If a wrapper somehow dispatches
      // one, that's a programming bug — deny rather than ask the human
      // to bless something they shouldn't have to think about.
      return {
        kind: "deny",
        reason: `bicriterion: capability ${cap} is not in the secretary contract`,
      };
    }

    case CAPABILITY.TOOL_INVOKE: {
      // tool.invoke is irreversible but used for MCP read tools that
      // are nonetheless gated for audit. We auto-approve known target
      // shapes, keypress on unknowns.
      if (
        target.startsWith("gmail:read/") ||
        target.startsWith("calendar:read/") ||
        target.startsWith("people:read/")
      ) {
        return { kind: "auto-approve", reason: "bicriterion: read-only MCP" };
      }
      return {
        kind: "needs-keypress",
        reason: `bicriterion: unknown tool.invoke target ${target.slice(0, 60)}`,
      };
    }

    case CAPABILITY.NET_EGRESS: {
      // The egress guard already gates network egress at the fetch
      // layer. If the gate also sees a NET_EGRESS call it's an
      // explicit, declared one — auto-approve and let the egress guard
      // do the host check.
      return { kind: "auto-approve", reason: "bicriterion: declared net.egress" };
    }

    default: {
      // FS_READ and FS_WRITE_REV never hit the broker (the gate routes
      // reversible calls straight through). Any other token shouldn't
      // be reachable; deny defensively.
      return {
        kind: "deny",
        reason: `bicriterion: capability ${cap} unexpected on broker path`,
      };
    }
  }
}

type DlpSummary = Readonly<{
  maxSeverity: SecretarySeverity;
  findingCount: number;
}>;

function readDlpSummary(args: Readonly<Record<string, unknown>> | undefined): DlpSummary | null {
  if (!args) {
    return null;
  }
  const raw = args.dlpSummary;
  if (raw === null || typeof raw !== "object") {
    return null;
  }
  const m = raw as Record<string, unknown>;
  if (
    (m.maxSeverity === "low" ||
      m.maxSeverity === "medium" ||
      m.maxSeverity === "high" ||
      m.maxSeverity === "critical") &&
    typeof m.findingCount === "number"
  ) {
    return { maxSeverity: m.maxSeverity, findingCount: m.findingCount };
  }
  return null;
}

function decodeRecipient(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

async function promptWithTimeout(
  prompt: (req: BrokerRequest) => Promise<BrokerDecision>,
  req: BrokerRequest,
  timeoutMs: number,
  reason: string,
): Promise<BrokerDecision> {
  const timer = new Promise<BrokerDecision>((resolve) => {
    const t = setTimeout(
      () =>
        resolve({
          decision: "deny",
          reason: `bicriterion: keypress timeout (${reason})`,
        }),
      timeoutMs,
    );
    if (typeof t === "object" && t !== null && "unref" in t) {
      (t as { unref: () => void }).unref();
    }
  });
  try {
    return await Promise.race([prompt(req), timer]);
  } catch (err) {
    return {
      decision: "deny",
      reason: `bicriterion: prompt error: ${(err as Error).message}`,
    };
  }
}

/**
 * Build a stdin-based prompt suitable for `enclawed demo run secretary`.
 * Prints a one-screen summary of the call (with redacted DLP excerpts)
 * and waits for `y` / `n` / Enter. Anything other than `y` is treated as
 * a deny.
 */
export function buildStdinKeypressPrompt(input: {
  stdin?: NodeJS.ReadableStream;
  stdout?: NodeJS.WritableStream;
}): (req: BrokerRequest) => Promise<BrokerDecision> {
  const stdin = input.stdin ?? process.stdin;
  const stdout = input.stdout ?? process.stdout;

  return async (req) => {
    stdout.write(
      [
        "",
        "── secretary HITL keypress ─────────────────────────────────",
        `requestId : ${req.requestId}`,
        `skill     : ${req.skillId}`,
        `cap       : ${req.call.cap}`,
        `target    : ${req.call.target}`,
        `args      : ${truncate(JSON.stringify(req.call.args ?? null), 200)}`,
        "────────────────────────────────────────────────────────────",
        "approve? [y/N] ",
      ].join("\n"),
    );
    const answer = await readOneLine(stdin);
    const trimmed = answer.trim().toLowerCase();
    if (trimmed === "y" || trimmed === "yes") {
      return { decision: "approve", reason: "stdin keypress: y" };
    }
    return { decision: "deny", reason: `stdin keypress: ${trimmed || "<empty>"}` };
  };
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function readOneLine(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve) => {
    let buf = "";
    const onData = (chunk: Buffer | string) => {
      buf += chunk.toString();
      const nl = buf.indexOf("\n");
      if (nl >= 0) {
        stream.off("data", onData);
        resolve(buf.slice(0, nl));
      }
    };
    stream.on("data", onData);
    stream.once("error", () => {
      stream.off("data", onData);
      resolve(buf);
    });
  });
}
