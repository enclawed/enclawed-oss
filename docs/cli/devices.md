---
summary: "CLI reference for `enclawed devices` (device pairing + token rotation/revocation)"
read_when:
  - You are approving device pairing requests
  - You need to rotate or revoke device tokens
title: "devices"
---

# `enclawed devices`

Manage device pairing requests and device-scoped tokens.

## Commands

### `enclawed devices list`

List pending pairing requests and paired devices.

```
enclawed devices list
enclawed devices list --json
```

Pending request output includes the requested role and scopes so approvals can
be reviewed before you approve.

### `enclawed devices remove <deviceId>`

Remove one paired device entry.

When you are authenticated with a paired device token, non-admin callers can
remove only **their own** device entry. Removing some other device requires
`operator.admin`.

```
enclawed devices remove <deviceId>
enclawed devices remove <deviceId> --json
```

### `enclawed devices clear --yes [--pending]`

Clear paired devices in bulk.

```
enclawed devices clear --yes
enclawed devices clear --yes --pending
enclawed devices clear --yes --pending --json
```

### `enclawed devices approve [requestId] [--latest]`

Approve a pending device pairing request by exact `requestId`. If `requestId`
is omitted or `--latest` is passed, Enclawed only prints the selected pending
request and exits; rerun approval with the exact request ID after verifying
the details.

Note: if a device retries pairing with changed auth details (role/scopes/public
key), Enclawed supersedes the previous pending entry and issues a new
`requestId`. Run `enclawed devices list` right before approval to use the
current ID.

```
enclawed devices approve
enclawed devices approve <requestId>
enclawed devices approve --latest
```

### `enclawed devices reject <requestId>`

Reject a pending device pairing request.

```
enclawed devices reject <requestId>
```

### `enclawed devices rotate --device <id> --role <role> [--scope <scope...>]`

Rotate a device token for a specific role (optionally updating scopes).
The target role must already exist in that device's approved pairing contract;
rotation cannot mint a new unapproved role.
If you omit `--scope`, later reconnects with the stored rotated token reuse that
token's cached approved scopes. If you pass explicit `--scope` values, those
become the stored scope set for future cached-token reconnects.
Non-admin paired-device callers can rotate only their **own** device token.
Also, any explicit `--scope` values must stay within the caller session's own
operator scopes; rotation cannot mint a broader operator token than the caller
already has.

```
enclawed devices rotate --device <deviceId> --role operator --scope operator.read --scope operator.write
```

Returns the new token payload as JSON.

### `enclawed devices revoke --device <id> --role <role>`

Revoke a device token for a specific role.

Non-admin paired-device callers can revoke only their **own** device token.
Revoking some other device's token requires `operator.admin`.

```
enclawed devices revoke --device <deviceId> --role node
```

Returns the revoke result as JSON.

## Common options

- `--url <url>`: Gateway WebSocket URL (defaults to `gateway.remote.url` when configured).
- `--token <token>`: Gateway token (if required).
- `--password <password>`: Gateway password (password auth).
- `--timeout <ms>`: RPC timeout.
- `--json`: JSON output (recommended for scripting).

Note: when you set `--url`, the CLI does not fall back to config or environment credentials.
Pass `--token` or `--password` explicitly. Missing explicit credentials is an error.

## Notes

- Token rotation returns a new token (sensitive). Treat it like a secret.
- These commands require `operator.pairing` (or `operator.admin`) scope.
- Token rotation stays inside the approved pairing role set and approved scope
  baseline for that device. A stray cached token entry does not grant a new
  rotate target.
- For paired-device token sessions, cross-device management is admin-only:
  `remove`, `rotate`, and `revoke` are self-only unless the caller has
  `operator.admin`.
- `devices clear` is intentionally gated by `--yes`.
- If pairing scope is unavailable on local loopback (and no explicit `--url` is passed), list/approve can use a local pairing fallback.
- `devices approve` requires an explicit request ID before minting tokens; omitting `requestId` or passing `--latest` only previews the newest pending request.

## Token drift recovery checklist

Use this when Control UI or other clients keep failing with `AUTH_TOKEN_MISMATCH` or `AUTH_DEVICE_TOKEN_MISMATCH`.

1. Confirm current gateway token source:

```bash
enclawed config get gateway.auth.token
```

2. List paired devices and identify the affected device id:

```bash
enclawed devices list
```

3. Rotate operator token for the affected device:

```bash
enclawed devices rotate --device <deviceId> --role operator
```

4. If rotation is not enough, remove stale pairing and approve again:

```bash
enclawed devices remove <deviceId>
enclawed devices list
enclawed devices approve <requestId>
```

5. Retry client connection with the current shared token/password.

Notes:

- Normal reconnect auth precedence is explicit shared token/password first, then explicit `deviceToken`, then stored device token, then bootstrap token.
- Trusted `AUTH_TOKEN_MISMATCH` recovery can temporarily send both the shared token and the stored device token together for the one bounded retry.

Related:

- [Dashboard auth troubleshooting](/web/dashboard#if-you-see-unauthorized-1008)
- [Gateway troubleshooting](/gateway/troubleshooting#dashboard-control-ui-connectivity)
