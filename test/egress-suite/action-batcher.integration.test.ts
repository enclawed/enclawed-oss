// The action batcher's tool idempotency comes from the open core's tool
// capability map, published on the shared classifier slot at boot. This
// checks the real map end to end, not a stub.

import { afterEach, describe, expect, it } from "vitest";
import {
  classifyActionIdempotency,
  setToolCapabilityClassifier,
} from "../../extensions/egress-action-batcher/api.js";
import { publishToolCapabilityClassifier } from "../../src/enclawed/tool-capability-map.js";

describe("action batcher x tool capability map", () => {
  afterEach(() => setToolCapabilityClassifier(null));

  it("collapses read-only tools and nothing else", () => {
    publishToolCapabilityClassifier();
    const cls = (toolName: string) => classifyActionIdempotency({ type: "tool", toolName });
    for (const t of ["read", "memory_search", "web_fetch", "web_search", "x_search"]) {
      expect(cls(t), t).toBe("cacheable");
    }
    for (const t of ["message", "sessions_send", "exec", "browser", "edit", "cron", "mcp_x"]) {
      expect(cls(t), t).toBe("never");
    }
  });

  it("fails toward overt with no map installed", () => {
    expect(classifyActionIdempotency({ type: "tool", toolName: "read" })).toBe("never");
  });
});
