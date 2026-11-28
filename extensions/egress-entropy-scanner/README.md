# Egress Entropy Scanner

Part of the Enclawed covert-channel egress suite. Requires the `egress-mediator` plugin.

Pipeline stage (priority 30, default mode `audit`). Estimates how many hidden bits a payload could carry (base64 and hex runs, near-random character entropy, incompressible text) and charges the estimate to the per-destination capacity ledger. In `enforce` mode it cancels a payload when the ledger is empty.

## Enable

```bash
enclawed plugins enable egress-entropy-scanner
```

Options go under `plugins.entries.egress-entropy-scanner.config`.

## Options

| Option                 | Type    | Default | Range         | Effect                                                        |
| ---------------------- | ------- | ------- | ------------- | ------------------------------------------------------------- |
| `minBlobLength`        | integer | `64`    | 8 to 65536    | Shortest base64 or hex run counted as an encoded blob         |
| `entropyThresholdBits` | number  | `5.4`   | above 0 to 16 | Character entropy (bits per character) above which to flag    |
| `incompressibleRatio`  | number  | `0.92`  | above 0 to 1  | Compressed-to-raw size ratio above which a message is flagged |

Invalid values (wrong type, out of range, unknown keys) stop the plugin from loading rather than silently weakening it.

## Documentation

[Covert-Channel Egress Defense](https://github.com/enclawed/enclawed-oss/blob/main/docs/security/covert-channel-egress.md#entropy-scanner)
