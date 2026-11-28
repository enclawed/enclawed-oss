# Command classes

How Enclawed decides a standard Unix command the agent runs. Every command, and every option of it, falls in one of five classes. An option that writes a file, runs a program, reaches the network or reads a secret moves the whole command to the class of that effect.

| Class                    | What happens                                        | Why                                                                           |
| ------------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------- |
| Host read-only           | Runs on the host with no prompt                     | It writes nothing, runs nothing and reaches no network                        |
| Reversible project write | Runs with no prompt; history keeps what it replaces | Every change can be undone                                                    |
| Contained                | Runs inside Enclawed's containment with no prompt   | It runs code Enclawed has read, in a sandbox that keeps every effect undoable |
| Ask                      | Waits for the person                                | The effect cannot be undone and matters                                       |
| Deny                     | Never runs                                          | The agent may not do it at all                                                |

Reading a credential stays a separate rule in every class: a command that shows a credential file's content asks, whatever class it is in. A command that only shows names, sizes or file types (metadata) never asks for that reason.

## Host read-only

Metadata readers. No prompt, even on credential paths, because they show no file content.

| Command                                                                                       | Exceptions (what moves it out of this class)                                                                                           |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `du`, `ls`, `stat`, `df`                                                                      | `du --files0-from` reads names from a file's content                                                                                   |
| `realpath`, `readlink`, `basename`, `dirname`, `pwd`                                          | none                                                                                                                                   |
| `find`                                                                                        | `-delete`, `-fprint*`, `-fls`, `-ok*`; `-exec` and `-execdir` stay here only when the command they run is itself here                  |
| `tree`                                                                                        | `-o` writes a file; `--fromfile` reads names from a file's content                                                                     |
| `test`, `[`                                                                                   | Only file tests and comparisons                                                                                                        |
| `file`, `wc`                                                                                  | `wc --files0-from`                                                                                                                     |
| `which`, `type`, `command -v`, `whereis`                                                      | `command NAME` without `-v` runs NAME                                                                                                  |
| `id`, `whoami`, `groups`, `logname`, `users`, `who`, `tty`                                    | none                                                                                                                                   |
| `uname`, `arch`, `hostname`, `date`, `uptime`, `nproc`, `free`, `getconf`, `locale`, `ulimit` | `hostname NAME` and `date -s` set the system; `ulimit` with a value sets a limit                                                       |
| `ps`, `pgrep`, `pidof`, `top`, `ss`, `findmnt`                                                | `top` only in batch mode with a count; `ss -K` (kills sockets), `-D` (writes a file) and `-N` (another namespace)                      |
| `lscpu`, `lsblk`, `lspci`, `lsusb`, `lsmod`                                                   | Options that read other trees or dump hardware registers                                                                               |
| `systemctl`                                                                                   | Only its query verbs (`status`, `is-*`, `list-*`); `show`, `cat` and `show-environment` can print credentials; another host or machine |
| `journalctl`                                                                                  | Every option that rotates, vacuums, flushes or writes; another journal                                                                 |
| `kpsewhich`                                                                                   | Options that may make missing files                                                                                                    |
| `dpkg`, `dpkg-query`, `apt`, `apt-cache`, `pkg-config`                                        | Only their query actions                                                                                                               |

Content readers. No prompt, but a credential file among their inputs asks.

| Command                                                                                                                                        | Exceptions                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cat`, `head`, `tail`, `tac`, `rev`, `nl`, `cut`, `tr`, `fold`, `fmt`, `expand`, `unexpand`, `column`, `paste`, `join`, `comm`, `sort`, `uniq` | `sort -o`, `-T`, `--compress-program`; `uniq IN OUT` writes OUT                                                                                   |
| `grep`, `egrep`, `fgrep`, `rg`                                                                                                                 | `rg --pre` and `--pre-glob` run a program per file                                                                                                |
| `diff`, `cmp`, `od`, `hexdump`, `xxd`, `strings`                                                                                               | `xxd -r` and `xxd IN OUT` write; `strings @FILE` reads options from a file                                                                        |
| `base64`, `base32`                                                                                                                             | A second operand                                                                                                                                  |
| `sha*sum`, `md5sum`, `b2sum`, `cksum`, `sum`                                                                                                   | none                                                                                                                                              |
| `jq`                                                                                                                                           | `jq --rawfile` and `--slurpfile` read files (the credential rule applies)                                                                         |
| `sed`                                                                                                                                          | `-i`, `-f`, the `w`, `W`, `r`, `R` and `e` commands, and the `w` and `e` substitution flags                                                       |
| `awk`                                                                                                                                          | `system()`, `getline` from a command or a file, output redirections, `ENVIRON`                                                                    |
| `echo`, `printf`, `true`, `false`, `seq`, `expr`, `yes`, `factor`, `bc`                                                                        | `printf -v`                                                                                                                                       |
| `env`, `printenv`                                                                                                                              | They print the session's environment, where credentials live: they ask, unless every line they print is filtered to lines that hold no credential |

`tail -f` stays read-only: it only waits for more of a file. `less` and `more` are not in this class: a pager can run commands.

Lines built from these commands stay read-only: pipelines, `&&` and `||` lists, `;` and newlines, subshells `( ... )`, brace groups `{ ...; }`, `for` loops over known words, `while` and `until` loops that set no variable and change no directory, `if` blocks, `time`, here-documents and here-strings.

## Reversible project writes

These run with no prompt when everything they touch is inside the project (or the session's own scratch directory) and is kept by history or by git.

| Command                                          | Condition                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Redirections `>`, `>>`, `>                       | `, `&>`, `2>`and`tee`                                                                                                                                                                                                                                                                                                          | To the console (`/dev/stdout`, `/dev/stderr`, `/dev/fd/1`, `/dev/fd/2`, `/dev/null`): always. To a new file in the project, the session's scratch directory or the system's temporary directory: no prompt, and the line runs with the shell's noclobber so the file is created exclusively. Overwriting an existing file: only a project file history keeps, or a scratch file; never a file that configures what runs later, a linked file, an untracked file, or a file elsewhere outside the project |
| `mkdir`, `touch`, `cp` (no recursion)            | Targets in the project or scratch                                                                                                                                                                                                                                                                                              |
| `mv`                                             | Sources and targets in the project or scratch; the moved content survives at its target                                                                                                                                                                                                                                        |
| `rm`                                             | Files git tracks, files this session created, and files in scratch                                                                                                                                                                                                                                                             |
| `chmod`                                          | Files the same line creates, and scratch files; never set-user-ID, set-group-ID, sticky, or write for the group or others. A mode change of a file that existed before asks unless this session created it (undoing that file removes it, mode and all): history keeps content, not modes. `chown` and extended attributes ask |
| `ln -s`                                          | A new link in the project, run contained                                                                                                                                                                                                                                                                                       |
| `truncate -s`, `sed -i`, `dos2unix`, `unix2dos`  | Project and scratch files; the prior content is kept by history                                                                                                                                                                                                                                                                |
| `gzip`, `gunzip`, `bzip2`, `xz`, `zstd` in place | The compressed or decompressed copy is written; the original survives in it                                                                                                                                                                                                                                                    |
| `tar -c`, `tar -t`                               | Creating an archive of project files, or listing one; never an option that runs a program, follows links out, reads names from a file or names a remote host. Extraction asks                                                                                                                                                  |

## Contained

Programs that run code Enclawed reads (scripts, test runners, package scripts, inline code) run inside the containment with no prompt, under the existing code-pin rules. Their effects stay undoable because the containment keeps the project's history and allows no network except declared destinations.

## Ask

| Effect                                        | Examples                                                                                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Deleting or overwriting data no history holds | `rm` of an untracked file the session did not create; overwriting an untracked file                                                                                      |
| Writing outside the project                   | `cp`, `mv`, `rm`, `chmod`, `chown` outside the project and scratch; a redirection that overwrites an existing file there; a hard link                                    |
| Network                                       | `curl`, `wget`, `ssh`, `scp`, `rsync` to a remote host, `nc`, `git push` (existing network rules)                                                                        |
| System state                                  | Package installs to the system, `systemctl`, `service`, `kill`, `pkill`, `killall`, `crontab`, `at`, `shutdown`, `reboot`, `mount`, `umount`, `docker run`, `podman run` |
| Disks                                         | `dd`, `mkfs`, `fdisk`, `shred`, `wipefs`                                                                                                                                 |
| Configuration that runs later                 | Writes to git hooks, agent and editor settings, CI workflows and the like; shell startup files in the home                                                               |
| Git history                                   | Commits and history rewrites                                                                                                                                             |
| A redirection Enclawed cannot read exactly    | A target with a pattern or an unknown variable, `exec >FILE`, `<>`, `/dev/tty`, another descriptor, a `/proc` path, a redirection of a whole group                       |

`kill` of a process the session started itself is not told apart from any other process: it asks.

## Deny

| Effect                                  | Commands                                                                                                                                                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Another user's authority                | `sudo`, `sudoedit`, `su`, `doas`, `pkexec`, `run0`, `sg`, `newgrp`, `machinectl shell`, `systemd-run` without `--user`, and anything run through them, through any wrapper, `find -exec`, `xargs`, `sh -c` or an alias |
| Account changes                         | `passwd`, `chsh`, `chfn`, `gpasswd`                                                                                                                                                                                    |
| Code fetched and run in one line        | `curl ... \| sh` and its variants (existing rule)                                                                                                                                                                      |
| Secrets of Enclawed or of the agent CLI | Existing rule                                                                                                                                                                                                          |

The agent cannot type a password, and on a machine where no password is asked a privileged command would run as root: Enclawed never lets the agent run one. The person runs it in their own terminal.
