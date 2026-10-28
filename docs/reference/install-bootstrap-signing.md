---
title: "Install Bootstrap Signing"
summary: "Required maintenance: re-sign install.sh and install.ps1 whenever they change"
read_when:
  - Editing enclawed-apps/install.sh or enclawed-apps/install.ps1
  - Publishing the website or the enclawed-oss mirror
  - An installer aborts with "INSTALL ABORTED -- integrity check failed"
---

# Install Bootstrap Signing

`enclawed-apps/install.sh` and `enclawed-apps/install.ps1` verify themselves
before they hand off to `install.mjs`. Each one re-fetches its own bytes from
`www.enclawed.com`, fetches a companion signature artifact, and refuses to
install unless the two agree.

**Editing a bootstrap without re-signing it breaks every install on that
platform.** This is not a soft failure: the user sees a tampering warning
naming `security@enclawed.com`, and nothing installs. Re-signing is a required
step of the edit, not a follow-up chore.

## The binding

`enclawed-apps/.trust/verify.mjs` checks a two-stage hash chain plus an
Ed25519 signature:

```
s1       = SHA256(script_bytes)
s2       = SHA256(hex(s1) || install_url)
artifact = s2 (32 bytes) || Ed25519_sign(s2) (64 bytes)
```

Binding the URL into `s2` means a correctly signed script is only valid at the
address it was signed for, so an attacker cannot serve a genuine artifact from
a substituted mirror.

| Bootstrap     | Signature artifact           |
| ------------- | ---------------------------- |
| `install.sh`  | `static/build/runtime-a.bin` |
| `install.ps1` | `static/build/runtime-b.bin` |

The trust root is `enclawed-apps/.trust/pub.b64`, embedded in each bootstrap as
`_BLD_PUB` (sh) and `$bldPub` (ps1). `verify.mjs` is handed the embedded copy,
so the key travels with the script the user actually read.

## Required maintenance

After any edit to a bootstrap:

```bash
pnpm sign:install-bootstraps --key <path to the Ed25519 signing key>
pnpm check:install-bootstrap-signatures
```

The signer writes both artifacts and syncs the `website/` copies. Ed25519 is
deterministic, so re-signing an unchanged bootstrap is a no-op — running it
more often than necessary costs nothing.

`pnpm check:install-bootstrap-signatures` is the guard. It fails when a
bootstrap has drifted from its artifact, when the published copies are not
byte-identical, or when a bootstrap embeds a different trust root than
`pub.b64`. Run it before publishing. Add `--remote` to also check that what
the website currently serves matches the tree.

The signing key must derive `pub.b64`; the signer refuses to write otherwise,
so a wrong key cannot silently re-root the trust chain. Keep the key outside
every repository.

## Two trees carry these files

Both are on the live install path, and they must be updated together — the
website serves the bootstrap, and the bootstrap then clones the mirror it runs
`verify.mjs` and `install.mjs` from.

| Tree                | Layout                        | Role                                                                                        |
| ------------------- | ----------------------------- | ------------------------------------------------------------------------------------------- |
| `enclawed-enclaved` | `website/` + `enclawed-apps/` | source of truth; `website/` **is** the deployed site                                        |
| `enclawed-oss`      | rooted at `enclawed-apps/`    | published to `enclawed/enclawed-oss`, cloned by the bootstrap to `~/.enclawed/enclawed-oss` |

`pnpm sign:install-bootstraps` signs `enclawed-apps/` and syncs the `website/`
copies in one pass, so deploying the `website/` directory is the whole
website side of the job. Then mirror the five files into `enclawed-oss`:

```bash
cp enclawed-apps/install.{sh,ps1}               ../enclawed-oss/enclawed-apps/
cp enclawed-apps/.trust/pub.b64                 ../enclawed-oss/enclawed-apps/.trust/
cp enclawed-apps/static/build/runtime-{a,b}.bin ../enclawed-oss/enclawed-apps/static/build/
node scripts/check-install-bootstrap-signatures.mjs --tree ../enclawed-oss
```

Both tools take `--tree <path>` and detect the layout from whether the tree has
a `website/` directory.

This is the one place where the enclaved and OSS trees must not be allowed to
diverge. They are otherwise independent codebases, but a trust root that
differs between them is a broken installer by construction.

> The site also serves `install.sh` and `install.ps1` at its root. Those are
> the core Enclawed installers, unrelated to these files, and they carry no
> signature gate — nothing here applies to them.

## Rotating the signing key

Only if the key is lost or compromised. Rotation invalidates the pinned trust
root in every already-installed checkout, so any user who re-runs their local
`install.ps1` instead of the published one gets an integrity failure until they
re-clone.

1. Generate an Ed25519 keypair and store the private half outside every repo,
   mode `600`.
2. Write the new base64 public key into `enclawed-apps/.trust/pub.b64` and the
   `_BLD_PUB` / `$bldPub` constants in both bootstraps.
3. `pnpm sign:install-bootstraps --key <new key>`.
4. `pnpm check:install-bootstrap-signatures`, then mirror into `enclawed-oss`
   and check that tree too.
5. Deploy `website/` and publish the mirror together. Until both are live,
   installs fail — the bootstrap and its artifact must roll out as one unit.

## Diagnosing a reported failure

An `INSTALL ABORTED -- integrity check failed` report is far more often a
stale artifact than an attack. Distinguish them by checking whether the
signature is _genuine but over different bytes_:

```bash
node scripts/check-install-bootstrap-signatures.mjs --remote
```

A stage-2 mismatch whose signature still verifies against the published trust
root means the bootstrap was edited without re-signing. A signature that does
not verify against the trust root at all is the case that warrants treating as
an incident.
