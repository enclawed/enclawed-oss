import { expectOpenDmPolicyConfigIssue } from "@enclawed/plugin-sdk/channel-test-helpers";
import { describe, it } from "vitest";
import { collectZaloStatusIssues } from "./status-issues.js";

describe("collectZaloStatusIssues", () => {
  it("warns when dmPolicy is open", () => {
    expectOpenDmPolicyConfigIssue({
      collectIssues: collectZaloStatusIssues,
      account: {
        accountId: "default",
        enabled: true,
        configured: true,
        dmPolicy: "open",
      },
    });
  });
});
