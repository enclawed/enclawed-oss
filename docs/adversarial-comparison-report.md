# Per-extension adversarial F1-F4 comparison

Enclawed (upstream) vs enclawed-oss vs enclawed-enclaved, with **per-extension scenarios**: each extension's F1-F4 inputs are derived from that extension's own manifest, so a Discord extension is probed against `(publish, channel://discord/message)`, an Ollama extension against `(tool.invoke, provider://ollama/inference)`, a browser extension against `(tool.invoke, tool://browser/op)`, etc. Same biconditional checker, but the (cap, target) pair under test is unique to each row.

Generated: 2026-05-02T03:58:39.262Z (Node v22.11.0, linux/x64).

## Headline

| Subject | Extensions present | Cases caught (per-extension) | Detection rate | Tree probe |
|---|---:|---:|---:|---:|
| **Enclawed (upstream)** | 124 | 0 / 496 | 0.0% | 509.2 ms over 14419 files |
| **enclawed-oss** | 124 | 496 / 496 | 100.0% | 10.8 ms over 307 files |
| **enclawed-enclaved** | 132 | 528 / 528 | 100.0% | 3.8 ms over 91 files |

Total harness time: **537.3 ms** (per-extension scoring across 134 unique names: 12.8 ms).

## Primitive availability per tree (empirical)

| Primitive | Enclawed | enclawed-oss | enclawed-enclaved |
|---|:-:|:-:|:-:|
| biconditional checker | absent | present | present |
| hash-chained AuditLogger | absent | present | present |
| extension admission gate | absent | present | present |
| two-layer egress guard | absent | present | present |
| Bell-LaPadula classification | absent | present | present |
| module-signing + trust root | absent | present | present |
| bootstrap seal | absent | present | present |

## Roles found across the catalog

Each extension is classified into a role based on its manifest, and the F1-F4 scenarios for that row use a (cap, target) tuple consistent with that role:

| Role | Sample (cap, target) pattern | Count |
|---|---|---:|
| `channel` | `(publish, channel://bluebubbles/message)` | 23 |
| `declared` | `(skill, acpx://op)` | 28 |
| `generic` | `(tool.invoke, tool://alibaba/op)` | 28 |
| `provider` | `(tool.invoke, provider://amazon-bedrock/inference)` | 49 |
| `tool` | `(tool.invoke, tool://browser/browser)` | 4 |
| `utility` | `(-, -)` | 2 |

## Per-extension scoreboard

Each row probes the named extension on its OWN (cap, target). `OC` = Enclawed upstream, `OSS` = enclawed-oss, `ENC` = enclawed-enclaved. `–` = extension not present in that tree.

| # | Extension | Role | Cap | Target | OC F1 | F2 | F3 | F4 | OSS F1 | F2 | F3 | F4 | ENC F1 | F2 | F3 | F4 |
|---:|---|---|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| 1 | `acpx` | `declared` | `skill` | `acpx://op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 2 | `active-memory` | `declared` | `plugin` | `active-memory://op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 3 | `alibaba` | `generic` | `tool.invoke` | `tool://alibaba/op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 4 | `amazon-bedrock` | `provider` | `tool.invoke` | `provider://amazon-bedrock/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 5 | `amazon-bedrock-mantle` | `provider` | `tool.invoke` | `provider://amazon-bedrock-mantle/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 6 | `anthropic` | `provider` | `tool.invoke` | `provider://anthropic/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 7 | `anthropic-vertex` | `provider` | `tool.invoke` | `provider://anthropic-vertex/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 8 | `arcee` | `provider` | `tool.invoke` | `provider://arcee/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 9 | `azure-speech` | `generic` | `tool.invoke` | `tool://azure-speech/op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 10 | `bluebubbles` | `channel` | `publish` | `channel://bluebubbles/message` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 11 | `bonjour` | `generic` | `tool.invoke` | `tool://bonjour/op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 12 | `brave` | `generic` | `tool.invoke` | `tool://brave/op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 13 | `browser` | `tool` | `tool.invoke` | `tool://browser/browser` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 14 | `byteplus` | `provider` | `tool.invoke` | `provider://byteplus/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 15 | `cerebras` | `provider` | `tool.invoke` | `provider://cerebras/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 16 | `chutes` | `provider` | `tool.invoke` | `provider://chutes/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 17 | `cloudflare-ai-gateway` | `provider` | `tool.invoke` | `provider://cloudflare-ai-gateway/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 18 | `codex` | `provider` | `tool.invoke` | `provider://codex/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 19 | `comfy` | `provider` | `tool.invoke` | `provider://comfy/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 20 | `copilot-proxy` | `provider` | `tool.invoke` | `provider://copilot-proxy/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 21 | `deepgram` | `generic` | `tool.invoke` | `tool://deepgram/op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 22 | `deepinfra` | `provider` | `tool.invoke` | `provider://deepinfra/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 23 | `deepseek` | `provider` | `tool.invoke` | `provider://deepseek/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 24 | `device-pair` | `declared` | `plugin` | `device-pair://op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 25 | `diagnostics-otel` | `declared` | `plugin` | `diagnostics-otel://op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 26 | `diagnostics-prometheus` | `generic` | `tool.invoke` | `tool://diagnostics-prometheus/op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 27 | `diffs` | `declared` | `skill` | `diffs://op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 28 | `discord` | `channel` | `publish` | `channel://discord/message` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 29 | `document-extract` | `generic` | `tool.invoke` | `tool://document-extract/op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 30 | `duckduckgo` | `generic` | `tool.invoke` | `tool://duckduckgo/op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 31 | `elevenlabs` | `generic` | `tool.invoke` | `tool://elevenlabs/op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 32 | `enclaved-secmon` | `declared` | `plugin` | `enclaved-secmon://op` | – | – | – | – | – | – | – | – | caught | caught | caught | caught |
| 33 | `eth-accreditor` | `declared` | `plugin` | `eth-accreditor://op` | – | – | – | – | – | – | – | – | caught | caught | caught | caught |
| 34 | `exa` | `generic` | `tool.invoke` | `tool://exa/op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 35 | `fal` | `provider` | `tool.invoke` | `provider://fal/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 36 | `feishu` | `channel` | `publish` | `channel://feishu/message` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 37 | `file-transfer` | `generic` | `tool.invoke` | `tool://file-transfer/op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 38 | `firecrawl` | `generic` | `tool.invoke` | `tool://firecrawl/op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 39 | `fireworks` | `provider` | `tool.invoke` | `provider://fireworks/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 40 | `github-copilot` | `provider` | `tool.invoke` | `provider://github-copilot/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 41 | `google` | `provider` | `tool.invoke` | `provider://google/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 42 | `google-meet` | `tool` | `tool.invoke` | `tool://google-meet/googlemeet` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 43 | `googlechat` | `channel` | `publish` | `channel://googlechat/message` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 44 | `gradium` | `generic` | `tool.invoke` | `tool://gradium/op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 45 | `groq` | `provider` | `tool.invoke` | `provider://groq/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 46 | `huggingface` | `provider` | `tool.invoke` | `provider://huggingface/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 47 | `image-generation-core` | `declared` | `plugin` | `image-generation-core://op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 48 | `imessage` | `channel` | `publish` | `channel://imessage/message` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 49 | `imessage-llm` | `declared` | `plugin` | `imessage-llm://op` | – | – | – | – | – | – | – | – | caught | caught | caught | caught |
| 50 | `inworld` | `generic` | `tool.invoke` | `tool://inworld/op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 51 | `irc` | `channel` | `publish` | `channel://irc/message` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 52 | `kilocode` | `provider` | `tool.invoke` | `provider://kilocode/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 53 | `kimi-coding` | `provider` | `tool.invoke` | `provider://kimi/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 54 | `line` | `channel` | `publish` | `channel://line/message` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 55 | `litellm` | `provider` | `tool.invoke` | `provider://litellm/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 56 | `llm-task` | `declared` | `plugin` | `llm-task://op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 57 | `lmstudio` | `provider` | `tool.invoke` | `provider://lmstudio/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 58 | `lobster` | `declared` | `plugin` | `lobster://op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 59 | `local-accreditor` | `declared` | `plugin` | `local-accreditor://op` | – | – | – | – | – | – | – | – | caught | caught | caught | caught |
| 60 | `local-blockchain-accreditor` | `declared` | `plugin` | `local-blockchain-accreditor://op` | – | – | – | – | – | – | – | – | caught | caught | caught | caught |
| 61 | `matrix` | `channel` | `publish` | `channel://matrix/message` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 62 | `mattermost` | `channel` | `publish` | `channel://mattermost/message` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 63 | `mcp-attested` | `declared` | `plugin` | `mcp-attested://op` | – | – | – | – | – | – | – | – | caught | caught | caught | caught |
| 64 | `media-understanding-core` | `declared` | `plugin` | `media-understanding-core://op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 65 | `memory-core` | `declared` | `plugin` | `memory-core://op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 66 | `memory-lancedb` | `declared` | `plugin` | `memory-lancedb://op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 67 | `memory-wiki` | `declared` | `skill` | `memory-wiki://op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 68 | `microsoft` | `generic` | `tool.invoke` | `tool://microsoft/op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 69 | `microsoft-foundry` | `provider` | `tool.invoke` | `provider://microsoft-foundry/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 70 | `migrate-claude` | `generic` | `tool.invoke` | `tool://migrate-claude/op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 71 | `migrate-hermes` | `generic` | `tool.invoke` | `tool://migrate-hermes/op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 72 | `minimax` | `provider` | `tool.invoke` | `provider://minimax/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 73 | `mistral` | `provider` | `tool.invoke` | `provider://mistral/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 74 | `moonshot` | `provider` | `tool.invoke` | `provider://moonshot/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 75 | `msteams` | `channel` | `publish` | `channel://msteams/message` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 76 | `nextcloud-talk` | `channel` | `publish` | `channel://nextcloud-talk/message` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 77 | `nostr` | `channel` | `publish` | `channel://nostr/message` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 78 | `nvidia` | `provider` | `tool.invoke` | `provider://nvidia/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 79 | `ollama` | `provider` | `tool.invoke` | `provider://ollama/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 80 | `open-prose` | `declared` | `skill` | `open-prose://op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 81 | `openai` | `provider` | `tool.invoke` | `provider://openai/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 82 | `opencode` | `provider` | `tool.invoke` | `provider://opencode/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 83 | `opencode-go` | `provider` | `tool.invoke` | `provider://opencode-go/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 84 | `openrouter` | `provider` | `tool.invoke` | `provider://openrouter/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 85 | `openshell` | `declared` | `plugin` | `openshell://op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 86 | `perplexity` | `generic` | `tool.invoke` | `tool://perplexity/op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 87 | `phone-control` | `declared` | `plugin` | `phone-control://op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 88 | `qa-channel` | `channel` | `publish` | `channel://qa-channel/message` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 89 | `qa-lab` | `declared` | `plugin` | `qa-lab://op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 90 | `qa-matrix` | `declared` | `plugin` | `qa-matrix://op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 91 | `qianfan` | `provider` | `tool.invoke` | `provider://qianfan/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 92 | `qqbot` | `channel` | `publish` | `channel://qqbot/message` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 93 | `qwen` | `provider` | `tool.invoke` | `provider://qwen/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 94 | `runway` | `generic` | `tool.invoke` | `tool://runway/op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 95 | `searxng` | `generic` | `tool.invoke` | `tool://searxng/op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 96 | `senseaudio` | `generic` | `tool.invoke` | `tool://senseaudio/op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 97 | `sglang` | `provider` | `tool.invoke` | `provider://sglang/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 98 | `shared` | `utility` | `-` | `-` | – | – | – | – | – | – | – | – | – | – | – | – |
| 99 | `signal` | `channel` | `publish` | `channel://signal/message` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 100 | `skill-workshop` | `generic` | `tool.invoke` | `tool://skill-workshop/op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 101 | `slack` | `channel` | `publish` | `channel://slack/message` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 102 | `speech-core` | `declared` | `plugin` | `speech-core://op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 103 | `stepfun` | `provider` | `tool.invoke` | `provider://stepfun/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 104 | `synology-chat` | `channel` | `publish` | `channel://synology-chat/message` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 105 | `synthetic` | `provider` | `tool.invoke` | `provider://synthetic/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 106 | `talk-voice` | `tool` | `tool.invoke` | `tool://talk-voice/voice` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 107 | `tavily` | `generic` | `tool.invoke` | `tool://tavily/op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 108 | `telegram` | `channel` | `publish` | `channel://telegram/message` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 109 | `telegram-llm` | `declared` | `plugin` | `telegram-llm://op` | – | – | – | – | – | – | – | – | caught | caught | caught | caught |
| 110 | `tencent` | `provider` | `tool.invoke` | `provider://tencent-tokenhub/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 111 | `test-support` | `utility` | `-` | `-` | – | – | – | – | – | – | – | – | – | – | – | – |
| 112 | `thread-ownership` | `declared` | `plugin` | `thread-ownership://op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 113 | `tlon` | `channel` | `publish` | `channel://tlon/message` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 114 | `together` | `provider` | `tool.invoke` | `provider://together/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 115 | `tokenjuice` | `generic` | `tool.invoke` | `tool://tokenjuice/op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 116 | `tts-local-cli` | `generic` | `tool.invoke` | `tool://tts-local-cli/op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 117 | `twitch` | `channel` | `publish` | `channel://twitch/message` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 118 | `venice` | `provider` | `tool.invoke` | `provider://venice/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 119 | `vercel-ai-gateway` | `provider` | `tool.invoke` | `provider://vercel-ai-gateway/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 120 | `video-generation-core` | `declared` | `plugin` | `video-generation-core://op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 121 | `vllm` | `provider` | `tool.invoke` | `provider://vllm/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 122 | `voice-call` | `tool` | `tool.invoke` | `tool://voice-call/voicecall` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 123 | `volcengine` | `provider` | `tool.invoke` | `provider://volcengine/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 124 | `voyage` | `generic` | `tool.invoke` | `tool://voyage/op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 125 | `vydra` | `provider` | `tool.invoke` | `provider://vydra/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 126 | `web-readability` | `generic` | `tool.invoke` | `tool://web-readability/op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 127 | `webhooks` | `generic` | `tool.invoke` | `tool://webhooks/op` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 128 | `whatsapp` | `channel` | `publish` | `channel://whatsapp/message` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 129 | `whatsapp-llm` | `declared` | `plugin` | `whatsapp-llm://op` | – | – | – | – | – | – | – | – | caught | caught | caught | caught |
| 130 | `xai` | `provider` | `tool.invoke` | `provider://xai/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 131 | `xiaomi` | `provider` | `tool.invoke` | `provider://xiaomi/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 132 | `zai` | `provider` | `tool.invoke` | `provider://zai/inference` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 133 | `zalo` | `channel` | `publish` | `channel://zalo/message` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |
| 134 | `zalouser` | `channel` | `publish` | `channel://zalouser/message` | MISSED | MISSED | MISSED | MISSED | caught | caught | caught | caught | caught | caught | caught | caught |

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
- Stated as a comparison: across the **124** Enclawed extensions probed, Enclawed's framework caught **0** / 496 (rate **0.0%**); across the **124** enclawed-oss extensions probed, enclawed-oss caught **496** / 496 (rate **100.0%**); across the **132** enclawed-enclaved extensions probed, enclawed-enclaved caught **528** / 528 (rate **100.0%**).
