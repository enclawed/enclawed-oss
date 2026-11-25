# Egress Mediator

Part of the Enclawed covert-channel egress suite.

The reference monitor of the covert-channel egress suite. It owns the chokepoints, runs every registered egress stage over each payload in priority order, keeps the per-destination capacity ledger, and records findings. It also connects the LLM scrambler to the configured model and the cover-traffic service to the channel send path.

Chokepoints:

- outbound channel messages (always on). `message_sending` and `media_sending` fire on every path that sends agent output: core outbound delivery, the reply dispatcher (every channel's replies), message-tool actions (including channels that handle `send` themselves), and the channel paths outside both (Telegram command replies, the WhatsApp heartbeat, Voice Call speech). Streaming previews are withheld while a send hook is registered;
- outbound arguments of egress tools (off by default; on in the hardened posture `ENCLAWED_FLAVOR=enclaved`);
- tool results and inbound channel messages before they reach the model (off by default; on in the hardened posture);
- attachments of outbound channel messages, through the media scramblers and canonical media order (on; inert until a media scrambler plugin is enabled or `egress-media-order` enforces).

A tool call is mediated as one payload: the timing delay applies once and the call counts once toward rate limits.

Explicit config always wins over the posture default.

The config fails closed. An unknown key at any level, a wrong type, an out-of-range value, or an unknown stage id refuses the plugin at load (`failed during register`) instead of falling back to a default.

## Enable

```bash
enclawed plugins enable egress-mediator
```

Options go under `plugins.entries.egress-mediator.config`.

## Options

| Option                      | Type                       | Default                                                                              | Effect                                                            |
| --------------------------- | -------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `enabled`                   | boolean                    | `true`                                                                               | Master switch; `false` passes everything through                  |
| `posture`                   | `"default"` or `"enforce"` | `"default"`                                                                          | `enforce` sets every stage to enforce; `stages` entries still win |
| `stages.<stage-id>.mode`    | `enforce`, `audit`, `off`  | staged defaults                                                                      | Per-stage mode                                                    |
| `ledger.capacityBits`       | number                     | `4096`                                                                               | Capacity ledger bucket size                                       |
| `ledger.refillBitsPerSec`   | number                     | `256`                                                                                | Capacity ledger refill rate; `0` means no refill                  |
| `toolCall.enabled`          | boolean                    | off; on when hardened                                                                | Mediate outbound tool arguments                                   |
| `toolCall.tools`            | string array               | `message`, `sessions_send`, `web_fetch`, `web_search`, `x_search`, `browser`, `tlon` | Tools always mediated                                             |
| `toolCall.commandTools`     | string array               | `exec`, `bash`                                                                       | Shell tools, mediated only when the command reaches the network   |
| `modelInput.enabled`        | boolean                    | off; on when hardened                                                                | Mediate what enters the model context                             |
| `modelInput.toolResults`    | boolean                    | `true`                                                                               | Include tool results                                              |
| `modelInput.inbound`        | boolean                    | `true`                                                                               | Include inbound channel messages                                  |
| `llm.enabled`               | boolean                    | `true`                                                                               | Connect the LLM scrambler to a model                              |
| `llm.provider`, `llm.model` | string                     | configured default model                                                             | Model used for rephrasing                                         |
| `llm.timeoutMs`             | integer                    | `30000`                                                                              | Per-rephrase timeout, 1 to 600000                                 |
| `coverTraffic.enabled`      | boolean                    | `true`                                                                               | Back cover traffic with the channel send path                     |
| `media.enabled`             | boolean                    | `true`                                                                               | Mediate outbound attachments                                      |

## Documentation

[Covert-Channel Egress Defense](https://github.com/enclawed/enclawed-oss/blob/main/docs/security/covert-channel-egress.md)
