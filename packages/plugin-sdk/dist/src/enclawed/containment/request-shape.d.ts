import fs from "node:fs";
import type http from "node:http";
import { type ApiProfile, type ApiRoute } from "./request-shape-profiles.js";
export type RequestShapeProfileId = "npm-registry" | "pypi" | "generic" | "api";
export declare const REQUEST_SHAPE_PROFILES: readonly RequestShapeProfileId[];
/** The profiles with a grammar of their own that a URL fragment can name (api needs its routes). */
export declare const NAMED_SHAPE_PROFILES: readonly RequestShapeProfileId[];
export type RequestShapeDeclaration = RequestShapeProfileId | Readonly<{
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
export type ArtifactDigest = Readonly<{
    algo: "sha256" | "sha384" | "sha512";
    value: Buffer;
}>;
export type ResolvedShape = Readonly<{
    profile: RequestShapeProfileId;
    pathPrefix: string;
    pins: ReadonlyMap<string, readonly ArtifactDigest[]>;
    requirePins: boolean;
    /** The api profile's routes and headers; null for the other profiles. */
    api: ApiProfile | null;
}>;
/** The shape of a destination declared without one: the generic profile at the root. */
export declare const GENERIC_SHAPE: ResolvedShape;
export type ShapeRefusalCode = "request-shape-method" | "request-shape-path" | "request-shape-query" | "request-shape-header" | "request-shape-body" | "request-shape-stream" | "request-shape-capacity" | "artifact-not-pinned" | "artifact-pin-mismatch" | "artifact-unverifiable";
export type ShapeRefusal = Readonly<{
    ok: false;
    code: ShapeRefusalCode;
    message: string;
}>;
export type ShapeVerdict = Readonly<{
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
}> | ShapeRefusal;
/** One pin string as digests (every one must match); null when malformed or weak. */
export declare function parseArtifactPin(pin: unknown): ArtifactDigest[] | null;
/** Validate a destination's shape; null shape: none declared. */
export declare function resolveRequestShape(decl: unknown): Readonly<{
    ok: true;
    shape: ResolvedShape | null;
}> | Readonly<{
    ok: false;
    message: string;
}>;
/** Does this request (or stream message) fit the destination's shape? */
export declare function checkRequestShape(shape: ResolvedShape, req: Readonly<{
    method: string;
    /** Path and query, as sent. */
    target: string;
    headerPairs: ReadonlyArray<readonly [string, string]>;
    bodyLength: number;
    /** The decoded body (an api route with a JSON body is checked against its schema). */
    body?: Buffer | null;
    kind: "request" | "message";
}>): ShapeVerdict;
/** Largest pinned artifact the relay verifies (spooled to a private file, never held in memory). */
export declare const MAX_PINNED_ARTIFACT: number;
export type VerifiedArtifact = Readonly<{
    ok: true;
    status: number;
    headers: Readonly<Record<string, string | string[]>>;
    size: number;
    /** The verified bytes; removes the spool file once read or destroyed. */
    open(): fs.ReadStream;
    discard(): void;
}> | ShapeRefusal;
/**
 * Read a pinned artifact's whole answer into a private spool file, hashing
 * as it arrives, and hand it over only when every pinned digest matches.
 * Anything else (another status, an encoded body, an oversize or broken
 * answer, a mismatch) is refused; nothing of it reaches the process.
 */
export declare function verifyPinnedAnswer(res: http.IncomingMessage, pins: readonly ArtifactDigest[], max?: number): Promise<VerifiedArtifact>;
