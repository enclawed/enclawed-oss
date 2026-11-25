# Egress Noise Injector

Part of the Enclawed covert-channel egress suite. Requires the `egress-mediator` plugin.

Pipeline stage (priority 40, default mode `audit`). Collapses visible details a reader does not notice: whitespace runs, typographic variants (curly quotes, dashes, ellipsis, no-break space), and repeated `!`, `?` or `.`. Mildly lossy, so it starts in audit.

## Enable

```bash
enclawed plugins enable egress-noise-injector
```

Options go under `plugins.entries.egress-noise-injector.config`.

## Options

| Option                    | Type    | Default | Effect                                        |
| ------------------------- | ------- | ------- | --------------------------------------------- |
| `collapseWhitespaceRuns`  | boolean | `true`  | Collapse runs of spaces, tabs and blank lines |
| `normalizeTypography`     | boolean | `true`  | Map typographic variants to plain ASCII       |
| `collapsePunctuationRuns` | boolean | `true`  | Collapse repeated `!`, `?` or `.` to one      |

Invalid values (wrong type, out of range, unknown keys) stop the plugin from loading rather than silently weakening it.

## Documentation

[Covert-Channel Egress Defense](https://github.com/enclawed/enclawed-oss/blob/main/docs/security/covert-channel-egress.md#noise-injector)
