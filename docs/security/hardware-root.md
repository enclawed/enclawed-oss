---
summary: "Check your Enclaweder with `enclawed hardware-root status`: what each state means and what to do"
read_when:
  - An Enclawed command was refused because the hardware root is DIRTY
  - You plugged in, replaced or moved an Enclaweder
  - You want to check that your Enclaweder is genuine and working
title: "Hardware root (Enclaweder)"
---

# Hardware root (Enclaweder)

An Enclaweder is the USB device that holds Enclawed's hardware root of trust. When one is plugged in, Enclawed uses it for every protected operation. If it is unplugged during a session, tampered with, or halted, it goes **DIRTY** and Enclawed stops until a person recovers it.

## Check the device

```bash
enclawed hardware-root status          # human-readable
enclawed hardware-root status --json   # the same diagnosis as JSON
```

`status` only reads: it never changes the device or this computer, and never asks for your authenticator or a recovery code. It reports, for each Enclaweder:

| Line        | What it tells you                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Present     | The device is plugged in, by the serial printed on it (`ENCLW-...` for Base, `ECPRO-...` for Pro).                                          |
| Genuine     | Its certificate verifies against the Enclawed root, and it just proved it holds its own key.                                                |
| Operational | It answers, its self-tests and state are OK, and its firmware is new enough.                                                                |
| Zeroization | Not zeroized; zeroized (keys destroyed, needs re-provisioning); or a different unit from the one this computer is bound to.                 |
| Halt state  | CLEAN, or DIRTY with the reason (for example: unplugged during a session, tamper detected, halted by this computer).                        |
| Recovery    | Which authenticator is enrolled, how many recovery codes are left, recent failed attempts, and whether recovery is locked (operators only). |
| Operators   | Who can recover the device when your own factors are lost: Enclawed, or your organization's operators.                                      |

Anything that is not OK comes with a **What to do** list.

### Exit codes

| Code | Meaning                                                                |
| ---- | ---------------------------------------------------------------------- |
| 0    | Operational and CLEAN                                                  |
| 2    | DIRTY: recovery needed                                                 |
| 3    | Not operational, zeroized, not genuine, a different unit, or no device |
| 1    | The check itself failed                                                |

## What to do

| What status shows                      | What to do                                                                                                                                                                                          |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No Enclaweder detected                 | Plug it in. On WSL, run `enclawed hardware-root wsl-setup` once (see [On Windows with WSL](#on-windows-with-wsl)).                                                                                  |
| DIRTY                                  | Run `enclawed hardware-root recover` with the unit plugged in. You need your authenticator (an app code, or your security key with `--fido`) plus one recovery code. The device checks both itself. |
| DIRTY, recovery locked                 | Repeated failed attempts locked the two-factor path. Contact your operators: only they can recover the device now.                                                                                  |
| DIRTY, two-factor recovery not set up  | Contact your operators to recover the device.                                                                                                                                                       |
| Zeroized                               | Do not use the unit: its keys are destroyed. Contact Enclawed or your operators to re-provision it.                                                                                                 |
| Not genuine                            | Stop. The device may be counterfeit. Do not use it, and report it to Enclawed or your operators.                                                                                                    |
| Firmware too old                       | Update the Enclaweder firmware.                                                                                                                                                                     |
| Reports a fault, or does not answer    | Unplug it and plug it back in, then run `status` again. If it stays that way, contact Enclawed or your operators.                                                                                   |
| Different unit                         | This computer is bound to another Enclaweder. Plug that one in. Moving this computer to a new unit is an operator action; if you did not swap the device on purpose, treat it as tampering.         |
| Same serial, new keys (re-provisioned) | The unit was re-provisioned since this computer bound it. Run `enclawed hardware-root recover` to adopt it; the device verifies the recovery.                                                       |
| Few recovery codes left                | Ask your operators to reissue a new set before you run out.                                                                                                                                         |
| Several failed recovery attempts       | Someone may be guessing codes. Investigate before continuing.                                                                                                                                       |
| In use by an Enclawed process          | Another Enclawed process on this computer owns the device; its state is shown. To recover, stop those processes first.                                                                              |

## On Windows with WSL

WSL does not see USB devices plugged into Windows until [usbipd-win](https://github.com/dorssel/usbipd-win) (version 4 or newer) shares them. When the installer detects WSL and an Enclaweder is plugged in, it sets this up once, so the device reaches WSL by itself after every reboot and replug:

1. Installs usbipd-win with `winget` if it is missing (it asks you first).
2. Shares the Enclaweder with WSL (`usbipd bind --hardware-id 1209:e100`). This persists across reboots. Windows asks **once** for administrator approval.
3. Registers a scheduled task for your Windows user, "Enclaweder auto-attach", that runs hidden at logon (`usbipd attach --wsl --hardware-id 1209:e100 --auto-attach`), restarts if it stops, and has no time limit. It starts right away.
4. On the Linux side, adds you to the `plugdev` group and, if your distribution has none, writes a udev rule (`/etc/udev/rules.d/99-enclaweder.rules`) that gives the device to `plugdev`. `sudo` may ask for your password.
5. Waits for the device to appear as `/dev/hidraw*`.

Run it yourself at any time; it changes nothing when everything is already set up:

```bash
enclawed hardware-root wsl-setup
```

`enclawed doctor` and `enclawed hardware-root status` show on WSL whether the device is shared, attached, and reachable, and name this command when something is missing.

If you were just added to `plugdev`, open a new WSL terminal (or run `newgrp plugdev`) before using the device.

### Undo

From a Windows PowerShell prompt run as administrator:

```powershell
usbipd unbind --hardware-id 1209:e100
Unregister-ScheduledTask -TaskName "Enclaweder auto-attach" -Confirm:$false
```

### Troubleshooting

- **"WSL cannot run Windows programs"**: Windows interop is off. Set `[interop]` `enabled=true` in `/etc/wsl.conf`, run `wsl --shutdown` from Windows, and reopen WSL. With `systemd=true`, the interop handler can also be missing; the setup prints the one-line fix.
- **Approval declined**: nothing was changed on Windows. Run `enclawed hardware-root wsl-setup` again.
- **No Enclaweder plugged in**: plug it in, then run `enclawed hardware-root wsl-setup`.
- **The device is in WSL but access is denied**: open a new WSL terminal so the `plugdev` membership applies. The udev rule only takes effect when udev runs, which in WSL needs `[boot]` `systemd=true` in `/etc/wsl.conf`.
- **It does not appear after a replug**: check the task in Windows Task Scheduler ("Enclaweder auto-attach" should be Running) and run `usbipd list` in Windows; the device should show as Attached.

## Recover

```bash
enclawed hardware-root recover            # authenticator app code + one recovery code
enclawed hardware-root recover --fido <device>   # security key + one recovery code
```

Recovery is interactive: you confirm the serial printed on the unit, then type your authenticator code and one recovery code. Each recovery code works once, and each authenticator code works once, so a code typed on a compromised computer is worth nothing afterwards. Failed attempts are counted by the device; repeated failures slow down and then lock recovery, after which only your operators can recover it.

See also [Two-factor authentication](/security/two-factor).
