---
name: _formal-demo
description: Demo skill exercising the formal-verification pipeline. Fetches a URL and writes the body to a cache.
caps: ["net.egress", "fs.read", "fs.write.rev"]
version: 1
---

# Formal-verify demo

Runs `fetch.py` to pull `https://api.example.com/foo` and stash the
body under `./.cache/`. Run via `tool.invoke` after admission.
