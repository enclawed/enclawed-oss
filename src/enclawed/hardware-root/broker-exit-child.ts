// Test helper for broker.test.ts: a process that uses the owner's socket and
// then simply returns, never calling process.exit. Whether it exits on its own
// is what the test checks.
//
//   tsx broker-exit-child.ts client SOCKET   connect, sign once, report, return
//   tsx broker-exit-child.ts owner SOCKET    claim the socket, serve, report, return
import { claimOwnership, connectRoot, schedulerFor, serveRoot } from "./broker.js";

const [mode, socketPath] = process.argv.slice(2);
const say = (o: Record<string, unknown>) => process.stdout.write(JSON.stringify(o) + "\n");

if (mode === "client") {
  const root = await connectRoot(socketPath, 50);
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
