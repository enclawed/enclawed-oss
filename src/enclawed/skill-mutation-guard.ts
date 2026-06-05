// Skill-mutation interception (paper §3.2 / G12).
//
// Once a skill is loaded, its content is immutable for the lifetime of the
// agent session. Any attempt the agent makes to modify a loaded skill must:
//   1. be intercepted as an irreversible capability call (fs.write.irrev),
//   2. walk the HITL gate,
//   3. be recorded in the hash-chained audit log with the pre- and
//      post-mutation content hashes regardless of approval,
//   4. on approval, mark the affected skill as needing re-verification
//      before the next session.
//
// The guard is small and intentionally stateful: it owns the in-session
// invariant ("the skill content matches the contentSha256 captured at
// load time") and refuses to drop that invariant without the audit
// records of step 3.

import { createHash } from "node:crypto";

import type { AuditLogger } from "./audit-log.js";
import { CAPABILITY, makeCall } from "./skill-capabilities.js";
import type { SkillGate } from "./skill-gate.js";
import { format as formatLabel } from "./classification.js";
import type { SkillManifest } from "./skill-manifest.js";

export type LoadedSkillRecord = Readonly<{
  manifest: SkillManifest;
  contentSha256: string;
  filePath: string;
}>;

export class SkillMutationGuard {
  private readonly audit: AuditLogger;
  private readonly gate: SkillGate;
  private readonly loaded: Map<string, LoadedSkillRecord> = new Map();
  private readonly invalidated: Set<string> = new Set();

  constructor(opts: { audit: AuditLogger; gate: SkillGate }) {
    this.audit = opts.audit;
    this.gate = opts.gate;
  }

  register(record: LoadedSkillRecord): void {
    this.loaded.set(record.manifest.id, record);
  }

  isInvalidated(skillId: string): boolean {
    return this.invalidated.has(skillId);
  }

  loadedSkillIds(): ReadonlyArray<string> {
    return [...this.loaded.keys()];
  }

  // Intercept a request to mutate a loaded skill's content. The call walks
  // the HITL gate as fs.write.irrev. Pre- and post-mutation hashes are
  // recorded in the audit log regardless of approval (paper §3.2). On
  // approval, the skill is marked as invalidated; it must be re-verified
  // at the next bootstrap.
  async attemptMutation(input: {
    skillId: string;
    proposedContent: Buffer | string;
    apply: () => Promise<void> | void;
  }): Promise<{ approved: boolean; postSha256: string }> {
    const rec = this.loaded.get(input.skillId);
    if (!rec) {
      throw new Error(`skill "${input.skillId}" not loaded`);
    }
    const proposedBuf =
      typeof input.proposedContent === "string"
        ? Buffer.from(input.proposedContent, "utf8")
        : input.proposedContent;
    const postSha256 = createHash("sha256").update(proposedBuf).digest("hex");

    // Pre-mutation hash record. We write this BEFORE asking the broker so
    // the audit trail includes the attempt even if the host crashes mid
    // dispatch.
    await this.audit.append({
      type: "skill.mutation.attempt",
      actor: input.skillId,
      level: formatLabel(rec.manifest.label),
      payload: {
        skillId: input.skillId,
        preSha256: rec.contentSha256,
        postSha256,
      },
    });

    const call = makeCall({
      cap: CAPABILITY.FS_WRITE_IRREV,
      target: `skill://${input.skillId}`,
      args: { preSha256: rec.contentSha256, postSha256 },
    });
    const outcome = await this.gate.dispatch({
      skillId: input.skillId,
      call,
      execute: async () => {
        try {
          await input.apply();
          return { ok: true };
        } catch (err) {
          return { ok: false, reason: (err as Error).message };
        }
      },
    });

    if (outcome.kind === "executed") {
      this.invalidated.add(input.skillId);
      this.loaded.set(input.skillId, {
        manifest: rec.manifest,
        contentSha256: postSha256,
        filePath: rec.filePath,
      });
      await this.audit.append({
        type: "skill.mutation.committed",
        actor: input.skillId,
        level: formatLabel(rec.manifest.label),
        payload: {
          skillId: input.skillId,
          preSha256: rec.contentSha256,
          postSha256,
          requiresReverification: true,
        },
      });
      return { approved: true, postSha256 };
    }

    await this.audit.append({
      type: "skill.mutation.denied",
      actor: input.skillId,
      level: formatLabel(rec.manifest.label),
      payload: {
        skillId: input.skillId,
        preSha256: rec.contentSha256,
        postSha256,
        reason: outcome.kind === "denied" ? outcome.reason : "execute-error",
      },
    });
    return { approved: false, postSha256 };
  }
}
