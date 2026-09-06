// Append-only JSONL store for scheduled follow-ups. Each
// "schedule_followup" tool call appends a `scheduled` record; each
// time the daily-loop fires a due follow-up it appends a `fired`
// record carrying the same id. Active follow-ups = scheduled minus
// fired. The file survives restarts so a followup scheduled now
// fires next week even if the service is bounced in between.

import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve as resolvePath } from "node:path";

export type Followup = Readonly<{
  id: string;
  triggerAtIso: string;
  summary: string;
  context: string | null;
  scheduledByThreadId: string;
  scheduledAtIso: string;
}>;

type StoreRecord =
  | { kind: "scheduled"; followup: Followup }
  | { kind: "fired"; id: string; firedAtIso: string };

export class FollowupStore {
  constructor(private readonly filePath: string) {}

  static defaultPath(): string {
    return resolvePath(
      homedir(),
      ".enclawed",
      "enclawed-apps",
      "executive-assistant",
      "followups.jsonl",
    );
  }

  async schedule(input: Omit<Followup, "id" | "scheduledAtIso">): Promise<Followup> {
    const full: Followup = {
      ...input,
      id: randomUUID(),
      scheduledAtIso: new Date().toISOString(),
    };
    await this.appendLine({ kind: "scheduled", followup: full });
    return full;
  }

  async markFired(id: string): Promise<void> {
    await this.appendLine({
      kind: "fired",
      id,
      firedAtIso: new Date().toISOString(),
    });
  }

  /** Active follow-ups whose triggerAtIso <= now. Sorted oldest-first. */
  async dueFollowups(now: Date): Promise<Followup[]> {
    const active = await this.activeFollowups();
    const nowMs = now.getTime();
    const due: Followup[] = [];
    for (const f of active) {
      const t = Date.parse(f.triggerAtIso);
      if (Number.isFinite(t) && t <= nowMs) {
        due.push(f);
      }
    }
    due.sort((a, b) => Date.parse(a.triggerAtIso) - Date.parse(b.triggerAtIso));
    return due;
  }

  /** All scheduled-but-not-fired follow-ups. */
  async activeFollowups(): Promise<Followup[]> {
    const records = await this.load();
    const scheduled = new Map<string, Followup>();
    for (const r of records) {
      if (r.kind === "scheduled") {
        scheduled.set(r.followup.id, r.followup);
      } else {
        scheduled.delete(r.id);
      }
    }
    return [...scheduled.values()];
  }

  private async load(): Promise<StoreRecord[]> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return [];
      }
      throw err;
    }
    const out: StoreRecord[] = [];
    for (const ln of raw.split("\n")) {
      if (!ln.trim()) {
        continue;
      }
      try {
        out.push(JSON.parse(ln) as StoreRecord);
      } catch {
        // ignore malformed line; the next sane record carries on
      }
    }
    return out;
  }

  private async appendLine(rec: StoreRecord): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, JSON.stringify(rec) + "\n", "utf8");
  }
}
