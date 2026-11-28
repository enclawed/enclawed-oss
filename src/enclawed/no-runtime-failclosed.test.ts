// Embedded or lazy paths that never ran bootstrapEnclawed() must not get an
// ungated, uncaged agent in the enclaved flavor.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ExecNetworkRefusedError, prepareExecNetCage } from "../agents/bash-tools.exec-netcage.js";
import {
  type AdminPolicyLoad,
  getActiveAdminPolicyLoad,
  setActiveAdminPolicy,
} from "./admin-policy.js";
import { planIrreversibleToolCall } from "./agent-tool-guard.js";
import { clearRuntime } from "./runtime.js";

let saved: AdminPolicyLoad;
const withFlavor = (flavor: "open" | "enclaved"): void =>
  setActiveAdminPolicy({
    admin: { source: { kind: "root-file", path: "<test>" }, doc: { v: 1, flavor } },
    ignored: [],
    invalid: null,
  });

beforeEach(() => {
  saved = getActiveAdminPolicyLoad();
  clearRuntime();
});
afterEach(() => {
  setActiveAdminPolicy(saved);
});

describe("no bootstrapped runtime", () => {
  it("enclaved: irreversible calls are refused, not waved through", async () => {
    withFlavor("enclaved");
    expect(await planIrreversibleToolCall("exec")).toMatchObject({ kind: "refused" });
  });

  it("enclaved: exec is refused rather than run outside the network cage", async () => {
    withFlavor("enclaved");
    await expect(prepareExecNetCage({ command: "true", onAlert: () => {} })).rejects.toBeInstanceOf(
      ExecNetworkRefusedError,
    );
  });

  it("open: unchanged (no gate, no cage)", async () => {
    withFlavor("open");
    expect(await planIrreversibleToolCall("exec")).toMatchObject({
      kind: "proceed",
      code: "no-runtime",
    });
    expect(await prepareExecNetCage({ command: "true", onAlert: () => {} })).toBeNull();
  });
});
