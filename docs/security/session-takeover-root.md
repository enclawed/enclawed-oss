---
summary: "Root on a compromised computer runs the coding host directly with the person's login and context: what Enclawed closes, what stays open during a live session, and the provider-side closure"
read_when:
  - You are assessing what root on the computer can do with a person's coding-agent account
  - You are integrating a model provider or a tool's login with Enclawed
  - You are reviewing the adapter kit's login seal, context seal or tool-credential seal
title: "Session takeover by root"
---

# Session takeover by root

**The attack.** An attacker holds root on the computer. Instead of fighting the governed session, it starts the coding host itself (for Claude Code, plain `claude`, `claude -c` or `claude --resume`), bypassing the adapter, and carries on the person's work with the person's account and the person's session context. An agent then acts as the person, outside Enclawed's policy and outside the device-anchored audit record.

**The guarantee Enclawed gives with an Enclaweder bound (command set 0.5):** root can act only on what lives in the computer. Between sessions, nothing the person's account, context or tools need is in the computer in a form root can use. During a live session, root can read what the session holds in memory and on its private disk; this page names exactly what that is and how far it reaches.

## What root can reach, surface by surface

| Surface                                                                                                                         | Before                                  | Now (between sessions)                                                                    | During a live session                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Host login (access and refresh token)                                                                                           | Plaintext login file                    | Sealed to the launch's **login box**; no plaintext copy anywhere the host or a tool reads | Access token in the launcher's memory; with the hardware root required, the refresh token is sealed in memory too |
| Session context (transcripts, memory, todos, plans, prompt history, file backups, pasted content)                               | Plaintext in the host's state directory | Sealed to the launch's **context box**, one record per file, bound to the audit log       | Plaintext in the session's private directory (memory-backed where available)                                      |
| Tool credentials made in the session (gh, git, npm, aws, gcloud, az, docker, kubectl, Hugging Face, Terraform, Vault, ssh keys) | Written into the person's own config    | Sealed to the launch's **tools box**; never in the person's own config                    | Plaintext in the session's private directory                                                                      |
| Tool credentials the person made outside Enclawed                                                                               | Untouched                               | Untouched                                                                                 | Untouched (copied into the session so they keep working)                                                          |
| The device key itself                                                                                                           | Not applicable                          | Never on disk                                                                             | Held only during the launch's start, then forgotten                                                               |

## The boxes

A launch receives one device-derived key (KEY_DERIVE, answered inside the sealed channel and only on a fresh device-verified activation of that launch: a device-counted unlock use or a code the device verifies). The device answers once per activation. From that one answer the kit derives, each under its own purpose label, an X25519 key pair per box: `login`, `context` and `tools`. No box's key follows from another's.

A box **seals with its public key** and **opens with its private key**. The launch opens what it needs at its start and then forgets every private key and the symmetric credential key. From then on the launcher can seal (a refreshed login, the context and the tool credentials at the session's end, also at a halt) and open nothing. This matters because KEY_DERIVE gives the same key for the same purpose on the same device every time: a symmetric key held for the whole session would hand root, reading memory once, every seal made under it, then and later.

## Integrity: a context resumed by anything else is detectable

Anyone holding a box's public key can seal a record to it. The records are therefore not evidence on their own. Every seal, adoption or discard of a store appends the store's digest (over every record's name and bytes) to the adapter's hash-chained audit log, under the store's lock. The log is anchored in the Enclaweder, and a launch first checks the log against the device's own fresh anchor read. A launch opens a store only when it is exactly the set the log last recorded. A record added (an injected transcript), removed, replaced, renamed or rolled back outside Enclawed refuses the whole store. Nothing is adopted silently. The person can discard it, and the discard is recorded too.

## Tool credentials

The session's tools are pointed, each through its own documented variable (`GH_CONFIG_DIR`, `NPM_CONFIG_USERCONFIG`, `AWS_SHARED_CREDENTIALS_FILE`, `AWS_CONFIG_FILE`, `CLOUDSDK_CONFIG`, `AZURE_CONFIG_DIR`, `DOCKER_CONFIG`, `KUBECONFIG`, `HF_TOKEN_PATH`, `TF_CLI_CONFIG_FILE`, `VAULT_CONFIG_PATH`), at a directory private to the session that mirrors the home directory. That directory is seeded with a copy of the person's own configuration, and the credentials earlier sessions made are opened over it. Git gets a global configuration of the session's own. It includes the person's and keeps credentials only in the session's store, because the person's credential helpers are reset. The OS keyring's bus is not in the session's environment, so a tool that would use the keyring keeps its credential in the redirected file instead. At the end, only what the session made or changed is sealed. The seed never is.

Below the redirection there is a floor, for tools with no variable (the AWS SSO cache) and for tools that ignore it. The person's credential locations are snapshotted at launch, and the home directory's dot-entries are indexed. At the end:

- a new file in a credential location is sealed into the store and erased from the home directory;
- a new file that is a credential by its name or its content is handled the same way;
- a credential-location file the session changed is restored to its bytes at launch, and the session's version is sealed;
- an identity added to the person's ssh agent during the session is removed from the agent.

Nothing that existed before the session is removed.

Limits of the floor: a credential the person writes into those locations from outside the session while it runs is taken as the session's. It is sealed, not lost. Stores that change on their own in ordinary use (gpg's state, desktop keyrings, password-manager stores) are not restored. The macOS Keychain is a platform store that the session cannot redirect.

## What root can still do during a live session

Said plainly, because no host-side measure changes it:

1. **Read the access token** from the launcher's memory, and use it from anywhere until it expires. Bearer tokens are bearer tokens.
2. **Read the refresh token**, unless the hardware root is required. With the root required, the refresh token is sealed in memory to the login box. A refresh opens it only after a new device-verified activation (headless: one device-counted unlock use; interactive: none is taken from the terminal the host owns, so the session's model access ends at the token's expiry and the person relaunches with `-c`). JavaScript strings are immutable, so the bytes of a token that was once a string stay in the heap until they are collected and overwritten. That is a best-effort property, not a guarantee.
3. **Read the session's context and tool credentials** from the session's private directory.
4. **Race the person's activation.** Root sees what the person types. One activation gives one derivation, so a stolen code makes the launch's own derivation fail and the launch refuse. That is detectable, not preventable.
5. **Drive the device through the launcher.** Root can read the launcher's seal keys and send what the launcher could send. Everything the device does is counted and recorded on the device.

What reaches the disk from a live session: a crash dump of the launcher would be a plaintext copy of its tokens, so the launcher turns its own core dumps off (RLIMIT_CORE 0, read back from the kernel) before it opens the login, and records when it cannot. Memory paged out to swap is outside the launcher's control. On a computer with swap, encrypted swap (or none) keeps paged-out tokens and the session's memory-backed directories off the disk in plaintext.

Kernel ptrace restrictions keep other processes of the same user out of the launcher's memory, and the launcher refuses to hold a login where they are off. Root is never kept out.

## The full closure is provider-side: proof of possession

Items 1 and 2 close only when a stolen token is useless without the device. That requires the provider to bind the session's tokens to a key that lives in the Enclaweder. This is sender-constrained tokens, as in OAuth 2.0 DPoP (RFC 9449) or mutual-TLS-bound tokens (RFC 8705).

**What Enclawed needs from the provider:**

- token issuance (the login, and every refresh) bound to a public key the client presents, with the key's thumbprint (`cnf.jkt`) in the token, and the refresh token bound to the same key;
- resource requests that require a fresh proof per request: the method, the URL, the access token's hash and a provider nonce (`DPoP-Nonce`), signed by that key. A replayed or unproven request is refused;
- EdDSA (Ed25519) accepted as the proof algorithm;
- optional but valuable: the provider accepting a device attestation of the proof key (a statement signed by the Enclaweder's certified key, naming the activation the key is bound to), so the provider knows the key cannot leave the device.

**Host side (the adapter kit):** the auth relay already terminates the host's requests and adds the credential. With proof of possession it adds the per-request proof as well, obtained from the device. The token alone, as root would steal it, is refused by the provider. Root during the live session can still have requests proven by driving the device through the launcher. Those requests go through this device only, while it is attached and the session's activation lives, and every proof is counted by the device and attributable in its record. Nothing works away from the device or after the session.

**Can command set 0.5 do it?** No. KEY_DERIVE returns a key to the host, and a key on the host is root's. CHALLENGE signs with the certified device key for any process that asks, under a fixed message format that is not a JWS signing input, and is bound to no activation. Domain separation between KEY_DERIVE and CHALLENGE does not change either fact. **A firmware addition is needed.**

**Firmware proposal (host-interface level only):**

- **PROOF_KEY_OPEN.** Inside the sealed channel, on an unspent activation of the launch, the device creates a proof key that exists only in the device and only for that activation's session. It answers with the key's public part and an attestation of it: a statement signed by the certified device key, under its own signing tag, naming the public key and the activation's binding. Opening a proof key spends the activation for that use, like the other activation-bound operations.
- **PROOF_SIGN.** Inside the sealed channel, the device signs a JWS signing input (the DPoP proof's header and payload, as the host gives them) with the session's proof key. The proof key signs nothing else, so key separation stands in for a signing tag. The device counts the proofs and writes that count into the session's anchor records.
- **PROOF_KEY_CLOSE.** Also implicit at a latch trip, a reset, a USB re-enumeration or a zeroize: the proof key is destroyed. A token bound to it is then useless everywhere.

The host keeps the access token, the refresh token and the DPoP header assembly. The device keeps the only key that makes them usable. Until a provider offers sender-constrained tokens, Enclawed bounds the exposure as above: no plaintext at rest, the refresh token sealed except at the instant of a refresh when the root is required, and every refresh audited.

## The conformance guarantees

- **Between sessions, no plaintext login or session context of the person exists at rest.** The login, the context and the tool credentials the session made are sealed. A direct run of the host finds no login, nothing to resume and no tool login.
- **A credential created inside a governed session is not usable by any process outside a governed session.** It exists only in the session's private directory while the session runs, and sealed otherwise. It opens only into a launch the person activated.
