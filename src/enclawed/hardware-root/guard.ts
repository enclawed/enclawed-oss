// TypeScript port of the fail-secure hardware-root guard. Vendored from
// enclaweder/integration/enclawed/hardware-root-guard.mjs -- keep in sync with that source.
//
// Once enclawed boots WITH the enclaweder, the guard binds the device identity and continuously
// proves the SAME genuine device is present, holds its key, and is not zeroized. If the enclaweder
// disconnects or zeroizes, the guard HALTS all operations and latches a persistent DIRTY state that
// survives restarts, does NOT auto-clear on reconnect (anti device-swap), and clears ONLY by an
// explicit human recovery with the genuine bound device present.
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import {
  verifyChallenge,
  verifyCert,
  ACC_STATE,
  type Identity,
  type DeviceStatus,
  type ChallengeResponse,
} from "./enclaweder-hid.js";

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
}

interface BoundInfo {
  serial: string;
  pubkey: string;
  uid: string;
}
interface DirtyInfo {
  reason: string;
  at: number;
  lastGoodAt: number;
}
interface GuardState {
  status: "UNBOUND" | "CLEAN" | "DIRTY";
  bound?: BoundInfo | null;
  boundAt?: number;
  lastGoodAt?: number;
  dirty?: DirtyInfo | null;
  recoveries?: Array<{ at: number; cleared: DirtyInfo | null }>;
}

export class HardwareRootGuard {
  private statePath: string;
  private onHalt: (reason: string) => void;
  private state: GuardState;
  private timer: NodeJS.Timeout | null = null;
  private rootPubkey: Buffer | null;

  constructor({
    statePath = "./.hw-root.state",
    onHalt,
    rootPubkey,
  }: {
    statePath?: string;
    onHalt?: (r: string) => void;
    rootPubkey?: Buffer;
  } = {}) {
    this.statePath = statePath;
    this.onHalt = onHalt ?? (() => {});
    // null => accept any PINNED trust domain (base or Pro), each of which may only have issued its
    // own model. Passing an explicit root demands that one root, which is how a deployment requires
    // a single SKU and how the tests pin a throwaway root. Defaulting to the base root -- as this
    // did -- silently rejected every genuine Pro unit.
    this.rootPubkey = rootPubkey ?? null; // trust anchor for the GENUINE gate
    this.state = this.loadState(); // persisted -> survives restart
  }
  private loadState(): GuardState {
    try {
      return JSON.parse(fs.readFileSync(this.statePath, "utf8")) as GuardState;
    } catch {
      return { status: "UNBOUND" };
    }
  }
  private saveState(): void {
    fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
  }
  get status(): string {
    return this.state.status;
  }
  get bound(): BoundInfo | null {
    return this.state.bound ?? null;
  }

  /** Gate every accredited operation. Throws HaltError unless CLEAN. */
  assertClean(): void {
    if (this.state.status !== "CLEAN") {
      throw new HaltError(
        this.state.status === "DIRTY"
          ? `hardware root DIRTY: ${this.state.dirty?.reason} -- human recovery required`
          : `hardware root not bound (${this.state.status})`,
      );
    }
  }

  /** Bind at boot. Refuses to start clean if a prior DIRTY latch persists. */
  async boot(dev: GuardDevice): Promise<BoundInfo> {
    if (this.state.status === "DIRTY") {
      throw new HaltError(
        `refusing to boot: hardware root was left DIRTY (${this.state.dirty?.reason}) -- human recovery required`,
      );
    }
    const id = await dev.getIdentity();
    const st = await dev.getStatus();
    const nonce = randomBytes(32);
    const chal = await dev.challenge(nonce);
    if (!verifyChallenge(id.pubkeyRaw, nonce, chal.uid, chal.sig)) {
      throw new HaltError("boot challenge failed");
    }
    // GENUINE gate: challenge-response only proves the device holds SOME key. A hardware root of trust
    // must be a MANUFACTURER-CERTIFIED device, so require a birth certificate that chains to the pinned
    // root AND certifies this exact device (uid + key). Without it a zeroized/re-minted or counterfeit
    // unit would bind. (Same certificate-chain check as provisioning/verify.py.)
    const cert = await dev.getCert();
    if (!cert || !verifyCert(cert, id.uid, id.pubkeyRaw, this.rootPubkey)) {
      throw new HaltError(
        "device not GENUINE -- no valid manufacturer certificate for this key (uncertified, counterfeit, or zeroized)",
      );
    }
    if (st.state === ACC_STATE.ZEROIZED) {
      throw new HaltError("device is ZEROIZED at boot");
    }
    this.state = {
      status: "CLEAN",
      bound: {
        serial: id.serial,
        pubkey: id.pubkeyRaw.toString("hex"),
        uid: id.uid.toString("hex"),
      },
      boundAt: Date.now(),
      lastGoodAt: Date.now(),
      dirty: null,
    };
    this.saveState();
    return this.bound as BoundInfo;
  }

  /** One liveness check; latches DIRTY on any failure. */
  async check(dev: GuardDevice): Promise<{ ok: boolean; reason?: string }> {
    if (this.state.status === "DIRTY") {
      return { ok: false, reason: this.state.dirty?.reason };
    }
    const fail = (reason: string): { ok: false; reason: string } => {
      this.markDirty(reason);
      return { ok: false, reason };
    };
    let id: Identity;
    let st: DeviceStatus;
    try {
      id = await dev.getIdentity();
    } catch {
      return fail("enclaweder disconnected (no response)");
    }
    if (id.pubkeyRaw.toString("hex") !== this.state.bound?.pubkey) {
      return fail("device key changed -- zeroized/re-minted or device swapped");
    }
    try {
      st = await dev.getStatus();
    } catch {
      return fail("enclaweder unresponsive");
    }
    if (st.state === ACC_STATE.ZEROIZED) {
      return fail("enclaweder reported ZEROIZED");
    }
    const nonce = randomBytes(32);
    let chal: ChallengeResponse;
    try {
      chal = await dev.challenge(nonce);
    } catch {
      return fail("challenge unanswered");
    }
    if (!verifyChallenge(id.pubkeyRaw, nonce, chal.uid, chal.sig)) {
      return fail("challenge signature invalid");
    }
    this.state.lastGoodAt = Date.now();
    this.saveState();
    return { ok: true };
  }

  private markDirty(reason: string): void {
    if (this.state.status === "DIRTY") {
      return;
    }
    this.state.status = "DIRTY";
    this.state.dirty = {
      reason,
      at: Date.now(),
      lastGoodAt: this.state.lastGoodAt ?? 0,
    };
    this.saveState();
    this.onHalt(reason);
  }

  startHeartbeat(dev: GuardDevice, { intervalMs = 1000 }: { intervalMs?: number } = {}): void {
    this.stopHeartbeat();
    this.timer = setInterval(() => {
      void this.check(dev).then((r) => {
        if (!r.ok) {
          this.stopHeartbeat();
        }
      });
    }, intervalMs);
    if (this.timer.unref) {
      this.timer.unref();
    }
  }
  stopHeartbeat(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Human-only recovery: DIRTY + explicit human confirmation + the GENUINE bound device present. */
  async recover(
    dev: GuardDevice,
    { humanConfirmed }: { humanConfirmed?: boolean } = {},
  ): Promise<boolean> {
    if (this.state.status !== "DIRTY") {
      throw new Error("not DIRTY");
    }
    if (humanConfirmed !== true) {
      throw new HaltError("recovery requires explicit human confirmation");
    }
    const id = await dev.getIdentity().catch(() => null);
    if (!id) {
      throw new HaltError("recovery: no device present");
    }
    if (id.pubkeyRaw.toString("hex") !== this.state.bound?.pubkey) {
      throw new HaltError("recovery: present device is NOT the bound root of trust");
    }
    const nonce = randomBytes(32);
    const chal = await dev.challenge(nonce);
    if (!verifyChallenge(id.pubkeyRaw, nonce, chal.uid, chal.sig)) {
      throw new HaltError("recovery: device failed challenge");
    }
    const cleared = this.state.dirty ?? null;
    this.state.status = "CLEAN";
    this.state.dirty = null;
    this.state.lastGoodAt = Date.now();
    this.state.recoveries = (this.state.recoveries ?? []).concat([{ at: Date.now(), cleared }]);
    this.saveState();
    return true;
  }
}
