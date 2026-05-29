---
summary: "CLI reference for `enclawed browser` (lifecycle, profiles, tabs, actions, state, and debugging)"
read_when:
  - You use `enclawed browser` and want examples for common tasks
  - You want to control a browser running on another machine via a node host
  - You want to attach to your local signed-in Chrome via Chrome MCP
title: "browser"
---

# `enclawed browser`

Manage Enclawed's browser control surface and run browser actions (lifecycle, profiles, tabs, snapshots, screenshots, navigation, input, state emulation, and debugging).

Related:

- Browser tool + API: [Browser tool](/tools/browser)

## Common flags

- `--url <gatewayWsUrl>`: Gateway WebSocket URL (defaults to config).
- `--token <token>`: Gateway token (if required).
- `--timeout <ms>`: request timeout (ms).
- `--expect-final`: wait for a final Gateway response.
- `--browser-profile <name>`: choose a browser profile (default from config).
- `--json`: machine-readable output (where supported).

## Quick start (local)

```bash
enclawed browser profiles
enclawed browser --browser-profile enclawed start
enclawed browser --browser-profile enclawed open https://example.com
enclawed browser --browser-profile enclawed snapshot
```

## Quick troubleshooting

If `start` fails with `not reachable after start`, troubleshoot CDP readiness first. If `start` and `tabs` succeed but `open` or `navigate` fails, the browser control plane is healthy and the failure is usually navigation SSRF policy.

Minimal sequence:

```bash
enclawed browser --browser-profile enclawed start
enclawed browser --browser-profile enclawed tabs
enclawed browser --browser-profile enclawed open https://example.com
```

Detailed guidance: [Browser troubleshooting](/tools/browser#cdp-startup-failure-vs-navigation-ssrf-block)

## Lifecycle

```bash
enclawed browser status
enclawed browser start
enclawed browser stop
enclawed browser --browser-profile enclawed reset-profile
```

Notes:

- For `attachOnly` and remote CDP profiles, `enclawed browser stop` closes the
  active control session and clears temporary emulation overrides even when
  Enclawed did not launch the browser process itself.
- For local managed profiles, `enclawed browser stop` stops the spawned browser
  process.

## If the command is missing

If `enclawed browser` is an unknown command, check `plugins.allow` in
`~/.enclawed/enclawed.json`.

When `plugins.allow` is present, the bundled browser plugin must be listed
explicitly:

```json5
{
  plugins: {
    allow: ["telegram", "browser"],
  },
}
```

`browser.enabled=true` does not restore the CLI subcommand when the plugin
allowlist excludes `browser`.

Related: [Browser tool](/tools/browser#missing-browser-command-or-tool)

## Profiles

Profiles are named browser routing configs. In practice:

- `enclawed`: launches or attaches to a dedicated Enclawed-managed Chrome instance (isolated user data dir).
- `user`: controls your existing signed-in Chrome session via Chrome DevTools MCP.
- custom CDP profiles: point at a local or remote CDP endpoint.

```bash
enclawed browser profiles
enclawed browser create-profile --name work --color "#FF5A36"
enclawed browser create-profile --name chrome-live --driver existing-session
enclawed browser create-profile --name remote --cdp-url https://browser-host.example.com
enclawed browser delete-profile --name work
```

Use a specific profile:

```bash
enclawed browser --browser-profile work tabs
```

## Tabs

```bash
enclawed browser tabs
enclawed browser tab new
enclawed browser tab select 2
enclawed browser tab close 2
enclawed browser open https://docs.enclawed.ai
enclawed browser focus <targetId>
enclawed browser close <targetId>
```

## Snapshot / screenshot / actions

Snapshot:

```bash
enclawed browser snapshot
```

Screenshot:

```bash
enclawed browser screenshot
enclawed browser screenshot --full-page
enclawed browser screenshot --ref e12
```

Notes:

- `--full-page` is for page captures only; it cannot be combined with `--ref`
  or `--element`.
- `existing-session` / `user` profiles support page screenshots and `--ref`
  screenshots from snapshot output, but not CSS `--element` screenshots.

Navigate/click/type (ref-based UI automation):

```bash
enclawed browser navigate https://example.com
enclawed browser click <ref>
enclawed browser type <ref> "hello"
enclawed browser press Enter
enclawed browser hover <ref>
enclawed browser scrollintoview <ref>
enclawed browser drag <startRef> <endRef>
enclawed browser select <ref> OptionA OptionB
enclawed browser fill --fields '[{"ref":"1","value":"Ada"}]'
enclawed browser wait --text "Done"
enclawed browser evaluate --fn '(el) => el.textContent' --ref <ref>
```

File + dialog helpers:

```bash
enclawed browser upload /tmp/enclawed/uploads/file.pdf --ref <ref>
enclawed browser waitfordownload
enclawed browser download <ref> report.pdf
enclawed browser dialog --accept
```

## State and storage

Viewport + emulation:

```bash
enclawed browser resize 1280 720
enclawed browser set viewport 1280 720
enclawed browser set offline on
enclawed browser set media dark
enclawed browser set timezone Europe/London
enclawed browser set locale en-GB
enclawed browser set geo 51.5074 -0.1278 --accuracy 25
enclawed browser set device "iPhone 14"
enclawed browser set headers '{"x-test":"1"}'
enclawed browser set credentials myuser mypass
```

Cookies + storage:

```bash
enclawed browser cookies
enclawed browser cookies set session abc123 --url https://example.com
enclawed browser cookies clear
enclawed browser storage local get
enclawed browser storage local set token abc123
enclawed browser storage session clear
```

## Debugging

```bash
enclawed browser console --level error
enclawed browser pdf
enclawed browser responsebody "**/api"
enclawed browser highlight <ref>
enclawed browser errors --clear
enclawed browser requests --filter api
enclawed browser trace start
enclawed browser trace stop --out trace.zip
```

## Existing Chrome via MCP

Use the built-in `user` profile, or create your own `existing-session` profile:

```bash
enclawed browser --browser-profile user tabs
enclawed browser create-profile --name chrome-live --driver existing-session
enclawed browser create-profile --name brave-live --driver existing-session --user-data-dir "~/Library/Application Support/BraveSoftware/Brave-Browser"
enclawed browser --browser-profile chrome-live tabs
```

This path is host-only. For Docker, headless servers, Browserless, or other remote setups, use a CDP profile instead.

Current existing-session limits:

- snapshot-driven actions use refs, not CSS selectors
- `click` is left-click only
- `type` does not support `slowly=true`
- `press` does not support `delayMs`
- `hover`, `scrollintoview`, `drag`, `select`, `fill`, and `evaluate` reject
  per-call timeout overrides
- `select` supports one value only
- `wait --load networkidle` is not supported
- file uploads require `--ref` / `--input-ref`, do not support CSS
  `--element`, and currently support one file at a time
- dialog hooks do not support `--timeout`
- screenshots support page captures and `--ref`, but not CSS `--element`
- `responsebody`, download interception, PDF export, and batch actions still
  require a managed browser or raw CDP profile

## Remote browser control (node host proxy)

If the Gateway runs on a different machine than the browser, run a **node host** on the machine that has Chrome/Brave/Edge/Chromium. The Gateway will proxy browser actions to that node (no separate browser control server required).

Use `gateway.nodes.browser.mode` to control auto-routing and `gateway.nodes.browser.node` to pin a specific node if multiple are connected.

Security + remote setup: [Browser tool](/tools/browser), [Remote access](/gateway/remote), [Tailscale](/gateway/tailscale), [Security](/gateway/security)
