# Egress Cover Traffic

Part of the Enclawed covert-channel egress suite. Requires the `egress-mediator` plugin.

Background service, off by default. Sends a fixed filler message to a configured destination on a constant or Poisson schedule so that whether, and how often, the agent sends says less about real activity. Sent through the channel by `egress-mediator`; use only a destination you control.

## Enable

```bash
enclawed plugins enable egress-cover-traffic
```

Options go under `plugins.entries.egress-cover-traffic.config`.

## Options

| Option           | Type                        | Default         | Effect                           |
| ---------------- | --------------------------- | --------------- | -------------------------------- |
| `enabled`        | boolean                     | `false`         | Start the service                |
| `mode`           | `"constant"` or `"poisson"` | `"poisson"`     | Filler schedule                  |
| `meanIntervalMs` | integer                     | `60000`         | Mean spacing, 1000 to 86400000   |
| `coverContent`   | string                      | `"[keepalive]"` | Filler text                      |
| `target.to`      | string                      | none            | Recipient; required when enabled |
| `target.channel` | string                      | none            | Channel id; required for sending |

The config fails closed: an unknown key, a wrong type, an out-of-range interval, or `enabled: true` without `target.to` refuses the plugin at load.

Real traffic is its own cover: every delivered real channel message resets the idle clock, so filler is only sent after `meanIntervalMs` without real traffic.

## Documentation

[Covert-Channel Egress Defense](https://github.com/enclawed/enclawed-oss/blob/main/docs/security/covert-channel-egress.md#cover-traffic)
