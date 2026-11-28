export declare const AUDIT_SECRET_PLACEHOLDER = "[secret removed by Enclawed]";
/** `s` with every secret value replaced; the same string when it holds none. */
export declare function redactAuditString(s: string): string;
