/** Internal bounds of the generic profile (not settings). */
export declare const GENERIC_MAX_SEGMENTS = 6;
export declare const GENERIC_MAX_SEGMENT = 48;
export declare const GENERIC_MAX_REL = 96;
/** Characters a generic path segment may hold (26 + 26 + 10 + 4). */
export declare const GENERIC_SEGMENT_ALPHABET = 66;
/** The accept values forwarded as sent; any other is forwarded as the first ("*\/*"). */
export declare const GENERIC_ACCEPT: readonly string[];
/** user-agent of every request to a generic destination. */
export declare const GENERIC_USER_AGENT = "enclawed-relay/1";
export type ProfileRefusalCode = "request-shape-method" | "request-shape-path" | "request-shape-query" | "request-shape-header" | "request-shape-body" | "request-shape-stream";
export type ProfileVerdict = Readonly<{
    ok: true;
    /** Header (lowercase) -> the value the relay forwards instead (null: dropped). */
    rewrite: ReadonlyMap<string, string | null>;
    /** Bits of choice this request carries (charged against the destination's ledger). */
    bits: number;
}> | Readonly<{
    ok: false;
    code: ProfileRefusalCode;
    message: string;
}>;
export type ProfileRequest = Readonly<{
    method: string;
    target: string;
    headerPairs: ReadonlyArray<readonly [string, string]>;
    bodyLength: number;
    /** The decoded request body (api profile with a body route only). */
    body?: Buffer | null;
    kind: "request" | "message";
}>;
/**
 * log2 of the number of distinct generic paths below a prefix (the empty
 * path, "/", and 1..GENERIC_MAX_SEGMENTS segments, each optionally followed
 * by a trailing slash, at most GENERIC_MAX_REL characters): counted exactly
 * by length (segments of "." and ".." are refused and not counted).
 */
export declare function genericPathCapacityBits(): number;
/** Bits of choice in the forwarded headers and method of a generic request. */
export declare function genericHeaderCapacityBits(): number;
/** The whole per-request capacity of the generic profile, in bits. */
export declare function genericCapacityBits(): {
    path: number;
    headers: number;
    total: number;
};
/** Does this request fit the generic profile below `prefix`? */
export declare function checkGeneric(prefix: string, req: ProfileRequest, where: string): ProfileVerdict;
export type JsonSchema = Readonly<{
    type: "object";
    properties: Readonly<Record<string, JsonSchema>>;
    required?: readonly string[];
}> | Readonly<{
    type: "string";
    maxLength: number;
    enum?: readonly string[];
}> | Readonly<{
    type: "integer" | "number";
    minimum?: number;
    maximum?: number;
}> | Readonly<{
    type: "boolean";
}> | Readonly<{
    type: "null";
}> | Readonly<{
    type: "array";
    items: JsonSchema;
    maxItems: number;
}>;
export type ApiRoute = Readonly<{
    method: "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";
    /** "/v1/items/{}": literal segments, "{}" one segment of [A-Za-z0-9._~-]{1,128}. */
    path: string;
    /** Query parameter names this route takes (each at most once, values of [A-Za-z0-9._~%+-]{0,256}). */
    query?: readonly string[];
    /** A JSON body and its schema (no other body is taken); for a stream route, its JSON messages'. */
    body?: Readonly<{
        maxBytes: number;
        schema: JsonSchema;
    }>;
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
/** Largest JSON body an API route may declare (the relay's own bound is smaller or equal). */
export declare const MAX_API_BODY: number;
type Problem = string | null;
/** Validate an explicit API profile declaration. */
export declare function resolveApiProfile(o: Readonly<Record<string, unknown>>): Readonly<{
    ok: true;
    api: ApiProfile;
}> | Readonly<{
    ok: false;
    message: string;
}>;
/** Does a JSON value fit the schema? null: yes; otherwise where it does not. */
export declare function jsonProblem(v: unknown, s: JsonSchema, at?: string): Problem;
/** Does this request (or stream message) fit one of the API profile's routes? */
export declare function checkApi(prefix: string, api: ApiProfile, req: ProfileRequest, where: string): ProfileVerdict;
export {};
