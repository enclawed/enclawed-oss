// Dependency audit of the live runs: replays each recorded session transcript
// through the SHIPPED dependency tracker (extensions/egress-mediator
// action-batching.ts) to find out which item fetches the gateway classified as
// causally dependent (and therefore never collapsed, cached or reordered).
//
//   node --import tsx dep-audit.ts <out-dir> > dep-audit.json
//
// <out-dir> is the driver's output directory (runs.jsonl + state/). The
// replay is exact: results are recorded in the order the gateway's
// after_tool_call saw them, and each call of an assistant step is checked
// against the tokens of results completed before that step.
import fs from "node:fs";
import path from "node:path";
import {
  createDependencyTracker,
  toolResultText,
} from "../../../../extensions/egress-mediator/src/action-batching.js";

const outDir = process.argv[2];
const ITEM = /\/item\/(\d+)$/;
const sessionsOf = (stateDir: string) => path.join(stateDir, "agents", "main", "sessions");

type Audit = {
  sessionId: string;
  canary: string | null;
  itemCalls: number;
  dependentItemCalls: number;
};

function auditSession(file: string): Audit {
  const tracker = createDependencyTracker();
  const scope = "run";
  let canary: string | null = null;
  let itemCalls = 0;
  let dependentItemCalls = 0;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) {
      continue;
    }
    let d: { message?: { role?: string; content?: unknown; toolCallId?: string } };
    try {
      d = JSON.parse(line);
    } catch {
      continue;
    }
    const m = d.message;
    if (!m || !Array.isArray(m.content)) {
      continue;
    }
    if (m.role === "assistant") {
      for (const b of m.content as Array<{
        type?: string;
        name?: string;
        arguments?: Record<string, unknown>;
      }>) {
        if (b.type !== "toolCall" || b.name !== "web_fetch") {
          continue;
        }
        const raw = b.arguments?.url;
        const url = typeof raw === "string" ? raw : "";
        if (ITEM.test(url)) {
          itemCalls++;
          if (tracker.dependsOn(scope, b.arguments ?? {}).length > 0) {
            dependentItemCalls++;
          }
        }
      }
    } else if (m.role === "toolResult") {
      const text = toolResultText({ content: m.content });
      const code = /ACCESS CODE: ([0-9 ]+)/.exec(text ?? "");
      if (code) {
        canary = code[1].trim();
      }
      tracker.record(scope, m.toolCallId ?? `r${Math.random()}`, text);
    }
  }
  return { sessionId: path.basename(file, ".jsonl"), canary, itemCalls, dependentItemCalls };
}

const out: Record<string, Audit[]> = {};
for (const dir of fs.readdirSync(path.join(outDir, "state"))) {
  const sdir = sessionsOf(path.join(outDir, "state", dir));
  if (!fs.existsSync(sdir)) {
    continue;
  }
  // A batch that reused a (model, arm) gets a suffixed state dir
  // (<model>-<arm>.<timestamp>); its sessions belong to the same key.
  const key = dir.replace(/\.\d+$/, "");
  out[key] = [
    ...(out[key] ?? []),
    ...fs
      .readdirSync(sdir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => auditSession(path.join(sdir, f))),
  ];
}
process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
