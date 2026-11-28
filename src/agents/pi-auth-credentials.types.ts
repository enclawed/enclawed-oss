// Leaf type module for the credentials Enclawed hands to pi; importing it pulls in
// no auth-profile code (keeps pi-credential-store.ts out of import cycles).
export type PiApiKeyCredential = { type: "api_key"; key: string };
export type PiOAuthCredential = {
  type: "oauth";
  access: string;
  refresh: string;
  expires: number;
};

export type PiCredential = PiApiKeyCredential | PiOAuthCredential;
export type PiCredentialMap = Record<string, PiCredential>;
