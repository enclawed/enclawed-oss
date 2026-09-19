import { defineConfig } from "vitest/config";

// Standalone config for the prerequisite-gated live / dynamic MCP harnesses
// (the main config excludes **/*.live.test.ts). They self-skip unless their env
// gates are set (OLLAMA_LIVE=1 / GOOGLE_LIVE=1 + Google OAuth env).
//   set -a; source .env.local; set +a
//   OLLAMA_LIVE=1 GOOGLE_LIVE=1 OLLAMA_MODEL=llama3.2 \
//     npx vitest run --config vitest.live.config.mts
export default defineConfig({
  test: {
    include: [
      "extensions/mcp-attested/src/adversarial-ollama.live.test.ts",
      "extensions/mcp-attested/src/adversarial-ollama-campaign.live.test.ts",
      "extensions/mcp-google-workspace/src/google-e2e.live.test.ts",
    ],
    testTimeout: 200_000,
    hookTimeout: 60_000,
  },
});
