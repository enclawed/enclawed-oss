// The target of a net.egress capability: a destination PROFILE, not a host.
//
// A host alone says where requests may go, not what they may be: a skill
// that declares egress to a package registry would conform with any request
// to that host, an exploit for the registry's proxy included. A target is
// therefore scheme, host, port and, optionally, the request shape the
// destination takes (./containment/request-shape.ts) under a path prefix:
//
//   https://registry.npmjs.org:443#npm-registry
//   https://artifacts.example:8443/artifactory/api/npm/npm-remote#npm-registry
//   https://pypi.org#pypi
//   https://docs.example.com/v2#generic        (GET/HEAD below /v2, nothing else)
//   https://api.example.com                    (no shape named: the generic
//                                               profile at the root)
//
// A bare host ("registry.npmjs.org") or "host:port" still parses, as https
// on 443 (or that port) with no shape named: the containment gives such a
// destination the generic profile (./containment/request-shape-profiles.ts:
// GET or HEAD, no body, no query, closed headers, its path choice charged
// against a capacity ledger), never free-form egress. An explicit API
// profile has routes a fragment cannot carry: only a signed admission
// record declares one. A path is accepted only with a profile (it is the
// profile's prefix; a path alone could not be enforced).
//
// The canonical string (egressTargetString) is what a net.egress
// CapabilityCall carries as its target and what the biconditional projects.

import {
  checkRequestShape,
  NAMED_SHAPE_PROFILES,
  resolveRequestShape,
  type RequestShapeProfileId,
} from "./containment/request-shape.js";

export type EgressTarget = Readonly<{
  scheme: "https" | "http";
  host: string;
  port: number;
  /** The profile's path prefix ("" for the root). */
  pathPrefix: string;
  /** The request shape; null: none (any request to the destination). */
  profile: RequestShapeProfileId | null;
}>;

const DNS = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;

/** Parse a declared egress target. Throws a TypeError naming what is wrong. */
export function parseEgressTarget(raw: unknown): EgressTarget {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) {
    throw new TypeError("an egress target must be a non-empty string");
  }
  const s = raw.trim();
  // Legacy: a bare host, or host:port.
  const legacy = /^([A-Za-z0-9.-]+)(?::(\d{1,5}))?$/.exec(s);
  if (legacy) {
    const host = legacy[1].toLowerCase();
    const port = legacy[2] ? Number(legacy[2]) : 443;
    if (!DNS.test(host) || port < 1 || port > 65535) {
      throw new TypeError(`egress target ${JSON.stringify(s)} is not a DNS name and port`);
    }
    return { scheme: "https", host, port, pathPrefix: "", profile: null };
  }
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new TypeError(`egress target ${JSON.stringify(s)} is neither a host nor a URL`);
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new TypeError(`egress target ${JSON.stringify(s)} must be https or http`);
  }
  if (u.username || u.password || u.search) {
    throw new TypeError(`egress target ${JSON.stringify(s)} carries credentials or a query`);
  }
  const host = u.hostname.toLowerCase();
  if (!DNS.test(host)) {
    throw new TypeError(`egress target ${JSON.stringify(s)}: the host must be a DNS name`);
  }
  const scheme = u.protocol === "https:" ? "https" : "http";
  const port = u.port ? Number(u.port) : scheme === "https" ? 443 : 80;
  const profileRaw = u.hash.replace(/^#/, "");
  let profile: RequestShapeProfileId | null = null;
  if (profileRaw) {
    if (!NAMED_SHAPE_PROFILES.includes(profileRaw as RequestShapeProfileId)) {
      throw new TypeError(
        `egress target ${JSON.stringify(s)}: unknown profile ${JSON.stringify(profileRaw)} (known: ${NAMED_SHAPE_PROFILES.join(", ")})`,
      );
    }
    profile = profileRaw as RequestShapeProfileId;
  }
  // The raw path, as written (URL would have resolved dot segments away).
  const rawPath = /^[a-z]+:\/\/[^/?#]*([^?#]*)/i.exec(s)?.[1] ?? "";
  const pathPrefix = rawPath === "/" ? "" : rawPath.replace(/\/$/, "");
  if (pathPrefix && !profile) {
    throw new TypeError(
      `egress target ${JSON.stringify(s)} names a path but no profile (#npm-registry, #pypi, #generic); a path alone cannot be enforced`,
    );
  }
  if (profile) {
    const shape = resolveRequestShape({ profile, pathPrefix });
    if (!shape.ok) {
      throw new TypeError(`egress target ${JSON.stringify(s)}: ${shape.message}`);
    }
  }
  return { scheme, host, port, pathPrefix, profile };
}

/** The canonical form: scheme://host:port[prefix][#profile], port always written. */
export function egressTargetString(t: EgressTarget): string {
  return `${t.scheme}://${t.host}:${t.port}${t.pathPrefix}${t.profile ? `#${t.profile}` : ""}`;
}

/** The canonical form of a declared target (throws when it does not parse). */
export function canonicalEgressTarget(raw: unknown): string {
  return egressTargetString(parseEgressTarget(raw));
}

/** The containment destination a target becomes (inspected or plain HTTP, with its shape). */
export function egressTargetDestination(t: EgressTarget): Readonly<{
  host: string;
  port: number;
  mode: "inspect" | "http";
  background: true;
  shape?: Readonly<{ profile: RequestShapeProfileId; pathPrefix: string }>;
}> {
  return {
    host: t.host,
    port: t.port,
    mode: t.scheme === "https" ? "inspect" : "http",
    background: true,
    ...(t.profile ? { shape: { profile: t.profile, pathPrefix: t.pathPrefix } } : {}),
  };
}

/**
 * Does a URL fall inside a target? Same scheme, host and port; with a
 * profile, a GET of that URL must also fit the profile's request grammar.
 */
export function urlWithinEgressTarget(url: string, t: EgressTarget): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const scheme = u.protocol === "https:" ? "https" : u.protocol === "http:" ? "http" : null;
  if (!scheme || scheme !== t.scheme || u.username || u.password) {
    return false;
  }
  const port = u.port ? Number(u.port) : scheme === "https" ? 443 : 80;
  if (u.hostname.toLowerCase() !== t.host || port !== t.port) {
    return false;
  }
  if (!t.profile) {
    return true;
  }
  const shape = resolveRequestShape({ profile: t.profile, pathPrefix: t.pathPrefix });
  if (!shape.ok || !shape.shape) {
    return false;
  }
  // The path as written: a URL parser would have resolved `..` already.
  const rawTarget = /^[a-z]+:\/\/[^/?#]*([^#]*)/i.exec(url)?.[1] || "/";
  return checkRequestShape(shape.shape, {
    method: "GET",
    target: rawTarget,
    headerPairs: [],
    bodyLength: 0,
    kind: "request",
  }).ok;
}
