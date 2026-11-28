# Egress Canonicalizer

Part of the Enclawed covert-channel egress suite. Requires the `egress-mediator` plugin.

Pipeline stage (priority 10, default mode `enforce`). Losslessly removes hidden-text carriers that have no legitimate use: invisible and zero-width characters, Unicode Tag characters, extra variation selectors, bidirectional controls, mixed-script homoglyphs, exotic spaces and trailing whitespace, non-canonical Unicode (NFC), and JSON key order. Emoji joiners and presentation selectors are kept.

## Enable

```bash
enclawed plugins enable egress-canonicalizer
```

Options go under `plugins.entries.egress-canonicalizer.config`.

## Options

Each transform can be switched off on its own; all default to `true`. To skip the whole stage, set `egress-mediator` config `stages["egress-canonicalizer"].mode` to `off`.

| Option                | Type    | Default | Effect                                                      |
| --------------------- | ------- | ------- | ----------------------------------------------------------- |
| `unicodeNfc`          | boolean | `true`  | Normalize Unicode to NFC                                    |
| `stripInvisible`      | boolean | `true`  | Remove invisible, zero-width and Tag characters             |
| `stripBidi`           | boolean | `true`  | Remove bidirectional controls                               |
| `foldMixedScript`     | boolean | `true`  | Fold look-alike letters in mixed-script words to ASCII      |
| `normalizeWhitespace` | boolean | `true`  | Turn exotic spaces into spaces and drop trailing whitespace |
| `canonicalizeJson`    | boolean | `true`  | Re-emit a whole JSON payload (or tool argument) sorted      |

Invalid values (wrong type, out of range, unknown keys) stop the plugin from loading rather than silently weakening it.

## Documentation

[Covert-Channel Egress Defense](https://github.com/enclawed/enclawed-oss/blob/main/docs/security/covert-channel-egress.md#canonicalizer)
