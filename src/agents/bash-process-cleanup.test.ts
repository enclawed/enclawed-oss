import { spawn } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { getProcessSupervisor } from "../process/supervisor/index.js";
import { terminateBackgroundExecSessions } from "./bash-process-cleanup.js";
import { addSession, resetProcessRegistryForTests } from "./bash-process-registry.js";
import { createProcessSessionFixture } from "./bash-process-registry.test-helpers.js";

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitDead(pid: number, ms = 5_000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (!alive(pid)) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return !alive(pid);
}

describe.skipIf(process.platform === "win32")("terminateBackgroundExecSessions", () => {
  afterEach(() => {
    resetProcessRegistryForTests();
  });

  it("cancels a supervised background session that would never exit on its own", async () => {
    // cat on an open stdin pipe waits forever, like awk given no file.
    const run = await getProcessSupervisor().spawn({
      runId: "bg-stdin",
      sessionId: "bg-stdin",
      backendId: "exec-host",
      mode: "child",
      argv: ["cat"],
      stdinMode: "pipe-open",
    });
    addSession(createProcessSessionFixture({ id: "bg-stdin", backgrounded: true, pid: run.pid }));

    expect(terminateBackgroundExecSessions()).toBe(1);
    const exit = await run.wait();
    expect(exit.reason).toBe("manual-cancel");
  });

  it("kills the process tree of a background session the supervisor does not hold", async () => {
    const child = spawn("sleep", ["60"], { detached: true, stdio: "ignore" });
    child.unref();
    const pid = child.pid as number;
    addSession(createProcessSessionFixture({ id: "bg-raw", backgrounded: true, pid }));

    expect(terminateBackgroundExecSessions()).toBe(1);
    expect(await waitDead(pid)).toBe(true);
  });

  it("leaves sessions that are not backgrounded alone", async () => {
    const child = spawn("sleep", ["60"], { detached: true, stdio: "ignore" });
    child.unref();
    const pid = child.pid as number;
    addSession(createProcessSessionFixture({ id: "fg", backgrounded: false, pid }));
    try {
      expect(terminateBackgroundExecSessions()).toBe(0);
      expect(alive(pid)).toBe(true);
    } finally {
      process.kill(-pid, "SIGKILL");
    }
  });
});
