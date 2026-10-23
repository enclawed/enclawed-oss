// Test helper: one Enclawed process on a machine with Enclaweders, driven by
// the hardware tests. It boots the hardware root through the real bootstrap
// and prints one JSON line per event on stdout.
//
//   tsx test-child.ts sign N      boot, sign N digests, report, exit
//   tsx test-child.ts hold        boot, report, then report health every 200 ms
//                                  until killed (signing once per report)
import { HardwareRootGuard } from "./guard.js";
import {
  assertHardwareClean,
  bootHardwareRoot,
  hardwareRootHealth,
  hardwareRootSigning,
} from "./index.js";

const say = (o: Record<string, unknown>) => process.stdout.write(JSON.stringify(o) + "\n");
const [mode, arg] = process.argv.slice(2);

async function signOnce(i: number) {
  const s = hardwareRootSigning();
  if (!s) {
    throw new Error("no signing");
  }
  const digest = Buffer.alloc(32, (i % 250) + 1);
  digest.writeUInt32BE(process.pid, 0);
  const r = await s.run((dev) => dev.challenge(digest));
  return { digest: digest.toString("hex"), uid: r.uid.toString("hex"), sig: r.sig.toString("hex") };
}

try {
  const root = await bootHardwareRoot();
  const role = root instanceof HardwareRootGuard ? "owner" : root ? "client" : "none";
  let clean = true;
  try {
    assertHardwareClean();
  } catch {
    clean = false;
  }
  say({ event: "booted", pid: process.pid, role, clean, members: hardwareRootSigning()?.members });
  if (mode === "sign") {
    const sigs = [];
    const t0 = Date.now();
    for (let i = 0; i < Number(arg); i++) {
      sigs.push(await signOnce(i));
    }
    say({ event: "signed", sigs, ms: Date.now() - t0 });
    process.exit(0);
  }
  if (mode === "hold") {
    let i = 0;
    setInterval(() => {
      const h = hardwareRootHealth();
      void (
        h.status === "CLEAN"
          ? signOnce(i++).then(
              () => true,
              () => false,
            )
          : Promise.resolve(false)
      ).then((signed) => say({ event: "health", health: h, signed }));
    }, 200);
  }
} catch (err) {
  say({ event: "error", message: (err as Error).message });
  process.exit(1);
}
