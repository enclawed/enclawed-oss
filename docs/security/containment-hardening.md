# Containment hardening plan

Defense-in-depth items planned for Enclawed's contained execution. Each one adds a layer on top of guarantees that already hold; none of them closes a known open route.

## 2.0.6: Landlock for contained runs

Status: planned.

What it adds: a Landlock ruleset installed by the name-guard shim inside the sandbox, before the contained command runs:

- file writes only beneath the run's read-write roots, its private `/tmp`, its home and `/dev/shm`;
- file execution only of the programs the line names and the guards' wrappers, with each real interpreter reached only through its wrapper. A wrapper would exec its interpreter from a file descriptor it holds open (execveat on an inherited descriptor), so the interpreter's path itself can be denied execution;
- a run is not contained (the person decides) when the kernel has no Landlock ABI the ruleset needs, and `enclawed doctor` says why.

Why it is a separate item: it lives in the native name-guard shim, so it ships with prebuilt guard binaries for every supported architecture. It also needs the descriptor-based exec of the wrapped interpreters, because Landlock's execute right cannot tell an exec through a wrapper from a direct one.

The route it would also cover is closed in 2.0.5 by independent layers. A contained process cannot write its own code pages:

- `/proc` is mounted read-only in the sandbox;
- the name guard never opens a procfs file for writing on the process's behalf;
- every contained run's seccomp filter refuses `ptrace`, `process_vm_readv`, `process_vm_writev` and `pidfd_getfd`.

## 2.0.5: contained Python needs Python 3.14 or newer

Status: shipped.

The python guard is verified on Python 3.14. When the `python3` a contained run would start (its real binary, asked for its version) is older, Python lines are not run contained: each asks a person, with the reason "contained Python needs Python 3.14 or newer; this host has 3.x". `enclawed doctor` reports it. Decisions that do not run Python contained are unaffected.

A contained pytest run uses plain assertions: the guard adds `-p no:cacheprovider --assert=plain` after the line's own options, so pytest's assertion rewriting (which compiles a rewritten syntax tree, code nobody read as text) never runs, and a failing `assert` reports `AssertionError` without the rewritten explanation. Selection expressions (`-k`, `-m`), doctests (`--doctest-modules`, `doctest.testmod`) and string `skipif` conditions are compiled from text at run time: such pytest lines ask a person, and doctest examples are not run contained.

## 2.0.5: a project's virtual environment

Status: shipped.

When a line runs a project virtual environment's Python (`.venv/bin/python`, its `pytest` console script, or `python3` with the environment activated first on the session's PATH), the contained run uses the toolchain's interpreter its `pyvenv.cfg` names (Python 3.14 or newer), binds the environment read-only (its site-packages executable, for extension modules) and puts its site-packages on the guard's path in place of the system's, trusted like the toolchain's own code: installs into the environment are decided when they run, and no contained run but an install writes an environment's packages, entry points or `pyvenv.cfg` (builds and runs a person approved included). If a run changed them anyway, the containment marks the environment (`.enclawed-tainted`); a marked environment is not run contained as toolchain code until a decided install into it removes the mark. Only environments named `.venv` or `venv` (the names those protections cover) run this way. The environment is trusted by content: Enclawed records a fingerprint of its installed packages (the packages, programs and headers: every entry's path, size, modification and change times and inode, digested; only `__pycache__` directories left out) in its own state outside the project when a person approves trusting it at Enclawed's prompt, or when a decided install into it completes. A contained run of it proceeds only while the fingerprint is the recorded one; an environment with no record (a committed one included) or a changed one asks. The agent's own writes into the environment's packages or entry points, and into the implicit execution caches the containment protects, wait for a person on the host too. The project's code may import only the standard library, its own modules and, in a pytest run, pytest; any other package of the environment it imports asks. The environment's other programs, and a bare program name the activated environment provides (`pytest` alone), ask.

## 2.0.5: real interpreters only through their wrappers

Status: shipped.

The real programs the guards wrap (the shells, node, python, gawk) are in no place of a contained run's view. Each guarded program's path shows the name guard in its wrapper mode. The wrapper checks what the run asks for (pinned -c text, the read copy of a script, python's and node's guard options, awk's sandbox mode), then asks the supervisor for the real program. The supervisor answers only a caller whose executable is the name guard at a wrapped program's path, which it reads while the caller is held in that call, and hands it a close-on-exec descriptor of an execute-only copy of the program, made on the host and never shown in the view.

A program started from an execute-only copy is not dumpable: no other process of the run can open its executable, its memory or its descriptors through /proc. The supervisor also sees every exec of the run: an exec that would start a real program's copy by any name (the process's own /proc/self/exe, a link to it, a descriptor of it, another process's /proc/<pid>/exe) is refused unless the process making it is a wrapper. Every other exec continues unchanged.

The exec check reads the path the caller passes; the kernel reads it again when the exec continues. The supervisor reads it a second time just before answering and refuses when it changed, so changing it in that window needs another thread rewriting the caller's memory at that instant. Every process that could start a real program's copy is itself a real program, and of those only node and python have threads; their guards refuse every exec. The check itself does not depend on how the path is spelled: a path that resolves through a descriptor link (a link whose text is /proc/<pid>/exe or /dev/fd/N) or to a procfs object is refused. A caller with more than one thread starts only a binary of the view's read-only system part (not a script, not a wrapped interpreter, nothing in a read-write root). What remains: a process made with CLONE_VM (vfork) shares its parent's memory while counting one thread, so a parent's other thread could still change the path after the second read; what such a path can reach is bounded by the view, in which the real programs' copies do not exist and through whose /proc they cannot be reached.

Modes, ownership, times and extended attributes are mediated as writes are: ownership never changes; extended attributes are never set or removed (the run sees a file system without them); a protected file's mode and times never change; no mode anywhere gains set-ID, sticky, group or other write; and a file of a read-write root that existed before the run keeps its mode (history keeps contents, not modes), except in a dependency tree, which is regenerated from its lockfile. New files and directories in a read-write root are made without group or other write.

A git directory (the project's .git, a submodule's or worktree's inside it, a nested repository's, or one a .git file names) is written only where git writes for the run's own operations: objects (not objects/info), the index and, when the line may move refs, refs, HEAD, logs and a merge's state. Everything else in it (config, commondir, hooks, info, alternates, shallow, worktree and submodule configuration, a rebase's or sequencer's todo) is refused by the name guard, and no .git file or directory is made or replaced.

The supervisor reads a caller's arguments with process_vm_readv, which also works for callers that are not dumpable.

## 2.0.5: a shell reads only what Enclawed read

Status: shipped.

A real shell of a contained run (sh, dash, bash) opens a file of a place the run can write (the project, its /tmp, its home) only as the bytes Enclawed read for the line: the scripts it read as code and the files a shell itself reads as input. The supervisor performs every such open: it copies the file into a sealed memory file while hashing it, and hands that copy over only when its path and hash are among the ones read. Any other file there, or one rewritten after it was read, fails to open (Permission denied), so a shell can never run text Enclawed did not read, whatever reading the line would have needed. Files outside the writable places open unchanged, and other programs' opens are not affected.

A shell's own here-documents go through a pipe when they fit one (bash 5.1 and later); a larger one fails, as does a file the shell writes and then sources.

## 2.0.5: contained builds, and GPU use by grant

Status: shipped.

A build tool's command line (cmake, ctest, make, ninja, meson, cargo, go in their build, test and check forms) runs contained with no person, although the project's build scripts are code Enclawed does not read. What makes such a run safe is the containment, not reading: it has no network at all, it writes only to the project (what git does not keep is kept in Enclawed's history first; a git-ignored build tree is regenerated by the build) and to its own private /tmp and home, the project's files that hold a secret read as empty, and nothing it leaves behind runs later on the host: every file that configures what runs later is refused by name, and in a build so is every path inside a .git directory, package.json and every .pth file, in dependency trees too. Every process of the run ends with it. The system's toolchain and the vendor toolchains under /usr/local and /opt that hold no credential file are visible read-only. A build may name its own threads; it makes no other write to /proc.

A build sees no GPU unless the person granted GPU use for that project (Enclawed Code: a per-project grant confirmed with the second factor and recorded in the audit log; never an environment variable or a file the agent can write). A run with code pins never sees one. With the grant, a build of that project sees the host's GPU device nodes (on WSL /dev/dxg with the driver's library and driver-store directories, read-only; on Linux the NVIDIA device nodes and the DRM render nodes, never the display nodes). What the grant exposes: device nodes give no file and no network access, but code in the build can use the GPU and every request the GPU kernel driver accepts. On WSL that driver forwards requests through the hypervisor to the Windows host's graphics driver. A flaw in that driver is reachable by the build's code, and the GPU's memory is shared with the host's other GPU users as the driver isolates it. Grant it only for projects whose builds need to run GPU code. Without the grant, a failed build on a host with a GPU says that it ran without the GPU and how to grant it.

## Policy item: build outputs a host tool loads

A Rust build writes `target/**/deps/*.so`, the procedural macros that rust-analyzer (an editor's language server) loads to expand code. A contained build writes `target/` by design, so these are not refused; a person whose editor runs rust-analyzer on a project whose build ran contained treats `target/` as that build's output (rebuilding it, or running the editor's analysis only after reviewing the build).

