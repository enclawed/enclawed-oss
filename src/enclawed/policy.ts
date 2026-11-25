import { DOE_Q_TEMPLATE, type Label, LEVEL, makeLabel } from "./classification.js";

export type Decision = { allowed: true } | { allowed: false; reason: string };

/**
 * Network access for the commands a model asks Enclawed to run (the exec
 * tool). "none": they run in a network cage and every attempt to connect is
 * blocked, recorded and reported. "host": they share the host's network.
 */
export type CommandNetwork = "none" | "host";

/**
 * Write history for agent file tools (enclaved flavor). A write whose prior
 * content is kept here is reversible and runs without asking a person; a
 * write opted out of history, or one that would exceed these caps, is
 * irreversible and waits for approval.
 */
export type HistoryPolicy = Readonly<{
  /** Largest single prior-content snapshot kept, in bytes. */
  maxFileBytes: number;
  /** Total bytes the history store may hold. */
  maxTotalBytes: number;
  /** Snapshots older than this are pruned. */
  maxAgeDays: number;
  /** Absolute paths or globs (`*`, `**`) whose writes keep no history. */
  noHistoryPaths: readonly string[];
  /** Tool ids whose writes keep no history. */
  noHistoryTools: ReadonlySet<string>;
}>;

/**
 * Bounds on history.maxAgeDays (settings audit #1). The floor keeps every
 * restore point for at least a week, far longer than any pending write needs
 * it, and the history store applies it again when it prunes.
 */
export const HISTORY_MIN_AGE_DAYS = 7;
export const HISTORY_MAX_AGE_DAYS = 365;

export const DEFAULT_HISTORY_POLICY: HistoryPolicy = Object.freeze({
  maxFileBytes: 16 * 1024 * 1024,
  maxTotalBytes: 1024 * 1024 * 1024,
  maxAgeDays: 30,
  noHistoryPaths: Object.freeze([]) as readonly string[],
  noHistoryTools: new Set<string>(),
});

export type Policy = Readonly<{
  enforceAllowlists: boolean;
  allowedChannels: ReadonlySet<string>;
  allowedProviders: ReadonlySet<string>;
  allowedTools: ReadonlySet<string>;
  allowedHosts: ReadonlySet<string>;
  commandNetwork: CommandNetwork;
  /**
   * Irreversible agent tools (canonical tool ids) the operator pre-approves,
   * so the enclaved flavor runs them without asking a person each time.
   * Empty by default: every irreversible call waits for approval.
   */
  preApprovedIrreversibleTools: ReadonlySet<string>;
  /**
   * Absolute directories where agent writes need no history (scratch), in
   * addition to the gateway's own temp directory.
   */
  scratchPaths: readonly string[];
  history: HistoryPolicy;
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
  commandNetwork?: CommandNetwork;
  preApprovedIrreversibleTools?: Iterable<string>;
  scratchPaths?: Iterable<string>;
  history?: Partial<{
    maxFileBytes: number;
    maxTotalBytes: number;
    maxAgeDays: number;
    noHistoryPaths: Iterable<string>;
    noHistoryTools: Iterable<string>;
  }>;
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
    commandNetwork: input.commandNetwork ?? "none",
    preApprovedIrreversibleTools: freezeAllowlist(input.preApprovedIrreversibleTools),
    scratchPaths: Object.freeze([...(input.scratchPaths ?? [])]),
    history: Object.freeze({
      maxFileBytes: input.history?.maxFileBytes ?? DEFAULT_HISTORY_POLICY.maxFileBytes,
      maxTotalBytes: input.history?.maxTotalBytes ?? DEFAULT_HISTORY_POLICY.maxTotalBytes,
      maxAgeDays: input.history?.maxAgeDays ?? DEFAULT_HISTORY_POLICY.maxAgeDays,
      noHistoryPaths: Object.freeze([...(input.history?.noHistoryPaths ?? [])]),
      noHistoryTools: freezeAllowlist(input.history?.noHistoryTools),
    }),
    maxOutputClearance: input.maxOutputClearance,
    defaultDataLabel: input.defaultDataLabel,
  });
}

export function checkChannel(policy: Policy, id: string): Decision {
  if (!policy.enforceAllowlists) {
    return { allowed: true };
  }
  return policy.allowedChannels.has(id)
    ? { allowed: true }
    : { allowed: false, reason: `channel "${id}" not on allowlist` };
}

export function checkProvider(policy: Policy, id: string): Decision {
  if (!policy.enforceAllowlists) {
    return { allowed: true };
  }
  return policy.allowedProviders.has(id)
    ? { allowed: true }
    : { allowed: false, reason: `provider "${id}" not on allowlist` };
}

export function checkTool(policy: Policy, id: string): Decision {
  if (!policy.enforceAllowlists) {
    return { allowed: true };
  }
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
