// Human form of an Enclaweder recovery code (factor B of the device's two-factor latch clear).
//
// A code is 128 random bits. It is written for people as 26 Crockford base32 characters (130
// bits, the top two always zero) plus one Crockford check symbol (the 128-bit value mod 37),
// grouped for reading: XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-X-C. Decoding is forgiving the way
// Crockford intends (case, I/L -> 1, O -> 0, hyphens and spaces ignored) and the check symbol
// catches a mistyped or transposed character before the code is spent on a device attempt.
//
// The code is never stored or logged by the host: callers hold it only long enough to send the
// 16 raw bytes to the device, then wipe the buffer.

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CHECK = ALPHABET + "*~$=U";

export const RECOVERY_CODE_BYTES = 16;
export const RECOVERY_CODE_CHARS = 26;

export type RecoveryCodeParse =
  | { ok: true; bytes: Buffer }
  | { ok: false; code: "length" | "character" | "check" | "range" };

function toBig(b: Buffer): bigint {
  return BigInt(`0x${b.toString("hex") || "0"}`);
}

/** Render 16 bytes as the printed form (used by tests and the provisioning reference). */
export function formatRecoveryCode(bytes: Buffer): string {
  if (bytes.length !== RECOVERY_CODE_BYTES) {
    throw new Error("a recovery code is 16 bytes");
  }
  let v = toBig(bytes);
  const out: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_CHARS; i++) {
    out.unshift(ALPHABET[Number(v & 31n)]);
    v >>= 5n;
  }
  const check = CHECK[Number(toBig(bytes) % 37n)];
  const body = out.join("");
  return `${body.slice(0, 5)}-${body.slice(5, 10)}-${body.slice(10, 15)}-${body.slice(15, 20)}-${body.slice(20, 25)}-${body.slice(25)}-${check}`;
}

/** Parse what a person typed. Never throws; the closed `code` says what was wrong. */
export function parseRecoveryCode(typed: string): RecoveryCodeParse {
  const s = typed.toUpperCase().replace(/[\s-]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0");
  if (s.length !== RECOVERY_CODE_CHARS + 1) {
    return { ok: false, code: "length" };
  }
  let v = 0n;
  for (const ch of s.slice(0, RECOVERY_CODE_CHARS)) {
    const d = ALPHABET.indexOf(ch);
    if (d < 0) {
      return { ok: false, code: "character" };
    }
    v = (v << 5n) | BigInt(d);
  }
  if (v >> 128n) {
    return { ok: false, code: "range" };
  }
  const ck = CHECK.indexOf(s[RECOVERY_CODE_CHARS]);
  if (ck < 0 || BigInt(ck) !== v % 37n) {
    return { ok: false, code: "check" };
  }
  const bytes = Buffer.from(v.toString(16).padStart(32, "0"), "hex");
  return { ok: true, bytes };
}

/** A TOTP code as typed (6 digits, spaces allowed). */
export function parseTotp(typed: string): number | null {
  const s = typed.replace(/\s/g, "");
  return /^\d{6}$/.test(s) ? Number(s) : null;
}
