// Deny-by-default plugin / channel / provider / tool policy.
//
// LIMITATION: enforcement is only as strong as the chokepoints we hook from
// integrations/*.mjs. A bypassing plugin or direct global.fetch caller can
// evade unless the host loader is configured to also enforce the allowlist
// (see enclawed/MODIFICATIONS.md "Plugin loader hardening").

const FROZEN_EMPTY = Object.freeze([]);

function freezeAllowlist(list) {
  if (!list) return new Set();
  return new Set(list.map(String));
}

export function createPolicy({
  enforceAllowlists = true,
  allowedChannels = FROZEN_EMPTY,
  allowedProviders = FROZEN_EMPTY,
  allowedTools = FROZEN_EMPTY,
  allowedHosts = FROZEN_EMPTY,
  // VPN-only egress (paper §4.4 + post-port hardening). When true, every
  // egress destination must either be on allowedHosts (literal hostname /
  // loopback / mDNS) or fall inside one of vpnGatewayCidrs (typical
  // private-network range exposed by the VPN tunnel). Public-internet IPs
  // are denied even if the OS routing table would forward them.
  requireVpnGateway = false,
  vpnGatewayCidrs = FROZEN_EMPTY,
  maxOutputClearance,
  defaultDataLabel,
} = {}) {
  if (!maxOutputClearance) {
    throw new Error('createPolicy: maxOutputClearance is required');
  }
  if (!defaultDataLabel) {
    throw new Error('createPolicy: defaultDataLabel is required');
  }
  return Object.freeze({
    enforceAllowlists,
    allowedChannels: freezeAllowlist(allowedChannels),
    allowedProviders: freezeAllowlist(allowedProviders),
    allowedTools: freezeAllowlist(allowedTools),
    allowedHosts: freezeAllowlist(allowedHosts),
    requireVpnGateway: requireVpnGateway === true,
    vpnGatewayCidrs: Object.freeze([...(vpnGatewayCidrs || [])].map(String)),
    maxOutputClearance,
    defaultDataLabel,
  });
}

export function checkChannel(policy, channelId) {
  if (!policy.enforceAllowlists) return { allowed: true };
  if (!policy.allowedChannels.has(channelId)) {
    return { allowed: false, reason: `channel "${channelId}" not on allowlist` };
  }
  return { allowed: true };
}

export function checkProvider(policy, providerId) {
  if (!policy.enforceAllowlists) return { allowed: true };
  if (!policy.allowedProviders.has(providerId)) {
    return { allowed: false, reason: `provider "${providerId}" not on allowlist` };
  }
  return { allowed: true };
}

export function checkTool(policy, toolId) {
  if (!policy.enforceAllowlists) return { allowed: true };
  if (!policy.allowedTools.has(toolId)) {
    return { allowed: false, reason: `tool "${toolId}" not on allowlist` };
  }
  return { allowed: true };
}

// Default profile recommended for a national-lab classified enclave.
// All cloud channels and cloud providers are denied by default; only a local
// model and a loopback control channel are permitted.
import { DOE_Q_TEMPLATE, makeLabel, LEVEL } from './classification.mjs';

export function defaultEnclavedPolicy({
  localModelProviderId = 'local-model',
  controlChannelId = 'web-loopback',
  // VPN-only mode is the default for enclaved deployments after the
  // upstream-extension port: every cloud channel/provider plugin is
  // present in source but unsigned, so it can only be loaded if the
  // operator promotes it; even when promoted, its outbound traffic
  // must traverse the org-controlled VPN. The default CIDRs cover the
  // RFC 1918 private ranges typically used as VPN gateways. The
  // deploying organization will replace these with the exact CIDR
  // their VPN exposes.
  vpnGatewayCidrs = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'],
} = {}) {
  return createPolicy({
    enforceAllowlists: true,
    allowedChannels: [controlChannelId],
    allowedProviders: [localModelProviderId],
    allowedTools: [],
    allowedHosts: ['127.0.0.1', '::1', 'localhost'],
    requireVpnGateway: true,
    vpnGatewayCidrs,
    maxOutputClearance: makeLabel(DOE_Q_TEMPLATE),
    defaultDataLabel: makeLabel({
      level: LEVEL.SECRET,
      compartments: ['RD'],
    }),
  });
}

export function defaultOpenPolicy() {
  return createPolicy({
    enforceAllowlists: false,
    maxOutputClearance: makeLabel({ level: LEVEL.UNCLASSIFIED }),
    defaultDataLabel: makeLabel({ level: LEVEL.UNCLASSIFIED }),
  });
}

// Backwards-compatible alias.
export const defaultClassifiedPolicy = defaultEnclavedPolicy;
