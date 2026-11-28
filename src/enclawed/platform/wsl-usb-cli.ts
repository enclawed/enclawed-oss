/**
 * Node-backed runner for the WSL USB setup ({@link ./wsl-usb.ts}): real fs / child_process /
 * readline deps, and the entry points shared by `enclawed hardware-root wsl-setup`, `enclawed
 * doctor`, `enclawed hardware-root status` and the installers.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import {
  describeWslUsbStatus,
  detectWsl,
  gatherWslUsbStatus,
  runWslUsbSetup,
  type RunOptions,
  type RunResult,
  type WslUsbDeps,
  type WslUsbSetupOutcome,
  type WslUsbStatus,
} from "./wsl-usb.js";

function readFileOrNull(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function readDirOrEmpty(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function whichOnPath(command: string, env: NodeJS.ProcessEnv): string | null {
  for (const dir of (env.PATH ?? "").split(path.delimiter)) {
    if (!dir) {
      continue;
    }
    const candidate = path.join(dir, command);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // keep looking
    }
  }
  return null;
}

function runProcess(command: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result: RunResult) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(result);
      }
    };
    const child = spawn(command, args, {
      stdio: opts.interactive
        ? "inherit"
        : [
            opts.input === undefined ? "ignore" : "pipe",
            "pipe",
            opts.input === undefined ? "pipe" : "inherit",
          ],
      // Windows programs started from a Linux cwd print a UNC warning; /mnt/c is quieter.
      cwd: command.endsWith(".exe") && fs.existsSync("/mnt/c") ? "/mnt/c" : undefined,
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ code: null, stdout, stderr, spawnError: "timeout" });
    }, opts.timeoutMs ?? 60_000);
    child.stdout?.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
    child.stderr?.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
    child.on("error", (err: NodeJS.ErrnoException) =>
      finish({ code: null, stdout, stderr, spawnError: err.code ?? err.message }),
    );
    child.on("close", (code) => finish({ code, stdout, stderr }));
    if (opts.input !== undefined) {
      child.stdin?.end(opts.input);
    }
  });
}

async function confirmOnTerminal(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(question)).trim();
    return answer === "" || /^y(es)?$/i.test(answer);
  } finally {
    rl.close();
  }
}

export function createNodeWslUsbDeps(
  overrides: Partial<Pick<WslUsbDeps, "log" | "confirm">> = {},
): WslUsbDeps {
  const env = process.env;
  return {
    env,
    readFile: readFileOrNull,
    readDir: readDirOrEmpty,
    exists: (p) => fs.existsSync(p),
    canReadWrite: (p) => {
      try {
        fs.accessSync(p, fs.constants.R_OK | fs.constants.W_OK);
        return true;
      } catch {
        return false;
      }
    },
    which: (c) => whichOnPath(c, env),
    run: runProcess,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
    userName: os.userInfo().username,
    isRoot: typeof process.getuid === "function" && process.getuid() === 0,
    activeGroupIds: typeof process.getgroups === "function" ? process.getgroups() : [],
    log: overrides.log ?? ((line) => console.log(`  ${line}`)),
    confirm: overrides.confirm ?? confirmOnTerminal,
  };
}

/** Cheap, synchronous: no Windows call. Callers use it to skip the whole check off WSL. */
export function isWslHost(): boolean {
  return detectWsl({ env: process.env, readFile: readFileOrNull });
}

export function wslUsbExitCode(outcome: WslUsbSetupOutcome, installer: boolean): number {
  switch (outcome) {
    case "ready":
    case "ready-relogin":
    case "not-wsl":
      return 0;
    case "no-device":
    case "report-only":
      return installer ? 0 : 1;
    default:
      return 1;
  }
}

export type WslUsbSetupCliOptions = {
  yes?: boolean;
  nonInteractive?: boolean;
  installer?: boolean;
  confirm?: (question: string) => Promise<boolean>;
  log?: (line: string) => void;
};

/** `enclawed hardware-root wsl-setup` (and the installers): returns the process exit code. */
export async function wslUsbSetupCli(opts: WslUsbSetupCliOptions = {}): Promise<number> {
  const deps = createNodeWslUsbDeps({ log: opts.log, confirm: opts.confirm });
  if (!detectWsl(deps)) {
    deps.log("Not running under WSL; nothing to set up.");
    return 0;
  }
  const interactive = !opts.nonInteractive && (Boolean(opts.confirm) || process.stdin.isTTY);
  const { outcome } = await runWslUsbSetup(deps, {
    mode: interactive ? "interactive" : "non-interactive",
    assumeYes: opts.yes,
    installer: opts.installer,
  });
  return wslUsbExitCode(outcome, opts.installer === true);
}

/** Read-only: the WSL USB status (no prompts, no elevation, no sudo). */
export async function wslUsbStatus(): Promise<WslUsbStatus> {
  return gatherWslUsbStatus(createNodeWslUsbDeps());
}

export { describeWslUsbStatus, wslUsbRelevant } from "./wsl-usb.js";
