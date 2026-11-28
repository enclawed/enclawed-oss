# Egress LLM Scrambler

Part of the Enclawed covert-channel egress suite. Requires the `egress-mediator` plugin.

Pipeline stage (priority 46, default mode `audit`). Rephrases each payload through a model under a fixed, compiled-in instruction, discarding every wording-level hidden encoding. `egress-mediator` connects it to the configured model (see its `llm` options). In `enforce` mode it fails closed: with no model, or on a model error or empty reply, the payload is blocked. A payload longer than one model call (8000 characters, fixed) is split at whitespace and every piece is rephrased. The model-backed alternative to `egress-semantic-scrambler`; enable at most one.

## Enable

```bash
enclawed plugins enable egress-llm-scrambler
```

Options go under `plugins.entries.egress-llm-scrambler.config`.

## Options

| Option    | Type    | Default | Effect                              |
| --------- | ------- | ------- | ----------------------------------- |
| `enabled` | boolean | `true`  | `false` skips registering the stage |

The former `maxChars` option is retired (it let long payloads pass unscrambled); a config that sets it is refused.

Invalid values (wrong type, unknown keys) refuse gateway start rather than silently weakening the stage.

In `audit` mode the stage does not call the model: it records an `llm-rephrase-audit` finding for each payload enforce would rephrase and passes it unchanged. In `enforce` mode a tool call's string arguments are rephrased one by one, so the argument structure survives.

## Documentation

[Covert-Channel Egress Defense](https://github.com/enclawed/enclawed-oss/blob/main/docs/security/covert-channel-egress.md#llm-scrambler)
