// Tighten-only layering of a user-writable `enclawed.policy` block over an
// authoritative base policy (the admin policy, or the flavor default).
//
// Under the compromised-host premise the user config (~/.enclawed/enclawed.json)
// is attacker-writable, so where it applies on top of an authoritative base it
// may only narrow what the base allows. Every key the user sets that would
// widen the base is refused: the base value stays, and the refusal is returned
// so bootstrap can print it and write it to the audit log.
//
// Per key:
//   allowedChannels / allowedProviders / allowedTools / allowedHosts
//       base enforcing: result = base ∩ user; entries outside base refused.
//       base not enforcing: any user list narrows "everything", so accepted.
//   enforceAllowlists           false over a true base is refused.
//   commandNetwork              "host" over a "none" base is refused.
//   preApprovedIrreversibleTools / scratchPaths
//       result = base ∩ user; additions refused (they skip approval).
//   history.noHistoryPaths / noHistoryTools
//       union (opting out of history makes writes irreversible, so they wait
//       for approval: tighter).
//   history.maxFileBytes / maxTotalBytes / maxAgeDays
//       smaller is tighter (more writes become irreversible); larger refused.
//   maxOutputClearance          must be dominated by the base; else refused.
//   defaultDataLabel            must dominate the base; else refused.

import { dominates, format as formatLabel } from "./classification.js";
import { parsePolicyJson } from "./policy-loader.js";
import { createPolicy, type Policy } from "./policy.js";

export type TightenResult = Readonly<{ policy: Policy; refused: ReadonlyArray<string> }>;

type ListKey = "allowedChannels" | "allowedProviders" | "allowedTools" | "allowedHosts";

export function tightenPolicy(base: Policy, userBlock: unknown): TightenResult {
  if (userBlock === undefined || userBlock === null) {
    return { policy: base, refused: [] };
  }
  // Parse with the base as defaults so validation errors surface exactly as
  // they do for an authoritative block.
  const user = parsePolicyJson(userBlock, {
    maxOutputClearance: base.maxOutputClearance,
    defaultDataLabel: base.defaultDataLabel,
    enforceAllowlists: base.enforceAllowlists,
  });
  const raw = userBlock as Record<string, unknown>;
  const rawHistory = (raw.history ?? {}) as Record<string, unknown>;
  const refused: string[] = [];

  const enforce = (() => {
    if (raw.enforceAllowlists === false && base.enforceAllowlists) {
      refused.push("enclawed.policy.enforceAllowlists=false (would turn every allowlist off)");
      return true;
    }
    return base.enforceAllowlists || user.enforceAllowlists;
  })();

  const list = (key: ListKey): Set<string> => {
    if (raw[key] === undefined) {
      return new Set(base[key]);
    }
    if (!base.enforceAllowlists) {
      return new Set(user[key]);
    }
    const out = new Set<string>();
    for (const v of user[key]) {
      if (base[key].has(v)) {
        out.add(v);
      } else {
        refused.push(`enclawed.policy.${key} += ${JSON.stringify(v)}`);
      }
    }
    return out;
  };

  const intersect = (
    key: "preApprovedIrreversibleTools" | "scratchPaths",
    baseVals: Iterable<string>,
    userVals: Iterable<string>,
  ): string[] => {
    if (raw[key] === undefined) {
      return [...baseVals];
    }
    const b = new Set(baseVals);
    const out: string[] = [];
    for (const v of userVals) {
      if (b.has(v)) {
        out.push(v);
      } else {
        refused.push(`enclawed.policy.${key} += ${JSON.stringify(v)}`);
      }
    }
    return out;
  };

  let commandNetwork = base.commandNetwork;
  if (raw.commandNetwork !== undefined) {
    if (user.commandNetwork === "host" && base.commandNetwork === "none") {
      refused.push(
        'enclawed.policy.commandNetwork="host" (would take exec out of the network cage)',
      );
    } else {
      commandNetwork = user.commandNetwork;
    }
  }

  const cap = (key: "maxFileBytes" | "maxTotalBytes" | "maxAgeDays"): number => {
    if (rawHistory[key] === undefined) {
      return base.history[key];
    }
    // maxAgeDays has no tighter side: a larger value retains more data, and a
    // smaller one prunes restore points sooner (writes admitted as reversible
    // become unrecoverable). Only the admin policy sets it.
    if (key === "maxAgeDays" && user.history[key] !== base.history[key]) {
      refused.push(
        `enclawed.policy.history.maxAgeDays=${user.history[key]} (only the admin policy may change ${base.history[key]})`,
      );
      return base.history[key];
    }
    if (user.history[key] > base.history[key]) {
      refused.push(
        `enclawed.policy.history.${key}=${user.history[key]} (above ${base.history[key]})`,
      );
      return base.history[key];
    }
    return user.history[key];
  };

  let maxOutputClearance = base.maxOutputClearance;
  if (raw.maxOutputClearance !== undefined) {
    if (dominates(base.maxOutputClearance, user.maxOutputClearance)) {
      maxOutputClearance = user.maxOutputClearance;
    } else {
      refused.push(
        `enclawed.policy.maxOutputClearance=${formatLabel(user.maxOutputClearance)} (above ${formatLabel(base.maxOutputClearance)})`,
      );
    }
  }
  let defaultDataLabel = base.defaultDataLabel;
  if (raw.defaultDataLabel !== undefined) {
    if (dominates(user.defaultDataLabel, base.defaultDataLabel)) {
      defaultDataLabel = user.defaultDataLabel;
    } else {
      refused.push(
        `enclawed.policy.defaultDataLabel=${formatLabel(user.defaultDataLabel)} (below ${formatLabel(base.defaultDataLabel)})`,
      );
    }
  }

  const policy = createPolicy({
    enforceAllowlists: enforce,
    allowedChannels: list("allowedChannels"),
    allowedProviders: list("allowedProviders"),
    allowedTools: list("allowedTools"),
    allowedHosts: list("allowedHosts"),
    commandNetwork,
    preApprovedIrreversibleTools: intersect(
      "preApprovedIrreversibleTools",
      base.preApprovedIrreversibleTools,
      user.preApprovedIrreversibleTools,
    ),
    scratchPaths: intersect("scratchPaths", base.scratchPaths, user.scratchPaths),
    history: {
      maxFileBytes: cap("maxFileBytes"),
      maxTotalBytes: cap("maxTotalBytes"),
      maxAgeDays: cap("maxAgeDays"),
      noHistoryPaths: [
        ...new Set([...base.history.noHistoryPaths, ...user.history.noHistoryPaths]),
      ],
      noHistoryTools: new Set([...base.history.noHistoryTools, ...user.history.noHistoryTools]),
    },
    maxOutputClearance,
    defaultDataLabel,
  });
  return { policy, refused };
}
