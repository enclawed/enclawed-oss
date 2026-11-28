import type { AuthProfileCredential, AuthProfileStore } from "./auth-profiles.js";
import type { PiApiKeyCredential, PiCredential, PiCredentialMap, PiOAuthCredential } from "./pi-auth-credentials.types.js";
export type { PiApiKeyCredential, PiCredential, PiCredentialMap, PiOAuthCredential };
export declare function convertAuthProfileCredentialToPi(cred: AuthProfileCredential): PiCredential | null;
export declare function resolvePiCredentialMapFromStore(store: AuthProfileStore): PiCredentialMap;
export declare function piCredentialsEqual(a: PiCredential | undefined, b: PiCredential): boolean;
