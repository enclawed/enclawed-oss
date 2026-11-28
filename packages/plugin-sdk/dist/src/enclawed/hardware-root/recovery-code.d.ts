export declare const RECOVERY_CODE_BYTES = 16;
export declare const RECOVERY_CODE_CHARS = 26;
export type RecoveryCodeParse = {
    ok: true;
    bytes: Buffer;
} | {
    ok: false;
    code: "length" | "character" | "check" | "range";
};
/** Render 16 bytes as the printed form (used by tests and the provisioning reference). */
export declare function formatRecoveryCode(bytes: Buffer): string;
/** Parse what a person typed. Never throws; the closed `code` says what was wrong. */
export declare function parseRecoveryCode(typed: string): RecoveryCodeParse;
/** A TOTP code as typed (6 digits, spaces allowed). */
export declare function parseTotp(typed: string): number | null;
