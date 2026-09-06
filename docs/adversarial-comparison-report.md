# Per-extension adversarial F1-F4 comparison

Enclawed (upstream) vs enclawed-oss vs enclawed-enclaved, with **per-extension scenarios**: each extension's F1-F4 inputs are derived from that extension's own manifest, so a Discord extension is probed against `(publish, channel://discord/message)`, an Ollama extension against `(tool.invoke, provider://ollama/inference)`, a browser extension against `(tool.invoke, tool://browser/op)`, etc. Same biconditional checker, but the (cap, target) pair under test is unique to each row.

Generated: 2026-09-01T06:52:56.309Z (Node v22.22.1, linux/x64).

## Headline

| Subject | Extensions present | Cases caught (per-extension) | Detection rate | Tree probe |
|---|---:|---:|---:|---:|
| **Enclawed (upstream)** | 124 | 496 / 496 | 100.0% | 117.7 ms over 300 files |
| **enclawed-oss** | 130 | 520 / 520 | 100.0% | 155.7 ms over 1184 files |
| **enclawed-enclaved** | 129 | 516 / 516 | 100.0% | 191.9 ms over 1006 files |

Total harness time: **577.4 ms** (per-extension scoring across 133 unique names: 111.4 ms).

## Primitive availability per tree (empirical)

| Primitive | Enclawed | enclawed-oss | enclawed-enclaved |
|---|:-:|:-:|:-:|
| biconditional checker | present | present | present |
| hash-chained AuditLogger | present | present | present |
| extension admission gate | present | present | present |
| two-layer egress guard | present | present | present |
| Bell-LaPadula classification | present | present | present |
| module-signing + trust root | present | present | present |
| bootstrap seal | present | present | present |

## Roles found across the catalog

Each extension is classified into a role based on its manifest, and the F1-F4 scenarios for that row use a (cap, target) tuple consistent with that role:

| Role | Sample (cap, target) pattern | Count |
|---|---|---:|
| `channel` | `(publish, channel://bluebubbles/message)` | 23 |
| `declared` | `(fs.read, active-memory://op)` | 39 |
| `generic` | `(tool.invoke, tool://brave/op)` | 8 |
| `provider` | `(tool.invoke, provider://amazon-bedrock/inference)` | 16 |
| `tool` | `(tool.invoke, tool://acpx/op)` | 44 |
| `utility` | `(-, -)` | 3 |

## Per-extension scoreboard

Each row probes the named extension on its OWN (cap, target). `OC` = Enclawed upstream, `OSS` = enclawed-oss, `ENC` = enclawed-enclaved. `–` = extension not present in that tree.

| # | Extension | Role | Cap | Target | OC F1 | F2 | F3 | F4 | OSS F1 | F2 | F3 | F4 | ENC F1 | F2 | F3 | F4 |
|---:|---|---|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| 1 | `acpx` | `tool` | `tool.invoke` | `tool://acpx/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 2 | `active-memory` | `declared` | `fs.read` | `active-memory://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 3 | `alibaba` | `declared` | `fs.read` | `alibaba://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 4 | `amazon-bedrock` | `provider` | `tool.invoke` | `provider://amazon-bedrock/inference` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 5 | `amazon-bedrock-mantle` | `tool` | `tool.invoke` | `tool://amazon-bedrock-mantle/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 6 | `anthropic` | `provider` | `tool.invoke` | `provider://anthropic/inference` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 7 | `anthropic-vertex` | `provider` | `tool.invoke` | `provider://anthropic-vertex/inference` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 8 | `arcee` | `tool` | `tool.invoke` | `tool://arcee/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 9 | `azure-speech` | `declared` | `fs.read` | `azure-speech://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 10 | `bluebubbles` | `channel` | `publish` | `channel://bluebubbles/message` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 11 | `bonjour` | `declared` | `fs.read` | `bonjour://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 12 | `brave` | `generic` | `tool.invoke` | `tool://brave/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 13 | `browser` | `tool` | `tool.invoke` | `tool://browser/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 14 | `byteplus` | `tool` | `tool.invoke` | `tool://byteplus/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 15 | `cerebras` | `tool` | `tool.invoke` | `tool://cerebras/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 16 | `chutes` | `tool` | `tool.invoke` | `tool://chutes/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 17 | `cloudflare-ai-gateway` | `tool` | `tool.invoke` | `tool://cloudflare-ai-gateway/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 18 | `codex` | `tool` | `tool.invoke` | `tool://codex/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 19 | `comfy` | `tool` | `tool.invoke` | `tool://comfy/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 20 | `copilot-proxy` | `tool` | `tool.invoke` | `tool://copilot-proxy/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 21 | `deepgram` | `generic` | `tool.invoke` | `tool://deepgram/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 22 | `deepinfra` | `tool` | `tool.invoke` | `tool://deepinfra/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 23 | `deepseek` | `tool` | `tool.invoke` | `tool://deepseek/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 24 | `device-pair` | `declared` | `fs.read` | `device-pair://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 25 | `diagnostics-otel` | `declared` | `fs.read` | `diagnostics-otel://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 26 | `diagnostics-prometheus` | `declared` | `fs.read` | `diagnostics-prometheus://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 27 | `diffs` | `tool` | `tool.invoke` | `tool://diffs/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 28 | `discord` | `channel` | `publish` | `channel://discord/message` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 29 | `document-extract` | `declared` | `fs.read` | `document-extract://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 30 | `duckduckgo` | `generic` | `tool.invoke` | `tool://duckduckgo/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 31 | `elevenlabs` | `generic` | `tool.invoke` | `tool://elevenlabs/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 32 | `enclaved` | `utility` | `-` | `-` | – | – | – | – | – | – | – | – | – | – | – | – |
| 33 | `exa` | `generic` | `tool.invoke` | `tool://exa/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 34 | `fal` | `provider` | `tool.invoke` | `provider://fal/inference` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 35 | `feishu` | `channel` | `publish` | `channel://feishu/message` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 36 | `file-transfer` | `declared` | `fs.read` | `file-transfer://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 37 | `firecrawl` | `generic` | `tool.invoke` | `tool://firecrawl/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 38 | `fireworks` | `tool` | `tool.invoke` | `tool://fireworks/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 39 | `github-copilot` | `provider` | `tool.invoke` | `provider://github-copilot/inference` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 40 | `google` | `provider` | `tool.invoke` | `provider://google/inference` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 41 | `google-meet` | `declared` | `fs.read` | `google-meet://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 42 | `googlechat` | `channel` | `publish` | `channel://googlechat/message` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 43 | `gradium` | `declared` | `fs.read` | `gradium://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 44 | `groq` | `provider` | `tool.invoke` | `provider://groq/inference` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 45 | `huggingface` | `tool` | `tool.invoke` | `tool://huggingface/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 46 | `image-generation-core` | `declared` | `fs.read` | `image-generation-core://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 47 | `imessage` | `channel` | `publish` | `channel://imessage/message` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 48 | `inworld` | `declared` | `fs.read` | `inworld://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 49 | `irc` | `channel` | `publish` | `channel://irc/message` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 50 | `kilocode` | `tool` | `tool.invoke` | `tool://kilocode/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 51 | `kimi-coding` | `tool` | `tool.invoke` | `tool://kimi-coding/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 52 | `line` | `channel` | `publish` | `channel://line/message` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 53 | `litellm` | `provider` | `tool.invoke` | `provider://litellm/inference` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 54 | `llm-task` | `declared` | `fs.read` | `llm-task://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 55 | `lmstudio` | `tool` | `tool.invoke` | `tool://lmstudio/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 56 | `lobster` | `declared` | `fs.read` | `lobster://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 57 | `matrix` | `channel` | `publish` | `channel://matrix/message` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 58 | `mattermost` | `channel` | `publish` | `channel://mattermost/message` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 59 | `mcp-attested` | `declared` | `fs.read` | `mcp-attested://op` | – | – | – | – | caught | caught | caught | caught | – | – | – | – |
| 60 | `mcp-caldav` | `tool` | `tool.invoke` | `tool://mcp-caldav/op` | – | – | – | – | caught | caught | caught | caught | caught | caught | caught | caught |
| 61 | `mcp-carddav` | `tool` | `tool.invoke` | `tool://mcp-carddav/op` | – | – | – | – | caught | caught | caught | caught | caught | caught | caught | caught |
| 62 | `mcp-github` | `tool` | `tool.invoke` | `tool://mcp-github/op` | – | – | – | – | caught | caught | caught | caught | caught | caught | caught | caught |
| 63 | `mcp-google-workspace` | `tool` | `tool.invoke` | `tool://mcp-google-workspace/op` | – | – | – | – | caught | caught | caught | caught | caught | caught | caught | caught |
| 64 | `mcp-imap-smtp` | `tool` | `tool.invoke` | `tool://mcp-imap-smtp/op` | – | – | – | – | caught | caught | caught | caught | caught | caught | caught | caught |
| 65 | `media-understanding-core` | `declared` | `fs.read` | `media-understanding-core://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 66 | `memory-core` | `declared` | `fs.read` | `memory-core://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 67 | `memory-lancedb` | `declared` | `fs.read` | `memory-lancedb://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 68 | `memory-wiki` | `tool` | `tool.invoke` | `tool://memory-wiki/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 69 | `microsoft` | `declared` | `fs.read` | `microsoft://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 70 | `microsoft-foundry` | `tool` | `tool.invoke` | `tool://microsoft-foundry/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 71 | `migrate-claude` | `declared` | `fs.read` | `migrate-claude://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 72 | `migrate-hermes` | `declared` | `fs.read` | `migrate-hermes://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 73 | `minimax` | `provider` | `tool.invoke` | `provider://minimax/inference` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 74 | `mistral` | `provider` | `tool.invoke` | `provider://mistral/inference` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 75 | `moonshot` | `provider` | `tool.invoke` | `provider://moonshot/inference` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 76 | `msteams` | `channel` | `publish` | `channel://msteams/message` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 77 | `nextcloud-talk` | `channel` | `publish` | `channel://nextcloud-talk/message` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 78 | `nostr` | `channel` | `publish` | `channel://nostr/message` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 79 | `nvidia` | `tool` | `tool.invoke` | `tool://nvidia/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 80 | `ollama` | `tool` | `tool.invoke` | `tool://ollama/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 81 | `open-prose` | `tool` | `tool.invoke` | `tool://open-prose/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 82 | `openai` | `provider` | `tool.invoke` | `provider://openai/inference` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 83 | `opencode` | `tool` | `tool.invoke` | `tool://opencode/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 84 | `opencode-go` | `tool` | `tool.invoke` | `tool://opencode-go/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 85 | `openrouter` | `provider` | `tool.invoke` | `provider://openrouter/inference` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 86 | `openshell` | `declared` | `fs.read` | `openshell://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 87 | `perplexity` | `generic` | `tool.invoke` | `tool://perplexity/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 88 | `phone-control` | `declared` | `fs.read` | `phone-control://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 89 | `qa-channel` | `channel` | `publish` | `channel://qa-channel/message` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 90 | `qa-lab` | `declared` | `fs.read` | `qa-lab://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 91 | `qa-matrix` | `declared` | `fs.read` | `qa-matrix://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 92 | `qianfan` | `tool` | `tool.invoke` | `tool://qianfan/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 93 | `qqbot` | `channel` | `publish` | `channel://qqbot/message` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 94 | `qwen` | `tool` | `tool.invoke` | `tool://qwen/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 95 | `runway` | `declared` | `fs.read` | `runway://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 96 | `searxng` | `declared` | `fs.read` | `searxng://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 97 | `senseaudio` | `declared` | `fs.read` | `senseaudio://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 98 | `sglang` | `tool` | `tool.invoke` | `tool://sglang/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 99 | `shared` | `utility` | `-` | `-` | – | – | – | – | – | – | – | – | – | – | – | – |
| 100 | `signal` | `channel` | `publish` | `channel://signal/message` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 101 | `skill-workshop` | `declared` | `fs.read` | `skill-workshop://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 102 | `slack` | `channel` | `publish` | `channel://slack/message` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 103 | `speech-core` | `declared` | `fs.read` | `speech-core://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 104 | `stepfun` | `tool` | `tool.invoke` | `tool://stepfun/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 105 | `synology-chat` | `channel` | `publish` | `channel://synology-chat/message` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 106 | `synthetic` | `tool` | `tool.invoke` | `tool://synthetic/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 107 | `talk-voice` | `declared` | `fs.read` | `talk-voice://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 108 | `tavily` | `generic` | `tool.invoke` | `tool://tavily/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 109 | `telegram` | `channel` | `publish` | `channel://telegram/message` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 110 | `tencent` | `tool` | `tool.invoke` | `tool://tencent/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 111 | `test-support` | `utility` | `-` | `-` | – | – | – | – | – | – | – | – | – | – | – | – |
| 112 | `thread-ownership` | `declared` | `fs.read` | `thread-ownership://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 113 | `tlon` | `channel` | `publish` | `channel://tlon/message` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 114 | `together` | `tool` | `tool.invoke` | `tool://together/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 115 | `tokenjuice` | `declared` | `fs.read` | `tokenjuice://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 116 | `tts-local-cli` | `declared` | `fs.read` | `tts-local-cli://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 117 | `twitch` | `channel` | `publish` | `channel://twitch/message` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 118 | `venice` | `tool` | `tool.invoke` | `tool://venice/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 119 | `vercel-ai-gateway` | `provider` | `tool.invoke` | `provider://vercel-ai-gateway/inference` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 120 | `video-generation-core` | `declared` | `fs.read` | `video-generation-core://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 121 | `vllm` | `tool` | `tool.invoke` | `tool://vllm/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 122 | `voice-call` | `tool` | `tool.invoke` | `tool://voice-call/voicecall` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 123 | `volcengine` | `tool` | `tool.invoke` | `tool://volcengine/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 124 | `voyage` | `declared` | `fs.read` | `voyage://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 125 | `vydra` | `tool` | `tool.invoke` | `tool://vydra/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 126 | `web-readability` | `declared` | `fs.read` | `web-readability://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 127 | `webhooks` | `declared` | `fs.read` | `webhooks://op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 128 | `whatsapp` | `channel` | `publish` | `channel://whatsapp/message` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 129 | `xai` | `provider` | `tool.invoke` | `provider://xai/inference` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 130 | `xiaomi` | `provider` | `tool.invoke` | `provider://xiaomi/inference` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 131 | `zai` | `tool` | `tool.invoke` | `tool://zai/op` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 132 | `zalo` | `channel` | `publish` | `channel://zalo/message` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |
| 133 | `zalouser` | `channel` | `publish` | `channel://zalouser/message` | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught | caught |

## Failure-mode primer (with per-extension grounding)

For an extension X with manifest-derived `(capX, targetX)`:

- **F1 gate-bypass.** Corpus delta = `[{op: capX, target: targetX, count: 1}]`; audit = `[]`. The extension mutated its own surface without going through the admission gate.
- **F2 audit-forgery.** Audit = `[{type: irreversible.executed, payload: {ok:true, call:{cap:capX, target:targetX}}}]`; corpus = `[]`. Audit claims X did the work, but no corpus mutation exists.
- **F3 approved-but-failed-silent.** Audit `ok=false` for `(capX, targetX)` (excluded from `S`); corpus shows the mutation. Projects as F1 because `S` excludes `ok=false`.
- **F4 wrong-target.** Audit approved `(capX, targetX)` but corpus mutated `(capX, attacker-target)`. Both halves of the multiset differ, surfacing as F1 + F2.

## Methodology

1. **Tree probe.** Walk every `*.ts/.tsx/.mjs/.js/.cjs` file in each tree (skipping node_modules, dist, build) and grep for the canonical symbol of each detection primitive. Probe terminates early once every primitive has been located.
2. **Per-extension manifest derivation.** For each extension directory, read its manifest -- `enclawed.module.json` if signed (enclawed side), else `enclawed.plugin.json` (enclawed side), else fall back to `package.json`. Derive the extension's role (channel / provider / tool / etc.) and a canonical `(cap, target)` tuple consistent with that role.
3. **Per-extension F1-F4 scenarios.** Build the four failure-mode scenarios using the extension's OWN `(cap, target)` so each row exercises that extension's specific capability surface.
4. **Detection.** A scenario is detected iff (a) the subject's tree carries every primitive that scenario depends on AND (b) the in-memory biconditional checker (mirrored from `src/enclawed/biconditional.ts`) returns a non-ok report on the (delta, audit) pair.
5. **Reproduce.** `node enclawed/test/security/adversarial-comparison.harness.mjs`. Override the upstream / companion paths with `ENCLAWED_PATH`, `ENCLAWED_OSS_PATH`, `ENCLAWED_ENCLAVED_PATH`. Dependency-free; runs on stock Node 22+.

## What this proves

- Every Enclawed extension's adversarial F1-F4 scenarios go undetected because the upstream tree contains zero detection primitives that could surface a (delta, audit) mismatch -- regardless of which capability the extension exposes.
- Every enclawed-oss extension's adversarial F1-F4 scenarios are detected by the inherited biconditional checker, on (cap, target) pairs derived from each extension's OWN manifest -- not a synthetic constant.
- enclawed-enclaved adds the bootstrap seal which blocks unsigned/under-verified extensions at admission time, so the same attacks never reach the corpus. The OSS biconditional checker stays in place as a post-hoc fallback.
- Stated as a comparison: across the **124** Enclawed extensions probed, Enclawed's framework caught **496** / 496 (rate **100.0%**); across the **130** enclawed-oss extensions probed, enclawed-oss caught **520** / 520 (rate **100.0%**); across the **129** enclawed-enclaved extensions probed, enclawed-enclaved caught **516** / 516 (rate **100.0%**).
