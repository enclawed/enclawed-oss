# Egress Taint Tracker

Part of the Enclawed covert-channel egress suite. Requires the `egress-mediator` plugin.

Pipeline stage (priority 20, default mode `enforce`). Blocks payloads carrying credentials (API keys, tokens, private-key headers, JWTs, bearer tokens, Luhn-valid card numbers) and values an application has tagged as sensitive with `tagSensitiveValue` (shared, process-wide taint store). Email and IP addresses are reported but never block.

## Enable

```bash
enclawed plugins enable egress-taint-tracker
```

Options go under `plugins.entries.egress-taint-tracker.config`.

## Options

| Option    | Type    | Default | Effect                              |
| --------- | ------- | ------- | ----------------------------------- |
| `enabled` | boolean | `true`  | `false` skips registering the stage |

Invalid values (wrong type, out of range, unknown keys) stop the plugin from loading rather than silently weakening it.

## Tagging sensitive values

Applications tag values with `tagSensitiveValue` from `enclawed/framework`. A value tagged without a scope is blocked at every destination; one tagged with `{ scope: conversationId }` only in that conversation. Values shorter than 8 characters are ignored.

```ts
import { tagSensitiveValue } from "enclawed/framework";

tagSensitiveValue(sessionCanary, { label: "session-canary" });
```

## Documentation

[Covert-Channel Egress Defense](https://github.com/enclawed/enclawed-oss/blob/main/docs/security/covert-channel-egress.md#taint-tracker)
