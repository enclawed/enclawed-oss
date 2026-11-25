---
summary: "Usage tracking surfaces and credential requirements"
read_when:
  - You are wiring provider usage/quota surfaces
  - You need to explain usage tracking behavior or auth requirements
title: "Usage Tracking"
---

# Usage tracking

## What it is

- Pulls provider usage/quota directly from their usage endpoints.
- No estimated costs; only the provider-reported windows.
- Human-readable status output is normalized to `X% left`, even when an
  upstream API reports consumed quota, remaining quota, or only raw counts.
- Session-level `/status` and `session_status` can fall back to the latest
  transcript usage entry when the live session snapshot is sparse. That
  fallback fills missing token/cache counters, can recover the active runtime
  model label, and prefers the larger prompt-oriented total when session
  metadata is missing or smaller. Existing nonzero live values still win.

## Where it shows up

- `/status` in chats: emoji‑rich status card with session tokens + estimated cost (API key only). Provider usage shows for the **current model provider** when available as a normalized `X% left` window.
- `/usage off|tokens|full` in chats: per-response usage footer (OAuth shows tokens only).
- `/usage cost` in chats: local cost summary aggregated from Enclawed session logs.
- CLI: `enclawed status --usage` prints a full per-provider breakdown.
- CLI: `enclawed channels list` prints the same usage snapshot alongside provider config (use `--no-usage` to skip).
- macOS menu bar: “Usage” section under Context (only if available).

## Providers + credentials

- **Anthropic (Claude)**: OAuth tokens in auth profiles.
- **GitHub Copilot**: OAuth tokens in auth profiles.
- **Gemini CLI**: OAuth tokens in auth profiles.
  - JSON usage falls back to `stats`; `stats.cached` is normalized into
    `cacheRead`.
- **OpenAI Codex**: OAuth tokens in auth profiles (accountId used when present).

Usage is hidden when no usable provider usage auth can be resolved. Providers
can supply plugin-specific usage auth logic; otherwise Enclawed falls back to
matching OAuth/API-key credentials from auth profiles, environment variables,
or config.
