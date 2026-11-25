// The real Enclaweder is never a test fixture: under a test runner the framework refuses to open a
// real device node and to write the real user's hardware-root state, unless the run is the
// deliberate live-device one. This file runs under vitest, so it is itself the case it checks.
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { directOpenRefusal, parseHidId } from "./hid-transport.js";
import {
  LIVE_DEVICE_TEST_ACK,
  LIVE_DEVICE_TEST_ENV,
  realStateWriteRefusal,
  testRunnerRefusal,
  underTestRunner,
} from "./test-guard.js";

const saved = process.env[LIVE_DEVICE_TEST_ENV];
afterEach(() => {
  if (saved === undefined) {
    delete process.env[LIVE_DEVICE_TEST_ENV];
  } else {
    process.env[LIVE_DEVICE_TEST_ENV] = saved;
  }
});

describe("test-runner device guard", () => {
  it("knows it runs under a test runner", () => {
    expect(underTestRunner()).toBe(true);
  });

  it("refuses a real device open without the deliberate opt-in", () => {
    delete process.env[LIVE_DEVICE_TEST_ENV];
    expect(testRunnerRefusal()).toMatch(/test runner may not open a real Enclaweder/);
    expect(directOpenRefusal()).toMatch(/test runner/);
  });

  it("accepts only the exact opt-in value", () => {
    process.env[LIVE_DEVICE_TEST_ENV] = "1";
    expect(testRunnerRefusal()).not.toBeNull();
    process.env[LIVE_DEVICE_TEST_ENV] = LIVE_DEVICE_TEST_ACK;
    expect(testRunnerRefusal()).toBeNull();
  });

  it("refuses writing the real user's latch and forensic log, whatever HOME says", () => {
    delete process.env[LIVE_DEVICE_TEST_ENV];
    const home = os.userInfo().homedir;
    expect(realStateWriteRefusal(path.join(home, ".enclawed-hw-root.state"))).not.toBeNull();
    expect(
      realStateWriteRefusal(path.join(home, ".enclawed-hw-root.state.queue.jsonl")),
    ).not.toBeNull();
    expect(realStateWriteRefusal(path.join(home, ".enclawed-forensics.jsonl"))).not.toBeNull();
    expect(
      realStateWriteRefusal(path.join(os.tmpdir(), "x", ".enclawed-hw-root.state")),
    ).toBeNull();
  });
});

describe("hidraw identity (finding H10)", () => {
  it("reads only the exact HID_ID line", () => {
    expect(parseHidId("DRIVER=hid-generic\nHID_ID=0003:00001209:0000E100\nHID_NAME=x\n")).toEqual({
      bus: 3,
      vid: 0x1209,
      pid: 0xe100,
    });
    expect(
      parseHidId("HID_ID=0003:0000046D:0000C52B\nHID_NAME=Receiver 00001209 0000E100\n")?.vid,
    ).toBe(0x046d);
    expect(parseHidId("HID_NAME=00001209 0000E100\nHID_UNIQ=00001209-0000e100\n")).toBeNull();
  });
});
