---
summary: "CLI reference for `enclawed conformance` (verify Enclawed's security guarantees on your installation)"
read_when:
  - You want to confirm that the security guarantees hold on this installation
  - You are auditing an installation or accepting a delivered package
title: "conformance"
---

# `enclawed conformance`

Check the security guarantees Enclawed makes. Run `enclawed conformance` to verify these guarantees on your own installation.

```bash
enclawed conformance
enclawed conformance --json
enclawed conformance --only approval-replay,approval-toctou
```

Each check runs inside the command's own process against the installed product, with throwaway directories and a local test server. The command does not read or change your configuration, does not use the network and never opens a hardware device.

The output has one line per guarantee: `PASS` or `FAIL`, and what the guarantee means. A failing line also says what went wrong and what to do. A guarantee that cannot be checked here is shown as `SKIP` with a note. The exit code is 0 only when no check fails.

## What is checked

- **MCP tool-definition drift:** a tool whose definition changes after its server was admitted is refused, and logged, until the server is admitted again; unchanged tools keep working.
- **Untrusted tool results:** a hostile result from a tool whose definition never changed is cleaned before the model reads it, and the action it asks for still goes through the per-action gate.
- **Approval single use and binding:** an approval runs one execution of the exact tool, arguments and target it was given for.
- **Approval-to-execution resource changes:** a file or directory that is swapped, replaced, hard-linked or renamed after approval makes the action refused until it is approved again.
- **Egress mediation** and the **choice-channel batcher.**
- **Fail-closed security plugins** and the **escape-hatch gate.**
- **Hardware root, host side:** forged or mismatched device evidence is refused. Guarantees that need the device itself are not checked by this command.
- **MCP server admission.**

The full list, with the tests that prove each guarantee in the source tree, is in [`conformance/README.md`](https://github.com/enclawed/enclawed-oss/blob/main/conformance/README.md).

## JSON output

`--json` prints `{ ok, passed, failed, skipped, results }`, where each result has `id`, `title`, `proves`, `status` (`pass`, `fail` or `skip`), and, when relevant, `detail` and `remedy`.
