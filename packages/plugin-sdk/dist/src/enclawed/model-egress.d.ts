export declare class EgressPolicyError extends Error {
    readonly code: "host-not-allowed" | "secret-in-request";
    name: string;
    constructor(message: string, code: "host-not-allowed" | "secret-in-request");
}
/** Refuse a host the policy does not allow. A no-op when allowlists are not enforced. */
export declare function assertHostAllowedByPolicy(url: URL): void;
/** The secret families a model-requested URL or body carries. */
export declare function secretsInModelRequest(url: string, body?: unknown): string[];
/** Refuse, audit and report a model-requested request that carries a secret. */
export declare function assertModelRequestCarriesNoSecrets(params: {
    url: string;
    body?: unknown;
    /** Which tool or path asked for it (web_fetch, media, ...). */
    via: string;
}): void;
