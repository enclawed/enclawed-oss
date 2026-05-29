# Secretary demo

An AI secretary that reads inbound Gmail, replies to senders in the
principal's Google Contacts, refuses everyone else with a fixed
template, and emails an end of day summary. The LLM is **Ollama**,
running locally; no cloud model call, ever.

This directory is a standalone Node application that depends on the
`enclawed` framework via the workspace. It is also the reference example
the framework SDK is built around — every primitive it consumes is
exposed publicly under `enclawed/framework`.

## Install

The full walkthrough (Google Cloud Console setup with screenshots, the
install command, and what to expect afterwards) lives at:

**https://www.enclawed.com/enclawed-apps/secretary**

The short version, once you have a Google OAuth Client ID and secret:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/enclawed/enclawed-oss/main/enclawed-apps/install.sh) secretary
```

The installer detects your OS, installs Node 22 and Ollama if missing,
runs the Google OAuth flow in your browser, writes
`~/.enclawed/enclawed-apps/secretary/.env`, and registers the agent as a
launchd / systemd-user service.

## Architecture in one diagram

```
                            ┌──────────────────────┐
            Gmail/Cal/People│ Google MCP endpoints │
                            └──────────┬───────────┘
                                       │ HTTPS, OAuth refresh token
                       ┌───────────────▼────────────────┐
                       │  mcp-attested registry         │   closed allowedTools:
                       │  - per-bridge clearance        │     gmail: search_threads, get_thread,
                       │  - per-call admission gate     │            create_draft, send_draft,
                       └───────────────┬────────────────┘            modify_thread_labels
                                       │                      calendar: list_events, get_event
                       ┌───────────────▼────────────────┐     people: search_contacts, list_contacts
                       │  SkillGate.dispatch            │
                       │  - audits (irreversible.*)     │
                       │  - reversible txn buffer       │
                       └───────────────┬────────────────┘
                                       │
                       ┌───────────────▼────────────────┐
       broker ──────►  │  Bicriterion HITL broker       │
       (stdin keypress │  - F-class routing             │
        OR scripted    │  - DLP severity → keypress     │
        deny)          │  - critical → unconditional    │
                       └───────────────┬────────────────┘
                                       │
                       ┌───────────────▼────────────────┐
                       │  Refusal gate (DETERMINISTIC)  │
                       │  - non-contact → frozen text   │
                       │  - LLM never sees calendar     │
                       │    until sender ∈ contacts     │
                       └───────────────┬────────────────┘
                                       │
                       ┌───────────────▼────────────────┐
                       │  Ollama (loopback only)        │   compose-only;
                       │  - not in the audit projection │   not gated.
                       └────────────────────────────────┘
```

Defense layers, mapped to the paper's failure modes:

| F   | Paper §6.3 line | Where it is closed                                                |
| --- | --------------- | ----------------------------------------------------------------- |
| F1  | 667–669         | All writes route through `SkillGate.dispatch()` (structural)      |
| F2  | 670–672         | Hash chained audit + `verifyChain()` after every run              |
| F3  | 673–675         | Tool wrappers parse echo; missing fields → `irreversible.error`   |
| F4  | 676–678         | Target string carries SHA-256(to, subject, body) + recipient      |
| F5  | 708–715         | DLP scanner + bicriterion broker; LLM never controls refusal text |

Known live gap: the framework egress guard wraps `globalThis.fetch`
only. Raw `node:net` / `tls.connect` sockets opened by in-process code
bypass the audit. Production closure: run the secretary inside a network
namespace pinned to Google hosts (see `security/nft.rules.example`).

## Files

```
enclawed-apps/secretary/
├── package.json            (declares `enclawed: workspace:*`)
├── app.config.json        (provider type, scopes, service, labels)
├── README.md               (this file)
├── .env.example            env reference (mirrors what the installer writes)
├── task.md                 reference copy of LLM prompts + refusal text
├── bin/install.sh          backward-compat shim → enclawed-apps/install.sh secretary
├── security/
│   └── nft.rules.example   process-level egress filter
└── src/
    ├── main.ts             CLI entrypoint (argv → runDemo)
    ├── runDemo.ts          orchestrator (synthesizes the SkillManifest in-process)
    ├── runtime-state.ts    in-memory thread record
    ├── policy/             bicriterion-broker, DLP, refusal-template
    ├── tools/              gate-wired Gmail/Calendar/People wrappers + Ollama client
    └── scheduler/          poll loop + EOD trigger
```

## Limitations

- **Raw socket egress** — the user space egress guard wraps `fetch`, not
  `node:net`. Closure for production: run the demo inside the network
  namespace described in `security/nft.rules.example`, or wait for the
  proposed framework level patch.
- **OAuth token storage** — refresh tokens live in
  `~/.enclawed/enclawed-apps/secretary/.env` at chmod 600. For a real deployment,
  plug `gcloud auth application-default login` against a service account
  whose token never lives on disk in the clear.
- **Calendar visibility** — even authorized contacts see only the same
  coarse summary the LLM is told to use ("sometime next week"), unless
  they explicitly ask for a slot. The hard guardrail is that the LLM
  only sees the calendar after `searchContactByEmail` returns a match.
