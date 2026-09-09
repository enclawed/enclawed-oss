---
summary: "CLI reference for `enclawed docs` (search the live docs index)"
read_when:
  - You want to search the live Enclawed docs from the terminal
title: "docs"
---

# `enclawed docs`

Search the live docs index.

Arguments:

- `[query...]`: search terms to send to the live docs index

Examples:

```bash
enclawed docs
enclawed docs browser existing-session
enclawed docs sandbox allowHostControl
enclawed docs gateway token secretref
```

Notes:

- With no query, `enclawed docs` opens the live docs search entrypoint.
- Multi-word queries are passed through as one search request.
