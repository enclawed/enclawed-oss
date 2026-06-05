import { DOE_Q_TEMPLATE, type Label, LEVEL, makeLabel } from "./classification.js";

export type Decision = { allowed: true } | { allowed: false; reason: string };

export type Policy = Readonly<{
  enforceAllowlists: boolean;
  allowedChannels: ReadonlySet<string>;
  allowedProviders: ReadonlySet<string>;
  allowedTools: ReadonlySet<string>;
  allowedHosts: ReadonlySet<string>;
  maxOutputClearance: Label;
  defaultDataLabel: Label;
}>;

function freezeAllowlist(list?: Iterable<string>): ReadonlySet<string> {
  return new Set([...(list ?? [])].map(String));
}

export function createPolicy(input: {
  enforceAllowlists?: boolean;
  allowedChannels?: Iterable<string>;
  allowedProviders?: Iterable<string>;
  allowedTools?: Iterable<string>;
  allowedHosts?: Iterable<string>;
  maxOutputClearance: Label;
  defaultDataLabel: Label;
}): Policy {
  if (!input.maxOutputClearance) {
    throw new Error("createPolicy: maxOutputClearance is required");
  }
  if (!input.defaultDataLabel) {
    throw new Error("createPolicy: defaultDataLabel is required");
  }
  return Object.freeze({
    enforceAllowlists: input.enforceAllowlists ?? true,
    allowedChannels: freezeAllowlist(input.allowedChannels),
    allowedProviders: freezeAllowlist(input.allowedProviders),
    allowedTools: freezeAllowlist(input.allowedTools),
    allowedHosts: freezeAllowlist(input.allowedHosts),
    maxOutputClearance: input.maxOutputClearance,
    defaultDataLabel: input.defaultDataLabel,
  });
}

export function checkChannel(policy: Policy, id: string): Decision {
  if (!policy.enforceAllowlists) return { allowed: true };
  return policy.allowedChannels.has(id)
    ? { allowed: true }
    : { allowed: false, reason: `channel "${id}" not on allowlist` };
}

export function checkProvider(policy: Policy, id: string): Decision {
  if (!policy.enforceAllowlists) return { allowed: true };
  return policy.allowedProviders.has(id)
    ? { allowed: true }
    : { allowed: false, reason: `provider "${id}" not on allowlist` };
}

export function checkTool(policy: Policy, id: string): Decision {
  if (!policy.enforceAllowlists) return { allowed: true };
  return policy.allowedTools.has(id)
    ? { allowed: true }
    : { allowed: false, reason: `tool "${id}" not on allowlist` };
}

// Strict profile for classified deployment. Every cloud channel and cloud
// provider is denied; only the loopback control channel and a local model
// provider are permitted.
export function defaultEnclavedPolicy(opts?: {
  localModelProviderId?: string;
  controlChannelId?: string;
}): Policy {
  const localModelProviderId = opts?.localModelProviderId ?? "local-model";
  const controlChannelId = opts?.controlChannelId ?? "web-loopback";
  return createPolicy({
    enforceAllowlists: true,
    allowedChannels: [controlChannelId],
    allowedProviders: [localModelProviderId],
    allowedTools: [],
    allowedHosts: ["127.0.0.1", "::1", "localhost"],
    maxOutputClearance: makeLabel(DOE_Q_TEMPLATE),
    defaultDataLabel: makeLabel({ level: LEVEL.SECRET, compartments: ["RD"] }),
  });
}

// Permissive profile for the Enclawed-compatible "open" flavor. The
// classification framework is still active so audit, DLP redaction, label
// types, and module-signing checks all run; allowlists are simply not
// enforced. Use this in development and for any deployment outside a
// classified enclave.
export function defaultOpenPolicy(): Policy {
  return createPolicy({
    enforceAllowlists: false,
    maxOutputClearance: makeLabel({ level: LEVEL.UNCLASSIFIED }),
    defaultDataLabel: makeLabel({ level: LEVEL.UNCLASSIFIED }),
  });
}

// Backwards-compatible alias (older code referenced defaultClassifiedPolicy).
export const defaultClassifiedPolicy = defaultEnclavedPolicy;
