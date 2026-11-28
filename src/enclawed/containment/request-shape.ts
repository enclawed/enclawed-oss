// Request shapes for declared destinations (M3): WHAT KIND of request may go
// to a destination, not only where it may go.
//
// A destination declared with host and port alone lets any request through
// to it (after the relay's other checks). That is enough for an API the
// process is meant to talk to freely, and not enough for a package registry:
// an agent whose only network access is a registry proxy can send that proxy
// an exploit (the July 2026 intrusion through an Artifactory-style cache), and
// every byte of it goes to an allowed host. A destination declared with a
// shape is a destination PROFILE: scheme (the mode), host, port, and the one
// request grammar the relay lets through. Everything else to that
// destination is refused with a 403 and an event naming the rule.
//
// Built-in profiles (registries proxied under a path prefix, the way
// Artifactory, Nexus and similar serve them, use the same grammar under the
// declared `pathPrefix`; anything outside the prefix is refused, so
// /artifactory/api/system/... never reaches the proxy):
//
//   npm-registry   the npm registry protocol a package manager uses to
//                  install (npm, pnpm, yarn, bun):
//                    GET|HEAD <prefix>/<name>                package document
//                    GET|HEAD <prefix>/@<scope>%2f<name>     the same, scoped (the
//                                                            one place an encoded
//                                                            separator is allowed)
//                    GET|HEAD <prefix>/@<scope>/<name>
//                    GET|HEAD <prefix>/[@<scope>/]<name>/<version-or-tag>
//                    GET|HEAD <prefix>/[@<scope>/]<name>/-/<file>.tgz   artifact
//                  No /-/ endpoint (search, audit, login, publish), no query.
//   pypi           the PyPI simple and JSON APIs and the files host (pip,
//                  uv, poetry):
//                    GET|HEAD <prefix>/simple/ and <prefix>/simple/<name>/
//                    GET|HEAD <prefix>/pypi/<name>/json, <prefix>/pypi/<name>/<version>/json
//                    GET|HEAD <prefix>/packages/<seg>/.../<dist>          artifact
//                    GET|HEAD <prefix>/packages/<seg>/.../<dist>.metadata (PEP 658)
//
// The grammar every profile shares (fail closed: whatever does not match is
// refused):
//   - method GET or HEAD only; no request body (Content-Length 0 at most, no
//     Transfer-Encoding);
//   - origin-form target, at most 1024 characters, characters from
//     [A-Za-z0-9._~+!@%/-] only: no `;` (Tomcat path parameters, `/..;/`),
//     no backslash, no `:`, no space, no `?` (no query) and no `#`;
//   - no empty, `.` or `..` segment and no percent-encoding at all, except
//     the literal `%2f` of a scoped npm package document;
//   - each segment drawn from its position's character set and length;
//   - request headers from a closed list, each at most once, each value from
//     its own character set and length (no X-Forwarded-*, no method or URL
//     override header, no Upgrade, no Expect, no Transfer-Encoding);
//   - a WebSocket or gRPC message is refused (a registry has no stream).
//
// Content pins. A shape may pin artifacts by their path (relative to the
// prefix): an npm SRI string ("sha512-<base64>", several separated by
// blanks) or a PyPI hash ("sha256:<hex>"). The relay fetches a pinned
// artifact whole (it drops Range, conditional and Accept-Encoding headers
// from the request so the answer is the complete identity-encoded file),
// verifies every pinned digest over the bytes BEFORE handing any of them to
// the process, and refuses the request on a mismatch or on any answer it
// cannot verify (artifact-pin-mismatch, artifact-unverifiable).
// `requirePins` refuses an artifact that has no pin (artifact-not-pinned).
//
// No free-form egress: a destination declared without a shape takes the
// generic profile (./request-shape-profiles.ts: GET or HEAD below the declared
// prefix, no body, no query, closed headers, every request charged its bits
// of path choice against a capacity ledger). A deployment that needs more
// declares an explicit `api` profile (its exact routes, query names and JSON
// body schemas), which only a declaration the person authorized may carry
// (./plan.ts). A registry mirror given as a URL with a path
// ("https://artifacts.example/artifactory/api/npm/npm-remote") becomes the
// prefix (./mcp.ts registryDestinations).

import { createHash, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import type http from "node:http";
import os from "node:os";
import path from "node:path";
import {
  checkApi,
  checkGeneric,
  resolveApiProfile,
  type ApiProfile,
  type ApiRoute,
} from "./request-shape-profiles.js";

export type RequestShapeProfileId = "npm-registry" | "pypi" | "generic" | "api";

export const REQUEST_SHAPE_PROFILES: readonly RequestShapeProfileId[] = Object.freeze([
  "npm-registry",
  "pypi",
  "generic",
  "api",
]);

/** The profiles with a grammar of their own that a URL fragment can name (api needs its routes). */
export const NAMED_SHAPE_PROFILES: readonly RequestShapeProfileId[] = Object.freeze([
  "npm-registry",
  "pypi",
  "generic",
]);

export type RequestShapeDeclaration =
  | RequestShapeProfileId
  | Readonly<{
      profile: RequestShapeProfileId;
      /** Where the registry protocol is served on this host ("/artifactory/api/npm/npm-remote"); default: the root. */
      pathPrefix?: string;
      /** Artifact path (relative to the prefix, starting with "/") -> pin: npm SRI or "sha256:<hex>". */
      pins?: Readonly<Record<string, string>>;
      /** Refuse an artifact that has no pin. */
      requirePins?: boolean;
      /** api: the routes the destination takes (./request-shape-profiles.ts). */
      routes?: readonly ApiRoute[];
      /** api: request headers beyond the base list. */
      headers?: readonly string[];
    }>;

export type ArtifactDigest = Readonly<{ algo: "sha256" | "sha384" | "sha512"; value: Buffer }>;

export type ResolvedShape = Readonly<{
  profile: RequestShapeProfileId;
  pathPrefix: string;
  pins: ReadonlyMap<string, readonly ArtifactDigest[]>;
  requirePins: boolean;
  /** The api profile's routes and headers; null for the other profiles. */
  api: ApiProfile | null;
}>;

/** The shape of a destination declared without one: the generic profile at the root. */
export const GENERIC_SHAPE: ResolvedShape = Object.freeze({
  profile: "generic",
  pathPrefix: "",
  pins: new Map(),
  requirePins: false,
  api: null,
});

export type ShapeRefusalCode =
  | "request-shape-method"
  | "request-shape-path"
  | "request-shape-query"
  | "request-shape-header"
  | "request-shape-body"
  | "request-shape-stream"
  | "request-shape-capacity"
  | "artifact-not-pinned"
  | "artifact-pin-mismatch"
  | "artifact-unverifiable";

export type ShapeRefusal = Readonly<{ ok: false; code: ShapeRefusalCode; message: string }>;

export type ShapeVerdict =
  | Readonly<{
      ok: true;
      /** The artifact path (relative to the prefix) when the request fetches one. */
      artifact: string | null;
      /** Its pin, when one is declared: the answer must match before the process sees it. */
      pin: readonly ArtifactDigest[] | null;
      /** Request headers (lowercase) the relay drops so a pinned answer is whole and verifiable. */
      drop: ReadonlySet<string>;
      /** Request headers (lowercase) the relay forwards with another value (null: drops). */
      rewrite: ReadonlyMap<string, string | null>;
      /** Bits of choice the request carries, charged against the destination's capacity ledger (generic profile). */
      bits: number;
    }>
  | ShapeRefusal;

const refuse = (code: ShapeRefusalCode, message: string): ShapeRefusal => ({
  ok: false,
  code,
  message,
});

// ─── Declarations ───────────────────────────────────────────────────────

const PREFIX = /^(\/[A-Za-z0-9_~+-][A-Za-z0-9._~+-]{0,127}){0,8}$/;
const SRI = /^(sha256|sha384|sha512)-([A-Za-z0-9+/]+={0,2})$/;
const PYPI_HASH = /^(sha256|sha384|sha512)[:=]([0-9a-f]+)$/;
const DIGEST_BYTES = { sha256: 32, sha384: 48, sha512: 64 } as const;

/** One pin string as digests (every one must match); null when malformed or weak. */
export function parseArtifactPin(pin: unknown): ArtifactDigest[] | null {
  if (typeof pin !== "string" || pin.length === 0 || pin.length > 1024) {
    return null;
  }
  const out: ArtifactDigest[] = [];
  for (const tok of pin.trim().split(/\s+|,/).filter(Boolean)) {
    const sri = SRI.exec(tok);
    const hex = sri ? null : PYPI_HASH.exec(tok.toLowerCase());
    const algo = (sri?.[1] ?? hex?.[1]) as ArtifactDigest["algo"] | undefined;
    if (!algo) {
      return null; // sha1, md5 and anything unrecognized: not a pin
    }
    const value = sri ? Buffer.from(sri[2], "base64") : Buffer.from(hex![2], "hex");
    if (value.length !== DIGEST_BYTES[algo]) {
      return null;
    }
    out.push({ algo, value });
  }
  return out.length ? out : null;
}

/** Validate a destination's shape; null shape: none declared. */
export function resolveRequestShape(
  decl: unknown,
): Readonly<{ ok: true; shape: ResolvedShape | null }> | Readonly<{ ok: false; message: string }> {
  if (decl === undefined || decl === null) {
    return { ok: true, shape: null };
  }
  const d = typeof decl === "string" ? { profile: decl } : decl;
  if (!d || typeof d !== "object" || Array.isArray(d)) {
    return { ok: false, message: "destination shape must be a profile id or an object" };
  }
  const o = d as Record<string, unknown>;
  const fields =
    o.profile === "api"
      ? ["profile", "pathPrefix", "routes", "headers"]
      : o.profile === "generic"
        ? ["profile", "pathPrefix"]
        : ["profile", "pathPrefix", "pins", "requirePins"];
  for (const k of Object.keys(o)) {
    if (!fields.includes(k)) {
      return { ok: false, message: `destination shape has an unknown field ${JSON.stringify(k)}` };
    }
  }
  if (!REQUEST_SHAPE_PROFILES.includes(o.profile as RequestShapeProfileId)) {
    return {
      ok: false,
      message: `destination shape profile must be one of ${REQUEST_SHAPE_PROFILES.join(", ")}: ${JSON.stringify(o.profile)}`,
    };
  }
  const prefix = o.pathPrefix === undefined ? "" : o.pathPrefix;
  if (
    typeof prefix !== "string" ||
    !PREFIX.test(prefix) ||
    prefix.split("/").some((s) => s === "." || s === "..")
  ) {
    return {
      ok: false,
      message: `destination shape pathPrefix must be "" or /segment[/segment...] (no dot segments, no encoding): ${JSON.stringify(prefix)}`,
    };
  }
  if (o.requirePins !== undefined && typeof o.requirePins !== "boolean") {
    return { ok: false, message: "destination shape requirePins must be a boolean" };
  }
  const profile = o.profile as RequestShapeProfileId;
  if (profile === "generic") {
    return { ok: true, shape: { ...GENERIC_SHAPE, pathPrefix: prefix } };
  }
  if (profile === "api") {
    const api = resolveApiProfile(o);
    if (!api.ok) {
      return { ok: false, message: api.message };
    }
    return {
      ok: true,
      shape: { profile, pathPrefix: prefix, pins: new Map(), requirePins: false, api: api.api },
    };
  }
  const pins = new Map<string, readonly ArtifactDigest[]>();
  if (o.pins !== undefined) {
    if (!o.pins || typeof o.pins !== "object" || Array.isArray(o.pins)) {
      return { ok: false, message: "destination shape pins must map artifact paths to pins" };
    }
    for (const [p, v] of Object.entries(o.pins as Record<string, unknown>)) {
      const g = matchGrammar(profile, p);
      if (!g.ok || g.kind !== "artifact") {
        return {
          ok: false,
          message: `destination shape pin ${JSON.stringify(p)} is not an artifact path of the ${profile} profile`,
        };
      }
      const digests = parseArtifactPin(v);
      if (!digests) {
        return {
          ok: false,
          message: `destination shape pin for ${JSON.stringify(p)} is not a sha256/sha384/sha512 pin`,
        };
      }
      pins.set(p, digests);
    }
  }
  return {
    ok: true,
    shape: { profile, pathPrefix: prefix, pins, requirePins: o.requirePins === true, api: null },
  };
}

// ─── The path grammar ───────────────────────────────────────────────────

const MAX_TARGET = 1024;
const TARGET_CHARS = /^[A-Za-z0-9._~+!@%/-]+$/;

const NPM_NAME = "[A-Za-z0-9][A-Za-z0-9._~-]{0,213}";
const NPM_SCOPE = "@[A-Za-z0-9][A-Za-z0-9._~-]{0,213}";
const NPM_VERSION = "[A-Za-z0-9][A-Za-z0-9._+~-]{0,127}";
const NPM_FILE = "[A-Za-z0-9][A-Za-z0-9._+~-]{0,250}\\.tgz";
const NPM_METADATA = new RegExp(`^/(?:${NPM_SCOPE}(?:%2[fF]|/))?${NPM_NAME}(?:/${NPM_VERSION})?$`);
const NPM_ARTIFACT = new RegExp(`^/(?:${NPM_SCOPE}/)?${NPM_NAME}/-/${NPM_FILE}$`);

const PY_NAME = "[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9])?";
const PY_VERSION = "[A-Za-z0-9][A-Za-z0-9._+!-]{0,127}";
const PY_SEG = "[A-Za-z0-9][A-Za-z0-9._+-]{0,127}";
const PY_DIST = "[A-Za-z0-9][A-Za-z0-9._+!-]{0,250}\\.(?:whl|tar\\.gz|tar\\.bz2|tgz|zip)";
const PY_SIMPLE = new RegExp(`^/simple/(?:${PY_NAME}/?)?$`);
const PY_JSON = new RegExp(`^/pypi/${PY_NAME}(?:/${PY_VERSION})?/json$`);
const PY_FILE = new RegExp(`^/packages/(?:${PY_SEG}/){0,6}${PY_DIST}$`);
const PY_FILE_METADATA = new RegExp(`^/packages/(?:${PY_SEG}/){0,6}${PY_DIST}\\.metadata$`);

type GrammarMatch =
  | Readonly<{ ok: true; kind: "metadata" | "artifact" }>
  | Readonly<{ ok: false; why: string }>;

/** Does `rel` (the path below the prefix) belong to the profile's grammar? */
function matchGrammar(profile: "npm-registry" | "pypi", rel: string): GrammarMatch {
  if (!rel.startsWith("/") || rel.length > MAX_TARGET || !TARGET_CHARS.test(rel)) {
    return { ok: false, why: "characters outside the registry path grammar" };
  }
  const segs = rel.slice(1).split("/");
  // A trailing slash is the PyPI simple form only.
  const inner = profile === "pypi" && rel.endsWith("/") ? segs.slice(0, -1) : segs;
  if (inner.some((s) => s === "" || s === "." || s === "..")) {
    return { ok: false, why: "an empty, '.' or '..' path segment" };
  }
  if (profile === "npm-registry") {
    // The only percent sign allowed: the %2f between scope and name of a package document.
    const pct = rel.indexOf("%");
    if (pct >= 0 && !(NPM_METADATA.test(rel) && /^\/@[^/%]+%2[fF][^%]*$/.test(rel))) {
      return { ok: false, why: "percent-encoding outside a scoped package name" };
    }
    if (NPM_ARTIFACT.test(rel)) {
      return { ok: true, kind: "artifact" };
    }
    if (NPM_METADATA.test(rel)) {
      return { ok: true, kind: "metadata" };
    }
    return {
      ok: false,
      why: "not a package document or tarball path of the npm registry protocol",
    };
  }
  if (rel.includes("%")) {
    return { ok: false, why: "percent-encoding" };
  }
  if (PY_FILE.test(rel)) {
    return { ok: true, kind: "artifact" };
  }
  if (PY_SIMPLE.test(rel) || PY_JSON.test(rel) || PY_FILE_METADATA.test(rel)) {
    return { ok: true, kind: "metadata" };
  }
  return { ok: false, why: "not a simple, JSON or files path of the PyPI protocol" };
}

// ─── Headers ────────────────────────────────────────────────────────────

const visible = (max: number, min = 1) => new RegExp(`^[\\x20-\\x7e]{${min},${max}}$`);

/** The request headers a registry client sends, each with its value grammar. */
const HEADER_RULES: ReadonlyArray<readonly [RegExp, RegExp]> = [
  [/^host$/, visible(260)],
  [/^accept$/, /^[A-Za-z0-9.+*/;=, _-]{1,512}$/],
  [/^accept-encoding$/, /^[A-Za-z0-9,;=. *-]{1,128}$/],
  [/^accept-language$/, /^[A-Za-z0-9,;=. *-]{1,128}$/],
  [/^user-agent$/, visible(2048)],
  [/^cache-control$/, /^[A-Za-z0-9=, -]{1,128}$/],
  [/^pragma$/, /^no-cache$/i],
  [/^connection$/, /^(keep-alive|close)$/i],
  [/^if-none-match$/, visible(512)],
  [/^if-modified-since$/, /^[A-Za-z0-9,: ]{1,64}$/],
  [/^range$/, /^bytes=\d{1,15}-(\d{1,15})?$/],
  [/^authorization$/, visible(4096)],
  [/^referer$/, visible(512)],
  [/^content-length$/, /^0$/],
  // npm-registry-fetch and pacote's own request headers.
  [/^npm-[a-z-]{1,32}$/, visible(512, 0)],
  [/^pacote-[a-z-]{1,32}$/, visible(512, 0)],
];
const MAX_HEADERS = 40;
/** Dropped from a pinned artifact's request: the answer must be the whole identity-encoded file. */
const PINNED_DROP: ReadonlySet<string> = new Set([
  "range",
  "if-none-match",
  "if-modified-since",
  "accept-encoding",
]);
const NO_DROP: ReadonlySet<string> = new Set();
const NO_REWRITE: ReadonlyMap<string, string | null> = new Map();

// ─── The check ──────────────────────────────────────────────────────────

/** Does this request (or stream message) fit the destination's shape? */
export function checkRequestShape(
  shape: ResolvedShape,
  req: Readonly<{
    method: string;
    /** Path and query, as sent. */
    target: string;
    headerPairs: ReadonlyArray<readonly [string, string]>;
    bodyLength: number;
    /** The decoded body (an api route with a JSON body is checked against its schema). */
    body?: Buffer | null;
    kind: "request" | "message";
  }>,
): ShapeVerdict {
  const where = `the ${shape.profile} destination`;
  if (shape.profile === "generic" || shape.profile === "api") {
    const v =
      shape.profile === "api" && shape.api
        ? checkApi(shape.pathPrefix, shape.api, req, where)
        : shape.profile === "generic"
          ? checkGeneric(shape.pathPrefix, req, where)
          : ({ ok: false, code: "request-shape-path", message: `${where} has no routes` } as const);
    return v.ok
      ? { ok: true, artifact: null, pin: null, drop: NO_DROP, rewrite: v.rewrite, bits: v.bits }
      : refuse(v.code, v.message);
  }
  const profile = shape.profile;
  if (req.kind !== "request") {
    return refuse(
      "request-shape-stream",
      `${where} takes plain requests only; a WebSocket or gRPC message is refused`,
    );
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return refuse(
      "request-shape-method",
      `${where} takes GET and HEAD only, not ${JSON.stringify(req.method.slice(0, 32))}`,
    );
  }
  if (req.bodyLength !== 0) {
    return refuse("request-shape-body", `${where} takes no request body`);
  }
  const t = req.target;
  if (t.length > MAX_TARGET) {
    return refuse("request-shape-path", `${where}: the path is longer than ${MAX_TARGET}`);
  }
  if (t.includes("?")) {
    return refuse("request-shape-query", `${where} takes no query string`);
  }
  let rel: string;
  if (shape.pathPrefix) {
    if (!t.startsWith(`${shape.pathPrefix}/`)) {
      return refuse("request-shape-path", `${where}: the path is outside ${shape.pathPrefix}/`);
    }
    rel = t.slice(shape.pathPrefix.length);
  } else {
    rel = t;
  }
  const g = matchGrammar(profile, rel);
  if (!g.ok) {
    return refuse("request-shape-path", `${where}: ${g.why}`);
  }
  const seen = new Set<string>();
  if (req.headerPairs.length > MAX_HEADERS) {
    return refuse("request-shape-header", `${where}: more than ${MAX_HEADERS} request headers`);
  }
  for (const [rawName, value] of req.headerPairs) {
    const name = rawName.toLowerCase();
    if (seen.has(name)) {
      return refuse(
        "request-shape-header",
        `${where}: the header ${JSON.stringify(name.slice(0, 64))} appears more than once`,
      );
    }
    seen.add(name);
    const rule = HEADER_RULES.find(([n]) => n.test(name));
    if (!rule) {
      return refuse(
        "request-shape-header",
        `${where} does not take the header ${JSON.stringify(name.slice(0, 64))}`,
      );
    }
    if (!rule[1].test(value)) {
      return refuse(
        "request-shape-header",
        `${where}: the value of ${JSON.stringify(name)} is outside its grammar`,
      );
    }
  }
  if (g.kind !== "artifact") {
    return { ok: true, artifact: null, pin: null, drop: NO_DROP, rewrite: NO_REWRITE, bits: 0 };
  }
  const pin = shape.pins.get(rel) ?? null;
  if (!pin && shape.requirePins) {
    return refuse("artifact-not-pinned", `${where}: the artifact ${rel} has no declared pin`);
  }
  return {
    ok: true,
    artifact: rel,
    pin,
    drop: pin ? PINNED_DROP : NO_DROP,
    rewrite: NO_REWRITE,
    bits: 0,
  };
}

// ─── Verifying a pinned answer ──────────────────────────────────────────

/** Largest pinned artifact the relay verifies (spooled to a private file, never held in memory). */
export const MAX_PINNED_ARTIFACT = 4 * 1024 * 1024 * 1024;

export type VerifiedArtifact =
  | Readonly<{
      ok: true;
      status: number;
      headers: Readonly<Record<string, string | string[]>>;
      size: number;
      /** The verified bytes; removes the spool file once read or destroyed. */
      open(): fs.ReadStream;
      discard(): void;
    }>
  | ShapeRefusal;

function digestsMatch(pins: readonly ArtifactDigest[], hashes: Map<string, Buffer>): boolean {
  return pins.every((p) => {
    const got = hashes.get(p.algo);
    return got !== undefined && got.length === p.value.length && timingSafeEqual(got, p.value);
  });
}

/**
 * Read a pinned artifact's whole answer into a private spool file, hashing
 * as it arrives, and hand it over only when every pinned digest matches.
 * Anything else (another status, an encoded body, an oversize or broken
 * answer, a mismatch) is refused; nothing of it reaches the process.
 */
export function verifyPinnedAnswer(
  res: http.IncomingMessage,
  pins: readonly ArtifactDigest[],
  max = MAX_PINNED_ARTIFACT,
): Promise<VerifiedArtifact> {
  return new Promise((resolve) => {
    const status = res.statusCode ?? 0;
    const enc = (res.headers["content-encoding"] ?? "identity").toLowerCase();
    if (status !== 200 || (enc !== "identity" && enc !== "")) {
      res.resume();
      resolve(
        refuse(
          "artifact-unverifiable",
          status !== 200
            ? `the pinned artifact was answered with status ${status}, not the artifact itself`
            : `the pinned artifact came ${enc}-encoded, so its digest cannot be checked`,
        ),
      );
      return;
    }
    let dir: string;
    try {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-artifact-"));
    } catch (err) {
      res.resume();
      resolve(
        refuse(
          "artifact-unverifiable",
          `no spool for the pinned artifact: ${(err as Error).message}`,
        ),
      );
      return;
    }
    const file = path.join(dir, "artifact");
    const discard = () => fs.rmSync(dir, { recursive: true, force: true });
    const out = fs.createWriteStream(file, { mode: 0o600, flags: "wx" });
    const algos = [...new Set(pins.map((p) => p.algo))];
    const hashers = algos.map((a) => [a, createHash(a)] as const);
    let size = 0;
    let done = false;
    const fail = (message: string, code: ShapeRefusalCode = "artifact-unverifiable") => {
      if (done) {
        return;
      }
      done = true;
      res.destroy();
      out.destroy();
      discard();
      resolve(refuse(code, message));
    };
    res.on("data", (c: Buffer) => {
      size += c.length;
      if (size > max) {
        fail(`the pinned artifact is larger than ${max} bytes`);
        return;
      }
      for (const [, h] of hashers) {
        h.update(c);
      }
      out.write(c);
    });
    res.on("error", (err) => fail(`the answer broke off: ${err.message}`));
    res.on("aborted", () => fail("the answer broke off"));
    // Closed before the whole answer arrived (no "end"): nothing of it is handed over.
    res.on("close", () => {
      if (!res.complete) {
        fail("the answer broke off");
      }
    });
    res.on("end", () => {
      if (done) {
        return;
      }
      out.end(() => {
        if (done) {
          return;
        }
        const got = new Map(hashers.map(([a, h]) => [a, h.digest()] as const));
        if (!digestsMatch(pins, got)) {
          fail(
            "the artifact's content does not match its declared pin; none of it was handed to the process",
            "artifact-pin-mismatch",
          );
          return;
        }
        done = true;
        const headers: Record<string, string | string[]> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (
            v !== undefined &&
            !["connection", "keep-alive", "transfer-encoding", "content-length"].includes(k)
          ) {
            headers[k] = v;
          }
        }
        resolve({
          ok: true,
          status,
          headers,
          size,
          open() {
            const s = fs.createReadStream(file);
            s.on("close", discard);
            return s;
          },
          discard,
        });
      });
    });
  });
}
