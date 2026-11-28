import { describe, expect, it } from "vitest";
import { getHistoryLimitFromSessionKey } from "./history.js";

describe("getHistoryLimitFromSessionKey", () => {
  it("matches channel history limits across canonical provider aliases", () => {
    expect(
      getHistoryLimitFromSessionKey("agent:main:bedrock:channel:general", {
        channels: {
          "aws-bedrock": {
            historyLimit: 17,
          },
        },
      }),
    ).toBe(17);
  });
});
