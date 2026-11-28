---
title: History CLI
summary: "List and restore the local history that makes agent file writes reversible"
read_when: "You want to undo a file change an agent made, or tune how much write history Enclawed keeps."
status: active
---

# History CLI

In the enclaved flavor, an agent action is **reversible** when the history of the data it changes exists or does not matter. Reversible actions run without asking you. Irreversible actions wait for your approval, unless your policy pre-approves the tool (`enclawed.policy.preApprovedIrreversibleTools`).

For the file tools (`write`, `edit`, `apply_patch`, including the deletes a patch can make), Enclawed decides per call, per file:

- **History irrelevant (scratch).** The file is inside a scratch location: the gateway's own temp directory, or a directory listed in `enclawed.policy.scratchPaths`. No snapshot is kept.
- **History exists (snapshot).** Before the write runs, Enclawed copies the file's current content (or notes that it does not exist yet) into a local history store, named by the SHA-256 of its bytes. A delete keeps the deleted content. The audit log records the snapshot hash and the path for that call.
- **History exists (git).** If no snapshot can be kept but the file is tracked by git with no uncommitted changes, its prior state is in git history.

When the file tools run inside a sandbox, the snapshot is read through that sandbox's own file bridge. The history entry and the audit record name the sandbox (backend and runtime id) and the path inside it, so a restore goes back into the same sandbox.

Every other write is irreversible and waits for approval. The audit log records why: `no-history-path`, `no-history-tool`, `over-size-cap`, `over-retention-budget`, `outside-allowed-roots` (outside the agent workspace, scratch locations or the sandbox mounts), `special-file`, `unreadable`, `store-failed`, `unresolvable-path`, `sandbox-read-failed` (the sandbox bridge could not read the file) or `no-file-bridge` (the caller gave no way to read the file first, for example a tool invoked without a workspace).

The history store lives in the Enclawed state directory (`~/.enclawed/history` by default, or `ENCLAWED_HISTORY_DIR`). It never leaves the machine.

## Commands

```bash
enclawed history list [path] [--json]
enclawed history restore <hash> [--to <path>] [--json]
enclawed history prune [--json]
```

- `list` shows every kept snapshot, or only the snapshots for one path.
- `restore` checks that the snapshot's bytes still hash to its name and refuses a tampered or corrupted snapshot. It then keeps the content it is about to replace as a new snapshot, writes the file, and records the restore in the audit log. Without `--to`, the snapshot goes back to the path it was taken from. A snapshot taken in a sandbox goes back into that sandbox through its file bridge. If that sandbox no longer exists, the restore is refused rather than recreating it; pass `--to <host path>` to restore the content on the host instead. A restore that cannot be audited does not run.
- `prune` removes snapshots older than the age limit now. The store also prunes on its own.

## Settings

All settings live in the `enclawed.policy` block of the config file and are checked at startup. Writes stay reversible by default. These settings let you trade history for storage.

```json5
{
  enclawed: {
    policy: {
      // Directories where writes need no history.
      scratchPaths: ["/srv/agent-scratch"],
      history: {
        maxFileBytes: 16777216, // largest single snapshot (default 16 MiB)
        maxTotalBytes: 1073741824, // total store size (default 1 GiB)
        maxAgeDays: 30, // snapshots older than this are pruned (default 30, 7 to 365)
        noHistoryPaths: ["/data/datasets/**"], // writes here keep no history
        noHistoryTools: [], // tool ids whose writes keep no history
      },
    },
  },
}
```

- A write whose snapshot would exceed `maxFileBytes`, or would push the store past `maxTotalBytes`, does not lose its history silently. It becomes irreversible and waits for approval. The store never evicts snapshots to make room. Only snapshots older than `maxAgeDays` are removed. `maxAgeDays` must be from 7 to 365, the store keeps every snapshot at least 7 days whatever limits a caller passes, and a snapshot a write has stored but not yet recorded is never pruned. In the enclaved flavor, or under an admin policy, the user config cannot change `maxAgeDays` (a smaller value would prune restore points sooner, a larger one retains more data); set it in the admin policy.
- `noHistoryPaths` takes absolute paths (which also cover everything below them) and globs, where `*` matches within one path segment and `**` matches at any depth. `noHistoryTools` takes tool ids. Writes these settings cover become irreversible. They do not affect scratch locations.
- Unsafe entries are refused at startup: empty entries, relative paths, `*`, `/` or anything else that covers the filesystem root, and anything that covers a whole home directory. Scratch paths cannot use wildcards.
- The startup audit record lists the active settings.
