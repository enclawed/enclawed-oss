---
summary: "CLI reference for `enclawed policy` (inspect the effective enclawed.policy block)"
read_when:
  - You want to check which hosts, channels, providers, and tools the policy allows
  - You edited the `enclawed.policy` block and want to confirm it parses as intended
title: "policy"
---

# `enclawed policy`

Inspect the effective Enclawed policy: allowlists and classification
clearances. The command is read-only. It runs the same config-to-policy loader
the runtime uses at startup, prints the result, and changes nothing (it does
not start the runtime and does not write to the audit log).

## `enclawed policy show`

```bash
enclawed policy show
enclawed policy show --json
enclawed policy show --config ./candidate-enclawed.json
```

Options:

- `--config <path>`: load this file instead of the resolved `enclawed.json`
  (useful for checking a candidate config before you apply it).
- `--json`: print machine-readable JSON instead of text.

Output fields:

| Field                | Meaning                                                                       |
| -------------------- | ----------------------------------------------------------------------------- |
| `source`             | The config file the policy came from, or `flavor-default` when none was found |
| `flavor`             | Active hardening flavor (`open` or `enclaved`, from `ENCLAWED_FLAVOR`)        |
| `enforceAllowlists`  | Whether the allowlists below are enforced                                     |
| `allowedHosts`       | Network hosts the runtime may reach                                           |
| `allowedChannels`    | Messaging channels that may be used                                           |
| `allowedProviders`   | Model providers that may be used                                              |
| `allowedTools`       | Agent tools that may run                                                      |
| `commandNetwork`     | Network access for commands the agent runs: `none` or `host`                  |
| `maxOutputClearance` | Highest classification label output may carry                                 |
| `defaultDataLabel`   | Label applied to data that arrives without one                                |

Lists are printed sorted. An empty list prints as `(empty)`.

## The `enclawed.policy` block

The policy is read from the `enclawed.policy` object in `enclawed.json`
(by default `~/.enclawed/enclawed.json`):

```json
{
  "enclawed": {
    "policy": {
      "enforceAllowlists": true,
      "allowedHosts": ["gmail.googleapis.com", "127.0.0.1"],
      "allowedChannels": ["mcp.workspace"],
      "allowedProviders": ["local-model"],
      "allowedTools": [],
      "commandNetwork": "none",
      "maxOutputClearance": "UNCLASSIFIED",
      "defaultDataLabel": "UNCLASSIFIED"
    }
  }
}
```

- Every key is optional. A missing key keeps the flavor default (see
  [Editions and hardening](/reference/editions-and-hardening)). If the file or
  the block is absent, the whole flavor-default policy applies.
- `allowedHosts`, `allowedChannels`, `allowedProviders`, and `allowedTools`
  must be arrays of strings.
- `enforceAllowlists` must be a boolean.
- `commandNetwork` must be `"none"` or `"host"`.
- `maxOutputClearance` and `defaultDataLabel` take either a classification
  string such as `"UNCLASSIFIED"` or `"TOP SECRET//SCI"`, or a label object
  `{ "level": 0, "compartments": [], "releasability": [] }` (`level` is
  required and must be a number; the two lists are optional string arrays).
- Unknown keys are ignored.

## Validating a policy

Run `enclawed policy show` against the file you want to check:

```bash
enclawed policy show --config ./candidate-enclawed.json
```

- Exit code `0`: the block parsed. Compare the printed values with what you
  intended.
- Exit code `1`: the file is not valid JSON, cannot be read, or a field has
  the wrong type. The error names the offending field (for example
  `enclawed.policy.commandNetwork must be "none" or "host"`). With `--json`
  the error is returned as `{ "ok": false, "configPath": ..., "error": ... }`.

A missing config file is not an error: the command reports the flavor-default
policy instead. To validate the rest of `enclawed.json`, use
[`enclawed config validate`](/cli/config).

## Admin policy and the user config

In the enclaved flavor, and whenever an admin policy is present, the
`enclawed.policy` block in the user config can only **narrow** the admin
policy. The admin policy is the root-owned `/etc/enclawed/policy.json`, or an
org-signed policy (see [Admin policy](/security/admin-policy)). Without an
admin policy, the block narrows the enclaved flavor default. Entries that
would widen it are refused at startup and recorded in the audit log, and
`policy show` lists them as `REFUSED`. The `adminPolicy` line shows which
admin policy applies.
