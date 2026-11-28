---
summary: "Mandatory two-factor authentication: FIDO2 security keys and device-bound passkeys (Windows Hello, Apple, Android), what to buy, how to enroll two, unlock tickets for services"
read_when:
  - Setting up Enclawed for the first time
  - An Enclawed command was refused with "two-factor authentication refused"
  - Running the gateway as a systemd or launchd service, or from CI
title: "Two-factor authentication"
---

# Two-factor authentication

Enclawed requires two-factor authentication (2FA) for everything that matters:

- starting a session (`enclawed gateway run`, `gateway start` / `install` / `restart`, `enclawed agent`, `enclawed run`, `enclawed swarm`, `enclawed node run`);
- policy changes (`config set` / `unset`, `configure`, `onboard`, `setup`, `trust add`, `exec-policy set`, `approvals set`, plugin, hook, skill and MCP changes, `doctor --fix`);
- recovery and re-baselining (for example the installer's `--recover-root`);
- disabling a protection (`reset`, `uninstall`, service uninstall);
- restoring or pruning protected history (`history restore`, `history prune`);
- operator and admin commands (`devices approve|reject|remove|rotate|revoke`, `pairing approve`, `nodes approve|reject`, `sandbox recreate`, `update`).

There is no switch that turns this off: no environment variable, flag, configuration key, developer mode or grace period. An install with nothing enrolled refuses every one of these commands and prints the enrollment steps below.

## Which factors are accepted

Enclawed is built for deployments that assume the computer it runs on is already compromised. A second factor only helps if its secret cannot be read or copied from that computer.

| Factor                                                                                       | Where the secret lives                                             | Accepted as the second factor? |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------ |
| FIDO2 security key with a PIN (YubiKey, Titan)                                               | inside the key; it never leaves it                                 | **Yes**                        |
| Device-bound passkey: Windows Hello on a TPM, Apple's or Android's secure hardware           | inside the device's security chip; it cannot be exported or copied | **Yes**, when proven (below)   |
| A synced passkey (iCloud Keychain, Google Password Manager, a password manager, most phones) | copied to a vendor cloud and other devices                         | No                             |
| Windows Hello without a TPM, or any passkey without a hardware attestation                   | software on this computer, or nothing proves where it is           | No                             |
| Authenticator app code (TOTP, Microsoft Authenticator)                                       | a shared secret this computer would have to keep                   | No                             |
| Your account or `sudo` password, a passphrase                                                | typed into, or stored on, this computer                            | No                             |

On every check the authenticator must confirm both that you are present and that it is you (its PIN, a fingerprint or your face). This computer keeps only the public key and an identifier. Each check also verifies that the authenticator's signature counter has moved forward, so a copied credential is detected and refused; an authenticator that never moves its counter is refused at its first check. The one exception is a Windows Hello passkey proven at enrollment to live in the TPM: its key cannot be copied out of the chip, so there is no copy for a counter to catch, and a counter that stays at 0 is accepted (once it starts counting, it must keep moving forward).

### What "proven" means for a passkey

When you enroll a passkey, the device must show a certificate from its maker that says the key was made inside its security chip and cannot leave it:

- **Windows Hello**: a TPM attestation that chains to Microsoft's TPM root, says the key was generated in this TPM and cannot be moved out of it, and names the TPM's maker and model.
- **Apple**: an Apple attestation that chains to Apple's WebAuthn root and is bound to this enrollment.
- **Android**: a key attestation that chains to Google's hardware attestation root, says the key was generated in the phone's secure hardware (not imported, not software), and that the phone's bootloader is locked and it booted a verified system.

The roots are pinned in Enclawed itself, with their download sources and fingerprints. A passkey that offers no such certificate (most synced passkeys answer with none) is refused, and so is one marked as backed up or eligible for backup. In practice: Windows Hello on a computer with a TPM works; Apple and Android devices today mostly create synced passkeys, which are refused.

### How a passkey is used from a terminal

A terminal cannot talk to Windows Hello or Touch ID directly, so Enclawed opens a one-time page in your browser at `http://localhost:<port>/...`. The page only asks your device for the passkey and hands the answer back; Enclawed checks it exactly as it checks a security key. The page answers only this computer, accepts one answer, and closes after it or after two minutes.

Under WSL, the page opens in your Windows browser, which reaches WSL only through WSL's localhost forwarding. Enclawed checks this before opening the page and tells you if it is off. To turn it on, put this in `%UserProfile%\.wslconfig` on Windows, then run `wsl --shutdown` and reopen the WSL terminal:

```ini
[wsl2]
localhostForwarding=true
```

(`networkingMode=mirrored` works too.) Install `wslu` for `wslview`, or Enclawed uses Windows' own `start`.

With an Enclaweder, a DIRTY device is recovered with two factors the device itself verifies (an authenticator app code or a security key, and a one-time recovery code): see `enclawed hardware-root recover` and [Hardware root](/security/hardware-root). The device, not this computer, holds the authenticator secret.

## What to buy

Any FIDO2 (CTAP2) security key that supports a PIN and attestation works. Examples: YubiKey 5 series (USB-A, USB-C, NFC), YubiKey Bio, Google Titan Security Key. Buy **two**: one you carry, one kept somewhere safe as the backup. A key that only does U2F (older "FIDO U2F" keys) cannot check a PIN and is refused.

## Set up

1. Install libfido2's command-line tools, which Enclawed uses to talk to the key:
   - Debian or Ubuntu: `sudo apt install fido2-tools`
   - Fedora: `sudo dnf install fido2-tools`
   - macOS: `brew install libfido2`
   - Windows: Yubico's libfido2 release (https://developers.yubico.com/libfido2/Releases/). Run elevated so the key is reached directly: without elevation Windows routes requests through its own WebAuthn service, which libfido2 cannot use. (Windows Hello itself is enrolled as a passkey, below.)
2. Plug in the first key and list it: `fido2-token -L`.
3. If the key has no PIN yet, set one: `fido2-token -S <device>` (the device path printed by `-L`, for example `/dev/hidraw4`).
4. Enroll it: `enclawed auth enroll --label primary`. Touch the key when it blinks and enter its PIN.
5. Set a PIN on the backup key, plug in both keys, and run `enclawed auth enroll --label backup`. Enclawed first asks for a touch and PIN of the key already enrolled (nobody can add a key without one), then enrolls the other key.
6. Check: `enclawed auth status`, then `enclawed auth test`.

### Enroll Windows Hello (or another device-bound passkey)

1. Make sure Windows Hello is set up (Settings, Accounts, Sign-in options: a PIN, fingerprint or face) and that the computer has a TPM (`tpm.msc` shows "The TPM is ready for use").
2. Run `enclawed auth enroll --passkey --label laptop`. If something is already enrolled, confirm with it first.
3. Your browser opens an Enclawed page; select **Continue**, and answer Windows Hello's prompt. If the browser asks whether the site may see your security key's make and model, allow it: that is the TPM certificate Enclawed checks.
4. The terminal prints the enrolled passkey, its TPM maker and model. Check with `enclawed auth test`.

Enroll a security key too, as a backup: a passkey lives in one computer, and a lost or wiped computer takes it with it.

The last enrolled key can never be removed (`enclawed auth remove <id>` refuses it); enroll a replacement first.

## Services, CI and other headless starts

A service has no person at a keyboard. Before starting it, a person issues an unlock ticket:

```bash
enclawed auth unlock --minutes 10        # touch + PIN
sudo systemctl restart enclawed-gateway   # or: enclawed gateway restart
```

A ticket:

- admits session starts only, never policy changes, restores, recovery or admin commands;
- is signed by the security key itself over its whole content, so software on this computer cannot create, extend or rebind one;
- is bound to your user, this computer and this boot (a reboot invalidates it);
- lasts 10 minutes by default (at most 8 hours; an administrator can only lower that) and admits one start unless `--uses N` (up to 20) says otherwise;
- is never renewed: the next one needs a new touch and PIN.

`enclawed auth lock` revokes a ticket at once.

## Administrator settings

In `enclawed.json`, `enclawed.auth` can only make the rule stricter:

```json5
{
  enclawed: {
    auth: {
      unlockMinutes: 5, // default ticket lifetime (default 10)
      maxUnlockMinutes: 60, // the longest ticket anyone may ask for (default and hard maximum 480)
      // Regulated deployments: only these authenticator models may enroll, and their
      // attestation certificate must be issued by the listed CA (PEM text or an absolute path).
      allowedAuthenticators: [
        {
          aaguid: "ee882879-721c-4913-9775-3dfcce97072a",
          description: "YubiKey 5 NFC",
          attestationCas: ["/etc/enclawed/yubico-attestation-ca.pem"],
        },
      ],
    },
  },
}
```

An unknown key or an out-of-range value makes every gated command refuse until it is fixed. At enrollment Enclawed always requires an attestation that proves device-bound hardware, verifies it, and records the model (AAGUID) and the certificate fingerprint in the audit log: a passkey's vendor attestation (Windows Hello on a TPM, Apple, Android) chained to that vendor's pinned root, or a security key's basic attestation from a recognized hardware security key model (certified FIDO2 keys from Yubico, Google Titan, Feitian, HID, Thales/SafeNet, and OneSpan, taken from the FIDO Alliance Metadata Service) chained to that model's pinned certificate authority. Self attestation, "none", software and virtual authenticators (such as a browser's WebAuthn virtual authenticator) and any other certificate authority are refused, and the allowlist below can only narrow this, never widen it. A security key's enrollment keeps its attestation and is verified again at every use; a packed enrollment that does not verify (one made before Enclawed 2.0.3 kept no attestation) is not a second factor: `enclawed auth status` and `enclawed doctor` name it, and you enroll a replacement (`enclawed auth enroll`) and remove it (`enclawed auth remove <id>`). While no other factor is enrolled, that old key must authorize the replacement's enrollment (a touch and PIN, recorded in the audit log with the old credential's id), and that is the only thing it can authorize: never a session start, an unlock, a policy change or a removal. The replacement must itself pass the attestation rules above, so the old key can be enrolled again only if it is a recognized hardware key. When another factor is enrolled, that factor authorizes the enrollment as usual. An adapter that keeps a separate factor store for an Enclaweder's authenticator code may hold one key there that only signs unlock tickets for headless launches (the role "device-unlock-signer"); it is never a second factor: such a ticket starts a launch only together with the Enclaweder's counted unlock grant bound to it, and the key authorizes nothing else and cannot be enrolled. With an allowlist, a passkey's model must be on it too (Windows Hello is `08987058-cadc-4b81-b6e1-30de50dcbe96`, or `9ddd1817-af5a-4672-a2b9-3e3dd95000a9` with virtualization-based security).

## Audit

Every check, success and failure, every enrollment, removal, ticket issue and ticket use is appended to the hash-chained audit log (`enclawed audit verify`). The records name the purpose, the key's local id, label and model, and the outcome code; they never contain a PIN, a challenge, or any secret.

## Upgrading an existing install

An install that has no security key enrolled is refused at the next gated command, with the steps above. Enroll a key (and a backup), then run the command again.

## Limits

In a software-only install, the check runs on this computer. A program already running as your user that can rewrite Enclawed's protected state directory could replace the enrolled public key; the enrollment is in the hash-chained audit log, which is how a substitution shows. An Enclaweder moves verification onto the device. The gate protects the Enclawed commands and sessions listed above; it does not stop someone from running an unrelated program with credentials they already hold.
