// What happens when a caged process tries to reach the network: every
// attempt is written to the hash-chained audit log at once, with what it
// tried to reach and whether the bytes it sent carry secrets or personal
// data; the person running Enclawed is told at once, through every channel
// the caller wires in. Repeats to one destination are folded into a count,
// so a loop of 564 upload retries is one alert, not 564.

import { createHash } from "node:crypto";
import { type Finding, scan } from "../dlp-scanner.js";
import { getRuntime } from "../runtime.js";
import type { NetCageAttempt, NetCageEvent } from "./cage.js";

export type NetCageSource = "exec" | "model-server";

export type NetCageAlert = {
  source: NetCageSource;
  /** What was running: the command line, or the model server's name. */
  label: string;
  attempt: NetCageAttempt;
  /** DLP findings in the bytes it tried to send (ids only, never the match). */
  findings: string[];
  /** Attempts to this destination so far, this one included. */
  count: number;
  message: string;
};

export type NetCageReporter = {
  onEvent: (event: NetCageEvent) => void;
  /** Attempts seen so far. */
  attempts: () => number;
  /** One line per destination, with its count, for a final summary. */
  summary: () => string[];
};

// Audit records per reporter before attempts are only counted: a process
// looping on connect() must not be able to fill the disk through the log.
const AUDIT_CAP = 1000;

function destination(a: NetCageAttempt): string {
  if (a.name) {
    return a.name;
  }
  if (a.dst) {
    return a.port ? `${a.dst}:${a.port}` : a.dst;
  }
  return a.transport === "ip" ? "an address off this machine" : `port ${a.port}`;
}

function describe(a: NetCageAttempt): string {
  const via =
    a.protocol === "dns"
      ? "a DNS lookup of"
      : a.protocol === "tls"
        ? "a TLS connection to"
        : a.protocol === "http"
          ? `an HTTP ${a.request ?? "request"} to`
          : a.transport === "ip"
            ? `${a.packets ?? 1} packet(s) to`
            : `a ${a.transport.toUpperCase()} connection to`;
  return `${via} ${destination(a)}`;
}

export function dlpFindingsOf(sampleBase64: string): Finding[] {
  if (!sampleBase64) {
    return [];
  }
  try {
    return scan(Buffer.from(sampleBase64, "base64").toString("latin1"), { onOversize: "truncate" });
  } catch {
    return [];
  }
}

export function createNetCageReporter(opts: {
  source: NetCageSource;
  label: string;
  /** Called at once for the first attempt to each destination. */
  notify: (alert: NetCageAlert) => void;
}): NetCageReporter {
  const counts = new Map<string, number>();
  let total = 0;
  let audited = 0;
  const who = opts.source === "exec" ? "a command the model ran" : "the model server";
  return {
    onEvent(event) {
      if (event.type === "notice") {
        getRuntime()
          ?.audit.append({
            type: "egress.cage.notice",
            actor: opts.source,
            level: null,
            payload: { label: opts.label, message: event.message },
          })
          .catch(() => {});
        return;
      }
      if (event.type !== "attempt") {
        return;
      }
      total++;
      const key = `${event.transport}|${destination(event)}`;
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      const findings = [...new Set(dlpFindingsOf(event.sample).map((f) => f.id))];
      if (audited < AUDIT_CAP) {
        audited++;
        getRuntime()
          ?.audit.append({
            type: "egress.cage.attempt",
            actor: opts.source,
            level: null,
            payload: {
              label: opts.label,
              transport: event.transport,
              dst: event.dst,
              port: event.port,
              protocol: event.protocol,
              name: event.name,
              request: event.request,
              bytes: event.bytes,
              packets: event.packets ?? null,
              // The bytes themselves stay out of the log: they may be the
              // very secret that was being sent. Their hash identifies them.
              sampleSha256: event.sample
                ? createHash("sha256").update(Buffer.from(event.sample, "base64")).digest("hex")
                : null,
              dlp: findings,
              count,
            },
          })
          .catch(() => {});
      }
      if (count > 1) {
        return;
      }
      const carrying = findings.length > 0 ? ` It carried ${findings.join(", ")}.` : "";
      const message =
        `Enclawed blocked ${who} (${opts.label}) from reaching the network: ` +
        `${describe(event)}.${carrying} Nothing left this machine.`;
      try {
        opts.notify({
          source: opts.source,
          label: opts.label,
          attempt: event,
          findings,
          count,
          message,
        });
      } catch {
        /* a failing notifier must not hide the next attempt */
      }
    },
    attempts: () => total,
    summary: () =>
      [...counts.entries()].map(([key, n]) => {
        const [transport, dest] = key.split("|");
        return `${n} × ${transport} to ${dest}`;
      }),
  };
}
