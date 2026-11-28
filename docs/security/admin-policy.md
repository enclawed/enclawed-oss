---
title: Admin policy
summary: Where an Enclawed deployment's security posture may be loosened from, and why everything else may only tighten it.
---

# Admin policy

Enclawed assumes the host is already compromised at the uid that runs it.
Anything that uid can write (environment variables, `~/.enclawed/*`, CLI
flags) is a knob an attacker can turn. In the enclaved flavor, those
sources may therefore only **tighten** the posture. Loosening it is
accepted only from the **admin policy**.

## Where the admin policy comes from

1. **A root-owned file, `/etc/enclawed/policy.json`.** It must be owned by
   root, have mode `0644` or narrower, and not be a symlink. Every ancestor
   directory must be owned by root and not writable by group or other. The
   policy's own directory may not even be a sticky world-writable directory.
2. **An org-signed document, `policy.signed.json`.** It lives in
   `/etc/enclawed/` or in the state directory (`~/.enclawed/`). Its payload is
   Ed25519-signed by a key listed in the root-owned
   `/etc/enclawed/org-keys.json` (`{ "v": 1, "keys": [{ "keyId", "publicKeyPem" }] }`).
   A signed payload must carry `expiresAt`, so an old, looser document
   cannot be replayed forever. A valid signed document takes precedence over
   `policy.json`.

A file that fails these checks is ignored and reported at every start. It
never loosens anything. A file that passes the checks but does not parse
refuses to start the enclaved flavor (`ENCLAWED_ADMIN_POLICY_INVALID`).

The checks also refuse to trust any file while the process runs in a
non-initial user namespace. An unprivileged `unshare -r -m` maps the user to
uid 0 and lets them bind-mount their own directory over `/etc/enclawed`.

Two cases are not supported yet:

- **Enclaweder-signed policies.** Accepting them requires a signing command
  that the device confirms with a physical presence check, so that software
  on the host cannot produce one. Until that command exists, use an org key.
- **Windows.** There is no root-owned path check on Windows, so no admin
  policy is found there, and the enclaved flavor runs at its deny-by-default
  posture.

## Schema (v1)

```json
{
  "v": 1,
  "flavor": "enclaved",
  "fipsRequired": true,
  "classificationScheme": "enclawed-default",
  "policy": { "allowedProviders": ["ollama"], "allowedTools": ["read", "exec"] },
  "audit": { "path": "/var/log/enclawed/audit.jsonl", "allowUserFallback": false },
  "trustRoot": {
    "signers": [{ "keyId": "org-2026", "publicKeyPem": "...", "approvedClearance": ["internal"] }]
  },
  "allow": {
    "dangerousConfigFlags": [],
    "gatewayAuthNone": false,
    "hardwareRootOptional": false,
    "bundledPluginsDir": "/opt/enclawed/extensions"
  },
  "expiresAt": "2027-01-01T00:00:00Z"
}
```

`policy` has the same shape as `enclawed.policy`. Unknown top-level keys are
refused. Write a starter document with
`enclawed policy init --provider <id> --tool <id> --admin-out ./policy.json`,
then install it as root:

```bash
sudo install -d -o root -g root -m 0755 /etc/enclawed
sudo install -o root -g root -m 0644 ./policy.json /etc/enclawed/policy.json
```

Sign a document for fleet distribution with `signAdminPolicy()` from
`src/enclawed/admin-policy.ts`, using an org key held offline.

## What user-writable sources may still do

Every refused attempt is printed at every start
(`enclawed: REFUSED: ...`) and recorded in an `enclawed.policy.refused`
audit record and in the `enclawed.boot` record (`policyRefusals`).

| Source                                                                                                                                                                                    | Allowed (tightens)                                                         | Refused (would loosen)                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENCLAWED_FLAVOR`                                                                                                                                                                         | `enclaved`                                                                 | `open` over an `enclaved` package pin or admin flavor                                                                                                    |
| `ENCLAWED_FIPS_REQUIRED`                                                                                                                                                                  | `1`                                                                        | `0` while FIPS is required                                                                                                                               |
| `ENCLAWED_AUDIT_PATH`, `enclawed.audit.path`                                                                                                                                              | open flavor only                                                           | any value in enclaved (the log goes to the admin `audit.path` or `/var/log/enclawed/audit.jsonl`; a user-owned fallback needs `audit.allowUserFallback`) |
| `ENCLAWED_CLASSIFICATION_SCHEME`                                                                                                                                                          | open flavor without an admin policy                                        | any value in enclaved or under an admin policy                                                                                                           |
| `enclawed.policy` allowlists                                                                                                                                                              | removing entries                                                           | adding entries the base does not allow                                                                                                                   |
| `enclawed.policy.enforceAllowlists`                                                                                                                                                       | `true`                                                                     | `false`                                                                                                                                                  |
| `enclawed.policy.commandNetwork`                                                                                                                                                          | `"none"`                                                                   | `"host"`                                                                                                                                                 |
| `preApprovedIrreversibleTools`, `scratchPaths`                                                                                                                                            | removing entries                                                           | adding entries                                                                                                                                           |
| `history.noHistory*`                                                                                                                                                                      | adding entries (writes become irreversible and wait for approval)          | —                                                                                                                                                        |
| `history` size caps                                                                                                                                                                       | smaller values                                                             | larger values                                                                                                                                            |
| `history.maxAgeDays`                                                                                                                                                                      | the base value                                                             | any other value (smaller prunes restore points sooner, larger retains more data); the admin policy sets it, 7 to 365                                     |
| `maxOutputClearance` / `defaultDataLabel`                                                                                                                                                 | lower / higher                                                             | higher / lower                                                                                                                                           |
| `~/.enclawed/trust-root.json`                                                                                                                                                             | open flavor without an admin policy: new keyIds                            | in enclaved the whole file; in any flavor, replacing a shipped keyId                                                                                     |
| `dangerously*` / `allowInsecure*` / `allowUnsafe*` config flags, `gateway.auth.mode: "none"`                                                                                              | open flavor                                                                | in enclaved unless listed under `allow`                                                                                                                  |
| `ENCLAWEDER_ROOT`                                                                                                                                                                         | exactly `required` (or unset)                                              | any other spelling in every flavor (`Required`, `1`, `true`, `off`, ...); `optional` in enclaved unless `allow.hardwareRootOptional` (device retirement) |
| `ENCLAWEDER_STATE`, `ENCLAWEDER_STATE_DIR`, `ENCLAWEDER_FORENSIC_WEBHOOK`, `ENCLAWEDER_FORENSIC_LOG`, `ENCLAWEDER_AUDIT_PATH`, `ENCLAWEDER_QUEUE_LOG`, `ENCLAWED_DISABLE_BUNDLED_PLUGINS` | open flavor                                                                | any value in enclaved: startup is refused                                                                                                                |
| `ENCLAWEDER_BROKER`                                                                                                                                                                       | a socket path (checked for ownership)                                      | `off` in enclaved: startup is refused                                                                                                                    |
| `ENCLAWED_BUNDLED_PLUGINS_DIR`                                                                                                                                                            | open flavor; in enclaved, the directory named in `allow.bundledPluginsDir` | any other value in enclaved: startup is refused (module signatures cover the manifests, not the plugin code)                                             |

The base that the user config narrows is the admin `policy` block, or the
flavor default when there is none. An admin choice that weakens the
enclaved posture (`enforceAllowlists: false`, `commandNetwork: "host"`,
`fipsRequired: false`, `flavor: "open"` on an enclaved package) is allowed,
but it is warned about at every start and recorded.

## The open flavor

The open flavor is not a security boundary unless an administrator makes
it one. Without an admin policy, the user config stays authoritative there,
as before. When an admin policy is present, it binds in the open flavor
too: the user config only tightens it, the user trust-root overlay is
ignored, and an admin `"flavor": "enclaved"` cannot be downgraded with
`ENCLAWED_FLAVOR=open`.

## Programmatic bootstrap

Options passed to `bootstrapEnclawed()` by the embedding app (`flavor`,
`policy`, `fipsRequired`, `auditPath`, `adminPolicy`) are trusted. Code
running in the process can already do anything the process can. They are
recorded in the boot record (`flavorSource: "option"`,
`fipsSource: "option"`).
