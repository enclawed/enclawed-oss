// Bridge between the upstream SKILL.md-format skills (src/agents/skills/)
// and the enclawed security core (paper §3-§5).
//
// Upstream skills are not signed and do not carry a verification level;
// they predate the trust schema. Per the paper's untrusted-by-default rule
// (G11), the runtime cannot infer trust from origin, so an upstream skill
// is admitted at verification=unverified — every irreversible capability
// call it triggers walks HITL through the broker (paper §4.1).
//
// In the enclaved flavor the runtime can refuse upstream-format skills
// entirely, requiring a sidecar signed manifest. In the open flavor the
// runtime synthesizes an unverified manifest and registers the skill with
// the gate so audit + HITL are exercised even for unsigned content.

import { createHash } from "node:crypto";

import type { AuditLogger } from "./audit-log.js";
import type { Broker } from "./skill-broker.js";
import type { Flavor } from "./flavor.js";
import { LEVEL, makeLabel, type Label } from "./classification.js";
import {
  type SkillManifest,
  VERIFICATION,
  parseSkillManifest,
} from "./skill-manifest.js";
import { SkillGate } from "./skill-gate.js";
import {
  SkillMutationGuard,
  type LoadedSkillRecord,
} from "./skill-mutation-guard.js";
import {
  ALL_CAPABILITIES,
  type CapabilityToken,
} from "./skill-capabilities.js";

export class SkillAdmissionError extends Error {
  override name = "SkillAdmissionError";
}

export type UpstreamSkill = Readonly<{
  id: string;
  filePath: string;
  content: string;
  // Optional caps the operator declared out-of-band for this upstream skill.
  // If absent, the synthesized manifest declares zero caps — every
  // irreversible call will walk HITL because nothing is in M.caps.
  declaredCaps?: ReadonlyArray<CapabilityToken>;
  // Optional label the operator assigned to this upstream skill. Defaults
  // to PUBLIC/UNCLASSIFIED.
  label?: Label;
}>;

export type SkillAdmissionRuntime = Readonly<{
  audit: AuditLogger;
  broker: Broker;
  gate: SkillGate;
  guard: SkillMutationGuard;
  flavor: Flavor;
}>;

// Admit an upstream SKILL.md-format skill through the enclawed security
// core. In the enclaved flavor this is a hard error: unsigned skills are
// rejected. In the open flavor the runtime synthesizes an unverified
// manifest, registers the skill with the gate, and writes a
// skill.admitted-unverified record to the audit log.
export async function admitUpstreamSkill(
  rt: SkillAdmissionRuntime,
  s: UpstreamSkill,
): Promise<{ manifest: SkillManifest; contentSha256: string }> {
  if (rt.flavor === "enclaved") {
    await rt.audit.append({
      type: "skill.admit.rejected",
      actor: s.id,
      level: null,
      payload: { skillId: s.id, reason: "enclaved flavor: upstream skill is unsigned" },
    });
    throw new SkillAdmissionError(
      `skill "${s.id}" rejected: enclaved flavor requires a signed manifest`,
    );
  }
  const declaredCaps = (s.declaredCaps ?? []).filter(
    (c): c is CapabilityToken => (ALL_CAPABILITIES as ReadonlyArray<string>).includes(c),
  );
  const label = s.label ?? makeLabel({ level: LEVEL.UNCLASSIFIED });
  const manifest = parseSkillManifest({
    v: 1,
    id: s.id,
    label: {
      level: label.level,
      compartments: [...label.compartments],
      releasability: [...label.releasability],
    },
    caps: declaredCaps,
    signer: "<unsigned-upstream>",
    version: 0,
    verification: VERIFICATION.UNVERIFIED,
  });
  const contentSha256 = createHash("sha256").update(s.content).digest("hex");

  rt.gate.loadSkill(manifest);
  const record: LoadedSkillRecord = Object.freeze({
    manifest,
    contentSha256,
    filePath: s.filePath,
  });
  rt.guard.register(record);

  await rt.audit.append({
    type: "skill.admitted-unverified",
    actor: s.id,
    level: null,
    payload: {
      skillId: s.id,
      filePath: s.filePath,
      contentSha256,
      declaredCaps,
      flavor: rt.flavor,
    },
  });

  return { manifest, contentSha256 };
}
