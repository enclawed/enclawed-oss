// Live: a contained build (./build-mode.ts) runs the project's unread build
// scripts, and every route by which such code could reach beyond the
// project's history-kept files is refused or harmless. Each attack below is a
// Makefile recipe (code Enclawed never reads); the assertions are made on the
// host after the run. Real namespaces, real name guard.

import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hostGpu } from "./build-mode.js";
import { containmentSupport } from "./host.js";
import { projectScriptDeclaration } from "./mcp.js";
import { lookupProgram } from "./plan.js";
import { planContainment } from "./plan.js";
import { fakeHome, planContext, runContainedScript, tempTree } from "./test-helpers.js";

const live = containmentSupport().ok && lookupProgram("make") !== null;
const haveCmake = lookupProgram("cmake") !== null && lookupProgram("cc") !== null;
const sha = (p: string) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const exists = (p: string) => {
  try {
    fs.lstatSync(p);
    return true;
  } catch {
    return false;
  }
};

function gitInit(dir: string) {
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_AUTHOR_NAME: "t",
    GIT_AUTHOR_EMAIL: "t@example.test",
    GIT_COMMITTER_NAME: "t",
    GIT_COMMITTER_EMAIL: "t@example.test",
  };
  execFileSync("git", ["init", "-q", "-b", "main", dir], { env });
  fs.writeFileSync(path.join(dir, "README.md"), "hello\n");
  execFileSync("git", ["add", "README.md"], { cwd: dir, env });
  execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: dir, env });
}

describe.skipIf(!live)("contained build: unread build code stays inside", () => {
  let root: string;
  let home: string;
  let stateDir: string;
  let proj: string;
  let outside: string;
  beforeAll(() => {
    root = tempTree("contain-build");
    home = fakeHome(root);
    stateDir = path.join(root, "state");
    proj = path.join(root, "proj");
    outside = path.join(root, "outside");
    fs.mkdirSync(proj);
    fs.mkdirSync(outside);
    gitInit(proj);
    fs.mkdirSync(path.join(proj, ".vscode"));
    fs.writeFileSync(path.join(proj, ".vscode", "tasks.json"), "{}\n");
    fs.writeFileSync(path.join(proj, "package.json"), '{"name":"p","scripts":{}}\n');
    fs.mkdirSync(path.join(proj, ".venv", "lib", "python3.12", "site-packages"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(proj, "node_modules", "dep"), { recursive: true });
    fs.writeFileSync(path.join(proj, "node_modules", "dep", "package.json"), '{"name":"dep"}\n');
    fs.writeFileSync(path.join(proj, ".env"), "API_TOKEN=sk-live-0123456789abcdef\n");
    fs.writeFileSync(path.join(proj, ".git", "hooks", "pre-commit"), "#!/bin/sh\nexit 0\n");
  });
  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const run = async (recipe: string, extra: { masks?: string[] } = {}) => {
    // Each line of `recipe` is one recipe line of the target (a tab in front);
    // `-` keeps make going after a refused step.
    fs.writeFileSync(
      path.join(proj, "Makefile"),
      `all:\n${recipe
        .split("\n")
        .filter(Boolean)
        .map((l) => `\t-${l}`)
        .join("\n")}\n`,
    );
    return runContainedScript(
      {
        label: "build-test",
        projectDir: proj,
        command: "sh",
        args: ["-c", "make -s all"],
        programs: ["make", "setsid", "nohup", "python3"],
        gitHistoryReadOnly: true,
        build: { masks: extra.masks ?? [path.join(proj, ".env")] },
      },
      planContext(home),
      { stateDir },
    );
  };

  it("plans the build form: no destination, no code pins, no real-program copies, build names in the guard", () => {
    const p = planContainment(
      projectScriptDeclaration({
        label: "b",
        projectDir: proj,
        command: "sh",
        args: ["-c", "true"],
        destinations: [{ host: "registry.npmjs.org", port: 443, mode: "inspect" }],
        build: { masks: [] },
      }),
      planContext(home),
    );
    expect(p.ok, p.ok ? "" : p.message).toBe(true);
    if (p.ok) {
      expect(p.plan.destinations).toEqual([]);
      expect(p.plan.build).toBe(true);
      expect(p.plan.realPrograms).toEqual([]);
      expect(p.plan.strictExec).toBe(false);
    }
    // A build with code pins or a destination is refused outright.
    const bad = planContainment(
      {
        ...projectScriptDeclaration({
          label: "b",
          projectDir: proj,
          command: "sh",
          args: ["-c", "true"],
        }),
        build: { masks: [] },
        destinations: [{ host: "example.com", port: 443, mode: "inspect" }],
      },
      planContext(home),
    );
    expect(bad.ok).toBe(false);
  });

  it.skipIf(!haveCmake)(
    "a real CMake project configures, builds, tests and runs",
    async () => {
      fs.writeFileSync(
        path.join(proj, "CMakeLists.txt"),
        "cmake_minimum_required(VERSION 3.10)\nproject(h C)\nenable_testing()\nadd_executable(h h.c)\nadd_test(NAME h COMMAND h)\n",
      );
      fs.writeFileSync(
        path.join(proj, "h.c"),
        '#include <stdio.h>\nint main(void){puts("hello from build");return 0;}\n',
      );
      const r = await runContainedScript(
        {
          label: "cmake",
          projectDir: proj,
          command: "sh",
          args: [
            "-c",
            "cmake -S . -B build -DCMAKE_BUILD_TYPE=Release >/dev/null && cmake --build build -j 2 >/dev/null && ctest --test-dir build --output-on-failure >/dev/null && ./build/h",
          ],
          programs: ["cmake", "ctest"],
          build: { masks: [] },
        },
        planContext(home),
        { stateDir },
      );
      expect(r.stdout + r.stderr).toContain("hello from build");
      expect(r.code, r.stderr).toBe(0);
      expect(exists(path.join(proj, "build", "CMakeCache.txt"))).toBe(true);
    },
    120_000,
  );

  it("no network: names resolve only to the containment's own stand-ins, and nothing reaches the host or beyond", async () => {
    // A listener on every address of the host: a connection from inside would land here.
    const got: string[] = [];
    const srv = net.createServer((c) => {
      got.push("connection");
      c.destroy();
    });
    await new Promise<void>((res) => srv.listen(0, "0.0.0.0", () => res()));
    const port = (srv.address() as net.AddressInfo).port;
    const hostIps = [
      "127.0.0.1",
      ...Object.values(os.networkInterfaces())
        .flat()
        .filter((i) => i && i.family === "IPv4")
        .map((i) => i!.address),
    ];
    try {
      const r = await run(
        [
          `python3 -c "import socket;print('DNS', socket.gethostbyname('example.com'))" 2>/dev/null || echo NODNS`,
          `python3 -c "import socket;socket.create_connection(('example.com',80),3);print('TCP-NAME')" 2>/dev/null || echo NO-TCP-NAME`,
          `python3 -c "import socket;socket.create_connection(('1.1.1.1',80),3);print('TCP-OUT')" 2>/dev/null || echo NOTCP`,
          ...hostIps.map(
            (ip) =>
              `python3 -c "import socket;socket.create_connection(('${ip}',${port}),3);print('TCP-HOST ${ip}')" 2>/dev/null || echo "NO-HOST ${ip}"`,
          ),
        ].join("\n"),
      );
      // A name resolves, if at all, to the containment's own stand-in range (198.18.0.0/15).
      const dns = /DNS (\S+)/.exec(r.stdout)?.[1];
      if (dns) {
        expect(dns).toMatch(/^198\.(?:18|19)\./);
      }
      // A connection to a stand-in reaches only the containment's own trap,
      // which records it; no request is let out (no destination exists).
      expect(r.events.some((e) => e.type === "egress-allowed")).toBe(false);
      expect(r.stdout).toContain("NOTCP");
      for (const ip of hostIps) {
        expect(r.stdout).toContain(`NO-HOST ${ip}`);
      }
      expect(got).toEqual([]);
    } finally {
      srv.close();
    }
  }, 60_000);

  it("writes outside the project, and to the person's home, do not happen", async () => {
    const bashrc = sha(path.join(home, ".bashrc"));
    const r = await run(
      [
        `echo x > ${outside}/planted && echo WROTE-OUTSIDE || echo NO-OUTSIDE`,
        `echo x >> ${home}/.bashrc && echo WROTE-HOME || echo NO-HOME`,
        `echo x >> $$HOME/.bashrc; echo HOME=$$HOME`,
        `ls ${home}/.ssh ${home}/.aws 2>/dev/null && echo SAW-CREDS || echo NO-CREDS`,
        `ls $$HOME/.ssh 2>/dev/null && echo SAW-SANDBOX-SSH || echo NO-SANDBOX-SSH`,
      ].join("\n"),
    );
    expect(exists(path.join(outside, "planted"))).toBe(false);
    expect(sha(path.join(home, ".bashrc"))).toBe(bashrc);
    expect(r.stdout).toContain("NO-CREDS");
    expect(r.stdout).toContain("NO-SANDBOX-SSH");
    expect(r.stdout).not.toContain(`HOME=${home}`);
  });

  it("nothing that runs later on the host can be planted: hooks, workflows, IDE and agent config, direnv, Python start-up files, manifests, git's files", async () => {
    const before = {
      hook: sha(path.join(proj, ".git", "hooks", "pre-commit")),
      config: sha(path.join(proj, ".git", "config")),
      head: sha(path.join(proj, ".git", "HEAD")),
      tasks: sha(path.join(proj, ".vscode", "tasks.json")),
      pkg: sha(path.join(proj, "package.json")),
      dep: sha(path.join(proj, "node_modules", "dep", "package.json")),
    };
    const targets = [
      ".git/hooks/pre-commit",
      ".git/hooks/post-checkout",
      ".git/config",
      ".git/info/attributes",
      ".git/modules/sub/hooks/post-checkout",
      ".git/refs/heads/evil",
      ".git/HEAD",
      ".github/workflows/x.yml",
      ".vscode/tasks.json",
      ".claude/settings.json",
      ".mcp.json",
      ".envrc",
      "sub/.envrc",
      "sitecustomize.py",
      ".venv/lib/python3.12/site-packages/evil.pth",
      ".venv/lib/python3.12/site-packages/sitecustomize.py",
      "lib/site-packages/x.pth",
      "package.json",
      "node_modules/dep/package.json",
      "node_modules/.npmrc",
      ".npmrc",
      ".pre-commit-config.yaml",
      ".cargo/config.toml",
    ];
    const r = await run(
      targets
        .map(
          (t) =>
            `mkdir -p ${path.posix.dirname(t)} 2>/dev/null; (echo planted >> ${t}) 2>/dev/null && echo "PLANTED ${t}" || echo "REFUSED ${t}"`,
        )
        .join("\n"),
    );
    // The control: an ordinary project file is written (the refusals are the guard's, not a broken run).
    const control = await run(
      `mkdir -p src && (echo ok >> src/normal.txt) && echo "PLANTED src/normal.txt"`,
    );
    expect(control.stdout).toContain("PLANTED src/normal.txt");
    expect(fs.readFileSync(path.join(proj, "src", "normal.txt"), "utf8")).toContain("ok");
    for (const t of targets) {
      expect(r.stdout, t).toContain(`REFUSED ${t}`);
      expect(r.stdout, t).not.toContain(`PLANTED ${t}`);
    }
    expect(sha(path.join(proj, ".git", "hooks", "pre-commit"))).toBe(before.hook);
    expect(sha(path.join(proj, ".git", "config"))).toBe(before.config);
    expect(sha(path.join(proj, ".git", "HEAD"))).toBe(before.head);
    expect(sha(path.join(proj, ".vscode", "tasks.json"))).toBe(before.tasks);
    expect(sha(path.join(proj, "package.json"))).toBe(before.pkg);
    expect(sha(path.join(proj, "node_modules", "dep", "package.json"))).toBe(before.dep);
    for (const t of [
      ".git/hooks/post-checkout",
      ".git/refs/heads/evil",
      ".github/workflows/x.yml",
      ".envrc",
      "sitecustomize.py",
      ".venv/lib/python3.12/site-packages/evil.pth",
      "lib/site-packages/x.pth",
      ".mcp.json",
    ]) {
      expect(exists(path.join(proj, t)), t).toBe(false);
    }
  });

  it("links do not lead around the guard: a symbolic or hard link to a protected or outside path writes nothing", async () => {
    const hook = sha(path.join(proj, ".git", "hooks", "pre-commit"));
    const r = await run(
      [
        `ln -sfn .git/hooks hk && (echo x > hk/pre-push) 2>/dev/null && echo VIA-SYMLINK || echo NO-SYMLINK`,
        `ln -sfn ${outside} out && (echo x > out/f) 2>/dev/null && echo VIA-OUT || echo NO-OUT`,
        `ln .git/hooks/pre-commit hl 2>/dev/null && echo HARDLINKED || echo NO-HARDLINK`,
        `(echo x >> hl) 2>/dev/null && echo WROTE-HL || echo NO-WRITE-HL`,
        `mv .git/hooks gone 2>/dev/null && echo MOVED || echo NO-MOVE`,
      ].join("\n"),
    );
    expect(r.stdout).toContain("NO-SYMLINK");
    expect(r.stdout).toContain("NO-OUT");
    expect(r.stdout).toContain("NO-MOVE");
    expect(exists(path.join(proj, ".git", "hooks", "pre-push"))).toBe(false);
    expect(exists(path.join(outside, "f"))).toBe(false);
    expect(sha(path.join(proj, ".git", "hooks", "pre-commit"))).toBe(hook);
  });

  it("the project's secret files read as empty; /proc/self/mem and ptrace are refused", async () => {
    const r = await run(
      [
        `echo "ENV[$$(cat .env)]"`,
        `python3 -c "open('/proc/self/mem','r+b');print('MEM-OPEN')" 2>/dev/null || echo NO-MEM`,
        `python3 -c "import ctypes,os;l=ctypes.CDLL(None,use_errno=True);print('PTRACE', l.ptrace(16, os.getppid(), 0, 0), ctypes.get_errno())"`,
        `python3 -c "import ctypes;l=ctypes.CDLL(None,use_errno=True);print('VMREAD', l.syscall(310, 1, 0, 1, 0, 1, 0), ctypes.get_errno())"`,
        `(echo x > /proc/sys/kernel/core_pattern) 2>/dev/null && echo PROC-WRITE || echo NO-PROC-WRITE`,
      ].join("\n"),
    );
    expect(r.stdout).toContain("ENV[]");
    expect(r.stdout).not.toContain("sk-live");
    expect(r.stdout).toContain("NO-MEM");
    // ptrace(PTRACE_ATTACH) and process_vm_readv: -1 with EPERM (1).
    expect(r.stdout).toMatch(/PTRACE -1 1\b/);
    expect(r.stdout).toMatch(/VMREAD -1 1\b/);
    expect(r.stdout).toContain("NO-PROC-WRITE");
    expect(fs.readFileSync(path.join(proj, ".env"), "utf8")).toContain("sk-live");
  });

  it("no process outlives the run: background, setsid and nohup children are killed when it ends", async () => {
    const marks = ["late-bg", "late-setsid", "late-nohup"].map((m) => path.join(proj, m));
    const r = await run(
      [
        `(sleep 3; touch late-bg) &`,
        `setsid sh -c 'sleep 3; touch late-setsid' </dev/null >/dev/null 2>&1 &`,
        `nohup sh -c 'sleep 3; touch late-nohup' </dev/null >/dev/null 2>&1 &`,
        `sleep 1; touch early`,
        `echo LAUNCHED`,
      ].join("\n"),
    );
    expect(r.stdout).toContain("LAUNCHED");
    expect(exists(path.join(proj, "early"))).toBe(true);
    await new Promise((res) => setTimeout(res, 5000));
    for (const m of marks) {
      expect(exists(m), m).toBe(false);
    }
    // And no process of the run is left on the host.
    const ps = spawnSync("ps", ["-eo", "args"], { encoding: "utf8" }).stdout;
    expect(ps).not.toMatch(/touch late-(?:setsid|nohup)/);
  }, 30_000);
});

describe.skipIf(!live || !haveCmake)(
  "contained build: the owner's prompt, decided and run end to end",
  () => {
    it("configures with no person; the CMakeLists' planted hook, manifest rewrite and secret read fail inside", async () => {
      const { DecisionEngine } = await import("../adapter/engine.js");
      const { scriptContainer } = await import("../adapter/contained-launch.js");
      const { nodeFsProbe } = await import("../adapter/fs-probe.js");
      const { NO_SHELL_DEFINITIONS } = await import("../adapter/shell-definitions.js");
      const { HistoryStore } = await import("../history-store.js");
      const { createPolicy } = await import("../policy.js");
      const { LEVEL, makeLabel } = await import("../classification.js");
      const root = tempTree("contain-build-e2e");
      const home = fakeHome(root);
      const proj = path.join(root, "proj");
      fs.mkdirSync(proj);
      fs.writeFileSync(
        path.join(proj, "CMakeLists.txt"),
        'cmake_minimum_required(VERSION 3.10)\nproject(openmc C)\noption(OPENMC_BUILD_TESTS "t" OFF)\nadd_executable(h h.c)\n' +
          'execute_process(COMMAND sh -c "echo pwned >> .git/hooks/pre-commit; echo x > package.json; cat .env" WORKING_DIRECTORY ${CMAKE_SOURCE_DIR} OUTPUT_VARIABLE O ERROR_VARIABLE E)\n' +
          'message(STATUS "ATTACK-OUT[${O}]")\n',
      );
      fs.writeFileSync(path.join(proj, "h.c"), "int main(void){return 0;}\n");
      fs.writeFileSync(path.join(proj, ".gitignore"), "build*/\n");
      fs.writeFileSync(path.join(proj, "package.json"), "{}\n");
      gitInit(proj);
      fs.writeFileSync(
        path.join(proj, ".env"),
        "TOKEN=sk-ant-api03-SECRETSECRETSECRETSECRETSECRET\n",
      );
      const policy = createPolicy({
        enforceAllowlists: false,
        maxOutputClearance: makeLabel({ level: LEVEL.UNCLASSIFIED }),
        defaultDataLabel: makeLabel({ level: LEVEL.UNCLASSIFIED }),
      });
      // The project policy declares a host for scripts: a build never gets it.
      const sc = scriptContainer({
        stateDir: path.join(root, "state"),
        destinations: [{ host: "example.com", port: 443, mode: "inspect" }],
      });
      const text =
        'grep -n "^build\\|^/build" .gitignore | head -3; cmake -S . -B build-cpu -DCMAKE_BUILD_TYPE=RelWithDebInfo -DOPENMC_BUILD_TESTS=ON 2>&1 | tail -25';
      try {
        const d = await new DecisionEngine({
          host: "test-host",
          shellDefinitions: NO_SHELL_DEFINITIONS,
          policy,
          projectDir: proj,
          home,
          hardware: () => ({ allowed: true }),
          history: {
            store: new HistoryStore({ dir: path.join(root, "hist"), limits: policy.history }),
          },
          fs: nodeFsProbe(),
          containScripts: sc.contain,
        }).preAction({
          type: "pre-action",
          actor: { sessionId: "s", subagentId: null },
          callId: "c1",
          tool: "Bash",
          policyIds: ["bash", "exec"],
          kind: "shell",
          params: { command: text },
          cwd: proj,
          command: { text, dialect: "posix" },
          approvalRoute: "no-person",
          hostMode: "bypassPermissions",
        });
        expect(d.outcome, d.reason).toBe("allow");
        expect(d.codes).toContain("contained-build");
        expect(d.rewrite?.command).toBeTruthy();
        const r = spawnSync("sh", ["-c", d.rewrite?.command ?? "false"], {
          cwd: proj,
          encoding: "utf8",
          timeout: 120_000,
        });
        expect(r.status, r.stderr).toBe(0);
        expect(r.stdout).toContain("Build files have been written to");
        expect(r.stdout).toContain("ATTACK-OUT[]");
        expect(r.stdout).not.toContain("SECRETSECRET");
        expect(exists(path.join(proj, "build-cpu", "CMakeCache.txt"))).toBe(true);
        expect(exists(path.join(proj, ".git", "hooks", "pre-commit"))).toBe(false);
        expect(fs.readFileSync(path.join(proj, "package.json"), "utf8")).toBe("{}\n");
      } finally {
        await sc.close();
        fs.rmSync(root, { recursive: true, force: true });
      }
    }, 180_000);
  },
);

describe.skipIf(!live)("contained build: GPU only with the project's grant", () => {
  const gpuHost = hostGpu().devices.length > 0;
  const haveNvcc = fs.existsSync("/usr/local/cuda/bin/nvcc");
  let root: string;
  let home: string;
  let proj: string;
  beforeAll(() => {
    root = tempTree("contain-build-gpu");
    home = fakeHome(root);
    proj = path.join(root, "proj");
    fs.mkdirSync(proj);
  });
  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });
  const plan = (gpu: boolean | undefined) =>
    planContainment(
      projectScriptDeclaration({
        label: "b",
        projectDir: proj,
        command: "sh",
        args: ["-c", "true"],
        build: { masks: [], ...(gpu === undefined ? {} : { gpu }) },
      }),
      planContext(home),
    );
  const devices = (p: ReturnType<typeof plan>) =>
    p.ok ? p.plan.ops.filter((o) => o.op === "device").map((o) => o.path) : null;

  it("no grant: no GPU device in the view; with it, exactly the host's GPU devices", () => {
    const base = ["/dev/full", "/dev/null", "/dev/random", "/dev/urandom", "/dev/zero"];
    expect(devices(plan(undefined))?.toSorted()).toEqual(base);
    expect(devices(plan(false))?.toSorted()).toEqual(base);
    expect(devices(plan(true))?.toSorted()).toEqual([...base, ...hostGpu().devices].toSorted());
    // On a host with a GPU, a build without the grant names the grant when it fails.
    const off = plan(false);
    expect(off.ok && off.plan.failureNotice !== null).toBe(gpuHost);
  });

  it("a GPU device or driver directory outside the fixed list, or GPU without a build, is refused", () => {
    const decl = projectScriptDeclaration({
      label: "b",
      projectDir: proj,
      command: "sh",
      args: ["-c", "true"],
      build: { masks: [] },
    });
    for (const gpu of [
      { devices: ["/dev/sda"], dirs: [] },
      { devices: ["/dev/dri/card0"], dirs: [] },
      { devices: [], dirs: ["/home"] },
    ]) {
      const p = planContainment({ ...decl, build: { masks: [], gpu } }, planContext(home));
      expect(p.ok, JSON.stringify(gpu)).toBe(false);
    }
  });

  it.skipIf(!gpuHost || !haveNvcc)(
    "live: a CUDA program runs with the grant and finds no GPU without it",
    async () => {
      fs.writeFileSync(
        path.join(proj, "k.cu"),
        '#include <cstdio>\n__global__ void k(){}\nint main(){k<<<1,1>>>();cudaError_t e=cudaDeviceSynchronize();printf("cuda: %s\\n", cudaGetErrorString(e));return e==cudaSuccess?0:1;}\n',
      );
      const go = (gpu: boolean) =>
        runContainedScript(
          {
            label: "cuda",
            projectDir: proj,
            command: "sh",
            args: ["-c", "nvcc -o k k.cu && ./k"],
            build: { masks: [], gpu, noGpuNotice: "no GPU: ask for the project's GPU grant" },
          },
          planContext(home),
          { stateDir: path.join(root, "state") },
        );
      const on = await go(true);
      expect(on.stdout, on.stderr).toContain("cuda: no error");
      expect(on.code).toBe(0);
      const off = await go(false);
      expect(off.stdout).not.toContain("cuda: no error");
      expect(off.code).not.toBe(0);
      expect(off.stderr).toContain("no GPU: ask for the project's GPU grant");
    },
    300_000,
  );

  it("a build names its own threads; no other procfs write is made for it", async () => {
    fs.writeFileSync(
      path.join(proj, "t.py"),
      [
        "import os, threading",
        "def own(p):",
        "    try:",
        "        open(p, 'w').write('x'); return 'ok'",
        "    except OSError as e:",
        "        return 'refused'",
        "tid = threading.get_native_id()",
        "print('SELF', own('/proc/self/comm'))",
        "print('TASK', own('/proc/self/task/%d/comm' % tid))",
        "print('THREAD', own('/proc/thread-self/comm'))",
        "print('PID1', own('/proc/1/comm'))",
        "print('MEM', own('/proc/self/mem'))",
        "print('OOM', own('/proc/self/oom_score_adj'))",
        "print('ATTR', own('/proc/self/attr/current'))",
        "print('SYS', own('/proc/sys/kernel/hostname'))",
      ].join("\n"),
    );
    const r = await runContainedScript(
      {
        label: "comm",
        projectDir: proj,
        command: "sh",
        args: ["-c", "python3 t.py"],
        programs: ["python3"],
        build: { masks: [] },
      },
      planContext(home),
      { stateDir: path.join(root, "state") },
    );
    for (const ok of ["SELF ok", "TASK ok", "THREAD ok"]) {
      expect(r.stdout, r.stderr).toContain(ok);
    }
    for (const no of ["PID1", "MEM", "OOM", "ATTR", "SYS"]) {
      expect(r.stdout).toContain(`${no} refused`);
    }
  });
});
