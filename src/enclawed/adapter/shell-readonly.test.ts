// The strict read-only shell allowlist (ported from codenclawed's
// shell-readonly.mjs with its tests: shell.test.mjs, regressions F1 and R1),
// and its use as the engine's default classifier.

import { describe, expect, it } from "vitest";
import {
  abbreviatesRefused,
  classifyCompound,
  classifyPowerShellCommand,
  classifyShellCommand,
  splitSimpleCommand,
  strictShellClassifier,
} from "./shell-readonly.js";

// False positives: ordinary read-only commands must run without a prompt.
const READ_ONLY = [
  "ls -la",
  "ls",
  "pwd",
  "cat README.md",
  "head -n 20 src/a.ts",
  "tail -n 5 'log file.txt'",
  'grep -rn "TODO" src',
  "rg -n foo src",
  "wc -l *.ts",
  "find . -name '*.ts' -type f",
  "git status",
  "git -C sub log --oneline -5",
  "git diff HEAD~1",
  "git --no-pager show HEAD",
  "git branch -a",
  "git config --get user.name",
  "git stash list",
  "node --version",
  "date +%Y-%m-%d",
  "env",
  "sort -n numbers.txt",
  "uniq data.txt",
  "command -v node",
  "stat -c %s file",
  "git cat-file -p HEAD:a.txt",
  "git cat-file blob HEAD:a.txt",
  "git cat-file -t HEAD",
  "git log --text",
  "git rev-parse --show-toplevel",
  "git ls-files --others",
  "git describe --tags",
  "jq -r .name package.json",
  "jq --arg x 1 .a f.json",
  "du -sh src",
  "ls --color=auto",
];

// Attacks: each is not read-only, with its reason code.
const NOT_READ_ONLY: ReadonlyArray<readonly [string, string]> = [
  ["rm -rf /", "command-not-allowlisted"],
  ["ls | sh", "shell-metacharacter"],
  ["cat a > b", "shell-metacharacter"],
  ["cat a >> b", "shell-metacharacter"],
  ["ls; rm x", "shell-metacharacter"],
  ["ls && rm x", "shell-metacharacter"],
  ["ls || rm x", "shell-metacharacter"],
  ["echo $(rm x)", "shell-metacharacter"],
  ["echo `rm x`", "shell-metacharacter"],
  ['echo "$(rm x)"', "shell-expansion"],
  ["echo $HOME", "shell-metacharacter"],
  ["cat < /etc/passwd", "shell-metacharacter"],
  ["(rm x)", "shell-metacharacter"],
  ["ls & rm x", "shell-metacharacter"],
  ["ls\nrm x", "shell-metacharacter"],
  ["cat a\\ b", "shell-metacharacter"],
  ["FOO=1 ls", "env-assignment"],
  ["find . -delete", "argument-not-read-only"],
  ["find . -exec rm {} ;", "shell-metacharacter"],
  ["find . -exec rm x", "argument-not-read-only"],
  ["sort -o out.txt in.txt", "argument-not-read-only"],
  ["uniq in out", "argument-not-read-only"],
  ["git push", "argument-not-read-only"],
  ["git commit -m x", "argument-not-read-only"],
  ["git -c core.pager=sh log", "argument-not-read-only"],
  ["git log --output=x", "argument-not-read-only"],
  ["git branch -D main", "argument-not-read-only"],
  ["git config user.name x", "argument-not-read-only"],
  ["env rm x", "command-not-allowlisted"],
  ["date -s 2020-01-01", "argument-not-read-only"],
  ["hostname evil", "argument-not-read-only"],
  ["rg --pre sh foo", "argument-not-read-only"],
  ["node script.js", "argument-not-read-only"],
  ["./ls", "command-not-allowlisted"],
  ["/bin/rm -rf x", "command-not-allowlisted"],
  ["sed -i s/a/b/ f", "argument-not-read-only"],
  ["awk 'BEGIN{system(\"rm x\")}'", "argument-not-read-only"],
  ["curl https://example.com", "command-not-allowlisted"],
  ["'unterminated", "unbalanced-quote"],
  ["", "no-command"],
  ["ls !x", "shell-metacharacter"],
  ["ls # comment", "shell-metacharacter"],
  ["echo {a,b}", "shell-metacharacter"],
];

describe("strict read-only shell allowlist", () => {
  it("recognizes ordinary read-only commands (no false positive)", () => {
    for (const cmd of READ_ONLY) {
      expect(classifyShellCommand(cmd).readOnly, cmd).toBe(true);
      expect(strictShellClassifier.classify(cmd, "posix").readOnly, cmd).toBe(true);
    }
  });

  it("refuses everything else, with a reason code", () => {
    for (const [cmd, code] of NOT_READ_ONLY) {
      const v = classifyShellCommand(cmd);
      expect(v.readOnly, cmd).toBe(false);
      expect(!v.readOnly && v.code, cmd).toBe(code);
    }
    expect(classifyShellCommand(undefined).readOnly).toBe(false);
    expect(classifyShellCommand({ cmd: "ls" }).readOnly).toBe(false);
  });

  it("F1: attached option values cannot smuggle an exec or a write through", () => {
    for (const cmd of [
      "git grep -Orm secret",
      "git grep -O/tmp/evil.sh pat",
      "git grep --open=sh pat",
      "tree -oout.txt",
      "date -s2020-01-01",
      "hostname -Fname.txt",
      "sort -oout in",
      "sort --out=x in",
      "git log --out=x",
      "ls --al",
    ]) {
      expect(classifyShellCommand(cmd).readOnly, cmd).toBe(false);
    }
    const v = classifyShellCommand("git grep -Orm secret");
    expect(!v.readOnly && v.detail).toMatch(/option -O/);
  });

  it("R1: git abbreviations of refused options are refused for every allowlisted git subcommand", () => {
    for (const cmd of [
      "git cat-file --te HEAD:a.txt",
      "git cat-file --fi HEAD:a.txt",
      "git cat-file --t HEAD:a.txt",
      "git cat-file --textconv HEAD:a.txt",
      "git cat-file --batch",
      "git cat-file --ba",
      "git cat-file --path=a.txt HEAD",
      "git rev-parse --ou=/tmp/x",
      "git ls-files --e",
      "git ls-tree --fi HEAD",
      "git reflog show --ext",
      "git grep --textc foo",
      "git log --te",
      "git rev-list --no-",
    ]) {
      expect(classifyShellCommand(cmd).readOnly, cmd).toBe(false);
    }
    expect(abbreviatesRefused("t")).toBe("textconv");
    expect(abbreviatesRefused("text", new Set(["text"]))).toBeNull();
  });

  it("reports the git -C directories (the engine checks that repository's config)", () => {
    const v = strictShellClassifier.classify("git -C a -C b log", "posix");
    expect(v.readOnly && v.git?.cdirs).toEqual(["a", "b"]);
    expect(strictShellClassifier.classify("ls", "posix")).toEqual({ readOnly: true });
  });

  it("quoting keeps metacharacters literal only inside single quotes", () => {
    expect(splitSimpleCommand("grep 'a|b;c' f")).toEqual({
      ok: true,
      argv: ["grep", "a|b;c", "f"],
    });
    expect(splitSimpleCommand('grep "a`b" f').ok).toBe(false);
  });

  it("PowerShell: a minimal read-only set, one simple command", () => {
    expect(classifyPowerShellCommand("Get-ChildItem -Recurse").readOnly).toBe(true);
    expect(classifyPowerShellCommand("Get-Content a.txt").readOnly).toBe(true);
    expect(classifyPowerShellCommand("Remove-Item a.txt").readOnly).toBe(false);
    expect(classifyPowerShellCommand("Get-Content a | Out-File b").readOnly).toBe(false);
    expect(classifyPowerShellCommand("gc $env:SECRET").readOnly).toBe(false);
    expect(strictShellClassifier.classify("Get-Content a.txt", "powershell").readOnly).toBe(true);
    expect(strictShellClassifier.classify("Remove-Item a.txt", "powershell").readOnly).toBe(false);
  });
});

// A real session inspecting a toolchain (Claude Code in Enclawed Code): every
// line below is read-only and must run without a person.
const TOOLCHAIN_LINES = [
  "ls -la && which git nvcc mpicc cmake gcc; nvidia-smi -L 2>/dev/null | head; nproc",
  "ls /usr/local/ | head -30; ls -d /usr/local/cuda* /opt/nvidia/hpc_sdk 2>/dev/null; ls /usr/lib/x86_64-linux-gnu/openmpi 2>/dev/null | head -3; gcc --version | head -1; dpkg -l | grep -Ei 'hdf5|openmpi|mpich|cmake|cuda-toolkit|libpng' | awk '{print $2,$3}' | head -20",
];

const INSPECT_READ_ONLY = [
  // nvidia-smi: its query forms.
  "nvidia-smi",
  "nvidia-smi -L",
  "nvidia-smi --list-gpus",
  "nvidia-smi -B",
  "nvidia-smi -q",
  "nvidia-smi -q -d MEMORY,UTILIZATION -i 0",
  "nvidia-smi --query --display=TEMPERATURE --id=0",
  "nvidia-smi -q -x",
  "nvidia-smi -q -u",
  "nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits",
  "nvidia-smi --query-compute-apps=pid,used_memory --format=csv -i 0",
  "nvidia-smi --help-query-gpu",
  "nvidia-smi --version",
  "nvidia-smi topo -m",
  // dpkg / dpkg-query: the query actions.
  "dpkg -l",
  "dpkg -l 'libhdf5*' openmpi-bin",
  "dpkg --list",
  "dpkg -L bash",
  "dpkg --listfiles bash",
  "dpkg -s bash",
  "dpkg --status bash",
  "dpkg -S /bin/bash",
  "dpkg --search /bin/bash",
  "dpkg -p bash",
  "dpkg --print-avail bash",
  "dpkg --print-architecture",
  "dpkg --print-foreign-architectures",
  "dpkg --version",
  "dpkg --get-selections",
  "dpkg --get-selections 'lib*'",
  "dpkg --no-pager -l",
  "dpkg-query -l",
  "dpkg-query -W -f='${Package} ${Version}\\n' bash",
  "dpkg-query --show --showformat='${Status}' bash",
  "dpkg-query -L bash",
  "dpkg-query -s bash",
  "dpkg-query -S /bin/bash",
  "dpkg-query -p bash",
  "dpkg-query --control-list bash",
  // apt-cache / apt: the query actions.
  "apt-cache policy cmake",
  "apt-cache policy libhdf5-dev libopenmpi-dev",
  "apt-cache show cmake",
  "apt-cache showpkg cmake",
  "apt-cache depends --recurse --no-recommends cmake",
  "apt-cache rdepends --installed cmake",
  "apt-cache search --names-only hdf5",
  "apt-cache madison cmake",
  "apt-cache pkgnames lib",
  "apt-cache stats",
  "apt-cache -q policy cmake",
  "apt-cache --version",
  "apt list --installed",
  "apt list -a 'libhdf5*'",
  "apt show cmake",
  "apt search hdf5",
  "apt policy cmake",
  // sed: print-only scripts (addresses, ! and groups, p P = l n N d D q Q).
  "sed -n '1,20p' src/solver.cpp",
  "sed -n 2p f",
  "sed -n '$p' f",
  "sed -n '/^int /,/^}/p' f.cpp",
  "sed -n '/TODO/Ip' f",
  "sed -n -e 1p -e '$p' f",
  "sed -ne '10,+5p' f",
  "sed -nE '0~4p' f",
  "sed '5q' f",
  "sed -n '/a/!p; 3{p;p}' f",
  "sed -n '/[a]x/p' f",
  "sed -n = f",
  "sed --quiet --expression=3p f g",
  "gsed -n 1p f",
  "sed --version",
  // awk: an inline program with no system, getline, pipe or output redirection.
  "awk '{print $2,$3}'",
  "awk -F: '{print $1}' /etc/passwd",
  "awk -F : -v n=3 'NR <= n {print}' f.txt",
  "gawk '$3 > 100 {print $1}' data.txt",
  "mawk '/foo|bar/ {n++} END {print n}' f",
  "nawk 'BEGIN {x = 10 / 2; print x}'",
  "awk '{s += $1} END {print s/NR}' f",
  "awk 'length($0) > 80' f",
  'awk \'$1 == "a" || $1 == "b"\' f',
  "awk '{print \"a|b>c\"}' f",
  "awk '$0 ~ /^[[:alpha:]]+>/ {print}' f",
  "awk 'NR > 1 {print $1; n++}; END {print n}' f",
  'awk \'BEGIN {if (1) print "x"; else print "y"}\'',
  "awk -- '{print}' f",
  "awk 'n = 2' f",
  "awk --version",
  // Machine and toolchain inspection.
  "lscpu",
  "lscpu -e=CPU,NODE",
  "lscpu --json",
  "lspci",
  "lspci -nnk",
  "lspci -vv -s 00:02.0",
  "lsusb",
  "lsusb -v",
  "lsusb -t",
  "lsblk",
  "lsblk -f -o NAME,SIZE,MOUNTPOINT",
  "lsmod",
  "free -h",
  "uptime",
  "uname -a",
  "hostname",
  "hostname -f",
  "id",
  "groups",
  "whoami",
  "getconf -a",
  "getconf PAGE_SIZE",
  "arch",
  "locale",
  "locale -a",
  "whereis gcc",
  "ulimit -a",
  "ulimit -n",
  "pkg-config --cflags --libs hdf5",
  "pkg-config --modversion hdf5",
  "pkg-config --list-all",
  "pkg-config --exists libpng",
  "pkg-config --atleast-version=1.10 hdf5",
  "pkgconf --variable=prefix hdf5",
  "cmake --version",
  "nvcc --version",
  "mpicc --version",
  "mpicc -show",
  "mpicc --showme",
  "mpicxx --showme:compile",
  "mpif90 -compile_info",
  "mpirun --version",
  "g++ --version",
  "gfortran --version",
  "python3 --version",
  "numactl --hardware",
  "env",
  "printenv",
  "df -h",
  "du -sh .",
  "stat -c %s f",
  "file f",
  "wc -l f",
];

const INSPECT_NOT_READ_ONLY = [
  // sed: in-place edits, file writes and reads, commands run, scripts from files.
  "sed -i s/a/b/ f",
  "sed -n 1p f -i",
  "sed --in-place=.bak 1d f",
  "sed -n '1w out' f",
  "sed -n '1W out' f",
  "sed 's/a/b/w out' f",
  "sed 's/a/b/e' f",
  // A plain substitution prints its input rewritten (read-only); these forms are not.
  "sed 's/a/b/ w out' f",
  "sed 's/[/]/x/' f",
  "sed 's/a/b/gw out' f",
  "sed -n '1e id' f",
  "sed '1r /etc/shadow' f",
  "sed '1R other' f",
  "sed -f script.sed f",
  "sed -n '1p;w out' f",
  "sed -n '\\,x,p' f",
  "sed -n '/[/]w x/p' f",
  "sed -n '1{p' f",
  "sed -n '1p}' f",
  "sed -n 'p x' f",
  "sed --follow-symlinks -n 1p f",
  "sed",
  // nvidia-smi: device modification, files, loops, state-setting subcommands.
  "nvidia-smi -pm 1",
  "nvidia-smi --persistence-mode=1",
  "nvidia-smi -r",
  "nvidia-smi --gpu-reset -i 0",
  "nvidia-smi -i 0 -pm 1",
  "nvidia-smi -c 3",
  "nvidia-smi -ac 2000,800",
  "nvidia-smi -rac",
  "nvidia-smi -pl 200",
  "nvidia-smi -e 0",
  "nvidia-smi -p 0",
  "nvidia-smi -mig 1",
  "nvidia-smi -lgc 1500,1500",
  "nvidia-smi -rgc",
  "nvidia-smi -t 1",
  "nvidia-smi --set-hostname=x",
  "nvidia-smi -q -f out.txt",
  "nvidia-smi -q --filename=out.txt",
  "nvidia-smi --debug=dbg.log",
  "nvidia-smi -l 1",
  "nvidia-smi --loop=1",
  "nvidia-smi -lms 100",
  "nvidia-smi dmon",
  "nvidia-smi pmon",
  "nvidia-smi daemon",
  "nvidia-smi mig -cgi 9",
  "nvidia-smi drain -p 0 -m 1",
  "nvidia-smi topo -p2p r",
  "nvidia-smi --query-gpu=name --format=json",
  "nvidia-smi -i -pm",
  "nvidia-smi -Lq",
  "nvidia-smi --list",
  // dpkg / dpkg-query: actions that change the system, hooks, other roots.
  "dpkg -i x.deb",
  "apt-cache gencaches",
  "apt-cache -o Dir::Cache=/tmp/x policy cmake",
  "apt-cache -c /tmp/apt.conf policy cmake",
  "apt-cache -p /tmp/pkgcache.bin stats",
  "apt-cache --pkg-cache=/tmp/x stats",
  "apt-cache -s /tmp/src.bin stats",
  "apt-cache -g policy cmake",
  "apt-cache --generate policy cmake",
  "apt-cache",
  "apt install cmake",
  "apt update",
  "apt list -o Dir=/tmp",
  "apt",
  "dpkg --install x.deb",
  "dpkg -r x",
  "dpkg --remove x",
  "dpkg -P x",
  "dpkg --purge x",
  "dpkg --configure -a",
  "dpkg --unpack x.deb",
  "dpkg --set-selections",
  "dpkg --clear-selections",
  "dpkg --add-architecture i386",
  "dpkg --update-avail f",
  "dpkg -V",
  "dpkg -x x.deb dir",
  "dpkg -l --log=/tmp/x",
  "dpkg -l --admindir=/tmp/db",
  "dpkg -l --root=/tmp",
  "dpkg -l --pre-invoke=sh",
  "dpkg -l --status-logger=sh",
  "dpkg -l --force-all",
  "dpkg --li",
  "dpkg -li x.deb",
  "dpkg-query --admindir=/tmp/db -l",
  "dpkg-query --root=/tmp -l",
  // awk: anything that runs, writes, or reads what the command line does not name.
  "awk 'BEGIN{system(\"rm -rf /\")}'",
  "awk '{print > \"/tmp/x\"}'",
  "awk '{print >> \"/tmp/x\"}'",
  "awk '{print $1 > $2}'",
  "awk '{print ($1 > 2) > \"f\"}' x",
  'awk \'{printf "%s", $1 > "/tmp/x"}\'',
  "awk '{print | \"sh\"}'",
  "awk '{print |& \"sh\"}'",
  "awk 'BEGIN{\"id\" | getline x}'",
  "awk 'BEGIN{getline x < \"/etc/shadow\"}'",
  "awk 'BEGIN{while ((getline l) > 0) n++}'",
  "awk 'BEGIN{fflush()}'",
  "awk 'BEGIN{close(\"x\")}'",
  "awk 'BEGIN{ARGV[1] = \"/etc/shadow\"; ARGC = 2} {print}'",
  'awk \'BEGIN{f = "system"; @f("id")}\'',
  "awk '@include \"x.awk\"'",
  "awk '@load \"filefuncs\"'",
  "awk -f prog.awk",
  "awk --file=prog.awk",
  "awk -fprog.awk",
  "gawk -i inc.awk '{print}'",
  "gawk -l filefuncs '{print}'",
  "gawk -E prog.awk",
  "gawk -e '{print}'",
  "gawk -o '{print}'",
  "gawk -p '{print}'",
  "gawk -d '{print}'",
  "mawk -W exec prog.awk",
  "awk '{print}' -f prog.awk",
  "awk",
  "awk -F",
  // A regular expression literal whose end two awks could read differently.
  "awk '/[/]/ {print}' f",
  "awk '/[]x]/' f",
  "awk '/[a[b]/' f",
  // A `/` after a keyword or `$`: division or a regex depending on the awk.
  "awk '{print /x/}' f",
  "awk '{x = $/2/}' f",
  "awk '{print `id`}' f",
  "awk 'BEGIN{x = 1 \\ 2}'",
  "awk '{print \"unterminated}'",
  // Hardware and system inspection: the forms that write or set state.
  "hostname evil",
  "hostname -F name.txt",
  "hostname -b x",
  "env rm -rf x",
  "env -i sh",
  "ulimit -n 1024",
  "ulimit unlimited",
  "lscpu -s /tmp/root",
  "lsblk --sysroot /tmp/root",
  "lspci -x",
  "lspci -xxxx",
  "lspci -H1",
  "lspci -M",
  "lspci -q",
  "lspci -O dump.name=x -A dump",
  "lsusb -D /dev/bus/usb/001/001",
  "pkg-config --log-file=/tmp/x --libs hdf5",
  "pkg-config --personality=evil --libs hdf5",
  "nvcc -o x x.cu",
  "nvcc",
  "mpicc x.c",
  "mpicc -show x.c",
  "mpicc -o x x.c",
  "mpirun -np 2 ./a.out",
  "mpirun ls",
  "numactl --hardware ls",
  "numactl -C 0 ls",
  "ldd /bin/ls",
  "pip list",
  "pip install x",
  "conda list",
  "rpm -qa",
  "getconf -a x y z",
];

describe("machine and toolchain inspection (no false positive, no false negative)", () => {
  const ctx = { cwd: "/home/u/proj", home: "/home/u" };

  it("the reported toolchain lines are read-only as a whole", () => {
    for (const line of TOOLCHAIN_LINES) {
      const v = classifyCompound(line, ctx);
      expect(v.readOnly, `${line} -> ${JSON.stringify(!v.readOnly && [v.code, v.detail])}`).toBe(
        true,
      );
      expect(strictShellClassifier.classify(line, "posix", ctx).readOnly, line).toBe(true);
    }
  });

  it("recognizes every read-only inspection form", () => {
    for (const cmd of INSPECT_READ_ONLY) {
      const v = classifyCompound(cmd, ctx);
      expect(v.readOnly, `${cmd} -> ${JSON.stringify(!v.readOnly && [v.code, v.detail])}`).toBe(
        true,
      );
    }
  });

  it("refuses every form that writes, runs a program or changes system state", () => {
    for (const cmd of INSPECT_NOT_READ_ONLY) {
      expect(classifyCompound(cmd, ctx).readOnly, cmd).toBe(false);
    }
    // The same commands inside an otherwise read-only line stay refused.
    for (const cmd of INSPECT_NOT_READ_ONLY) {
      expect(classifyCompound(`ls && ${cmd} | head`, ctx).readOnly, cmd).toBe(false);
    }
  });

  it("names what it refuses", () => {
    const pm = classifyShellCommand("nvidia-smi -pm 1");
    expect(!pm.readOnly && pm.detail).toMatch(/nvidia-smi -pm is not on the read-only list/);
    const sys = classifyShellCommand("awk 'BEGIN{system(\"id\")}'");
    expect(!sys.readOnly && sys.detail).toMatch(/system is not on the read-only list/);
    const pipe = classifyShellCommand("awk '{print | \"sh\"}'");
    expect(!pipe.readOnly && pipe.detail).toMatch(/pipe/);
    const out = classifyShellCommand("awk '{print > \"/tmp/x\"}'");
    expect(!out.readOnly && out.detail).toMatch(/output redirection/);
    const inst = classifyShellCommand("dpkg -i x.deb");
    expect(!inst.readOnly && inst.detail).toMatch(/-i/);
  });
});

const GH_LINE =
  "git remote -v && git branch -a | head -20 && gh auth status 2>&1 | head -10 && gh repo view metereindustries/openmc_gpu 2>&1 | head -3";

const GH_READ_ONLY = [
  "gh --version",
  "gh version",
  "gh auth status",
  "gh auth status -h github.com",
  "gh auth status --hostname=github.com",
  "gh repo view",
  "gh repo view cli/cli",
  "gh repo view github.com/cli/cli",
  "gh repo view https://github.com/cli/cli",
  "gh repo view cli/cli --json name,description --jq .name",
  "gh repo view cli/cli --json name -t '{{.name}}'",
  "gh repo view -b trunk cli/cli",
  "gh repo list",
  "gh repo list enclawed -L 50 --source",
  "gh pr list",
  "gh pr list -R cli/cli -s merged -L 5 --json number,title",
  "gh pr list --repo=github.com/cli/cli -d",
  "gh pr view 123",
  "gh pr view 123 -c -R cli/cli",
  "gh pr view https://github.com/cli/cli/pull/1",
  "gh pr view feature/a/b",
  "gh pr status",
  "gh pr diff 12 --name-only",
  "gh pr diff 12 --color=never",
  "gh pr checks 12 --required",
  "gh issue list -l bug -s all",
  "gh issue view 7 --comments",
  "gh issue status",
  "gh run list -L 5",
  "gh run list -w ci.yml -b main",
  "gh run view 123 --log-failed",
  "gh run view 123 --log -j 456",
  "gh run view 123 -v --exit-status",
  "gh release list",
  "gh release view v1.0",
  "gh workflow list -a",
  "gh workflow view ci.yml --yaml",
  "gh label list",
  "gh gist list",
  "gh gist view abc123 --raw",
  "gh search repos openmc --language=C++ -L 10",
  "gh search issues crash --repo cli/cli --state open",
  "gh search prs --merged --author octocat",
  "gh search code 'cudaMalloc' --extension cu",
  "gh search repos foo --archived=false",
];

const GH_NOT_READ_ONLY = [
  "gh",
  "gh api repos/cli/cli",
  "gh api -X DELETE repos/o/r",
  "gh auth token",
  "gh auth login",
  "gh auth logout",
  "gh auth refresh",
  "gh auth setup-git",
  "gh auth switch",
  "gh auth status -t",
  "gh auth status --show-token",
  "gh auth status -ht github.com",
  "gh alias list",
  "gh alias set x '!rm -rf /'",
  "gh extension list",
  "gh extension install o/gh-x",
  "gh config set pager sh",
  "gh config get pager",
  "gh secret list",
  "gh variable list",
  "gh codespace list",
  "gh gist create f",
  "gh gist edit abc",
  "gh gist delete abc",
  "gh browse",
  "gh someextension",
  "gh repo",
  "gh repo clone cli/cli",
  "gh repo create x",
  "gh repo delete o/r",
  "gh repo view -w",
  "gh repo view --web cli/cli",
  "gh pr list -w",
  "gh pr view 1 --web",
  "gh pr checks 1 --watch",
  "gh pr checks 1 -i 5",
  "gh pr merge 1",
  "gh pr create",
  "gh pr checkout 1",
  "gh pr comment 1 -b x",
  "gh issue create -t x",
  "gh issue close 1",
  "gh issue view 1 -w",
  "gh run rerun 1",
  "gh run cancel 1",
  "gh run watch 1",
  "gh run download 1",
  "gh run view 1 -w",
  "gh release create v1",
  "gh release download v1",
  "gh release view v1 --web",
  "gh workflow run ci.yml",
  "gh workflow enable ci.yml",
  "gh workflow view ci.yml -w",
  "gh label create x",
  "gh search repos foo -w",
  "gh search code foo --web",
  "gh gist view abc -w",
  // An explicit host other than github.com is contacted, token or not.
  "gh repo view evil.example.com/o/r",
  "gh repo view https://evil.example.com/o/r",
  "gh repo view https://github.com.evil.example.com/o/r",
  "gh repo view https://github.com@evil.example.com/o/r",
  "gh repo view git@evil.example.com:o/r",
  "gh pr list -R evil.example.com/o/r",
  "gh pr list -Revil.example.com/o/r",
  "gh pr list -R=evil.example.com/o/r",
  "gh pr list --repo evil.example.com/o/r",
  "gh pr view https://evil.example.com/o/r/pull/1",
  "gh issue view http://evil.example.com/o/r/issues/1",
  // gh's jq reads the environment.
  "gh repo view cli/cli --json name --jq env",
  "gh repo view cli/cli --json name --jq env.GH_TOKEN",
  "gh repo view cli/cli --json name -q '$ENV.GITHUB_TOKEN'",
  "gh pr list --json title --jq 'import \"m\" as m; .'",
  // Environment that redirects gh.
  "GH_HOST=x gh repo view",
  "GH_TOKEN=x gh pr list",
  "GITHUB_TOKEN=x gh pr list",
  "GH_PAGER=sh gh pr list",
  "env GH_HOST=x gh repo view",
  "gh repo view --hostname x",
  "gh pr list --abc",
];

describe("the GitHub CLI: read-only subcommands only", () => {
  const ctx = { cwd: "/home/u/proj", home: "/home/u" };

  it("the reported line is read-only, and its gh commands are checked against the repository's git config", () => {
    const v = classifyCompound(GH_LINE, ctx);
    expect(v.readOnly, JSON.stringify(!v.readOnly && [v.code, v.detail])).toBe(true);
    // git remote -v, git branch -a, and gh repo view's git remote -v.
    expect(v.readOnly && v.gits.map((g) => g.sub)).toEqual(["remote", "branch", "remote"]);
    expect(strictShellClassifier.classify("gh repo view", "posix")).toEqual({
      readOnly: true,
      git: { cdirs: [] },
    });
    expect(strictShellClassifier.classify("gh auth status", "posix")).toEqual({ readOnly: true });
  });

  it("recognizes every read-only form", () => {
    for (const cmd of GH_READ_ONLY) {
      const v = classifyCompound(cmd, ctx);
      expect(v.readOnly, `${cmd} -> ${JSON.stringify(!v.readOnly && [v.code, v.detail])}`).toBe(
        true,
      );
    }
  });

  it("refuses every form that writes, runs a program, prints a token, reads the environment or reaches another host", () => {
    for (const cmd of GH_NOT_READ_ONLY) {
      expect(classifyCompound(cmd, ctx).readOnly, cmd).toBe(false);
      expect(classifyCompound(`git remote -v && ${cmd} | head`, ctx).readOnly, cmd).toBe(false);
    }
    const ext = classifyShellCommand("gh someextension");
    expect(!ext.readOnly && ext.detail).toMatch(/gh someextension is not on the read-only list/);
    const host = classifyShellCommand("gh repo view evil.example.com/o/r");
    expect(!host.readOnly && host.detail).toMatch(/host other than github.com/);
    expect(classifyCompound("GH_HOST=x gh repo view", ctx)).toMatchObject({
      readOnly: false,
      code: "env-assignment",
    });
  });
});
