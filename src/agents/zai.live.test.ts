import { completeSimple, getModel } from "@mariozechner/pi-ai/compat";
import { describe, expect, it } from "vitest";
import {
  createSingleUserPromptMessage,
  extractNonEmptyAssistantText,
  isLiveTestEnabled,
} from "./live-test-helpers.js";

const ZAI_KEY = process.env.ZAI_API_KEY ?? process.env.Z_AI_API_KEY ?? "";
const LIVE = isLiveTestEnabled(["ZAI_LIVE_TEST"]);

const describeLive = LIVE && ZAI_KEY ? describe : describe.skip;

async function expectModelReturnsAssistantText(modelId: "glm-5" | "glm-4.7") {
  // Upstream pi-ai dropped "glm-5" from the zai catalog; the live test
  // intentionally probes both IDs (one may exist server-side without being
  // in the local registry). Cast through `never` so the lookup compiles.
  const model = getModel("zai", modelId as never);
  const res = await completeSimple(
    model,
    {
      messages: createSingleUserPromptMessage(),
    },
    { apiKey: ZAI_KEY, maxTokens: 64 },
  );
  const text = extractNonEmptyAssistantText(res.content);
  expect(text.length).toBeGreaterThan(0);
}

describeLive("zai live", () => {
  it("returns assistant text", async () => {
    await expectModelReturnsAssistantText("glm-5");
  }, 20000);

  it("glm-4.7 returns assistant text", async () => {
    await expectModelReturnsAssistantText("glm-4.7");
  }, 20000);
});
