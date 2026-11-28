// Fail-secure hardware-root guard.
//
// Enclawed assumes the host is already compromised, so the halt latch is HELD BY THE DEVICE
// (Enclaweder command set 0.3, findings N17/N18). This guard:
//
//   * binds a genuine, certified device and reads ITS latch (LATCH_GET, signed over a fresh
//     nonce) at boot and on every heartbeat; a device that says DIRTY halts this process
//     whatever this host's files say, and a device without the latch (firmware < 0.3) is
//     refused ("device latch unsupported: update firmware");
//   * opens the device's host session (LATCH_OPEN): from that moment the device itself is dirty
//     until this process closes the session cleanly. Unplug, power loss, crash, kill or a
//     lapsed lease leave the DEVICE dirty, and the next boot of any process sees it;
//   * keeps the host file only as a cache and an append-only audit mirror. A CLEAN host file
//     never overrides a set device latch; a DIRTY host file is pushed to the device (which then
//     holds it); an unreadable or corrupt file reads as DIRTY, never as clean;
//   * cannot clear anything by itself. recover() asks the DEVICE to clear, with two factors it
//     verifies (a TOTP or FIDO2 assertion AND a one-time recovery code) or with the operator
//     quorum, and accepts the result only when a fresh signed LATCH_GET says CLEAR.
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import {
  clearByOperatorQuorum,
  clearByTwoFactors,
  DeviceLatchError,
  haltDeviceAnonymous,
  HOST_HALT_CODE,
  LATCH_KEEPALIVE_INTERVAL_MS,
  LatchSession,
  readDeviceLatch,
  readFailLog,
  transientDeviceError,
  type DeviceLatchState,
  type LatchFrameDevice,
  type SecondFactor,
} from "./device-latch.js";
import {
  verifyChallenge,
  verifyCert,
  ACC_STATE,
  type Identity,
  type DeviceStatus,
  type ChallengeResponse,
  type EnclawederSku,
  type OperatorSigner,
  type ReconnectOutcome,
} from "./enclaweder-hid.js";
import type { DeviceTransientCode } from "./enclaweder-hid.js";
import { reconcileDeviceFailures, recordHostAuthFailure } from "./failure-audit.js";
import { realStateWriteRefusal } from "./test-guard.js";

/** Failures since the last clean session at or above this print a launch warning. */
export const FAILURE_WARN_THRESHOLD = 3;

export class HaltError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super("HALT: " + reason);
    this.name = "HaltError";
    this.reason = reason;
  }
}

/** The subset of the device the guard drives. `Enclaweder` satisfies this structurally. */
export interface GuardDevice {
  getIdentity(): Promise<Identity>;
  getStatus(): Promise<DeviceStatus>;
  challenge(nonce32: Buffer): Promise<ChallengeResponse>;
  getCert(): Promise<Buffer | null>;
  /** Frame-level access for the device-held latch (command set 0.3). Absent = unsupported. */
  request?: LatchFrameDevice["request"];
  sendNoWait?: LatchFrameDevice["sendNoWait"];
  /** Find the device again after its node went away (Enclaweder.reconnect). Absent = cannot. */
  reconnect?(): Promise<ReconnectOutcome>;
}

/*
 * How long "no answer" is treated as transient before it is a verdict (internal constants, no
 * setting). A loaded host (a large model on the GPU, WSL2 with usbipd) stalls this process past a
 * request's timeout, and USB re-enumeration takes the node away for a moment; neither is a loss
 * of the device. So a heartbeat check that got NO answer is made again, with fresh nonces, up to
 * CHECK_ATTEMPTS times within CHECK_WINDOW_MS (monotonic), and a node that went away is reopened
 * within the same window, accepting only the same pinned device. A definite answer -- another
 * key or uid, a signature that does not verify, a bad state, a device that reports its latch
 * set -- latches DIRTY at once, as does the window running out. While a check is retrying, the
 * gate is closed (gate(): "checking"): accredited calls are refused, nothing is latched.
 */
const CHECK_ATTEMPTS = 3;
const CHECK_WINDOW_MS = 10_000;
/** Pause between attempts, so a stalled host gets to drain what it owes before the next one. */
const CHECK_PAUSE_MS = 1_000;
/** How often a node that went away is looked for again, within the window. */
const REOPEN_POLL_MS = 500;

const pause = (ms: number): Promise<void> =>
  new Promise((r) => {
    const t = setTimeout(r, ms);
    t.unref?.();
  });

/**
 * Whether the guard's gate is open, and if not, why, as a closed union. "checking" is the gate
 * closed while the device is being asked again (no latch: refuse calls, do not halt); "dirty"
 * is a real latch; "refused" a refused boot; "unbound" no device bound; "halted" a gate closed
 * for good in this process without a latch (the heartbeat no longer runs).
 */
export type GuardGate =
  | { kind: "clean" }
  | { kind: "checking"; reason: string }
  | { kind: "dirty"; reason: string }
  | { kind: "refused"; reason: string }
  | { kind: "unbound"; reason: string }
  | { kind: "halted"; reason: string };

/** One pass of the heartbeat check: what the device said, or that it said nothing. */
type CheckStep =
  | { kind: "ok"; latch: DeviceLatchState }
  | { kind: "device-halt"; latch: DeviceLatchState }
  | { kind: "definite"; reason: string }
  | { kind: "transient"; code: DeviceTransientCode; reason: string };

/**
 * A device that can also enrol a measurement and attest against it.
 *
 * This is deliberately separate from GuardDevice. Binding a hardware root
 * needs identity, status, challenge and certificate, and the Enclaweder
 * class in enclaweder-hid.ts implements exactly those. Enrolment and
 * attestation are a further capability whose wire opcodes are not in this
 * tree, so nothing here implements them; the fleet tests supply devices
 * that do. Naming the capability means a device that lacks it is refused
 * with an explanation instead of failing on an undefined method.
 */
export interface AttestingDevice extends GuardDevice {
  enroll(meas32: Buffer): Promise<number | null>;
  attest(meas32: Buffer, nonce32: Buffer): Promise<unknown>;
}

interface BoundInfo {
  serial: string;
  pubkey: string;
  uid: string;
  /**
   * Which pinned domain signed this device's birth certificate. This is the
   * AUTHENTICATED model -- the USB serial prefix is display only and a Pro
   * unit reports the driver's base prefix until something re-renders it, so
   * anything deciding what the device IS has to read this. Optional because
   * state files written before it existed do not carry it.
   */
  sku?: EnclawederSku;
}
interface DirtyInfo {
  reason: string;
  at: number;
  lastGoodAt: number;
  /** Where the halt came from: this host's guard, or the device's own latch. */
  source?: "host" | "device";
}
/** One append-only history entry. Never removed, never rewritten, carried across every rebind. */
export interface GuardHistoryEntry {
  at: number;
  kind:
    | "bound"
    | "rebound"
    | "halt"
    | "recovered"
    | "device-latch-set"
    | "pushed-to-device"
    | "refused-boot"
    | "session-closed";
  detail?: string;
  serial?: string;
  deviceSeq?: string;
  via?: "two-factor" | "operator-quorum";
}
interface GuardState {
  status: "UNBOUND" | "CLEAN" | "DIRTY";
  /**
   * True from the moment a device is bound until the process closes the
   * session deliberately. It is what distinguishes "this host once had
   * an enclaweder" from "this run is continuing a session that had one":
   * a session left open means the last run was accredited by hardware
   * and did not end on its own terms, so resuming it without the device
   * is not the same thing as starting fresh without one. The DEVICE holds
   * the authoritative copy of this (its armed host session); this is the
   * host's mirror for the device-absent rule.
   */
  sessionOpen?: boolean;
  bound?: BoundInfo | null;
  boundAt?: number;
  lastGoodAt?: number;
  dirty?: DirtyInfo | null;
  /** Legacy recovery records; kept verbatim across rebinds. */
  recoveries?: Array<{ at: number; cleared: DirtyInfo | null; via?: string; deviceSeq?: string }>;
  /** Append-only audit mirror (recoveries, halts, bindings, device latch events). */
  history?: GuardHistoryEntry[];
  /** The device's failure total when the last session ended cleanly (for the launch warning). */
  failureTotalAtLastClean?: string;
  /** Last device latch read (cache only; never authoritative). */
  device?: { state: "CLEAR" | "SET"; reason: string; seq: string; checkedAt: number } | null;
}

/** How a DIRTY latch is cleared. There is no "confirmed" boolean: the device decides. */
export type RecoveryAuth =
  | {
      kind: "two-factor";
      /** The one-time recovery code, 16 raw bytes (parseRecoveryCode). Wiped after use. */
      recoveryCode: Buffer;
      /** Factor A, verified by the device: TOTP code + host time, or a FIDO2 assertion. */
      factorA: SecondFactor;
    }
  | {
      kind: "operator-quorum";
      /** M operator signers (off-host: hardware tokens, an air-gapped station, removable media). */
      signers: OperatorSigner[];
    };

/** Device states a guard may bind in: power-on (PROVISION), READY, ATTESTED (finding H6). */
const BINDABLE_STATES: ReadonlySet<number> = new Set([
  ACC_STATE.PROVISION,
  ACC_STATE.READY,
  ACC_STATE.ATTESTED,
]);

function stateName(n: number): string {
  return (Object.entries(ACC_STATE).find(([, v]) => v === n)?.[0] ?? `state ${n}`).toUpperCase();
}

export class HardwareRootGuard {
  private statePath: string;
  private onHalt: (reason: string) => void;
  private state: GuardState;
  private timer: NodeJS.Timeout | null = null;
  private rootPubkey: Buffer | null;
  private session: LatchSession | null = null;
  private sessionDev: GuardDevice | null = null;
  /** A refused boot keeps every gate closed until a later boot succeeds (finding H5). */
  private refused: string | null = null;
  /** When (monotonic ms) the device's own latch was last read and verified CLEAR (finding N18). */
  private deviceCheckedAt = 0;
  private deviceStaleMs: number;
  private checking = false;
  /** When the heartbeat check now in flight started (finding H9). */
  private checkStartedAt = 0;
  /** A heartbeat check still unanswered after this long closes the gate (finding H9). */
  private answerBudgetMs: number;
  private heartbeatStarted = false;
  /** Bumped by stopHeartbeat(): a check still retrying from an earlier heartbeat stands down. */
  private heartbeatEpoch = 0;
  private cert: Buffer | null = null;

  constructor({
    statePath = "./.hw-root.state",
    onHalt,
    rootPubkey,
    deviceStaleMs = 15_000,
    answerBudgetMs = 1500,
  }: {
    statePath?: string;
    onHalt?: (r: string) => void;
    rootPubkey?: Buffer;
    /** assertClean() fails closed when the last verified device latch read is older than this. */
    deviceStaleMs?: number;
    /** assertClean() fails closed while a heartbeat check has been unanswered this long. */
    answerBudgetMs?: number;
  } = {}) {
    this.answerBudgetMs = answerBudgetMs;
    this.statePath = statePath;
    this.onHalt = onHalt ?? (() => {});
    // null => accept any PINNED trust domain (base or Pro), each of which may only have issued its
    // own model. Passing an explicit root demands that one root, which is how a deployment requires
    // a single SKU and how the tests pin a throwaway root.
    this.rootPubkey = rootPubkey ?? null; // trust anchor for the GENUINE gate
    this.deviceStaleMs = deviceStaleMs;
    this.state = this.loadState(); // persisted -> survives restart
  }

  /**
   * The host cache. Missing means never bound. ANY other failure -- a directory, a permission
   * error, a truncated or corrupt file -- reads as DIRTY (finding H7): an attacker who can break
   * the file must not thereby make the host look clean.
   */
  private loadState(): GuardState {
    let text: string;
    try {
      text = fs.readFileSync(this.statePath, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return { status: "UNBOUND" };
      }
      return this.unreadable(
        `latch file unreadable (${(err as NodeJS.ErrnoException).code ?? "error"})`,
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return this.unreadable("latch file corrupt (not JSON)");
    }
    const st = parsed as GuardState;
    if (!st || typeof st !== "object" || !["UNBOUND", "CLEAN", "DIRTY"].includes(st.status)) {
      return this.unreadable("latch file corrupt (no valid status)");
    }
    return st;
  }
  private unreadable(reason: string): GuardState {
    const now = Date.now();
    return {
      status: "DIRTY",
      dirty: { reason, at: now, lastGoodAt: 0, source: "host" },
      history: [{ at: now, kind: "halt", detail: reason }],
    };
  }
  /** Atomic write (temp + rename). Throws; callers decide what a failure means. */
  private saveState(): void {
    // Never the real user's latch from a test run (the founder's device was latched that way).
    const refusal = realStateWriteRefusal(this.statePath);
    if (refusal) {
      throw new Error(refusal);
    }
    const tmp = `${this.statePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    fs.renameSync(tmp, this.statePath);
  }
  private trySave(): boolean {
    try {
      this.saveState();
      return true;
    } catch {
      return false;
    }
  }
  private log(e: Omit<GuardHistoryEntry, "at">): void {
    (this.state.history ??= []).push({ at: Date.now(), ...e });
  }

  get status(): string {
    return this.state.status;
  }
  get bound(): BoundInfo | null {
    return this.state.bound ?? null;
  }
  get history(): readonly GuardHistoryEntry[] {
    return this.state.history ?? [];
  }
  /** The bound device's birth certificate, as verified at boot (clients re-verify it; H1). */
  get certificate(): Buffer | null {
    return this.cert;
  }
  /** Why the last boot was refused, if it was (finding H5). */
  get refusal(): string | null {
    return this.refused;
  }

  /** Gate every accredited operation. Throws HaltError unless CLEAN, unrefused and device-fresh. */
  assertClean(): void {
    const g = this.gate();
    if (g.kind !== "clean") {
      throw new HaltError(g.reason);
    }
  }

  /**
   * The gate as a closed union (assertClean() throws its reason). A stale latch read or a
   * heartbeat still waiting for its answer closes the gate as "checking", not as a latch: the
   * check either proves the device again or, past its window, latches DIRTY itself.
   */
  gate(): GuardGate {
    if (this.refused) {
      return { kind: "refused", reason: `hardware root boot was refused: ${this.refused}` };
    }
    if (this.state.status === "DIRTY") {
      return {
        kind: "dirty",
        reason: `hardware root DIRTY: ${this.state.dirty?.reason} -- two-factor recovery on the device required`,
      };
    }
    if (this.state.status !== "CLEAN") {
      return { kind: "unbound", reason: `hardware root not bound (${this.state.status})` };
    }
    if (this.session && this.heartbeatStarted && !this.timer) {
      return { kind: "halted", reason: "hardware root: the device heartbeat is not running" };
    }
    // Freshness (finding H9): CLEAN is what the device proved recently, not what was cached.
    // Monotonic: the wall clock of this host jumps (WSL time sync was seen stepping 13 s).
    const now = performance.now();
    if (this.session && this.checking && now - this.checkStartedAt > this.answerBudgetMs) {
      return {
        kind: "checking",
        reason: `hardware root: checking the device -- its heartbeat has been unanswered for ${Math.round(now - this.checkStartedAt)} ms (limit ${this.answerBudgetMs} ms)`,
      };
    }
    if (this.session && now - this.deviceCheckedAt > this.deviceStaleMs) {
      return {
        kind: "checking",
        reason: `hardware root: checking the device -- its latch was last verified ${Math.round(now - this.deviceCheckedAt)} ms ago (limit ${this.deviceStaleMs} ms)`,
      };
    }
    return { kind: "clean" };
  }

  /** Bind at boot. Refuses unless the DEVICE says clean; opens the device's host session. */
  async boot(dev: GuardDevice): Promise<BoundInfo> {
    try {
      const bound = await this.bootInner(dev);
      this.refused = null;
      return bound;
    } catch (err) {
      this.refused =
        err instanceof Error ? (err instanceof HaltError ? err.reason : err.message) : String(err);
      this.log({ kind: "refused-boot", detail: this.refused.slice(0, 300) });
      this.trySave();
      throw err instanceof HaltError ? err : new HaltError(this.refused);
    }
  }

  private async bootInner(dev: GuardDevice): Promise<BoundInfo> {
    const id = await dev.getIdentity();
    const st = await dev.getStatus();
    if (!BINDABLE_STATES.has(st.state)) {
      throw new HaltError(
        `device is ${stateName(st.state)} at boot; it may bind only in PROVISION, READY or ATTESTED`,
      );
    }
    // GENUINE gate: a MANUFACTURER-CERTIFIED device whose certificate binds this uid + key.
    const cert = await dev.getCert();
    const parsedCert = cert ? verifyCert(cert, id.uid, id.pubkeyRaw, this.rootPubkey) : null;
    if (!parsedCert) {
      throw new HaltError(
        "device not GENUINE -- no valid manufacturer certificate for this key (uncertified, counterfeit, or zeroized)",
      );
    }
    this.cert = Buffer.from(cert!);
    const serial =
      (parsedCert.sku === "pro" ? "ECPRO-" : "ENCLW-") + id.uid.toString("hex").toUpperCase();
    if (!dev.request) {
      throw new HaltError(
        "device latch unsupported: update firmware (this driver offers no frame access)",
      );
    }
    const ldev = dev as GuardDevice & LatchFrameDevice;
    // The DEVICE's latch, signed over our fresh nonce: the authority.
    let latch: DeviceLatchState;
    try {
      latch = await readDeviceLatch(ldev, id.pubkeyRaw, id.uid);
    } catch (err) {
      if (err instanceof DeviceLatchError && err.code === "unsupported") {
        throw new HaltError(`device latch unsupported: update firmware (enclaweder ${serial})`);
      }
      throw new HaltError(`device latch unreadable: ${(err as Error).message}`);
    }
    this.mirrorDevice(latch);
    await this.warnOnFailures(ldev, id.pubkeyRaw, id.uid, serial);
    if (this.state.status === "DIRTY" && latch.state === "CLEAR") {
      // The host saw a halt the device does not hold yet (it was absent, or this file is the
      // only record). Push it to the device, which from now on is the one that decides.
      await haltDeviceAnonymous(ldev, HOST_HALT_CODE.HOST_MIRROR).catch(() => undefined);
      this.log({ kind: "pushed-to-device", detail: this.state.dirty?.reason, serial });
      this.trySave();
      throw new HaltError(
        `refusing to boot: hardware root was left DIRTY (${this.state.dirty?.reason}); the halt is now held by enclaweder ${serial} -- two-factor recovery required`,
      );
    }
    if (latch.state === "SET") {
      this.adoptDeviceHalt(latch, serial);
      throw new HaltError(
        `refusing to boot: enclaweder ${serial} holds a DIRTY latch (${latch.reasonText}) -- two-factor recovery on the device required`,
      );
    }
    const nonce = randomBytes(32);
    const chal = await dev.challenge(nonce);
    if (!verifyChallenge(id.pubkeyRaw, nonce, chal.uid, chal.sig)) {
      throw new HaltError("boot challenge failed");
    }
    // Dirty on start: from here the device is armed until this process closes cleanly.
    let session: LatchSession;
    try {
      session = await LatchSession.open(ldev, id.pubkeyRaw);
    } catch (err) {
      if (err instanceof DeviceLatchError && err.code === "busy") {
        throw new HaltError(
          `another process holds enclaweder ${serial}'s host session; one owner per device (its lease ends ${err.waitMs ?? "?"} ms after its last renewal, and if it does not close cleanly the device latches DIRTY)`,
        );
      }
      throw new HaltError(`could not open the device host session: ${(err as Error).message}`);
    }
    this.session = session;
    this.sessionDev = dev;
    this.deviceCheckedAt = performance.now();
    const prev = this.state;
    this.state = {
      status: "CLEAN",
      bound: {
        serial,
        pubkey: id.pubkeyRaw.toString("hex"),
        uid: id.uid.toString("hex"),
        sku: parsedCert.sku,
      },
      boundAt: Date.now(),
      lastGoodAt: Date.now(),
      dirty: null,
      sessionOpen: true,
      // Append-only: a rebind keeps every earlier recovery, halt and binding.
      recoveries: prev.recoveries ?? [],
      history: prev.history ?? [],
      device: prev.device ?? null,
      failureTotalAtLastClean: prev.failureTotalAtLastClean,
    };
    this.log({ kind: "bound", serial, deviceSeq: String(session.sid) });
    this.mirrorDevice(latch);
    this.trySave();
    session.startKeepalive(LATCH_KEEPALIVE_INTERVAL_MS, (err) =>
      this.markDirty(`device host session lost: ${err.message}`),
    );
    return this.bound as BoundInfo;
  }

  /** Failed authentications since the last clean session above the threshold: say so, loudly. */
  private lastFailureTotal: bigint | null = null;
  private async warnOnFailures(
    dev: LatchFrameDevice,
    pub: Buffer,
    uid: Buffer,
    serial: string,
  ): Promise<void> {
    try {
      const f = await readFailLog(dev, pub, uid);
      this.lastFailureTotal = f.total;
      const since = f.total - BigInt(this.state.failureTotalAtLastClean ?? "0");
      if (since >= BigInt(FAILURE_WARN_THRESHOLD)) {
        console.error(
          `[enclawed] WARNING: enclaweder ${serial} logged ${since} failed authentication attempt(s) since the last clean session (device total ${f.total}). Inspect: enclawed hardware-root status`,
        );
      }
    } catch {
      /* firmware without the log is refused elsewhere */
    }
  }

  private mirrorDevice(l: DeviceLatchState): void {
    this.state.device = {
      state: l.state,
      reason: l.reasonText,
      seq: String(l.seq),
      checkedAt: Date.now(),
    };
  }
  /** The device says DIRTY: mirror it here (cache + audit), never the other way round. */
  private adoptDeviceHalt(l: DeviceLatchState, serial: string): void {
    const already = this.state.status === "DIRTY" && this.state.dirty?.source === "device";
    if (!already) {
      this.state.status = "DIRTY";
      this.state.dirty = {
        reason: `device latch: ${l.reasonText}`,
        at: Date.now(),
        lastGoodAt: this.state.lastGoodAt ?? 0,
        source: "device",
      };
      this.log({
        kind: "device-latch-set",
        detail: l.reasonText,
        serial,
        deviceSeq: String(l.setSeq),
      });
    }
    this.mirrorDevice(l);
    this.trySave();
  }

  /**
   * End the hardware-accredited session deliberately: the authenticated clean close is what
   * disarms the device. Only the guard that opened a session closes it, and only that writes
   * sessionOpen = false (finding H4): a refused recovery or a per-call process never does.
   */
  closeSession(): void {
    this.stopHeartbeat();
    const s = this.session;
    if (!s) {
      return;
    }
    this.session = null;
    s.closeSync();
    if (this.lastFailureTotal !== null) {
      this.state.failureTotalAtLastClean = String(this.lastFailureTotal);
    }
    if (this.state.sessionOpen !== false) {
      this.state.sessionOpen = false;
      this.log({ kind: "session-closed", serial: this.state.bound?.serial });
      this.trySave();
    }
  }
  /** As closeSession(), awaiting the device's acknowledgement (graceful exit paths). */
  async closeSessionAsync(): Promise<void> {
    this.stopHeartbeat();
    const s = this.session;
    if (!s) {
      return;
    }
    this.session = null;
    try {
      await s.close();
    } catch {
      s.closeSync();
    }
    if (this.lastFailureTotal !== null) {
      this.state.failureTotalAtLastClean = String(this.lastFailureTotal);
    }
    if (this.state.sessionOpen !== false) {
      this.state.sessionOpen = false;
      this.log({ kind: "session-closed", serial: this.state.bound?.serial });
      this.trySave();
    }
  }

  /** A journal checkpoint signed under this guard's device host session (finding H2). */
  async checkpoint(head32: Buffer): Promise<{ uid: Buffer; sid: bigint; ck: bigint; sig: Buffer }> {
    if (!this.session || this.state.status !== "CLEAN") {
      throw new HaltError("no clean device host session to checkpoint under");
    }
    return this.session.checkpoint(head32);
  }

  /**
   * One liveness check. Never rejects (finding H7). A definite answer that is not CLEAN latches
   * DIRTY at once; NO answer is made again within the fixed window (see CHECK_ATTEMPTS), and
   * latches DIRTY only when the window runs out.
   */
  async check(dev: GuardDevice): Promise<{ ok: boolean; reason?: string }> {
    if (this.state.status === "DIRTY") {
      return { ok: false, reason: this.state.dirty?.reason };
    }
    const fail = (reason: string): { ok: false; reason: string } => {
      this.markDirty(reason);
      return { ok: false, reason };
    };
    const epoch = this.heartbeatEpoch;
    const started = performance.now(); // monotonic: the wall clock steps on this kind of host
    const elapsed = () => Math.round(performance.now() - started);
    const stoodDown = { ok: false, reason: "the heartbeat was stopped while checking" } as const;
    try {
      for (let attempt = 1; ; attempt++) {
        const step = await this.checkOnce(dev);
        // Re-read after the await: the session's keepalive may have latched meanwhile.
        if ((this.state.status as GuardState["status"]) === "DIRTY") {
          return { ok: false, reason: this.state.dirty?.reason };
        }
        if (step.kind === "ok") {
          this.deviceCheckedAt = performance.now();
          this.state.lastGoodAt = Date.now();
          this.mirrorDevice(step.latch);
          this.trySave();
          return { ok: true };
        }
        if (step.kind === "device-halt") {
          this.adoptDeviceHalt(step.latch, this.state.bound?.serial ?? "");
          this.stopHeartbeat();
          this.session = null;
          this.onHaltSafe(`device latch: ${step.latch.reasonText}`);
          return { ok: false, reason: `device latch: ${step.latch.reasonText}` };
        }
        if (step.kind === "definite") {
          return fail(step.reason);
        }
        // No answer. Not a verdict yet, unless the window is spent.
        if (epoch !== this.heartbeatEpoch) {
          return stoodDown;
        }
        if (step.code === "gone" && dev.reconnect) {
          const found = await this.findAgain(dev, started, epoch);
          if (found === "stopped") {
            return stoodDown;
          }
          if (found.kind === "different") {
            return fail(
              `a different device answered in place of the bound enclaweder (on ${found.path}) -- device swapped`,
            );
          }
          if (found.kind === "absent") {
            return fail(`enclaweder disconnected: not found again within ${elapsed()} ms`);
          }
          // The same device is back: the next pass proves it with a fresh signed latch read.
          if (performance.now() - started < CHECK_WINDOW_MS) {
            continue;
          }
          return fail(`${step.reason}: reopened, but not proven again within ${elapsed()} ms`);
        }
        if (attempt >= CHECK_ATTEMPTS || performance.now() - started >= CHECK_WINDOW_MS) {
          return fail(`${step.reason} (asked again; no answer within ${elapsed()} ms)`);
        }
        await pause(CHECK_PAUSE_MS);
        if (epoch !== this.heartbeatEpoch) {
          return stoodDown;
        }
      }
    } catch (err) {
      return fail(`guard check error: ${(err as Error).message}`);
    }
  }

  /** Reopen a node that went away, polling within the check's window. */
  private async findAgain(
    dev: GuardDevice,
    started: number,
    epoch: number,
  ): Promise<ReconnectOutcome | "stopped"> {
    for (;;) {
      let found: ReconnectOutcome;
      try {
        found = await dev.reconnect!();
      } catch {
        found = { kind: "absent" };
      }
      if (found.kind !== "absent" || performance.now() - started >= CHECK_WINDOW_MS) {
        return found;
      }
      await pause(REOPEN_POLL_MS);
      if (epoch !== this.heartbeatEpoch) {
        return "stopped";
      }
    }
  }

  /** One pass: identity, status, and the device's signed latch over a fresh nonce. */
  private async checkOnce(dev: GuardDevice): Promise<CheckStep> {
    const noAnswer = (err: unknown, reason: string): CheckStep | null => {
      const code = transientDeviceError(err);
      return code ? { kind: "transient", code, reason } : null;
    };
    let id: Identity;
    try {
      id = await dev.getIdentity();
    } catch (err) {
      return (
        noAnswer(err, "enclaweder disconnected (no response)") ?? {
          kind: "definite",
          reason: `enclaweder identity check failed: ${(err as Error).message}`,
        }
      );
    }
    if (id.pubkeyRaw.toString("hex") !== this.state.bound?.pubkey) {
      return {
        kind: "definite",
        reason: "device key changed -- zeroized/re-minted or device swapped",
      };
    }
    if (this.state.bound?.uid && id.uid.toString("hex") !== this.state.bound.uid) {
      return { kind: "definite", reason: "device uid changed -- device swapped" };
    }
    let st: DeviceStatus;
    try {
      st = await dev.getStatus();
    } catch (err) {
      return (
        noAnswer(err, "enclaweder unresponsive") ?? {
          kind: "definite",
          reason: `enclaweder status check failed: ${(err as Error).message}`,
        }
      );
    }
    if (!BINDABLE_STATES.has(st.state)) {
      return { kind: "definite", reason: `enclaweder reported ${stateName(st.state)}` };
    }
    if (!dev.request) {
      return { kind: "definite", reason: "device latch unsupported" };
    }
    // The signed latch read over a fresh nonce is also the proof of possession.
    let latch: DeviceLatchState;
    try {
      latch = await readDeviceLatch(dev as LatchFrameDevice, id.pubkeyRaw, id.uid);
    } catch (err) {
      const reason = `device latch check failed: ${(err as Error).message}`;
      return noAnswer(err, reason) ?? { kind: "definite", reason };
    }
    return latch.state === "SET" ? { kind: "device-halt", latch } : { kind: "ok", latch };
  }

  private onHaltSafe(reason: string): void {
    try {
      this.onHalt(reason);
    } catch {
      /* a failing handler must not stop the halt */
    }
  }

  private markDirty(reason: string): void {
    if (this.state.status === "DIRTY") {
      return;
    }
    // Halt first: neither a failing handler nor a failing disk may skip it (finding H7).
    this.state.status = "DIRTY";
    this.state.dirty = {
      reason,
      at: Date.now(),
      lastGoodAt: this.state.lastGoodAt ?? 0,
      source: "host",
    };
    this.log({ kind: "halt", detail: reason, serial: this.state.bound?.serial });
    this.stopHeartbeat();
    this.onHaltSafe(reason);
    // Tell the device, which from now on holds it: under our session if we have one, else with
    // the set-only anonymous HALT. Best effort -- if the device is gone it is already armed.
    const s = this.session;
    const d = this.sessionDev;
    this.session = null;
    if (s) {
      void s
        .halt(HOST_HALT_CODE.GUARD_CHECK_FAILED)
        .catch(() =>
          d?.request
            ? haltDeviceAnonymous(d as LatchFrameDevice, HOST_HALT_CODE.GUARD_CHECK_FAILED).catch(
                () => undefined,
              )
            : undefined,
        );
    }
    this.trySave();
  }

  startHeartbeat(dev: GuardDevice, { intervalMs = 1000 }: { intervalMs?: number } = {}): void {
    this.stopHeartbeat();
    // Two missed beats plus one answer budget, never looser than what the caller configured.
    this.deviceStaleMs = Math.min(this.deviceStaleMs, 2 * intervalMs + this.answerBudgetMs);
    this.heartbeatStarted = true;
    const epoch = this.heartbeatEpoch;
    this.timer = setInterval(() => {
      if (this.checking) {
        return; // one check at a time: overlapping ticks only built a backlog in the device lane
      }
      this.checking = true;
      this.checkStartedAt = performance.now();
      void this.check(dev)
        .then((r) => {
          // Only this heartbeat's own failure stops it, never a later heartbeat's timer.
          if (!r.ok && epoch === this.heartbeatEpoch) {
            this.stopHeartbeat();
          }
        })
        .finally(() => {
          this.checking = false;
        });
    }, intervalMs);
    if (this.timer.unref) {
      this.timer.unref();
    }
  }
  stopHeartbeat(): void {
    this.heartbeatEpoch++;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Recovery. The DEVICE clears its latch, verifying the factors itself; this only relays them,
   * then accepts the outcome when a fresh signed LATCH_GET says CLEAR. There is no boolean
   * "confirmed" authority: a process of this user cannot clear anything by calling this.
   */
  async recover(
    dev: GuardDevice,
    auth: RecoveryAuth | { humanConfirmed?: boolean } = {},
  ): Promise<boolean> {
    if (!auth || !("kind" in auth)) {
      throw new HaltError(
        "recovery: a 'humanConfirmed' flag is no longer an authority. The Enclaweder clears its own latch only with two factors it verifies (an authenticator code or security key AND a one-time recovery code) or with the operator quorum: run `enclawed hardware-root recover`",
      );
    }
    const id = await dev.getIdentity().catch(() => null);
    if (!id) {
      throw new HaltError("recovery: no device present");
    }
    // A re-provisioned unit keeps its chip (factory UID) but gets a new key and a new birth
    // certificate. It may be adopted only as the SAME chip and SKU, only with a certificate the
    // pinned root signed for exactly this UID and key, and only once the device itself has
    // verified the person's factors (below). A different chip is never adopted here.
    const bound = this.state.bound;
    const keyChanged = !!bound?.pubkey && id.pubkeyRaw.toString("hex") !== bound.pubkey;
    if (keyChanged && (!bound?.uid || id.uid.toString("hex") !== bound.uid)) {
      throw new HaltError("recovery: present device is NOT the bound root of trust");
    }
    const cert = await dev.getCert();
    const parsedCert = cert ? verifyCert(cert, id.uid, id.pubkeyRaw, this.rootPubkey) : null;
    if (!parsedCert) {
      throw new HaltError("recovery: present device is not GENUINE");
    }
    if (keyChanged && bound?.sku && parsedCert.sku !== bound.sku) {
      throw new HaltError(
        "recovery: present device is NOT the bound root of trust (different SKU)",
      );
    }
    if (!dev.request) {
      throw new HaltError("recovery: device latch unsupported: update firmware");
    }
    const ldev = dev as GuardDevice & LatchFrameDevice;
    const serial =
      (parsedCert.sku === "pro" ? "ECPRO-" : "ENCLW-") + id.uid.toString("hex").toUpperCase();
    let latch = await readDeviceLatch(ldev, id.pubkeyRaw, id.uid);
    if (latch.state === "CLEAR" && this.state.status !== "DIRTY") {
      throw new Error("not DIRTY");
    }
    if (latch.state === "CLEAR") {
      // Host DIRTY, device clean: put the device in charge first, so this host file can never
      // be the thing that is cleared.
      await haltDeviceAnonymous(ldev, HOST_HALT_CODE.HOST_MIRROR);
      this.log({ kind: "pushed-to-device", detail: this.state.dirty?.reason, serial });
      latch = await readDeviceLatch(ldev, id.pubkeyRaw, id.uid);
    }
    const cleared = this.state.dirty ?? null;
    let via: "two-factor" | "operator-quorum";
    try {
      if (auth.kind === "two-factor") {
        via = "two-factor";
        await clearByTwoFactors(ldev, auth.recoveryCode, auth.factorA);
      } else {
        via = "operator-quorum";
        await clearByOperatorQuorum(ldev, id.pubkeyRaw, id.uid, auth.signers);
      }
    } catch (err) {
      this.log({
        kind: "halt",
        detail: `recovery refused by the device: ${(err as Error).message}`.slice(0, 300),
        serial,
      });
      this.trySave();
      // Every failed attempt is logged on the host too, then reconciled with the device's own
      // signed log: an entry the host never recorded is flagged.
      await recordHostAuthFailure({
        op: auth.kind === "two-factor" ? "latch-clear-two-factor" : "latch-clear-operator",
        reason: err instanceof DeviceLatchError ? err.code : "error",
        serial,
      });
      await reconcileDeviceFailures(ldev, id.pubkeyRaw, id.uid, this.statePath, serial, 1).catch(
        () => undefined,
      );
      throw new HaltError(`recovery refused by the device: ${(err as Error).message}`);
    } finally {
      if (auth.kind === "two-factor") {
        auth.recoveryCode.fill(0);
      }
    }
    const after = await readDeviceLatch(ldev, id.pubkeyRaw, id.uid);
    if (after.state !== "CLEAR") {
      throw new HaltError("recovery: the device still reports its latch SET");
    }
    if (keyChanged) {
      // Same chip, re-provisioned, and the device has just verified the person's factors: adopt
      // the new key. The history keeps the old binding (append-only).
      this.log({
        kind: "rebound",
        serial,
        deviceSeq: String(after.seq),
        detail: `re-provisioned unit adopted after ${via} recovery: key ${bound?.pubkey?.slice(0, 16)}... -> ${id.pubkeyRaw.toString("hex").slice(0, 16)}...`,
      });
      this.state.bound = {
        serial,
        pubkey: id.pubkeyRaw.toString("hex"),
        uid: id.uid.toString("hex"),
        sku: parsedCert.sku,
      };
      this.state.boundAt = Date.now();
    }
    this.state.status = "CLEAN";
    this.state.dirty = null;
    this.state.lastGoodAt = Date.now();
    this.state.sessionOpen = false; // only after a successful recovery (finding H4)
    this.state.recoveries = (this.state.recoveries ?? []).concat([
      { at: Date.now(), cleared, via, deviceSeq: String(after.seq) },
    ]);
    this.log({
      kind: "recovered",
      via,
      serial,
      deviceSeq: String(after.seq),
      detail: cleared?.reason,
    });
    this.mirrorDevice(after);
    this.saveState();
    return true;
  }
}
