// Test helper for broker.test.ts: a process that uses the owner's socket and
// then simply returns, never calling process.exit. Whether it exits on its own
// is what the test checks.
//
//   tsx broker-exit-child.ts client SOCKET   connect, sign once, report, return
//   tsx broker-exit-child.ts owner SOCKET    claim the socket, serve, report, return
//   tsx broker-exit-child.ts boot SOCKET ROOT boot the hardware root with no device visible
//                                            (ENCLAWEDER_BROKER=SOCKET), report health, exit
import { claimOwnership, connectRoot, schedulerFor, serveRoot } from "./broker.js";

const [mode, socketPath, rootHex] = process.argv.slice(2);
const say = (o: Record<string, unknown>) => process.stdout.write(JSON.stringify(o) + "\n");

if (mode === "client") {
  // The owner's devices are certified by the test's throwaway root (finding H1: a client
  // trusts only devices whose certificates verify).
  const root = await connectRoot(socketPath, 50, {
    rootPubkey: rootHex ? Buffer.from(rootHex, "hex") : null,
  });
  const r = await root!.device().challenge(Buffer.alloc(32, 7));
  say({ event: "signed", sig: r.sig.toString("hex") });
} else if (mode === "owner") {
  const server = await claimOwnership(socketPath);
  const svc = {
    members: () => [{ uid: "01".repeat(12), pubkey: "00".repeat(32), serial: "S" }],
    run: <T>(fn: (dev: never) => Promise<T>) => fn(undefined as never),
    health: () => ({ status: "CLEAN" as const }),
  };
  serveRoot(server!, Promise.resolve({ svc, scheduler: schedulerFor(svc) }));
  say({ event: "serving" });
}
if (mode === "boot") {
  process.env.ENCLAWEDER_BROKER = socketPath;
  const { bootHardwareRoot, hardwareRootHealth } = await import("./index.js");
  try {
    const r = await bootHardwareRoot({ rootPubkey: Buffer.from(rootHex, "hex") });
    say({ event: "booted", role: r ? "client" : "none", health: hardwareRootHealth() });
  } catch (err) {
    say({ event: "refused", message: (err as Error).message });
  }
  process.exit(0);
}
