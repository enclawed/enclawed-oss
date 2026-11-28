# Egress Replay Sentinel

Part of the Enclawed covert-channel egress suite. Requires the `egress-mediator` plugin.

Pipeline stage (priority 35, default mode `audit`). Flags a payload that repeats an earlier one to the same destination with only cosmetic differences, and records the difference in the capacity ledger. Detection only: it never rewrites or blocks.

## Enable

```bash
enclawed plugins enable egress-replay-sentinel
```

Options go under `plugins.entries.egress-replay-sentinel.config`.

## Options

| Option           | Type    | Default | Range     | Effect                                                       |
| ---------------- | ------- | ------- | --------- | ------------------------------------------------------------ |
| `historyPerSink` | integer | `16`    | 1 to 1024 | Earlier messages per destination each new one is compared to |

A tool call counts as one message, however many arguments it has. Invalid values (wrong type, out of range, unknown keys) stop the plugin from loading rather than silently weakening it.

## Documentation

[Covert-Channel Egress Defense](https://github.com/enclawed/enclawed-oss/blob/main/docs/security/covert-channel-egress.md#replay-sentinel)
