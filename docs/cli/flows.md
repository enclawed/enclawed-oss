---
summary: "Redirect: flow commands live under `enclawed tasks flow`"
read_when:
  - You encounter enclawed flows in older docs or release notes
title: "flows (redirect)"
---

# `enclawed tasks flow`

Flow commands are subcommands of `enclawed tasks`, not a standalone `flows` command.

```bash
enclawed tasks flow list [--json]
enclawed tasks flow show <lookup>
enclawed tasks flow cancel <lookup>
```

For full documentation see [Task Flow](/automation/taskflow) and the [tasks CLI reference](/cli/index#tasks).
