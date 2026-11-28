import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { privateSessionRoot } from "./adapter/scratch.js";
import { privateSocketDir, SESSION_ROOT_MAX_BYTES } from "./unix-socket-dir.js";

// A TMPDIR long enough that a socket under it cannot be bound (the case a long CI or
// sandbox temp directory produces).
const longTmp = path.join(os.tmpdir(), "t".repeat(60), "u".repeat(40));
fs.mkdirSync(longTmp, { recursive: true });
afterAll(() => fs.rmSync(path.join(os.tmpdir(), "t".repeat(60)), { recursive: true, force: true }));

const listen = (p: string) =>
  new Promise<void>((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(p, () => s.close(() => resolve()));
  });

describe("directories for Unix sockets under a long TMPDIR", () => {
  it("a socket directory is chosen where its sockets can be bound", async () => {
    const dir = privateSocketDir("ecw-test-", { env: { TMPDIR: longTmp }, maxName: 10 });
    try {
      expect(Buffer.byteLength(path.join(dir, "relay.sock"))).toBeLessThanOrEqual(100);
      expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
      await listen(path.join(dir, "relay.sock"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a session root under a too-long TMPDIR is skipped for one that leaves room for its sockets", () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), "proj-"));
    try {
      const root = privateSessionRoot({
        env: { TMPDIR: longTmp },
        projectDir: path.join(os.homedir(), "nonexistent-project-for-test"),
        name: "socktest",
        stateDir: path.join(longTmp, "state"),
      });
      expect(root.startsWith(longTmp)).toBe(false);
      expect(Buffer.byteLength(root)).toBeLessThanOrEqual(SESSION_ROOT_MAX_BYTES);
    } finally {
      fs.rmSync(project, { recursive: true, force: true });
    }
  });
});
