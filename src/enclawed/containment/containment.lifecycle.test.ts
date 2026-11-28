// Lifecycle of a containment in the parent process: the guard that runs is
// the verified one, a containment whose setup fails inside releases its
// sockets by itself, and a contained server that ends normally lets the
// parent exit (nothing of the containment holds its event loop).

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NAME_GUARD_PREBUILT } from "../prebuilt/name-guard.generated.js";
import { containmentSupport } from "./host.js";
import { containMcpServer } from "./mcp.js";
import { ensureNameGuard, nameGuardDigest } from "./name-guard.js";
import { FIXTURES, fakeHome, planContext, tempTree } from "./test-helpers.js";

const live = containmentSupport().ok;
const here = path.dirname(fileURLToPath(import.meta.url));

describe.skipIf(!live)("containment lifecycle", () => {
  let root: string;
  let home: string;
  let stateDir: string;
  beforeAll(() => {
    root = tempTree("contain-life");
    home = fakeHome(root);
    stateDir = path.join(root, "state");
  });
  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("the guard is the prebuilt, verified one when it matches this source, and a changed guard file is not run", async () => {
    const g = ensureNameGuard(stateDir);
    expect(g.ok).toBe(true);
    if (!g.ok) {
      return;
    }
    expect(nameGuardDigest(g.binary)).toBe(g.sha256);
    // Built from this very source, so the prebuilt one is used (no compiler needed).
    expect(g.sha256).toBe(
      (NAME_GUARD_PREBUILT.binaries as Record<string, string | null>)[`linux-${process.arch}`],
    );
    const proj = path.join(root, "tamper");
    fs.mkdirSync(proj);
    const out = await containMcpServer(
      { name: "fs", command: "node", args: [path.join(FIXTURES, "fs-server.cjs"), proj] },
      { roots: [{ path: proj, access: "rw" }], packageRoot: FIXTURES },
      { stateDir },
      planContext(home),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) {
      return;
    }
    // The verified file is replaced between verification and exec.
    fs.chmodSync(g.binary, 0o755);
    const original = fs.readFileSync(g.binary);
    fs.writeFileSync(g.binary, Buffer.concat([original, Buffer.from("tampered")]));
    try {
      const r = spawnSync(out.containment.argv[0], out.containment.argv.slice(1), {
        env: { ...out.containment.env },
        encoding: "utf8",
        input: "",
        timeout: 30_000,
      });
      expect(r.status).toBe(126);
      expect(r.stderr).toMatch(/changed after it was verified/);
    } finally {
      fs.writeFileSync(g.binary, original);
      await out.containment.close();
    }
  });

  it("a containment whose setup fails inside closes its relay and event sockets by itself", async () => {
    const proj = path.join(root, "vanishing");
    fs.mkdirSync(proj);
    const out = await containMcpServer(
      { name: "fs", command: "node", args: [path.join(FIXTURES, "fs-server.cjs"), proj] },
      { roots: [{ path: proj, access: "rw" }], packageRoot: FIXTURES },
      { stateDir },
      planContext(home),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) {
      return;
    }
    const cfg = JSON.parse(out.containment.env.ENCLAWED_CONTAIN) as {
      relaySock: string;
      eventSock: string;
      sockDir: string;
    };
    // The root goes away before start: the view cannot be built.
    fs.rmSync(proj, { recursive: true });
    const child = spawn(out.containment.argv[0], out.containment.argv.slice(1), {
      env: { ...out.containment.env },
      stdio: ["pipe", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
    const code = await new Promise<number | null>((r) => child.on("exit", (c) => r(c)));
    expect(code, stderr).toBe(126);
    // No close() from the caller: the sockets and their directory still go.
    const end = Date.now() + 3000;
    while (fs.existsSync(cfg.sockDir) && Date.now() < end) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(fs.existsSync(cfg.sockDir)).toBe(false);
    const refused = await new Promise<string>((resolve) => {
      const s = net.connect(cfg.relaySock);
      s.on("connect", () => {
        s.destroy();
        resolve("connected");
      });
      s.on("error", (e: NodeJS.ErrnoException) => resolve(e.code ?? "error"));
    });
    expect(refused).toBe("ENOENT");
    await out.containment.close(); // still safe to call
  });

  it("a contained server that ends normally lets the parent process exit without close() or a kill", async () => {
    const proj = path.join(root, "exit");
    fs.mkdirSync(proj);
    const script = path.join(root, "parent.mts");
    fs.writeFileSync(
      script,
      `
import { spawn } from "node:child_process";
const { containMcpServer } = await import(${JSON.stringify(path.join(here, "mcp.ts"))});
const out = await containMcpServer(
  { name: "fs", command: "node", args: [${JSON.stringify(path.join(FIXTURES, "fs-server.cjs"))}, ${JSON.stringify(proj)}] },
  { roots: [{ path: ${JSON.stringify(proj)}, access: "rw" }], packageRoot: ${JSON.stringify(FIXTURES)} },
  { stateDir: ${JSON.stringify(stateDir)} },
  ${JSON.stringify(planContext(home))},
);
if (!out.ok) { console.error(out.message); process.exit(3); }
const child = spawn(out.containment.argv[0], out.containment.argv.slice(1), { env: { ...out.containment.env }, stdio: ["pipe", "pipe", "inherit"] });
child.stdout.on("data", (d) => { if (String(d).includes('"id":1')) { console.log("INITIALIZED"); child.stdin.end(); } });
child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } }) + "\\n");
`,
    );
    const started = Date.now();
    const parent = spawn(process.execPath, ["--import", "tsx", script], {
      cwd: path.join(here, "..", "..", ".."),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    parent.stdout.on("data", (d: Buffer) => (output += d.toString("utf8")));
    parent.stderr.on("data", (d: Buffer) => (output += d.toString("utf8")));
    const code = await new Promise<number | null | "hung">((resolve) => {
      const t = setTimeout(() => {
        parent.kill("SIGKILL");
        resolve("hung");
      }, 30_000);
      parent.on("exit", (c) => {
        clearTimeout(t);
        resolve(c);
      });
    });
    expect([code, output]).toEqual([0, expect.stringContaining("INITIALIZED")]);
    expect(Date.now() - started).toBeLessThan(30_000);
  }, 60_000);
});
