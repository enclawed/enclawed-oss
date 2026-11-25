---
summary: "CLI reference for `enclawed docs` (search the docs/ folder on GitHub)"
read_when:
  - You want to search the Enclawed docs from the terminal
title: "docs"
---

# `enclawed docs`

Search the Enclawed docs. There is no hosted docs site: the docs are the
Markdown files under [`docs/`](https://github.com/enclawed/enclawed-oss/tree/main/docs)
in the public enclawed-oss repository.

Arguments:

- `[query...]`: search terms

Examples:

```bash
enclawed docs
enclawed docs browser existing-session
enclawed docs sandbox allowHostControl
enclawed docs gateway token secretref
```

Notes:

- With no query, `enclawed docs` prints the link to the docs folder.
- With a query, it prints a GitHub code-search link scoped to `docs/` in
  `enclawed/enclawed-oss`. Multi-word queries are passed through as one search.
