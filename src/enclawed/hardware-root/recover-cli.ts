// `enclawed hardware-root status | recover`: the one implementation, shared by the core CLI, the
// executive-assistant installer (--recover-root) and codenclawed (recover-root), which are thin
// callers of it.
//
// The Enclaweder holds the halt latch. This tool only RELAYS what a person types to the device:
// the device verifies both factors itself (an authenticator TOTP code or a FIDO2 assertion, AND a
// one-time recovery code) and decides. Because these are typed on the host -- presumed
// compromised -- each recovery code works once and each TOTP step works once: a captured code is
// worth nothing afterwards. Nothing typed is echoed, logged, written or kept.
//
// There is no flag that skips a factor. The operator path (--operator-key / --operator-offline)
// is the custodial authority for lost factors (Enclawed, or the customer's own quorum after a
// custody handover), itself M-of-N; it is not a user bypass.
import { createPrivateKey, sign as edSign } from "node:crypto";
import fs from "node:fs";
import { createInterface } from "node:readline/promises";
import {
  FIDO_RP_ID,
  fidoChallenge,
  operatorAuthMessage,
  type SecondFactor,
} from "./device-latch.js";
import type { OperatorSigner } from "./enclaweder-hid.js";
import { FAILURE_WARN_THRESHOLD, type RecoveryAuth } from "./guard.js";
import { hardwareRootStatusStandalone, recoverHardwareRootStandalone } from "./index.js";
import { parseRecoveryCode, parseTotp } from "./recovery-code.js";
import { diagnoseHardwareRoot, renderHardwareRootDiagnosis } from "./status-report.js";

export interface CliIO {
  out: NodeJS.WritableStream;
  err: NodeJS.WritableStream;
  stdin: NodeJS.ReadableStream & { isTTY?: boolean; setRawMode?(on: boolean): unknown };
  stdoutIsTTY: boolean;
}
const defaultIO = (): CliIO => ({
  out: process.stdout,
  err: process.stderr,
  stdin: process.stdin,
  stdoutIsTTY: process.stdout.isTTY,
});

/** Failures above this since the last clean session print a prominent warning. */
export { FAILURE_WARN_THRESHOLD };

/** ENCLW- or ECPRO- with the full 24-hex uid; returns the uid (lower-case) or null. */
export function typedSerialUid(typed: string): string | null {
  const m = /^(ENCLW|ECPRO)-([0-9A-F]{24})$/i.exec(typed.trim());
  return m ? m[2].toLowerCase() : null;
}

async function ask(io: CliIO, q: string): Promise<string> {
  const rl = createInterface({ input: io.stdin, output: io.out, terminal: false });
  try {
    io.out.write(q);
    return (await rl.question("")).trim();
  } finally {
    rl.close();
  }
}

/**
 * Read a line in raw mode. The returned string is all the caller ever holds. Without `echo`
 * nothing is shown. With `echo` the characters are shown while typing (a long code is easier to
 * get right when you can see it), and the line is wiped once Enter is pressed.
 */
export async function askSecret(
  io: CliIO,
  q: string,
  opts: { echo?: boolean } = {},
): Promise<string> {
  io.out.write(q);
  const stdin = io.stdin;
  if (!stdin.isTTY || !stdin.setRawMode) {
    throw new Error("a recovery code is read only from an interactive terminal (no echo)");
  }
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise<string>((resolve, reject) => {
    let buf = "";
    const onData = (d: Buffer | string) => {
      for (const ch of d.toString("utf8")) {
        if (ch === "\r" || ch === "\n") {
          done();
          resolve(buf);
          return;
        }
        if (ch === "\u0003") {
          done();
          reject(new Error("aborted"));
          return;
        }
        if (ch === "\u007f" || ch === "\b") {
          if (opts.echo && buf.length > 0) {
            io.out.write("\b \b");
          }
          buf = buf.slice(0, -1);
        } else if (ch >= " ") {
          buf += ch;
          if (opts.echo) {
            io.out.write(ch);
          }
        }
      }
    };
    const done = () => {
      stdin.removeListener("data", onData);
      stdin.setRawMode?.(false);
      stdin.pause();
      // Wipe what was shown: back to the line start, clear it, reprint the prompt only.
      io.out.write(opts.echo ? `\r\u001b[2K${q}(entered)\n` : "\n");
    };
    stdin.on("data", onData);
  });
}

/**
 * `enclawed hardware-root status`: the user's diagnosis (present, genuine, operational,
 * zeroization, halt state, recovery readiness, and what to do). Read-only: it never changes the
 * device or this computer, and never asks for a factor. Returns the exit code: 0 operational and
 * CLEAN, 2 DIRTY, 3 not operational / zeroized / not genuine / different unit / no device,
 * 1 error.
 */
export async function hardwareRootStatusCli(
  opts: { json?: boolean; statePath?: string } = {},
  io: CliIO = defaultIO(),
): Promise<number> {
  let dx;
  try {
    dx = diagnoseHardwareRoot(await hardwareRootStatusStandalone({ statePath: opts.statePath }));
  } catch (e) {
    io.err.write(`enclawed: hardware-root status failed: ${(e as Error).message ?? String(e)}\n`);
    return 1;
  }
  io.out.write(opts.json ? `${JSON.stringify(dx, null, 2)}\n` : renderHardwareRootDiagnosis(dx));
  return dx.exitCode;
}

export interface RecoverCliOptions {
  statePath?: string;
  /** Operator path: Ed25519 PKCS#8 PEM files (removable media; never on this host). */
  operatorKeys?: string[];
  /** Operator path, keys fully off-host: print the message, read pasted signatures. */
  operatorOffline?: number;
  /** Factor A by FIDO2 security key (needs libfido2's fido2-assert) instead of TOTP. */
  fido?: string;
  /** Pin one device (its hidraw path). */
  hidraw?: string;
  /** Called with what to record in the caller's audit log (never a code). */
  audit?: (ev: {
    outcome: string;
    code?: string;
    serial?: string;
    via?: string;
    detail?: string;
  }) => void | Promise<void>;
}

/**
 * `enclawed hardware-root recover`. Interactive only: stdin and stdout must be a terminal, so no
 * typed code can be piped from or into a file. Returns the exit code.
 */
export async function hardwareRootRecoverCli(
  opts: RecoverCliOptions = {},
  io: CliIO = defaultIO(),
): Promise<number> {
  const audit = async (ev: Parameters<NonNullable<RecoverCliOptions["audit"]>>[0]) => {
    try {
      await opts.audit?.(ev);
    } catch {
      /* the caller's log is best effort; the device keeps its own */
    }
  };
  if (!io.stdin.isTTY || !io.stdoutIsTTY) {
    io.err.write(
      "enclawed: recovery requires an interactive terminal (stdin and stdout); run it yourself at a console, with the Enclaweder plugged in\n",
    );
    await audit({ outcome: "refused", code: "no-tty" });
    return 1;
  }
  const st = await hardwareRootStatusStandalone({ statePath: opts.statePath });
  if (st.owner) {
    io.err.write(
      "enclawed: an Enclawed process on this machine owns the Enclaweder; stop it first\n",
    );
    await audit({ outcome: "refused", code: "owner-running" });
    return 1;
  }
  const dev = st.devices.find((d) => d.latch?.state === "SET") ?? st.devices[0];
  if (!dev) {
    io.err.write("enclawed: no Enclaweder detected on the bus\n");
    return 1;
  }
  if (!dev.latch) {
    io.err.write(`enclawed: ${dev.latchError}\n`);
    await audit({ outcome: "refused", code: "latch-unavailable", serial: dev.serial });
    return 1;
  }
  const hostDirty = st.hostLatches.find((l) => l.status === "DIRTY");
  if (dev.latch.state !== "SET" && !hostDirty) {
    io.out.write(`Nothing to recover: enclaweder ${dev.serial} reports its latch CLEAN.\n`);
    return 0;
  }
  io.out.write(
    `Hardware root is DIRTY: accreditation is halted.\n  device: ${hostDirty?.bound?.serial ?? dev.serial}\n  reason: ${dev.latch.state === "SET" ? dev.latch.reasonText : (hostDirty?.dirty?.reason ?? "(unrecorded)")}\n`,
  );
  io.out.write("Confirm you are physically holding the bound Enclaweder.\n");
  const typedUid = typedSerialUid(
    await ask(
      io,
      "Type the serial printed on it (ENCLW-... or ECPRO-..., all 24 characters after the dash): ",
    ),
  );
  if (!typedUid || typedUid !== dev.uid) {
    io.out.write("Aborted: the serial did not match. Nothing was changed.\n");
    await audit({ outcome: "aborted", code: "serial-mismatch", serial: dev.serial });
    return 1;
  }
  let auth: RecoveryAuth;
  if (opts.operatorKeys?.length || opts.operatorOffline) {
    let signers: OperatorSigner[];
    if (opts.operatorKeys?.length) {
      try {
        signers = opts.operatorKeys.map((f) => {
          const stt = fs.statSync(f);
          if (process.platform !== "win32" && (stt.mode & 0o077) !== 0) {
            throw new Error(
              `${f} is readable or writable by others (mode ${(stt.mode & 0o777).toString(8)})`,
            );
          }
          const k = createPrivateKey(fs.readFileSync(f));
          if (k.asymmetricKeyType !== "ed25519") {
            throw new Error(`${f} is not an Ed25519 private key`);
          }
          return (msg: Buffer) => edSign(null, msg, k);
        });
      } catch (e) {
        io.err.write(`enclawed: operator keys: ${(e as Error).message}\n`);
        await audit({ outcome: "refused", code: "operator-keys" });
        return 1;
      }
    } else {
      // Offline signers: show the exact message for each operator to sign elsewhere.
      const count = Math.max(1, Math.min(8, opts.operatorOffline ?? 1));
      signers = Array.from({ length: count }, (_v, i) => async (msg: Buffer) => {
        io.out.write(
          `\nOperator ${i + 1} of ${count}: sign this message (hex) with your operator key, on your own device:\n${msg.toString("hex")}\n`,
        );
        const hex = (await ask(io, "Paste the 64-byte Ed25519 signature (hex): ")).replace(
          /\s/g,
          "",
        );
        return Buffer.from(/^[0-9a-f]{128}$/i.test(hex) ? hex : "", "hex");
      });
    }
    auth = { kind: "operator-quorum", signers };
  } else {
    io.out.write(
      "\nTwo factors, both checked by the Enclaweder itself:\n" +
        "  1. a current code from your authenticator app (or your security key, with --fido)\n" +
        "  2. one of your one-time recovery codes (used once, then dead)\n" +
        "Both are typed on this computer: that is why each works only once.\n\n",
    );
    let factorA: SecondFactor;
    if (opts.fido) {
      const a = await fidoAssert(opts.fido, opts.hidraw, io);
      if (!a) {
        await audit({ outcome: "refused", code: "fido-unavailable", serial: dev.serial });
        return 1;
      }
      factorA = a;
    } else {
      const t = parseTotp(await askSecret(io, "Authenticator code (6 digits): "));
      if (t === null) {
        io.out.write("That is not a 6-digit code. Nothing was sent.\n");
        return 1;
      }
      factorA = { kind: "totp", code: t, hostTimeS: Math.floor(Date.now() / 1000) };
    }
    const typed = await askSecret(io, "Recovery code (dashes optional, shown while you type): ", {
      echo: true,
    });
    const parsed = parseRecoveryCode(typed);
    if (!parsed.ok) {
      io.out.write(
        `That recovery code is not valid (${parsed.code}): check it against your paper copy. Nothing was sent to the device.\n`,
      );
      await audit({ outcome: "refused", code: `code-${parsed.code}`, serial: dev.serial });
      return 1;
    }
    auth = { kind: "two-factor", recoveryCode: parsed.bytes, factorA };
  }
  try {
    const r = await recoverHardwareRootStandalone({
      auth,
      statePath: opts.statePath,
      hidraw: opts.hidraw,
    });
    await audit({
      outcome: r.recovered ? "recovered" : "not-recovered",
      serial: r.serial ?? dev.serial,
      via: auth.kind,
    });
    io.out.write(
      r.recovered
        ? `Recovered: enclaweder ${r.serial ?? dev.serial} reports its latch CLEAN again.\n`
        : "Recovery did not complete; the latch is unchanged.\n",
    );
    return r.recovered ? 0 : 1;
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    await audit({
      outcome: "refused",
      code: "device-refused",
      serial: dev.serial,
      via: auth.kind,
      detail: msg.slice(0, 300),
    });
    io.err.write(
      `enclawed: recovery REFUSED: ${msg}\nThe device keeps its latch and counts the attempt; repeated failures back off and then lock the two-factor path (operator quorum only).\n`,
    );
    return 1;
  }
}

/**
 * FIDO2 factor through libfido2's `fido2-assert` (package fido2-tools): the device's one-shot
 * nonce is the clientDataHash, the RP id is fixed, user verification (PIN or biometric) required.
 */
async function fidoAssert(token: string, hidraw: string | undefined, io: CliIO) {
  const { spawnSync } = await import("node:child_process");
  const { Enclaweder } = await import("./enclaweder-hid.js");
  const { findAllEnclaweders } = await import("./enclaweder-hid.js");
  const path = hidraw ?? findAllEnclaweders()[0];
  if (!path) {
    return null;
  }
  const d = new Enclaweder(path);
  let ch;
  try {
    ch = await fidoChallenge(d);
  } catch (e) {
    io.err.write(`enclawed: the device issued no FIDO2 challenge: ${(e as Error).message}\n`);
    return null;
  } finally {
    d.close();
  }
  const input = `${ch.clientDataHash.toString("base64")}\n${FIDO_RP_ID}\n${ch.credentialId.toString("base64")}\n`;
  io.out.write("Touch your security key and enter its PIN when asked.\n");
  const r = spawnSync("fido2-assert", ["-G", "-v", "-t", "up=true", token], {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "inherit"],
  });
  if (r.error || r.status !== 0) {
    io.err.write(
      `enclawed: fido2-assert failed${r.error ? ` (${r.error.message}; install fido2-tools)` : ""}\n`,
    );
    return null;
  }
  // fido2-assert -G output: clientDataHash, rp id, authenticatorData (CBOR byte string, base64), signature (base64)
  const lines = r.stdout.trim().split("\n");
  const cbor = Buffer.from(lines[2] ?? "", "base64");
  const authData = cbor[0] === 0x58 ? cbor.subarray(2, 2 + cbor[1]) : cbor;
  return {
    kind: "fido2" as const,
    authenticatorData: Buffer.from(authData),
    signature: Buffer.from(lines[3] ?? "", "base64"),
  };
}

export { operatorAuthMessage };
