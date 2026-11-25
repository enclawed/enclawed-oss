import { type RequestShapeProfileId } from "./containment/request-shape.js";
export type EgressTarget = Readonly<{
    scheme: "https" | "http";
    host: string;
    port: number;
    /** The profile's path prefix ("" for the root). */
    pathPrefix: string;
    /** The request shape; null: none (any request to the destination). */
    profile: RequestShapeProfileId | null;
}>;
/** Parse a declared egress target. Throws a TypeError naming what is wrong. */
export declare function parseEgressTarget(raw: unknown): EgressTarget;
/** The canonical form: scheme://host:port[prefix][#profile], port always written. */
export declare function egressTargetString(t: EgressTarget): string;
/** The canonical form of a declared target (throws when it does not parse). */
export declare function canonicalEgressTarget(raw: unknown): string;
/** The containment destination a target becomes (inspected or plain HTTP, with its shape). */
export declare function egressTargetDestination(t: EgressTarget): Readonly<{
    host: string;
    port: number;
    mode: "inspect" | "http";
    background: true;
    shape?: Readonly<{
        profile: RequestShapeProfileId;
        pathPrefix: string;
    }>;
}>;
/**
 * Does a URL fall inside a target? Same scheme, host and port; with a
 * profile, a GET of that URL must also fit the profile's request grammar.
 */
export declare function urlWithinEgressTarget(url: string, t: EgressTarget): boolean;
