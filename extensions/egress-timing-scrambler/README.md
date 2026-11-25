# Egress Timing Scrambler

Part of the Enclawed covert-channel egress suite. Requires the `egress-mediator` plugin.

Pipeline stage (priority 48, default mode `audit`). Adds a cryptographically random delay before each outbound channel message or tool call, so the gaps between messages carry less attacker-chosen signal. Reduces timing capacity; does not drive it to zero.

## Enable

```bash
enclawed plugins enable egress-timing-scrambler
```

Options go under `plugins.entries.egress-timing-scrambler.config`.

## Options

| Option       | Type    | Default | Range       | Effect                                              |
| ------------ | ------- | ------- | ----------- | --------------------------------------------------- |
| `enabled`    | boolean | `true`  |             | `false` skips registering the stage                 |
| `minDelayMs` | integer | `0`     | 0 to 600000 | Shortest random delay; must not exceed `maxDelayMs` |
| `maxDelayMs` | integer | `750`   | 0 to 600000 | Longest random delay                                |

A tool call gets one delay, however many arguments it has. Invalid values (wrong type, out of range, unknown keys) stop the plugin from loading rather than silently weakening it.

## Documentation

[Covert-Channel Egress Defense](https://github.com/enclawed/enclawed-oss/blob/main/docs/security/covert-channel-egress.md#timing-scrambler)
