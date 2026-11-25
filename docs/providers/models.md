---
summary: "Model providers (LLMs) supported by Enclawed"
read_when:
  - You want to choose a model provider
  - You want quick setup examples for LLM auth + model selection
title: "Model Provider Quickstart"
---

# Model Providers

Enclawed can use many LLM providers. Pick one, authenticate, then set the default
model as `provider/model`.

## Quick start (two steps)

1. Authenticate with the provider (usually via `enclawed onboard`).
2. Set the default model:

```json5
{
  agents: { defaults: { model: { primary: "anthropic/claude-opus-4-6" } } },
}
```

## Supported providers (starter set)

- [Anthropic (API + Claude CLI)](/providers/anthropic)
- [Amazon Bedrock](/providers/bedrock)
- [Chutes](/providers/chutes)
- [ComfyUI](/providers/comfy)
- [Cloudflare AI Gateway](/providers/cloudflare-ai-gateway)
- [fal](/providers/fal)
- [Fireworks](/providers/fireworks)
- [Mistral](/providers/mistral)
- [OpenAI (API + Codex)](/providers/openai)
- [OpenCode (Zen + Go)](/providers/opencode)
- [OpenRouter](/providers/openrouter)
- [Runway](/providers/runway)
- [Synthetic](/providers/synthetic)
- [Vercel AI Gateway](/providers/vercel-ai-gateway)
- [Venice (Venice AI)](/providers/venice)
- [xAI](/providers/xai)

## Additional bundled provider variants

- `anthropic-vertex` - implicit Anthropic on Google Vertex support when Vertex credentials are available; no separate onboarding auth choice
- `copilot-proxy` - local VS Code Copilot Proxy bridge; use `enclawed onboard --auth-choice copilot-proxy`
- `google-gemini-cli` - unofficial Gemini CLI OAuth flow; requires a local `gemini` install (`brew install gemini-cli` or `npm install -g @google/gemini-cli`); default model `google-gemini-cli/gemini-3-flash-preview`; use `enclawed onboard --auth-choice google-gemini-cli` or `enclawed models auth login --provider google-gemini-cli --set-default`

For the full provider catalog (xAI, Groq, Mistral, etc.) and advanced configuration,
see [Model providers](/concepts/model-providers).
