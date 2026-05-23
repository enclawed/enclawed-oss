// Wires the skill trust schema (paper §3-§5) into a single runtime object
// the host can call from bootstrap. The runtime is intentionally additive
// alongside the existing module-level pipeline; nothing here changes the
// behavior of an already-deployed enclawed harness until the host opts in
// by calling SkillRuntime.bootstrap().

import type { AuditLogger } from "./audit-log.js";
import type { Label } from "./classification.js";
import { type LoadedSkill, verifySkill } from "./skill-loader.js";
import { SkillGate, TransactionBuffer } from "./skill-gate.js";
import {
  SkillMutationGuard,
  type LoadedSkillRecord,
} from "./skill-mutation-guard.js";
import type { Broker } from "./skill-broker.js";
import type { TrustedSigner } from "./trust-root.js";
import type { VerificationLevel } from "./skill-manifest.js";

export type SkillRuntimeOptions = Readonly<{
  audit: AuditLogger;
  broker: Broker;
  userClearance: Label;
  resolveSigner?: (keyId: string) => TrustedSigner | undefined;
  signerVerificationAuthority?: (signer: TrustedSigner) => VerificationLevel;
}>;

export type SkillBundle = Readonly<{
  manifestJson: unknown;
  content: Buffer | string;
  signature: string;
  filePath: string;
}>;

export class SkillRuntime {
  readonly audit: AuditLogger;
  readonly broker: Broker;
  readonly gate: SkillGate;
  readonly guard: SkillMutationGuard;
  private readonly userClearance: Label;
  private readonly resolveSigner?: (keyId: string) => TrustedSigner | undefined;
  private readonly signerVerificationAuthority?: (signer: TrustedSigner) => VerificationLevel;
  private bootstrapped = false;
  private readonly txn: TransactionBuffer;

  constructor(opts: SkillRuntimeOptions) {
    this.audit = opts.audit;
    this.broker = opts.broker;
    this.userClearance = opts.userClearance;
    this.resolveSigner = opts.resolveSigner;
    this.signerVerificationAuthority = opts.signerVerificationAuthority;
    this.txn = new TransactionBuffer();
    this.gate = new SkillGate({ audit: this.audit, broker: this.broker, txn: this.txn });
    this.guard = new SkillMutationGuard({ audit: this.audit, gate: this.gate });
  }

  // Verify and load a list of skills at bootstrap. After bootstrap returns
  // successfully the loaded set is frozen for the lifetime of this runtime
  // (paper §3.4). Any failure aborts the load — the host should treat
  // partial success as a fatal error.
  async bootstrap(bundles: ReadonlyArray<SkillBundle>): Promise<ReadonlyArray<LoadedSkill>> {
    if (this.bootstrapped) {
      throw new Error("SkillRuntime: already bootstrapped");
    }
    const loaded: LoadedSkill[] = [];
    for (const b of bundles) {
      const result = verifySkill({
        manifestJson: b.manifestJson,
        content: b.content,
        signature: b.signature,
        userClearance: this.userClearance,
        resolveSigner: this.resolveSigner,
        signerVerificationAuthority: this.signerVerificationAuthority,
      });
      this.gate.loadSkill(result.manifest);
      const rec: LoadedSkillRecord = Object.freeze({
        manifest: result.manifest,
        contentSha256: result.contentSha256,
        filePath: b.filePath,
      });
      this.guard.register(rec);
      await this.audit.append({
        type: "skill.loaded",
        actor: result.manifest.id,
        level: null,
        payload: {
          skillId: result.manifest.id,
          version: result.manifest.version,
          verification: result.manifest.verification,
          signerKeyId: result.signerKeyId,
          contentSha256: result.contentSha256,
        },
      });
      loaded.push(result);
    }
    this.bootstrapped = true;
    return Object.freeze(loaded);
  }

  isBootstrapped(): boolean {
    return this.bootstrapped;
  }

  // Roll back any pending reversible-call entries in the txn buffer. Useful
  // when the host hits an abort condition mid-session.
  async rollbackPending(): Promise<void> {
    await this.txn.rollbackAll();
  }
}
