import { type AttestedRecord, type DeviceTotpAccess, type DeviceTotpFailure } from "./hardware-root/totp-verify.js";
export declare const SYSTEM_POLICY_DIR = "/etc/enclawed";
export declare const ADMIN_POLICY_FILENAME = "policy.json";
export declare const SIGNED_POLICY_FILENAME = "policy.signed.json";
export declare const ORG_KEYS_FILENAME = "org-keys.json";
export declare const DEVICE_POLICY_FILENAME = "policy.device.json";
/** Longest a device-attested policy may stay valid after the device signed it. */
export declare const DEVICE_POLICY_MAX_TTL_S: number;
/** Clock skew tolerated between the device-attested time and this host. */
export declare const DEVICE_POLICY_SKEW_S = 300;
/** Domain separator for admin-policy signatures. */
export declare const ADMIN_POLICY_SIGNING_DOMAIN = "enclawed-admin-policy-v1\0";
export type AdminPolicyDoc = Readonly<{
    v: 1;
    flavor?: "enclaved" | "open";
    fipsRequired?: boolean;
    classificationScheme?: string;
    policy?: unknown;
    audit?: Readonly<{
        path?: string;
        allowUserFallback?: boolean;
    }>;
    trustRoot?: Readonly<{
        signers: ReadonlyArray<unknown>;
    }>;
    allow?: Readonly<{
        dangerousConfigFlags?: ReadonlyArray<string>;
        gatewayAuthNone?: boolean;
        /**
         * Device retirement: allows ENCLAWEDER_ROOT=optional in the enclaved
         * flavor (start software-only after a session a now-absent Enclaweder
         * accredited). Refused from the user environment otherwise.
         */
        hardwareRootOptional?: boolean;
        /**
         * Absolute path the enclaved flavor accepts for ENCLAWED_BUNDLED_PLUGINS_DIR
         * (a relocated bundled plugin tree). Any other value of the variable is
         * refused at startup.
         */
        bundledPluginsDir?: string;
    }>;
    expiresAt?: string;
}>;
export type AdminPolicySource = Readonly<{
    kind: "root-file";
    path: string;
}> | Readonly<{
    kind: "signed";
    path: string;
    keyId: string;
}> | Readonly<{
    kind: "device-attested";
    path: string;
    device: string;
}>;
export type AdminPolicy = Readonly<{
    source: AdminPolicySource;
    doc: AdminPolicyDoc;
}>;
export type AdminPolicyLoad = Readonly<{
    admin: AdminPolicy | null;
    /** Documents that were found but ignored (insecure ownership, bad signature, ...). */
    ignored: ReadonlyArray<string>;
    /**
     * Set when a document that passed the ownership/signature checks does not
     * parse: the admin wrote something broken. The enclaved flavor refuses to
     * start on it rather than guess.
     */
    invalid: string | null;
}>;
export type AdminPolicyLoadOptions = {
    /** Directory holding policy.json / org-keys.json. Default /etc/enclawed. */
    systemDir?: string;
    /** Extra directory searched for policy.signed.json (the state dir). */
    stateDir?: string;
    /**
     * uids accepted as "root" for the ownership checks. Default [0]. Tests pass
     * their own uid; production code never sets this from the environment.
     */
    trustedUids?: ReadonlyArray<number>;
    /**
     * The uid map the root-ownership checks treat as this process's (default: read
     * /proc/self/uid_map). Tests that must run inside `unshare -r` pass the
     * initial-namespace map; production code never sets this.
     */
    uidMap?: string | null;
    /** Demand this manufacturer root for device certificates instead of the pinned ones (tests). */
    deviceRootPubkey?: Buffer;
    now?: () => Date;
    platform?: NodeJS.Platform;
};
export type SecureFileCheck = Readonly<{
    ok: true;
}> | Readonly<{
    ok: false;
    reason: string;
}>;
/**
 * Check that `path` is a regular file owned by a trusted uid with mode no
 * wider than 0644, that it is not a symlink, and that no ancestor directory is
 * a symlink, owned by an untrusted uid, or writable by group/other. ENOENT is
 * reported as `{ ok: false, reason: "ENOENT" }`.
 */
export declare function checkRootOwnedFile(path: string, trustedUids?: ReadonlyArray<number>, opts?: {
    uidMap?: string | null;
}): SecureFileCheck;
export declare function isInitialUidMap(map: string): boolean;
/** Validate an admin-policy document's shape. Throws TypeError on any problem. */
export declare function parseAdminPolicyDoc(raw: unknown, opts?: {
    signed?: boolean;
}): AdminPolicyDoc;
/** Sign an admin-policy document with an org Ed25519 private key (offline tooling, tests). */
export declare function signAdminPolicy(doc: AdminPolicyDoc, keyId: string, privateKeyPem: string): {
    v: 1;
    payload: string;
    keyId: string;
    sig: string;
};
/**
 * The short, human-readable summary of a document that the person is shown before typing the
 * code, and that the device binds (as SHA3-256) into its signature. Deterministic: a verifier
 * recomputes it from the document, so a summary that does not describe the document is refused.
 */
export declare function adminPolicySummary(payload: Buffer): string;
export type DeviceAttestedEnvelope = {
    v: 1;
    kind: "enclaweder-attested";
    payload: string;
    summary: string;
    device: {
        uid: string;
        pubkey: string;
        cert: string;
    };
    attestation: AttestedRecord;
};
/**
 * Has the bound Enclaweder approve a policy document: the person was shown `adminPolicySummary`
 * and typed a current code; the device verifies the code and, in the same request, signs the
 * document digest. Refused unless the device's certificate proves it genuine and the signature
 * verifies over a fresh nonce with a step near this host's clock. Returns the envelope to write
 * as policy.device.json (the loader still requires the device in the root-owned org-keys.json).
 */
export declare function attestAdminPolicyWithDevice(access: DeviceTotpAccess & {
    cert: Buffer;
}, p: {
    doc: AdminPolicyDoc;
    code: string;
    nowS?: number;
    rootPubkey?: Buffer;
}): Promise<{
    ok: true;
    envelope: DeviceAttestedEnvelope;
    summary: string;
} | {
    ok: false;
    code: DeviceTotpFailure | "not-genuine" | "invalid-document";
    reason?: string;
}>;
/** Load the admin policy from the root-owned and signed locations. Never throws. */
export declare function loadAdminPolicy(opts?: AdminPolicyLoadOptions): AdminPolicyLoad;
export declare function setActiveAdminPolicy(load: AdminPolicyLoad): void;
export declare function clearActiveAdminPolicy(): void;
export declare function getActiveAdminPolicyLoad(): AdminPolicyLoad;
export declare function getActiveAdminPolicy(): AdminPolicy | null;
/** True when the admin policy explicitly allows the named dangerous config flag. */
export declare function adminAllowsDangerousFlag(flag: string): boolean;
/** True when the admin policy explicitly allows gateway.auth.mode "none". */
export declare function adminAllowsGatewayAuthNone(): boolean;
/** True when the admin policy explicitly allows ENCLAWEDER_ROOT=optional (device retirement). */
export declare function adminAllowsHardwareRootOptional(): boolean;
/** Human-readable source of the admin policy, for the boot record and `policy show`. */
export declare function describeAdminSource(admin: AdminPolicy | null): string;
