import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  AUTO_ATTACH_TASK_NAME,
  UDEV_RULE,
  UDEV_RULE_PATH,
  describeWslUsbStatus,
  detectWsl,
  elevatedSetupScript,
  gatherWslUsbStatus,
  parseUsbipdState,
  rulesTextCoversEnclaweder,
  runWslUsbSetup,
  wslConfDisablesInterop,
  wslUsbRelevant,
  type RunOptions,
  type RunResult,
  type WslUsbDeps,
} from "./wsl-usb.js";

// A fake WSL machine. Nothing here touches the real filesystem, powershell.exe, usbipd or
// /dev/hidraw*: every Windows call is answered from `win`, every Linux read from `files`.

const PS = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
const USBIPD = "C:\\Program Files\\usbipd-win\\usbipd.exe";
const ATTACH_ARGS = "attach --wsl --hardware-id 1209:e100 --auto-attach";
const HIDRAW_UEVENT = "DRIVER=hid-generic\nHID_ID=0003:00001209:0000E100\nHID_NAME=Enclaweder\n";

type WinState = {
  interop: boolean;
  usbipd: boolean;
  usbipdVersion: string;
  winget: boolean;
  plugged: boolean;
  bound: boolean;
  attached: boolean;
  task: null | { state: string; arguments: string };
  elevation: "accept" | "refuse";
  wingetInstalls: boolean;
};

type Machine = {
  win: WinState;
  files: Map<string, string>;
  dirs: Map<string, string[]>;
  devNodes: Set<string>;
  accessible: Set<string>;
  activeGroupIds: number[];
  calls: Array<{ cmd: string; args: string[]; opts?: RunOptions; script?: string }>;
  logs: string[];
  confirmAnswer: boolean;
  confirms: string[];
  clock: number;
};

function decodeScript(args: string[]): string | undefined {
  const i = args.indexOf("-EncodedCommand");
  return i >= 0 ? Buffer.from(args[i + 1], "base64").toString("utf16le") : undefined;
}

function plugInLinux(m: Machine): void {
  m.dirs.set("/sys/class/hidraw", ["hidraw0"]);
  m.files.set("/sys/class/hidraw/hidraw0/device/uevent", HIDRAW_UEVENT);
  m.devNodes.add("/dev/hidraw0");
}

function windowsStatusJson(w: WinState): string {
  const state = w.usbipd
    ? JSON.stringify({
        Devices: w.plugged
          ? [
              {
                BusId: "2-3",
                ClientIPAddress: w.attached ? "172.20.0.2" : null,
                Description: "USB Input Device",
                InstanceId: "USB\\VID_1209&PID_E100\\ECPRO-0035",
                IsForced: false,
                PersistedGuid: w.bound ? "8a2c-..." : null,
                StubInstanceId: null,
              },
            ]
          : [],
      })
    : null;
  return `\uFEFF${JSON.stringify({
    usbipd: w.usbipd ? USBIPD : null,
    version: w.usbipd ? w.usbipdVersion : null,
    state,
    task: w.task,
    pnp: w.plugged,
    winget: w.winget,
    user: "HOST\\person",
  })}\r\n`;
}

function makeMachine(partial: Partial<WinState> = {}): Machine {
  const m: Machine = {
    win: {
      interop: true,
      usbipd: true,
      usbipdVersion: "4.3.0+59.Branch.master",
      winget: true,
      plugged: true,
      bound: false,
      attached: false,
      task: null,
      elevation: "accept",
      wingetInstalls: true,
      ...partial,
    },
    files: new Map([
      ["/proc/version", "Linux version 6.6.0-microsoft-standard-WSL2"],
      ["/etc/group", "root:x:0:\nplugdev:x:46:\nperson:x:1000:\n"],
    ]),
    dirs: new Map([["/proc/sys/fs/binfmt_misc", ["register", "status", "WSLInterop"]]]),
    devNodes: new Set(["/run/udev/control"]),
    accessible: new Set(),
    activeGroupIds: [1000],
    calls: [],
    logs: [],
    confirmAnswer: true,
    confirms: [],
    clock: 0,
  };
  m.files.set("/proc/sys/fs/binfmt_misc/WSLInterop", "enabled\ninterpreter /init\n");
  return m;
}

/** A machine already fully set up (the state after a successful run, after re-login). */
function makeConfiguredMachine(): Machine {
  const m = makeMachine({
    bound: true,
    attached: true,
    task: {
      state: "Running",
      arguments: `-NoProfile -WindowStyle Hidden -Command & '${USBIPD}' ${ATTACH_ARGS}`,
    },
  });
  m.files.set("/etc/group", "plugdev:x:46:person\n");
  m.activeGroupIds = [1000, 46];
  m.dirs.set("/etc/udev/rules.d", ["99-enclaweder.rules"]);
  m.files.set("/etc/udev/rules.d/99-enclaweder.rules", UDEV_RULE);
  plugInLinux(m);
  m.accessible.add("/dev/hidraw0");
  return m;
}

function depsFor(m: Machine): WslUsbDeps {
  const run = async (cmd: string, args: string[], opts?: RunOptions): Promise<RunResult> => {
    const script = decodeScript(args);
    m.calls.push({ cmd, args, opts, script });
    const ok = (stdout = ""): RunResult => ({ code: 0, stdout, stderr: "" });
    if (cmd === PS) {
      if (!m.win.interop) {
        return { code: 2, stdout: "", stderr: "MZ: not found", spawnError: undefined };
      }
      if (script === "exit 0") {
        return ok();
      }
      if (script?.includes("ConvertTo-Json")) {
        return ok(windowsStatusJson(m.win));
      }
      if (script?.startsWith("winget ")) {
        if (m.win.wingetInstalls) {
          m.win.usbipd = true;
          m.win.usbipdVersion = "4.4.0";
        }
        return { code: m.win.wingetInstalls ? 0 : 1, stdout: "", stderr: "" };
      }
      if (script?.includes("-Verb RunAs")) {
        if (m.win.elevation === "refuse") {
          return { code: 1223, stdout: "", stderr: "" };
        }
        const inner = Buffer.from(
          /'-EncodedCommand','([^']+)'/.exec(script)?.[1] ?? "",
          "base64",
        ).toString("utf16le");
        if (inner.includes(" bind --hardware-id 1209:e100")) {
          m.win.bound = true;
        }
        if (inner.includes("Register-ScheduledTask")) {
          m.win.task = {
            state: "Running",
            arguments: `-NoProfile -WindowStyle Hidden -Command & '${USBIPD}' ${ATTACH_ARGS}`,
          };
          // The auto-attach loop hands the device to Linux.
          m.win.attached = true;
          plugInLinux(m);
        }
        return ok();
      }
      if (script?.startsWith("Start-ScheduledTask")) {
        if (m.win.task) {
          m.win.task.state = "Running";
        }
        return ok();
      }
      throw new Error(`unexpected powershell script: ${script}`);
    }
    if (cmd === "sudo") {
      const [sub, ...rest] = args;
      if (sub === "usermod") {
        m.files.set(
          "/etc/group",
          m.files.get("/etc/group")!.replace("plugdev:x:46:", `plugdev:x:46:${rest[2]}`),
        );
      } else if (sub === "groupadd") {
        m.files.set("/etc/group", `${m.files.get("/etc/group")}plugdev:x:46:\n`);
      } else if (sub === "tee") {
        m.dirs.set("/etc/udev/rules.d", ["99-enclaweder.rules"]);
        m.files.set(rest[0], opts?.input ?? "");
      }
      return ok();
    }
    throw new Error(`unexpected command: ${cmd} ${args.join(" ")}`);
  };
  return {
    env: {},
    readFile: (p) => m.files.get(p) ?? null,
    readDir: (p) => m.dirs.get(p) ?? [],
    exists: (p) => p === PS || m.devNodes.has(p),
    canReadWrite: (p) => m.accessible.has(p),
    which: () => null,
    run,
    sleep: async (ms) => {
      m.clock += ms;
    },
    now: () => m.clock,
    userName: "person",
    isRoot: false,
    activeGroupIds: m.activeGroupIds,
    log: (line) => m.logs.push(line),
    confirm: async (q) => {
      m.confirms.push(q);
      return m.confirmAnswer;
    },
  };
}

const MUTATING = (c: Machine["calls"][number]) =>
  c.cmd === "sudo" ||
  Boolean(
    c.script &&
    (c.script.includes("-Verb RunAs") ||
      c.script.startsWith("winget ") ||
      c.script.startsWith("Start-ScheduledTask")),
  );

describe("WSL detection", () => {
  it("recognizes WSL from /proc/version or the WSL environment", () => {
    expect(
      detectWsl({ env: {}, readFile: () => "Linux version 6.6.0-microsoft-standard-WSL2" }),
    ).toBe(true);
    expect(detectWsl({ env: { WSL_DISTRO_NAME: "Ubuntu" }, readFile: () => null })).toBe(true);
    expect(detectWsl({ env: { WSL_INTEROP: "/run/WSL/1_interop" }, readFile: () => null })).toBe(
      true,
    );
    expect(detectWsl({ env: {}, readFile: () => "Linux version 6.8.0-generic (Ubuntu)" })).toBe(
      false,
    );
  });

  it("does nothing off WSL", async () => {
    const m = makeMachine();
    m.files.set("/proc/version", "Linux version 6.8.0-generic");
    const res = await runWslUsbSetup(depsFor(m), { mode: "interactive" });
    expect(res.outcome).toBe("not-wsl");
    expect(m.calls).toHaveLength(0);
  });

  it("parses [interop] enabled from wsl.conf", () => {
    expect(wslConfDisablesInterop("[boot]\nsystemd=true\n[interop]\nenabled = false\n")).toBe(true);
    expect(wslConfDisablesInterop("[interop]\nenabled=true\n")).toBe(false);
    expect(wslConfDisablesInterop("[automount]\nenabled=false\n")).toBe(false);
    expect(wslConfDisablesInterop(null)).toBe(false);
  });
});

describe("interop disabled", () => {
  it("explains the wsl.conf fix instead of failing obscurely", async () => {
    const m = makeMachine({ interop: false });
    m.files.set("/etc/wsl.conf", "[interop]\nenabled=false\n");
    const res = await runWslUsbSetup(depsFor(m), { mode: "interactive" });
    expect(res.outcome).toBe("interop-unavailable");
    expect(m.logs.join("\n")).toContain("enabled=true");
    expect(m.calls.some(MUTATING)).toBe(false);
  });

  it("names the missing binfmt registration (systemd distros)", async () => {
    const m = makeMachine({ interop: false });
    m.dirs.set("/proc/sys/fs/binfmt_misc", ["register", "status"]);
    const res = await runWslUsbSetup(depsFor(m), { mode: "interactive" });
    expect(res.outcome).toBe("interop-unavailable");
    expect(m.logs.join("\n")).toContain("WSLInterop.conf");
  });
});

describe("one-time setup", () => {
  it("binds, registers the logon task with one elevation, adds the group and rule, verifies the node", async () => {
    const m = makeMachine();
    const res = await runWslUsbSetup(depsFor(m), { mode: "interactive" });
    expect(res.outcome).toBe("ready-relogin");
    const elevations = m.calls.filter((c) => c.script?.includes("-Verb RunAs"));
    expect(elevations).toHaveLength(1);
    expect(m.win.bound).toBe(true);
    expect(m.win.task?.arguments).toContain(ATTACH_ARGS);
    const sudo = m.calls.filter((c) => c.cmd === "sudo").map((c) => c.args.slice(0, 2).join(" "));
    expect(sudo).toEqual([
      "usermod -aG",
      "tee /etc/udev/rules.d/99-enclaweder.rules",
      "udevadm control",
      "udevadm trigger",
    ]);
    expect(m.files.get(UDEV_RULE_PATH)).toBe(UDEV_RULE);
    expect(m.logs.join("\n")).toContain("newgrp plugdev");
    expect(m.confirms).toHaveLength(0);
  });

  it("is idempotent: a configured machine is only queried", async () => {
    const m = makeConfiguredMachine();
    const res = await runWslUsbSetup(depsFor(m), { mode: "interactive" });
    expect(res.outcome).toBe("ready");
    expect(m.calls.some(MUTATING)).toBe(false);
    expect(res.status.wsl && res.status.issues).toEqual([]);
  });

  it("re-running right after setup changes nothing on Windows", async () => {
    const m = makeMachine();
    await runWslUsbSetup(depsFor(m), { mode: "interactive" });
    m.calls.length = 0;
    m.activeGroupIds.push(46); // the new terminal
    m.accessible.add("/dev/hidraw0");
    const res = await runWslUsbSetup(depsFor(m), { mode: "interactive" });
    expect(res.outcome).toBe("ready");
    expect(m.calls.some(MUTATING)).toBe(false);
  });

  it("the elevated script binds by hardware id and registers a hidden, unlimited, restarting logon task", () => {
    const script = elevatedSetupScript({
      usbipdPath: USBIPD,
      user: "HOST\\person",
      bind: true,
      task: true,
    });
    expect(script).toContain("bind --hardware-id 1209:e100");
    expect(script).toContain("-AtLogOn -User 'HOST\\person'");
    expect(script).toContain("-ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999");
    expect(script).toContain("-RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries");
    expect(script).toContain(`-TaskName '${AUTO_ATTACH_TASK_NAME}'`);
    expect(script).toContain(`-WindowStyle Hidden -Command & ''${USBIPD}'' ${ATTACH_ARGS}`);
    expect(script).toContain("Start-ScheduledTask");
  });

  it("starts a registered but stopped task without elevating", async () => {
    const m = makeConfiguredMachine();
    m.win.task!.state = "Ready";
    const res = await runWslUsbSetup(depsFor(m), { mode: "interactive" });
    expect(res.outcome).toBe("ready");
    expect(m.calls.some((c) => c.script?.includes("-Verb RunAs"))).toBe(false);
    expect(m.calls.some((c) => c.script?.startsWith("Start-ScheduledTask"))).toBe(true);
  });
});

describe("usbipd-win missing", () => {
  it("asks, then installs with winget", async () => {
    const m = makeMachine({ usbipd: false });
    const res = await runWslUsbSetup(depsFor(m), { mode: "interactive" });
    expect(m.confirms[0]).toContain("Install it now with winget?");
    const winget = m.calls.find((c) => c.script?.startsWith("winget "));
    expect(winget?.script).toContain("winget install --exact --id dorssel.usbipd-win");
    expect(winget?.opts?.interactive).toBe(true);
    expect(res.outcome).toBe("ready-relogin");
  });

  it("stops when the person declines", async () => {
    const m = makeMachine({ usbipd: false });
    m.confirmAnswer = false;
    const res = await runWslUsbSetup(depsFor(m), { mode: "interactive" });
    expect(res.outcome).toBe("usbipd-missing");
    expect(m.calls.some(MUTATING)).toBe(false);
  });

  it("reports and stops when winget is missing", async () => {
    const m = makeMachine({ usbipd: false, winget: false });
    const res = await runWslUsbSetup(depsFor(m), { mode: "interactive" });
    expect(res.outcome).toBe("usbipd-missing");
    expect(m.confirms).toHaveLength(0);
    expect(m.logs.join("\n")).toContain("winget is not available");
  });

  it("reports a failed install", async () => {
    const m = makeMachine({ usbipd: false, wingetInstalls: false });
    const res = await runWslUsbSetup(depsFor(m), { mode: "interactive", assumeYes: true });
    expect(res.outcome).toBe("usbipd-install-failed");
    expect(m.confirms).toHaveLength(0);
  });

  it("treats usbipd-win 3.x as too old", async () => {
    const m = makeMachine({ usbipdVersion: "3.2.0" });
    m.confirmAnswer = false;
    const res = await runWslUsbSetup(depsFor(m), { mode: "interactive" });
    expect(m.confirms[0]).toContain("too old");
    expect(res.outcome).toBe("usbipd-missing");
  });
});

describe("elevation refused", () => {
  it("changes nothing and says how to retry", async () => {
    const m = makeMachine({ elevation: "refuse" });
    const res = await runWslUsbSetup(depsFor(m), { mode: "interactive" });
    expect(res.outcome).toBe("elevation-refused");
    expect(m.win.bound).toBe(false);
    expect(m.calls.some((c) => c.cmd === "sudo")).toBe(false);
    expect(m.logs.join("\n")).toContain("enclawed hardware-root wsl-setup");
  });
});

describe("Linux group", () => {
  it("creates plugdev when the distro lacks it", async () => {
    const m = makeMachine();
    m.files.set("/etc/group", "root:x:0:\n");
    await runWslUsbSetup(depsFor(m), { mode: "interactive" });
    const sudo = m.calls.filter((c) => c.cmd === "sudo").map((c) => c.args[0]);
    expect(sudo.slice(0, 2)).toEqual(["groupadd", "usermod"]);
  });

  it("reports a member whose group is not active yet (needs a new terminal)", async () => {
    const m = makeConfiguredMachine();
    m.activeGroupIds.splice(m.activeGroupIds.indexOf(46), 1);
    m.accessible.clear();
    const status = await gatherWslUsbStatus(depsFor(m));
    expect(status.wsl && status.issues).toEqual(["group-not-active", "hidraw-no-access"]);
    expect(describeWslUsbStatus(status).lines.join("\n")).toContain("open a new WSL terminal");
  });

  it("skips the rule when the distro already covers 1209:e100", async () => {
    const m = makeMachine();
    m.dirs.set("/usr/lib/udev/rules.d", ["70-vendor.rules"]);
    m.files.set(
      "/usr/lib/udev/rules.d/70-vendor.rules",
      'SUBSYSTEM=="hidraw", ATTRS{idVendor}=="1209", \\\n  ATTRS{idProduct}=="E100", GROUP="plugdev"\n',
    );
    await runWslUsbSetup(depsFor(m), { mode: "interactive" });
    expect(m.calls.some((c) => c.cmd === "sudo" && c.args[0] === "tee")).toBe(false);
  });
});

describe("no device / installer / report-only", () => {
  it("the installer skips quietly when no Enclaweder is in play", async () => {
    const m = makeMachine({ plugged: false, usbipd: false });
    const res = await runWslUsbSetup(depsFor(m), { mode: "interactive", installer: true });
    expect(res.outcome).toBe("no-device");
    expect(m.confirms).toHaveLength(0);
    expect(m.calls.some(MUTATING)).toBe(false);
    expect(wslUsbRelevant(res.status)).toBe(false);
  });

  it("the CLI asks to plug it in before binding", async () => {
    const m = makeMachine({ plugged: false });
    const res = await runWslUsbSetup(depsFor(m), { mode: "interactive" });
    expect(res.outcome).toBe("no-device");
    expect(m.calls.some((c) => c.script?.includes("-Verb RunAs"))).toBe(false);
  });

  it("non-interactive only reports and names the fix", async () => {
    const m = makeMachine();
    const res = await runWslUsbSetup(depsFor(m), { mode: "non-interactive" });
    expect(res.outcome).toBe("report-only");
    expect(m.calls.some(MUTATING)).toBe(false);
    expect(m.logs.join("\n")).toContain("Fix: enclawed hardware-root wsl-setup");
  });

  it("reports when the device does not show up in Linux in time", async () => {
    const m = makeMachine({ bound: true, task: { state: "Running", arguments: ATTACH_ARGS } });
    m.files.set("/etc/group", "plugdev:x:46:person\n");
    m.activeGroupIds.push(46);
    m.dirs.set("/etc/udev/rules.d", ["99-enclaweder.rules"]);
    m.files.set("/etc/udev/rules.d/99-enclaweder.rules", UDEV_RULE);
    const res = await runWslUsbSetup(depsFor(m), { mode: "interactive", attachTimeoutMs: 2_000 });
    expect(res.outcome).toBe("not-visible");
    expect(m.clock).toBeGreaterThanOrEqual(2_000);
  });
});

describe("parsers", () => {
  it("reads usbipd state for the Enclaweder only", () => {
    const text = JSON.stringify({
      Devices: [
        {
          BusId: "1-1",
          InstanceId: "USB\\VID_046D&PID_C52B\\x",
          PersistedGuid: null,
          ClientIPAddress: null,
        },
        {
          BusId: "2-3",
          InstanceId: "USB\\VID_1209&PID_E100\\y",
          PersistedGuid: "g",
          ClientIPAddress: "1.2.3.4",
        },
      ],
    });
    expect(parseUsbipdState(text)).toEqual({ connected: true, bound: true, attached: true });
    expect(parseUsbipdState("garbage")).toEqual({
      connected: false,
      bound: false,
      attached: false,
    });
  });

  it("ignores commented-out rules", () => {
    expect(rulesTextCoversEnclaweder('# ATTRS{idVendor}=="1209", ATTRS{idProduct}=="e100"\n')).toBe(
      false,
    );
  });
});
