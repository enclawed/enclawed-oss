# Egress Semantic Scrambler

Part of the Enclawed covert-channel egress suite. Requires the `egress-mediator` plugin.

Pipeline stage (priority 45, default mode `audit`). Deterministically collapses word-choice channels: synonyms in 24 curated groups map to one word, contractions expand, and simple passive sentences become active. The model-free alternative to `egress-llm-scrambler`; enable at most one.

## Enable

```bash
enclawed plugins enable egress-semantic-scrambler
```

Options go under `plugins.entries.egress-semantic-scrambler.config`.

## Options

| Option                 | Type    | Default | Effect                                              |
| ---------------------- | ------- | ------- | --------------------------------------------------- |
| `enabled`              | boolean | `true`  | `false` skips registering the stage                 |
| `expandContractions`   | boolean | `true`  | Expand contractions to one full form                |
| `canonicalizeSynonyms` | boolean | `true`  | Collapse curated synonym groups to one word         |
| `passiveToActive`      | boolean | `true`  | Rewrite simple agentive passive sentences as active |

Invalid values (wrong type, out of range, unknown keys) stop the plugin from loading rather than silently weakening it.

## Documentation

[Covert-Channel Egress Defense](https://github.com/enclawed/enclawed-oss/blob/main/docs/security/covert-channel-egress.md#semantic-scrambler)
