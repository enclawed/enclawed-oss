import { describe, expect, it } from "vitest";
import { buildPlatformRuntimeLogHints, buildPlatformServiceStartHints } from "./runtime-hints.js";

describe("buildPlatformRuntimeLogHints", () => {
  it("renders launchd log hints on darwin", () => {
    expect(
      buildPlatformRuntimeLogHints({
        platform: "darwin",
        env: {
          ENCLAWED_STATE_DIR: "/tmp/enclawed-state",
          ENCLAWED_LOG_PREFIX: "gateway",
        },
        systemdServiceName: "enclawed-gateway",
        windowsTaskName: "Enclawed Gateway",
      }),
    ).toEqual([
      "Launchd stdout (if installed): /tmp/enclawed-state/logs/gateway.log",
      "Launchd stderr (if installed): /tmp/enclawed-state/logs/gateway.err.log",
    ]);
  });

  it("renders systemd and windows hints by platform", () => {
    expect(
      buildPlatformRuntimeLogHints({
        platform: "linux",
        systemdServiceName: "enclawed-gateway",
        windowsTaskName: "Enclawed Gateway",
      }),
    ).toEqual(["Logs: journalctl --user -u enclawed-gateway.service -n 200 --no-pager"]);
    expect(
      buildPlatformRuntimeLogHints({
        platform: "win32",
        systemdServiceName: "enclawed-gateway",
        windowsTaskName: "Enclawed Gateway",
      }),
    ).toEqual(['Logs: schtasks /Query /TN "Enclawed Gateway" /V /FO LIST']);
  });
});

describe("buildPlatformServiceStartHints", () => {
  it("builds platform-specific service start hints", () => {
    expect(
      buildPlatformServiceStartHints({
        platform: "darwin",
        installCommand: "enclawed gateway install",
        startCommand: "enclawed gateway",
        launchAgentPlistPath: "~/Library/LaunchAgents/com.enclawed.gateway.plist",
        systemdServiceName: "enclawed-gateway",
        windowsTaskName: "Enclawed Gateway",
      }),
    ).toEqual([
      "enclawed gateway install",
      "enclawed gateway",
      "launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.enclawed.gateway.plist",
    ]);
    expect(
      buildPlatformServiceStartHints({
        platform: "linux",
        installCommand: "enclawed gateway install",
        startCommand: "enclawed gateway",
        launchAgentPlistPath: "~/Library/LaunchAgents/com.enclawed.gateway.plist",
        systemdServiceName: "enclawed-gateway",
        windowsTaskName: "Enclawed Gateway",
      }),
    ).toEqual([
      "enclawed gateway install",
      "enclawed gateway",
      "systemctl --user start enclawed-gateway.service",
    ]);
  });
});
