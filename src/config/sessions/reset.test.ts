import { beforeEach, describe, expect, it } from "vitest";
import { setActivePluginRegistry } from "../../plugins/runtime.js";
import { createSessionConversationTestRegistry } from "../../test-utils/session-conversation-registry.js";
import { isThreadSessionKey, resolveSessionResetType } from "./reset.js";

describe("session reset thread detection", () => {
  beforeEach(() => {
    setActivePluginRegistry(createSessionConversationTestRegistry());
  });

  it("still treats telegram :topic: suffixes as thread sessions", () => {
    const sessionKey = "agent:main:telegram:group:-100123:topic:77";
    expect(isThreadSessionKey(sessionKey)).toBe(true);
    expect(resolveSessionResetType({ sessionKey })).toBe("thread");
  });
});
