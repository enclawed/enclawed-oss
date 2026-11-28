# Egress Behavioral Invariants

Part of the Enclawed covert-channel egress suite. Requires the `egress-mediator` plugin.

Pipeline stage (priority 50, default mode `audit`). Tracks each destination over time: cancels traffic above 60 payloads or 262144 characters per 60-second window, and flags near-periodic sending as a possible timing channel. Minimum interval, send-time quantization with jitter, and constant-rate paced release are implemented but off.

## Enable

```bash
enclawed plugins enable egress-behavioral-invariants
```

Options go under `plugins.entries.egress-behavioral-invariants.config`.

## Options

| Option                 | Type    | Default  | Effect                                                                     |
| ---------------------- | ------- | -------- | -------------------------------------------------------------------------- |
| `windowMs`             | integer | `60000`  | Rolling window for the rate and volume limits (1 to 86400000)              |
| `maxMessagesPerWindow` | integer | `60`     | Most sends per destination per window                                      |
| `maxBytesPerWindow`    | integer | `262144` | Most characters per destination per window                                 |
| `minIntervalMs`        | integer | `0`      | Minimum spacing between sends (0 = off)                                    |
| `timingQuantumMs`      | integer | `0`      | Snap send times to a grid of this many ms (0 = off)                        |
| `jitterMs`             | integer | `0`      | Random jitter on top of quantization; requires `timingQuantumMs` above 0   |
| `releaseCadenceMs`     | integer | `0`      | Constant-rate paced release: sends leave at least this far apart (0 = off) |

A tool call counts once toward the limits, however many arguments it has. Invalid values (wrong type, out of range, unknown keys) stop the plugin from loading rather than silently weakening it.

## Documentation

[Covert-Channel Egress Defense](https://github.com/enclawed/enclawed-oss/blob/main/docs/security/covert-channel-egress.md#behavioral-invariants)
