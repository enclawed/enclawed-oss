// The two request shapes that are not a package registry (./request-shape.ts):
//
//   generic   what EVERY declared destination without a shape of its own
//             takes. No free-form egress: GET or HEAD only, no request body,
//             no query, a path below the declared prefix of at most
//             GENERIC_MAX_SEGMENTS segments of [A-Za-z0-9._~-] (each at most
//             GENERIC_MAX_SEGMENT long, all of it at most GENERIC_MAX_REL),
//             and a closed list of request headers whose values cannot carry
//             data: accept is forwarded only when it is one of a few common
//             values (otherwise "*/*"), accept-encoding is forwarded as the
//             sorted set of the codings it names, user-agent is replaced by
//             the relay's own, and accept-language, caching, conditional,
//             range and fetch-metadata headers are dropped. Any other header
//             (authorization, cookie, x-*, content-type, ...) refuses the
//             request. A WebSocket or gRPC message is refused.
//
//             What is left is the choice of path (and of the few header
//             values above) per request: genericCapacityBits() counts it
//             exactly. Each request is charged that many bits against a
//             per-destination capacity ledger (@enclawed/egress-core, the
//             covert-channel suite's ledger) whose size and refill are
//             internal constants of the relay (./relay.ts); a request over
//             budget is refused (request-shape-capacity). So a declared
//             destination is a place to fetch from, never a bulk channel out.
//
//   api       an explicit API profile: exactly the routes declared (method,
//             path pattern, query parameter names, a JSON body schema), the
//             headers declared on top of a fixed base list. Only a declaration
//             the person authorized carries one (a signed admission record,
//             ./plan.ts), and the record (with the profile) is audited when it
//             is signed.
//
// Fail closed everywhere: whatever does not match is refused.

/** Internal bounds of the generic profile (not settings). */
export const GENERIC_MAX_SEGMENTS = 6;
export const GENERIC_MAX_SEGMENT = 48;
export const GENERIC_MAX_REL = 96;

const SEG_CHARS = "A-Za-z0-9._~-";
/** Characters a generic path segment may hold (26 + 26 + 10 + 4). */
export const GENERIC_SEGMENT_ALPHABET = 66;
const GENERIC_SEG = new RegExp(`^[${SEG_CHARS}]{1,${GENERIC_MAX_SEGMENT}}$`);

/** The accept values forwarded as sent; any other is forwarded as the first ("*\/*"). */
export const GENERIC_ACCEPT: readonly string[] = Object.freeze([
  "*/*",
  "application/json",
  "text/html",
  "text/plain",
  "application/octet-stream",
  "application/xml",
  "text/markdown",
  "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
]);
const ENCODINGS = ["br", "deflate", "gzip", "identity", "zstd"] as const;
/** user-agent of every request to a generic destination. */
export const GENERIC_USER_AGENT = "enclawed-relay/1";
/**
 * Hop-by-hop headers: the relay never forwards them (./relay-types.ts
 * HOP_BY_HOP), so they carry nothing out; a body they announce is checked
 * as a body.
 */
const HOP_BY_HOP_NAMES = new Set([
  "connection",
  "keep-alive",
  "proxy-connection",
  "proxy-authorization",
  "proxy-authenticate",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-length",
  "http2-settings",
]);
/** Headers accepted and dropped (their values never leave). */
const GENERIC_DROPPED =
  /^(?:accept-language|cache-control|pragma|if-none-match|if-modified-since|if-match|if-unmodified-since|range|referer|dnt|upgrade-insecure-requests|priority|sec-fetch-[a-z-]{1,24}|sec-ch-[a-z-]{1,32}|sec-gpc|te)$/;

export type ProfileRefusalCode =
  | "request-shape-method"
  | "request-shape-path"
  | "request-shape-query"
  | "request-shape-header"
  | "request-shape-body"
  | "request-shape-stream";

export type ProfileVerdict =
  | Readonly<{
      ok: true;
      /** Header (lowercase) -> the value the relay forwards instead (null: dropped). */
      rewrite: ReadonlyMap<string, string | null>;
      /** Bits of choice this request carries (charged against the destination's ledger). */
      bits: number;
    }>
  | Readonly<{ ok: false; code: ProfileRefusalCode; message: string }>;

const no = (code: ProfileRefusalCode, message: string): ProfileVerdict => ({
  ok: false,
  code,
  message,
});

export type ProfileRequest = Readonly<{
  method: string;
  target: string;
  headerPairs: ReadonlyArray<readonly [string, string]>;
  bodyLength: number;
  /** The decoded request body (api profile with a body route only). */
  body?: Buffer | null;
  kind: "request" | "message";
}>;

// ─── Capacity of the generic profile ────────────────────────────────────

/**
 * log2 of the number of distinct generic paths below a prefix (the empty
 * path, "/", and 1..GENERIC_MAX_SEGMENTS segments, each optionally followed
 * by a trailing slash, at most GENERIC_MAX_REL characters): counted exactly
 * by length (segments of "." and ".." are refused and not counted).
 */
export function genericPathCapacityBits(): number {
  // seg[n]: number of admissible segments of length n.
  const seg = (n: number) =>
    n < 1 || n > GENERIC_MAX_SEGMENT
      ? 0n
      : BigInt(GENERIC_SEGMENT_ALPHABET) ** BigInt(n) - (n === 1 || n === 2 ? 1n : 0n);
  // ways[k][len]: paths of k segments, "/seg" each, of total length len.
  let ways = new Map<number, bigint>([[0, 1n]]);
  let total = 2n; // "" and "/"
  for (let k = 1; k <= GENERIC_MAX_SEGMENTS; k++) {
    const next = new Map<number, bigint>();
    for (const [len, w] of ways) {
      for (let n = 1; n <= GENERIC_MAX_SEGMENT && len + 1 + n <= GENERIC_MAX_REL; n++) {
        next.set(len + 1 + n, (next.get(len + 1 + n) ?? 0n) + w * seg(n));
      }
    }
    ways = next;
    for (const [len, w] of ways) {
      total += w; // without a trailing slash
      if (len + 1 <= GENERIC_MAX_REL) {
        total += w; // with one
      }
    }
  }
  return log2Big(total);
}

/** Bits of choice in the forwarded headers and method of a generic request. */
export function genericHeaderCapacityBits(): number {
  const accept = GENERIC_ACCEPT.length + 1; // one of the values, or absent
  const encoding = 2 ** ENCODINGS.length + 1; // a subset, or absent
  const connection = 3; // keep-alive, close, absent
  const contentLength = 2; // "0", absent
  const method = 2; // GET, HEAD
  return Math.log2(accept * encoding * connection * contentLength * method);
}

/** The whole per-request capacity of the generic profile, in bits. */
export function genericCapacityBits(): {
  path: number;
  headers: number;
  total: number;
} {
  const p = genericPathCapacityBits();
  const h = genericHeaderCapacityBits();
  return { path: p, headers: h, total: p + h };
}

function log2Big(n: bigint): number {
  const s = n.toString(2);
  const head = Number.parseInt(s.slice(0, 53), 2);
  return Math.log2(head) + Math.max(0, s.length - 53);
}

/** Bits a generic request with this path below the prefix carries (an upper bound per request). */
function genericRequestBits(rel: string): number {
  // Each character of the path is one of the alphabet or "/": at most
  // log2(alphabet + 1) bits; plus the header and method choice.
  return rel.length * Math.log2(GENERIC_SEGMENT_ALPHABET + 1) + genericHeaderCapacityBits();
}

// ─── The generic profile ────────────────────────────────────────────────

/** Does this request fit the generic profile below `prefix`? */
export function checkGeneric(prefix: string, req: ProfileRequest, where: string): ProfileVerdict {
  if (req.kind !== "request") {
    return no(
      "request-shape-stream",
      `${where} takes plain requests only; a WebSocket or gRPC message is refused`,
    );
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return no(
      "request-shape-method",
      `${where} takes GET and HEAD only (a destination without an API profile is for fetching), not ${JSON.stringify(req.method.slice(0, 32))}`,
    );
  }
  if (req.bodyLength !== 0) {
    return no("request-shape-body", `${where} takes no request body`);
  }
  const t = req.target;
  if (t.includes("?") || t.includes("#")) {
    return no("request-shape-query", `${where} takes no query string`);
  }
  let rel: string;
  if (prefix) {
    if (t !== prefix && !t.startsWith(`${prefix}/`)) {
      return no("request-shape-path", `${where}: the path is outside ${prefix}/`);
    }
    rel = t.slice(prefix.length);
  } else {
    if (!t.startsWith("/")) {
      return no("request-shape-path", `${where}: the target is not a path`);
    }
    rel = t === "/" ? "" : t;
  }
  if (rel.length > GENERIC_MAX_REL) {
    return no(
      "request-shape-path",
      `${where}: the path is longer than ${GENERIC_MAX_REL} characters below the declared prefix`,
    );
  }
  if (rel !== "" && rel !== "/") {
    const segs = rel.slice(1).split("/");
    if (segs.length > 1 && segs[segs.length - 1] === "") {
      segs.pop(); // one trailing slash
    }
    if (segs.length > GENERIC_MAX_SEGMENTS) {
      return no(
        "request-shape-path",
        `${where}: more than ${GENERIC_MAX_SEGMENTS} path segments below the declared prefix`,
      );
    }
    for (const s of segs) {
      if (!GENERIC_SEG.test(s) || s === "." || s === "..") {
        return no(
          "request-shape-path",
          `${where}: a path segment outside [${SEG_CHARS}]{1,${GENERIC_MAX_SEGMENT}} (no encoding, no empty or dot segment)`,
        );
      }
    }
  }
  const rewrite = new Map<string, string | null>();
  const seen = new Set<string>();
  for (const [rawName, value] of req.headerPairs) {
    const name = rawName.toLowerCase();
    if (seen.has(name)) {
      return no(
        "request-shape-header",
        `${where}: the header ${JSON.stringify(name.slice(0, 64))} appears more than once`,
      );
    }
    seen.add(name);
    if (name === "host") {
      continue; // checked against the destination by the relay
    }
    if (name === "accept") {
      const v = value.trim().toLowerCase();
      if (!GENERIC_ACCEPT.includes(v)) {
        rewrite.set(name, GENERIC_ACCEPT[0]);
      }
      continue;
    }
    if (name === "accept-encoding") {
      const tokens = value
        .toLowerCase()
        .split(",")
        .map((x) => x.split(";")[0].trim())
        .filter((x) => (ENCODINGS as readonly string[]).includes(x));
      const norm = [...new Set(tokens)].toSorted().join(", ") || "identity";
      if (norm !== value) {
        rewrite.set(name, norm);
      }
      continue;
    }
    if (name === "user-agent") {
      rewrite.set(name, GENERIC_USER_AGENT);
      continue;
    }
    if (name === "upgrade" && /websocket/i.test(value)) {
      return no(
        "request-shape-stream",
        `${where} takes plain requests only; a WebSocket is refused`,
      );
    }
    if (name === "content-length" && value.trim() !== "0") {
      return no("request-shape-body", `${where} takes no request body`);
    }
    if (HOP_BY_HOP_NAMES.has(name)) {
      continue; // never forwarded
    }
    if (GENERIC_DROPPED.test(name)) {
      rewrite.set(name, null);
      continue;
    }
    return no(
      "request-shape-header",
      `${where} does not take the header ${JSON.stringify(name.slice(0, 64))} (a destination without an API profile takes no credential, cookie or custom header)`,
    );
  }
  return { ok: true, rewrite, bits: genericRequestBits(rel) };
}

// ─── The explicit API profile ───────────────────────────────────────────

export type JsonSchema =
  | Readonly<{
      type: "object";
      properties: Readonly<Record<string, JsonSchema>>;
      required?: readonly string[];
    }>
  | Readonly<{ type: "string"; maxLength: number; enum?: readonly string[] }>
  | Readonly<{ type: "integer" | "number"; minimum?: number; maximum?: number }>
  | Readonly<{ type: "boolean" }>
  | Readonly<{ type: "null" }>
  | Readonly<{ type: "array"; items: JsonSchema; maxItems: number }>;

export type ApiRoute = Readonly<{
  method: "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** "/v1/items/{}": literal segments, "{}" one segment of [A-Za-z0-9._~-]{1,128}. */
  path: string;
  /** Query parameter names this route takes (each at most once, values of [A-Za-z0-9._~%+-]{0,256}). */
  query?: readonly string[];
  /** A JSON body and its schema (no other body is taken); for a stream route, its JSON messages'. */
  body?: Readonly<{ maxBytes: number; schema: JsonSchema }>;
  /**
   * A stream route: "websocket" (a GET upgraded to WebSocket; each message
   * is then checked by the relay) or "grpc" (a POST of application/grpc
   * messages, each checked as it streams).
   */
  stream?: "websocket" | "grpc";
}>;

export type ApiProfile = Readonly<{
  routes: readonly ApiRoute[];
  /** Request headers beyond the base list (lowercase names). */
  headers: readonly string[];
}>;

const API_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]);
const API_BASE_HEADERS = new Set([
  "host",
  "accept",
  "accept-encoding",
  "accept-language",
  "user-agent",
  "content-type",
  "content-length",
  "connection",
  "authorization",
]);
/** Never declarable: they change how the request is read, routed or framed. */
const API_FORBIDDEN_HEADER =
  /^(?:transfer-encoding|upgrade|expect|te|forwarded|x-forwarded-.*|x-http-method(?:-override)?|x-method-override|x-original-url|x-rewrite-url|proxy-.*|cookie|via)$/;
const API_HEADER_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const API_LITERAL_SEG = new RegExp(`^[${SEG_CHARS}]{1,128}$`);
const API_PARAM_SEG = new RegExp(`^[${SEG_CHARS}]{1,128}$`);
const QUERY_NAME = /^[A-Za-z0-9._~-]{1,64}$/;
const QUERY_VALUE = /^[A-Za-z0-9._~%+-]{0,256}$/;
const MAX_STRING = 65536;
const MAX_ITEMS = 10000;
const MAX_SCHEMA_DEPTH = 8;
/** Largest JSON body an API route may declare (the relay's own bound is smaller or equal). */
export const MAX_API_BODY = 1024 * 1024;

type Problem = string | null;

function schemaProblem(s: unknown, depth: number, at: string): Problem {
  if (depth > MAX_SCHEMA_DEPTH) {
    return `${at}: schema nested deeper than ${MAX_SCHEMA_DEPTH}`;
  }
  if (!s || typeof s !== "object" || Array.isArray(s)) {
    return `${at}: a schema must be an object`;
  }
  const o = s as Record<string, unknown>;
  const allowed = (keys: string[]) => Object.keys(o).find((k) => !keys.includes(k));
  switch (o.type) {
    case "object": {
      const extra = allowed(["type", "properties", "required"]);
      if (extra) {
        return `${at}: unknown schema field ${JSON.stringify(extra)}`;
      }
      if (!o.properties || typeof o.properties !== "object" || Array.isArray(o.properties)) {
        return `${at}: an object schema names its properties (no other property is taken)`;
      }
      for (const [k, v] of Object.entries(o.properties as Record<string, unknown>)) {
        const p = schemaProblem(v, depth + 1, `${at}.${k}`);
        if (p) {
          return p;
        }
      }
      if (
        o.required !== undefined &&
        (!Array.isArray(o.required) ||
          o.required.some(
            (r) => typeof r !== "string" || !Object.hasOwn(o.properties as object, r),
          ))
      ) {
        return `${at}: required must list declared properties`;
      }
      return null;
    }
    case "string": {
      const extra = allowed(["type", "maxLength", "enum"]);
      if (extra) {
        return `${at}: unknown schema field ${JSON.stringify(extra)}`;
      }
      if (!Number.isInteger(o.maxLength) || (o.maxLength as number) < 0) {
        return `${at}: a string schema needs maxLength`;
      }
      if ((o.maxLength as number) > MAX_STRING) {
        return `${at}: maxLength above ${MAX_STRING}`;
      }
      if (
        o.enum !== undefined &&
        (!Array.isArray(o.enum) || o.enum.some((e) => typeof e !== "string"))
      ) {
        return `${at}: enum must list strings`;
      }
      return null;
    }
    case "integer":
    case "number": {
      const extra = allowed(["type", "minimum", "maximum"]);
      if (extra) {
        return `${at}: unknown schema field ${JSON.stringify(extra)}`;
      }
      for (const k of ["minimum", "maximum"]) {
        if (o[k] !== undefined && typeof o[k] !== "number") {
          return `${at}: ${k} must be a number`;
        }
      }
      return null;
    }
    case "boolean":
    case "null":
      return allowed(["type"]) ? `${at}: unknown schema field` : null;
    case "array": {
      const extra = allowed(["type", "items", "maxItems"]);
      if (extra) {
        return `${at}: unknown schema field ${JSON.stringify(extra)}`;
      }
      if (
        !Number.isInteger(o.maxItems) ||
        (o.maxItems as number) < 0 ||
        (o.maxItems as number) > MAX_ITEMS
      ) {
        return `${at}: an array schema needs maxItems (at most ${MAX_ITEMS})`;
      }
      return schemaProblem(o.items, depth + 1, `${at}[]`);
    }
    default:
      return `${at}: schema type must be object, string, integer, number, boolean, null or array`;
  }
}

/** Validate an explicit API profile declaration. */
export function resolveApiProfile(
  o: Readonly<Record<string, unknown>>,
): Readonly<{ ok: true; api: ApiProfile }> | Readonly<{ ok: false; message: string }> {
  if (!Array.isArray(o.routes) || o.routes.length === 0 || o.routes.length > 256) {
    return { ok: false, message: "an api profile declares its routes (1 to 256)" };
  }
  const routes: ApiRoute[] = [];
  for (const [i, r] of (o.routes as unknown[]).entries()) {
    const at = `route ${i}`;
    if (!r || typeof r !== "object" || Array.isArray(r)) {
      return { ok: false, message: `${at} must be an object` };
    }
    const rr = r as Record<string, unknown>;
    const extra = Object.keys(rr).find(
      (k) => !["method", "path", "query", "body", "stream"].includes(k),
    );
    if (extra) {
      return { ok: false, message: `${at} has an unknown field ${JSON.stringify(extra)}` };
    }
    if (typeof rr.method !== "string" || !API_METHODS.has(rr.method)) {
      return { ok: false, message: `${at}: method must be one of ${[...API_METHODS].join(", ")}` };
    }
    if (
      typeof rr.path !== "string" ||
      !rr.path.startsWith("/") ||
      rr.path.length > 512 ||
      rr.path
        .slice(1)
        .split("/")
        .some((s) => s !== "{}" && (!API_LITERAL_SEG.test(s) || s === "." || s === ".."))
    ) {
      return {
        ok: false,
        message: `${at}: path must be /segment[/segment...] of literal segments or {} (no encoding, no dot segments)`,
      };
    }
    if (
      rr.query !== undefined &&
      (!Array.isArray(rr.query) ||
        rr.query.length > 32 ||
        rr.query.some((q) => typeof q !== "string" || !QUERY_NAME.test(q)))
    ) {
      return { ok: false, message: `${at}: query must list parameter names` };
    }
    let body: ApiRoute["body"];
    if (rr.body !== undefined) {
      const b = rr.body as Record<string, unknown> | null;
      if (
        !b ||
        typeof b !== "object" ||
        !Number.isInteger(b.maxBytes) ||
        (b.maxBytes as number) < 1 ||
        (b.maxBytes as number) > MAX_API_BODY ||
        Object.keys(b).some((k) => k !== "maxBytes" && k !== "schema")
      ) {
        return {
          ok: false,
          message: `${at}: body must be { maxBytes (1..${MAX_API_BODY}), schema }`,
        };
      }
      if ((rr.method === "GET" || rr.method === "HEAD") && rr.stream === undefined) {
        return { ok: false, message: `${at}: a ${rr.method} route takes no body` };
      }
      const p = schemaProblem(b.schema, 0, `${at} body`);
      if (p) {
        return { ok: false, message: p };
      }
      body = { maxBytes: b.maxBytes as number, schema: b.schema as JsonSchema };
    }
    if (
      rr.stream !== undefined &&
      !(
        (rr.stream === "websocket" && rr.method === "GET") ||
        (rr.stream === "grpc" && rr.method === "POST")
      )
    ) {
      return {
        ok: false,
        message: `${at}: stream must be "websocket" (method GET) or "grpc" (method POST)`,
      };
    }
    routes.push({
      method: rr.method as ApiRoute["method"],
      path: rr.path,
      ...(rr.stream ? { stream: rr.stream as ApiRoute["stream"] } : {}),
      ...(rr.query ? { query: [...(rr.query as string[])] } : {}),
      ...(body ? { body } : {}),
    });
  }
  const headers: string[] = [];
  if (o.headers !== undefined) {
    if (!Array.isArray(o.headers) || o.headers.length > 16) {
      return { ok: false, message: "an api profile's headers must list at most 16 header names" };
    }
    for (const h of o.headers) {
      const n = typeof h === "string" ? h.toLowerCase() : "";
      if (!API_HEADER_NAME.test(n) || API_FORBIDDEN_HEADER.test(n)) {
        return {
          ok: false,
          message: `an api profile may not declare the header ${JSON.stringify(h)}`,
        };
      }
      headers.push(n);
    }
  }
  return { ok: true, api: { routes, headers } };
}

/** Does a JSON value fit the schema? null: yes; otherwise where it does not. */
export function jsonProblem(v: unknown, s: JsonSchema, at = "body"): Problem {
  switch (s.type) {
    case "object": {
      if (!v || typeof v !== "object" || Array.isArray(v)) {
        return `${at} is not an object`;
      }
      for (const k of Object.keys(v)) {
        if (!Object.hasOwn(s.properties, k)) {
          return `${at} has the undeclared property ${JSON.stringify(k.slice(0, 64))}`;
        }
      }
      for (const r of s.required ?? []) {
        if (!Object.hasOwn(v, r)) {
          return `${at} lacks ${JSON.stringify(r)}`;
        }
      }
      for (const [k, sub] of Object.entries(s.properties)) {
        if (Object.hasOwn(v, k)) {
          const p = jsonProblem((v as Record<string, unknown>)[k], sub, `${at}.${k}`);
          if (p) {
            return p;
          }
        }
      }
      return null;
    }
    case "string":
      if (typeof v !== "string") {
        return `${at} is not a string`;
      }
      if (v.length > s.maxLength) {
        return `${at} is longer than ${s.maxLength}`;
      }
      if (s.enum && !s.enum.includes(v)) {
        return `${at} is not one of its declared values`;
      }
      return null;
    case "integer":
    case "number":
      if (
        typeof v !== "number" ||
        !Number.isFinite(v) ||
        (s.type === "integer" && !Number.isInteger(v))
      ) {
        return `${at} is not ${s.type === "integer" ? "an integer" : "a number"}`;
      }
      if (
        (s.minimum !== undefined && v < s.minimum) ||
        (s.maximum !== undefined && v > s.maximum)
      ) {
        return `${at} is out of its declared range`;
      }
      return null;
    case "boolean":
      return typeof v === "boolean" ? null : `${at} is not a boolean`;
    case "null":
      return v === null ? null : `${at} is not null`;
    case "array": {
      if (!Array.isArray(v)) {
        return `${at} is not an array`;
      }
      if (v.length > s.maxItems) {
        return `${at} has more than ${s.maxItems} items`;
      }
      for (const [i, x] of v.entries()) {
        const p = jsonProblem(x, s.items, `${at}[${i}]`);
        if (p) {
          return p;
        }
      }
      return null;
    }
  }
  // Fail closed: a schema of no known type takes nothing.
  return `${at} has no schema it fits`;
}

function routeMatches(route: ApiRoute, rel: string): boolean {
  const want = route.path.slice(1).split("/");
  const got = rel.slice(1).split("/");
  if (want.length !== got.length) {
    return false;
  }
  return want.every((w, i) =>
    w === "{}" ? API_PARAM_SEG.test(got[i]) && got[i] !== "." && got[i] !== ".." : w === got[i],
  );
}

const WEBSOCKET_HEADERS = new Set([
  "upgrade",
  "sec-websocket-key",
  "sec-websocket-version",
  "sec-websocket-protocol",
]);
const GRPC_HEADER = /^(?:te|grpc-[a-z-]{1,32})$/;

/** Does this request (or stream message) fit one of the API profile's routes? */
export function checkApi(
  prefix: string,
  api: ApiProfile,
  req: ProfileRequest,
  where: string,
): ProfileVerdict {
  const [pathPart, query = null] = (() => {
    const q = req.target.indexOf("?");
    return q < 0 ? [req.target, null] : [req.target.slice(0, q), req.target.slice(q + 1)];
  })();
  if (req.target.includes("#")) {
    return no("request-shape-path", `${where}: a fragment is not sent`);
  }
  if (prefix && !pathPart.startsWith(`${prefix}/`)) {
    return no("request-shape-path", `${where}: the path is outside ${prefix}/`);
  }
  const rel = prefix ? pathPart.slice(prefix.length) : pathPart;
  const byPath = api.routes.filter((r) => routeMatches(r, rel));
  if (byPath.length === 0) {
    return no(
      "request-shape-path",
      `${where}: ${JSON.stringify(rel.slice(0, 120))} is not a declared route`,
    );
  }
  if (req.kind !== "request") {
    // A message of a stream the relay already admitted: only on a stream route.
    const kind = req.method === "WEBSOCKET" ? "websocket" : "grpc";
    const sr = byPath.find((r) => r.stream === kind);
    if (!sr) {
      return no(
        "request-shape-stream",
        `${where}: ${JSON.stringify(rel.slice(0, 120))} is not a declared ${kind === "websocket" ? "WebSocket" : "gRPC"} route`,
      );
    }
    const len = req.body?.length ?? req.bodyLength;
    if (sr.body && len > sr.body.maxBytes) {
      return no(
        "request-shape-body",
        `${where}: a message is larger than the route's ${sr.body.maxBytes} bytes`,
      );
    }
    if (sr.body && req.body) {
      const text = req.body.toString("utf8");
      if (/^\s*[[{]/.test(text)) {
        let v: unknown;
        try {
          v = JSON.parse(text);
        } catch {
          return no("request-shape-body", `${where}: a message is not JSON`);
        }
        const p = jsonProblem(v, sr.body.schema, "message");
        if (p) {
          return no("request-shape-body", `${where}: ${p}`);
        }
      }
    }
    return { ok: true, rewrite: new Map(), bits: 0 };
  }
  const route = byPath.find((r) => r.method === req.method);
  if (!route) {
    return no(
      "request-shape-method",
      `${where}: ${JSON.stringify(req.method.slice(0, 32))} is not declared for this route`,
    );
  }
  if (query !== null) {
    if (query.length > 1024) {
      return no("request-shape-query", `${where}: the query is longer than 1024`);
    }
    const names = new Set<string>();
    for (const part of query === "" ? [] : query.split("&")) {
      const eq = part.indexOf("=");
      const name = eq < 0 ? part : part.slice(0, eq);
      const value = eq < 0 ? "" : part.slice(eq + 1);
      if (!(route.query ?? []).includes(name) || names.has(name) || !QUERY_VALUE.test(value)) {
        return no(
          "request-shape-query",
          `${where}: the query parameter ${JSON.stringify(name.slice(0, 64))} is not declared for this route, repeated, or its value is outside its grammar`,
        );
      }
      names.add(name);
    }
  }
  const seen = new Set<string>();
  let contentType: string | null = null;
  for (const [rawName, value] of req.headerPairs) {
    const name = rawName.toLowerCase();
    if (seen.has(name)) {
      return no(
        "request-shape-header",
        `${where}: the header ${JSON.stringify(name.slice(0, 64))} appears more than once`,
      );
    }
    seen.add(name);
    const streamHeader =
      (route.stream === "websocket" && WEBSOCKET_HEADERS.has(name)) ||
      (route.stream === "grpc" && GRPC_HEADER.test(name));
    if (
      !API_BASE_HEADERS.has(name) &&
      !api.headers.includes(name) &&
      !streamHeader &&
      !(HOP_BY_HOP_NAMES.has(name) && name !== "upgrade")
    ) {
      return no(
        "request-shape-header",
        `${where} does not take the header ${JSON.stringify(name.slice(0, 64))}`,
      );
    }
    if (!/^[\x20-\x7e]{0,4096}$/.test(value)) {
      return no(
        "request-shape-header",
        `${where}: the value of ${JSON.stringify(name)} is outside its grammar`,
      );
    }
    if (name === "content-type") {
      contentType = value;
    }
  }
  if (route.stream) {
    // The stream's head carries no body; its messages are checked one by one.
    if (req.bodyLength !== 0) {
      return no("request-shape-body", `${where}: a stream's opening request takes no body`);
    }
    return { ok: true, rewrite: new Map(), bits: 0 };
  }
  if (!route.body) {
    if (req.bodyLength !== 0) {
      return no("request-shape-body", `${where}: this route takes no request body`);
    }
    return { ok: true, rewrite: new Map(), bits: 0 };
  }
  if (req.bodyLength > route.body.maxBytes || (req.body && req.body.length > route.body.maxBytes)) {
    return no(
      "request-shape-body",
      `${where}: the body is larger than the route's ${route.body.maxBytes} bytes`,
    );
  }
  if (req.bodyLength === 0) {
    return no("request-shape-body", `${where}: this route takes a JSON body`);
  }
  if (
    !contentType ||
    !/^application\/json\s*(?:;\s*charset=utf-8\s*)?$/i.test(contentType.trim())
  ) {
    return no("request-shape-body", `${where}: the body must be application/json`);
  }
  if (!req.body) {
    return no("request-shape-body", `${where}: the body could not be read`);
  }
  let v: unknown;
  try {
    v = JSON.parse(req.body.toString("utf8"));
  } catch {
    return no("request-shape-body", `${where}: the body is not JSON`);
  }
  const p = jsonProblem(v, route.body.schema);
  if (p) {
    return no("request-shape-body", `${where}: ${p}`);
  }
  return { ok: true, rewrite: new Map(), bits: 0 };
}
