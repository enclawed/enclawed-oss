import { describe, expect, it } from "vitest";
import { checkHpcCommand, NodeHourLedger } from "./gate.js";
import { parseHpcPolicy, type HpcPolicy } from "./policy.js";
import { parseCommandLine } from "./shell-words.js";
import { fluxMinutes, pbsMinutes, slurmMinutes } from "./time.js";

const APP = "/opt/myapp/bin/mpi-myapp";

function policy(over: Record<string, unknown> = {}): HpcPolicy {
  return parseHpcPolicy({
    enforce: true,
    executables: [APP, "/work/inputs/", "python3", "module:mypkg.drive"],
    maxRanks: 64,
    maxNodes: 4,
    maxWalltimeMinutes: 120,
    partitions: ["pdebug", "pbatch"],
    accounts: ["sci"],
    nodeHourBudget: 10,
    ...over,
  })!;
}

function check(
  command: string,
  opts: {
    files?: Record<string, string>;
    env?: NodeJS.ProcessEnv;
    policy?: HpcPolicy;
    ledger?: NodeHourLedger;
  } = {},
) {
  const p = opts.policy ?? policy();
  return checkHpcCommand(
    command,
    p,
    {
      cwd: "/work",
      env: opts.env ?? {},
      readFile: (abs) => opts.files?.[abs] ?? null,
    },
    opts.ledger ?? new NodeHourLedger(p.nodeHourBudget),
  );
}

describe("walltime formats", () => {
  it("parses Slurm, Moab/PBS and Flux durations into minutes", () => {
    expect(slurmMinutes("30")).toBe(30);
    expect(slurmMinutes("1:30:00")).toBe(90);
    expect(slurmMinutes("2-00")).toBe(2880);
    expect(slurmMinutes("1-02:30")).toBe(1440 + 150);
    expect(slurmMinutes("UNLIMITED")).toBe(Number.POSITIVE_INFINITY);
    expect(slurmMinutes("1h")).toBeNull();
    expect(pbsMinutes("01:00:00")).toBe(60);
    expect(pbsMinutes("1:00:00:00")).toBe(1440);
    expect(fluxMinutes("45")).toBe(45);
    expect(fluxMinutes("2h")).toBe(120);
    expect(fluxMinutes("90s")).toBe(1.5);
  });
});

describe("shell words", () => {
  it("splits operators and keeps quoted text whole", () => {
    const r = parseCommandLine(`cd /work && srun -n 4 "${APP}" -in 'run in' | tee log; echo done`);
    expect(r.ok && r.commands.map((c) => c.words.map((w) => w.text))).toEqual([
      ["cd", "/work"],
      ["srun", "-n", "4", APP, "-in", "run in"],
      ["tee", "log"],
      ["echo", "done"],
    ]);
  });

  it("marks expansions and keeps redirections out of argv", () => {
    const r = parseCommandLine("srun -n $N ./a 2>&1 > out.log");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.commands).toHaveLength(1);
      expect(r.commands[0].words.map((w) => [w.text, w.dynamic])).toEqual([
        ["srun", false],
        ["-n", false],
        ["$N", true],
        ["./a", false],
      ]);
    }
  });
});

describe("hpc gate: allowed launches", () => {
  it("allows an in-policy Slurm job and charges node-hours", () => {
    const ledger = new NodeHourLedger(10);
    const d = check(`srun -N 2 -n 64 -t 60 -p pdebug -A sci ${APP} -in run.in`, { ledger });
    expect(d.reasons).toEqual([]);
    expect(d.allowed).toBe(true);
    expect(d.nodeHours).toBe(2);
    expect(ledger.used).toBe(2);
    expect(d.launches[0]).toMatchObject({ scheduler: "slurm", verb: "srun", ranks: 64, nodes: 2 });
  });

  it("does not charge an srun step inside an existing allocation", () => {
    const d = check(`srun -n 32 ${APP} -in run.in`, { env: { SLURM_JOB_ID: "123" } });
    expect(d.allowed).toBe(true);
    expect(d.nodeHours).toBe(0);
  });

  it("parses MPICH's -disable-auto-cleanup as a flag, not as the program", () => {
    const d = check(`mpiexec -disable-auto-cleanup -n 16 ${APP} -in run.in`);
    expect(d.reasons).toEqual([]);
    expect(d.launches[0]).toMatchObject({ scheduler: "mpi", ranks: 16 });
  });

  it("allows mpirun of an allowlisted binary, MPMD included", () => {
    const d = check(`mpirun -np 16 ${APP} -in run.in : -n 8 python3 /work/inputs/analyze.py`);
    expect(d.allowed).toBe(true);
    expect(d.launches[0]).toMatchObject({ scheduler: "mpi", ranks: 24 });
  });

  it("reads #SBATCH directives and checks the script body", () => {
    const files = {
      "/work/inputs/job.sh": `#!/bin/bash\n#SBATCH -N 1\n#SBATCH -t 30\n#SBATCH -p pbatch\n#SBATCH -A sci\nsrun -n 36 ${APP} -in run.in\n`,
    };
    const d = check("sbatch inputs/job.sh", { files });
    expect(d.reasons).toEqual([]);
    expect(d.nodeHours).toBe(0.5);
    expect(d.launches.map((l) => l.verb)).toEqual(["sbatch", "srun"]);
    expect(d.launches[0].scriptSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("parses Moab resource lists and #MSUB directives", () => {
    const files = {
      "/work/inputs/m.sh": `#MSUB -A sci\n#MSUB -q pbatch\nmpirun -np 64 ${APP} -in run.in\n`,
    };
    const d = check("msub -l nodes=2:ppn=32,walltime=00:30:00 inputs/m.sh", { files });
    expect(d.reasons).toEqual([]);
    expect(d.launches[0]).toMatchObject({
      scheduler: "moab",
      nodes: 2,
      ranks: 64,
      walltimeMinutes: 30,
    });
    expect(d.nodeHours).toBe(1);
  });

  it("handles flux run, flux batch with #FLUX: directives, and FSD time limits", () => {
    expect(check(`flux run -N 1 -n 32 -t 30m -q pdebug -B sci ${APP} -in run.in`).allowed).toBe(
      true,
    );
    const files = {
      "/work/inputs/f.sh": `#!/bin/sh\n# flux: -N 2\n# flux: -t 1h\n# flux: -q pbatch\n# flux: --bank=sci\nflux run -n 64 ${APP} -in run.in\n`,
    };
    const d = check("flux batch inputs/f.sh", { files });
    expect(d.reasons).toEqual([]);
    expect(d.nodeHours).toBe(2);
  });

  it("allows python -m with an allowlisted module", () => {
    expect(check("srun -N 1 -t 10 -p pdebug -A sci python3 -m mypkg.drive").allowed).toBe(true);
  });

  it("leaves commands that never touch a scheduler alone", () => {
    const d = check("ls -la /work && grep -r srunning notes.txt");
    expect(d).toMatchObject({ allowed: true, touchedHpc: false });
  });

  it("allows read-only scheduler queries", () => {
    expect(check("squeue -u me; sinfo; flux jobs -a; showq").allowed).toBe(true);
  });
});

describe("hpc gate: refusals", () => {
  const denied = (cmd: string, match: RegExp, opts?: Parameters<typeof check>[1]) => {
    const d = check(cmd, opts);
    expect(d.allowed).toBe(false);
    expect(d.reasons.join("\n")).toMatch(match);
    return d;
  };

  it("refuses programs off the allowlist, including through an interpreter", () => {
    denied("srun -N 1 -t 10 -p pdebug -A sci /tmp/miner", /program "\/tmp\/miner" is not on/);
    denied("mpirun -n 4 python3 /tmp/evil.py", /program "\/tmp\/evil.py"/);
    denied("mpirun -n 4 python3 -c 'import os'", /inline code/);
    denied(`mpirun -n 4 ${APP}x -in run.in`, /not on enclawed.hpc.executables/);
    // A prefix entry does not allow a sibling directory with the same prefix.
    denied("mpirun -n 4 /work/inputs-evil/run", /not on/);
    denied("mpirun -n 4 /work/inputs/../../tmp/x", /not on/);
  });

  it("enforces rank, node, walltime, partition and account limits", () => {
    denied(`mpirun -n 65 ${APP}`, /65 ranks exceeds maxRanks 64/);
    denied(`srun -N 5 -t 10 -p pdebug -A sci ${APP}`, /5 nodes exceeds maxNodes 4/);
    denied(`srun -N 1 -t 3:00:00 -p pdebug -A sci ${APP}`, /walltime 180 min exceeds 120/);
    denied(`srun -N 1 -t UNLIMITED -p pdebug -A sci ${APP}`, /exceeds 120/);
    denied(`srun -N 1 -p pdebug -A sci ${APP}`, /set a time limit/);
    denied(`srun -N 1 -t 10 -p pbig -A sci ${APP}`, /partition "pbig" is not allowed/);
    denied(`srun -N 1 -t 10 -p pdebug ${APP}`, /name an account/);
    denied(`srun -N 1-8 -t 10 -p pdebug -A sci ${APP}`, /8 nodes exceeds/);
  });

  it("spends the node-hour budget and then refuses", () => {
    const ledger = new NodeHourLedger(10);
    const job = `srun -N 4 -t 60 -p pbatch -A sci ${APP}`;
    expect(check(job, { ledger }).allowed).toBe(true);
    expect(check(job, { ledger }).allowed).toBe(true);
    const d = check(job, { ledger });
    expect(d.allowed).toBe(false);
    expect(d.reasons.join()).toMatch(/needs 4.00 node-hours; 2.00 left of 10/);
    expect(ledger.used).toBe(8);
  });

  it("charges every job in a line, not just the first", () => {
    const job = `sbatch -N 4 -t 60 -p pbatch -A sci --wrap "srun ${APP}"`;
    denied(`${job}; ${job}; ${job}`, /needs 12.00 node-hours/);
  });

  it("refuses schedulers the site did not enable", () => {
    denied("msub -l nodes=1,walltime=10:00 job.sh", /scheduler "moab" is not allowed/, {
      policy: policy({ schedulers: ["slurm"] }),
      files: { "/work/job.sh": "echo hi\n" },
    });
  });

  it("refuses job control when it is turned off", () => {
    denied("scancel 1234", /cancelling jobs is not allowed/, {
      policy: policy({ allowJobControl: false }),
    });
    denied("flux cancel f1234", /not allowed/, { policy: policy({ allowJobControl: false }) });
  });

  it("observe mode decides and reports but never blocks", () => {
    const d = check("mpirun -n 4 /tmp/miner", { policy: policy({ enforce: false }) });
    expect(d.allowed).toBe(true);
    expect(d.reasons.join()).toMatch(/not on/);
    expect(d.nodeHours).toBe(0);
  });
});

describe("hpc gate: red team", () => {
  const blocked = (cmd: string, opts?: Parameters<typeof check>[1]) => {
    const d = check(cmd, opts);
    expect(d.allowed, `${cmd} should be blocked`).toBe(false);
    return d;
  };

  it("sees launchers behind wrappers and absolute paths", () => {
    blocked("env FOO=1 nice -n 5 timeout 60 /usr/bin/srun -N 1 -t 10 -p pdebug -A sci /tmp/x");
    blocked("nohup stdbuf -oL mpirun -n 4 /tmp/x &");
    blocked("sudo -u other mpirun -n 4 /tmp/x");
    blocked("command exec mpiexec.hydra -n 2 /tmp/x");
  });

  it("refuses names and values it cannot see", () => {
    blocked("$LAUNCHER -n 4 /tmp/x");
    blocked("`echo srun` -n 4 /tmp/x");
    blocked(`mpirun -n $(nproc) ${APP}`);
    blocked("X=srun; $X -n 4 /tmp/x");
    blocked(`eval "srun -n 4 /tmp/x"`);
    blocked(`sh -c "$CMD"`);
    blocked(`env -S "srun -n 4 /tmp/x"`);
    blocked(`echo srun /tmp/x | xargs srun`);
    blocked("mpirun -n 4 /opt/myapp/bin/m*");
  });

  it("follows shells, sourced files and executable scripts", () => {
    blocked(`bash -c 'cd /work && mpirun -n 4 /tmp/x'`);
    blocked("sh -c \"sh -c 'srun -n 2 /tmp/x'\"");
    const files = {
      "/work/run.sh": "#!/bin/bash\nmpirun -n 4 /tmp/x\n",
      "/work/lib.sh": "srun -n 4 /tmp/x\n",
    };
    blocked("./run.sh", { files });
    blocked("bash run.sh", { files });
    blocked("source lib.sh", { files });
    blocked(". ./lib.sh", { files });
  });

  it("checks what a batch job will run, however it is submitted", () => {
    const files = {
      "/work/inputs/j.sh":
        "#SBATCH -N 1\n#SBATCH -t 10\n#SBATCH -p pdebug\n#SBATCH -A sci\nsrun /tmp/x\n",
    };
    blocked("sbatch inputs/j.sh", { files });
    blocked("sbatch < inputs/j.sh", { files });
    blocked(`sbatch -N 1 -t 10 -p pdebug -A sci --wrap "srun /tmp/x"`);
    blocked(`salloc -N 1 -t 10 -p pdebug -A sci mpirun -n 2 /tmp/x`);
    blocked(`sbatch -N 1 -t 10 -p pdebug -A sci <<EOF\nsrun /tmp/x\nEOF`);
    blocked("sbatch inputs/missing.sh", { files });
    blocked("flux bulksubmit -n1 {} ::: a b");
  });

  it("does not let directives in the script override command-line limits upward", () => {
    // Directives apply first; a larger -N on the command line still hits maxNodes.
    const files = {
      "/work/inputs/j.sh":
        "#SBATCH -N 1\n#SBATCH -t 10\n#SBATCH -p pdebug\n#SBATCH -A sci\nsrun /opt/myapp/bin/mpi-myapp\n",
    };
    blocked("sbatch -N 16 inputs/j.sh", { files });
  });

  it("counts Moab processors per node toward the rank cap", () => {
    const files = { "/work/inputs/m.sh": "#MSUB -A sci\n#MSUB -q pbatch\n" };
    blocked("msub -l nodes=2:ppn=36,walltime=00:10:00 inputs/m.sh", { files });
    blocked("msub -l nodes=1:ppn=8+3:ppn=36,walltime=00:10:00 inputs/m.sh", { files });
  });

  it("does not trust option spellings it does not know", () => {
    blocked(`srun --frobnicate 4 -N 1 -t 10 -p pdebug -A sci ${APP}`);
    blocked(`mpirun --frobnicate ${APP}`);
  });

  it("keeps launchers pinned to the site shims", () => {
    const shims = { policy: policy({ launcherPaths: ["/opt/enclawed/shims/mpiexec"] }) };
    expect(check(`/opt/enclawed/shims/mpiexec -n 4 ${APP}`, shims).allowed).toBe(true);
    expect(check(`mpiexec -n 4 ${APP}`, shims).allowed).toBe(true);
    blocked(`/usr/bin/mpiexec -n 4 ${APP}`, shims);
    blocked(`cd /tmp && ./mpiexec -n 4 ${APP}`, shims);
    blocked(`PATH=/tmp/fake:$PATH mpiexec -n 4 ${APP}`);
    blocked(`export PATH=/tmp/fake; mpiexec -n 4 ${APP}`);
    blocked(`env LD_PRELOAD=/tmp/hook.so mpiexec -n 4 ${APP}`);
    blocked(`alias mpiexec=/tmp/x; mpiexec -n 4 ${APP}`);
    const viaEnv = checkHpcCommand(
      `mpiexec -n 4 ${APP}`,
      policy(),
      { cwd: "/work", env: {}, callEnv: { PATH: "/tmp/fake" }, readFile: () => null },
      new NodeHourLedger(null),
    );
    expect(viaEnv.allowed).toBe(false);
  });

  it("refuses unterminated quoting that might hide a launch", () => {
    blocked(`srun -n 4 "${APP}`);
  });

  it("refuses deeply nested indirection", () => {
    let cmd = "srun /tmp/x";
    for (let i = 0; i < 6; i++) {
      cmd = `sh -c ${JSON.stringify(cmd)}`;
    }
    blocked(cmd);
  });
});

describe("hpc gate: clusters reached over ssh", () => {
  const remotePolicy = (over: Record<string, unknown> = {}) =>
    policy({
      executables: [APP, "/work/inputs/", "/p/stage/"],
      clusterHosts: ["login1.lab.gov", "bastion.lab.gov"],
      staging: { local: "/home/me/stage", remote: "/p/stage" },
      ...over,
    });
  const job = `#!/bin/bash\n#SBATCH -N 1\n#SBATCH -t 30\n#SBATCH -p pbatch\n#SBATCH -A sci\nsrun -n 36 ${APP} -in run.in\n`;
  const files = {
    "/home/me/stage/job.sh": job,
    "/home/me/stage/big.sh": job.replace("-N 1", "-N 64"),
  };
  const ok = (cmd: string, p = remotePolicy()) => {
    const d = check(cmd, { files, policy: p });
    expect(d.reasons, cmd).toEqual([]);
    expect(d.allowed).toBe(true);
    return d;
  };
  const refused = (cmd: string, p = remotePolicy()) => {
    const d = check(cmd, { files, policy: p });
    expect(d.allowed, `${cmd} should be refused`).toBe(false);
    return d.reasons.join("; ");
  };

  it("checks the remote launch, reading the batch script from its local staging copy", () => {
    const d = ok("ssh login1.lab.gov sbatch /p/stage/job.sh");
    expect(d.launches.map((l) => l.verb)).toEqual(["sbatch", "srun"]);
    ok("ssh -J bastion.lab.gov me@login1.lab.gov 'sbatch /p/stage/job.sh'");
    // ssh starts in the remote home directory: a relative path is not the staged file.
    expect(refused("ssh login1.lab.gov sbatch job.sh")).toMatch(/cannot read batch script/);
    expect(refused("ssh login1.lab.gov sbatch /p/stage/big.sh")).toMatch(/exceeds maxNodes/);
  });

  it("refuses a remote script the gate cannot read, or a cd that changes which file it is", () => {
    expect(refused("ssh login1.lab.gov sbatch /home/me/other.sh")).toMatch(
      /cannot read batch script/,
    );
    expect(refused("ssh login1.lab.gov 'cd /tmp && sbatch job.sh'")).toMatch(
      /cannot read batch script/,
    );
    // The same holds on the local side: inputs/job.sh is readable from /work,
    // but after the cd the scheduler would run /tmp/inputs/job.sh instead.
    const local = { "/work/inputs/job.sh": job };
    expect(check("sbatch inputs/job.sh", { files: local }).allowed).toBe(true);
    const moved = check("cd /tmp && sbatch inputs/job.sh", { files: local });
    expect(moved.allowed).toBe(false);
    expect(moved.reasons.join("; ")).toMatch(/cannot read batch script/);
    expect(check("cd /tmp && sbatch /work/inputs/job.sh", { files: local }).allowed).toBe(true);
  });

  it("allows only listed hosts, and no option that forwards, proxies or picks the port", () => {
    expect(refused("ssh evil.example.com sbatch /p/stage/job.sh")).toMatch(/clusterHosts/);
    expect(refused("ssh -J evil.example.com login1.lab.gov squeue")).toMatch(/clusterHosts/);
    for (const opt of [
      "-L 8080:node1:80",
      "-R 9000:localhost:22",
      "-D 1080",
      "-W node1:22",
      "-A",
      "-X",
      "-p 2222",
      "-p2222",
      "-F /tmp/ssh_config",
      "-o ProxyCommand=nc",
      "-o LocalCommand=id",
      "-o Port=2222",
      "-o StrictHostKeyChecking=no",
    ]) {
      expect(refused(`ssh ${opt} login1.lab.gov squeue`), opt).toMatch(/ssh -/);
    }
    ok("ssh -o BatchMode=yes -o ConnectTimeout=10 -t login1.lab.gov squeue");
    expect(refused("ssh login1.lab.gov")).toMatch(/interactive/);
  });

  it("copies only into the remote staging directory, and nothing off the cluster by default", () => {
    ok("scp /home/me/stage/job.sh login1.lab.gov:/p/stage/job.sh");
    ok("rsync -av /home/me/stage/ login1.lab.gov:/p/stage/");
    expect(refused("scp /etc/passwd login1.lab.gov:/p/stage/x")).toMatch(/local staging/);
    expect(refused("scp /home/me/stage/job.sh login1.lab.gov:/tmp/job.sh")).toMatch(
      /remote staging/,
    );
    expect(refused("scp /home/me/stage/job.sh login1.lab.gov:job.sh")).toMatch(/remote staging/);
    expect(refused("scp -P 2222 /home/me/stage/job.sh login1.lab.gov:/p/stage/")).toMatch(/scp -P/);
    expect(refused("rsync -e 'ssh -p 2222' /home/me/stage/ login1.lab.gov:/p/stage/")).toMatch(
      /remote shell/,
    );
    expect(refused("scp login1.lab.gov:/p/results/out.dat /home/me/stage/")).toMatch(
      /off the cluster/,
    );
    ok(
      "scp login1.lab.gov:/p/stage/run.log /home/me/stage/",
      remotePolicy({ allowDownload: true }),
    );
    expect(refused("sftp login1.lab.gov")).toMatch(/interactive/);
  });

  it("still sees a launch over ssh when no cluster hosts are configured", () => {
    expect(refused(`ssh somehost srun -n 4 ${APP}`, policy())).toMatch(/clusterHosts/);
    // An ssh that carries no launch is outside the gate's scope then.
    expect(check("ssh somehost uptime", { policy: policy() }).allowed).toBe(true);
  });
});

describe("hpc gate: compute nodes reached from the login node", () => {
  const p = () =>
    policy({
      clusterHosts: ["login1.lab.gov", "node*.lab.gov"],
      staging: { local: "/home/me/stage", remote: "/p/stage" },
    });

  it("lets a pattern name allocated compute nodes, and nothing that only looks like them", () => {
    expect(
      check("ssh login1.lab.gov 'ssh node0123.lab.gov hostname'", { policy: p() }).allowed,
    ).toBe(true);
    for (const host of [
      "node1.lab.gov.evil.com",
      "evilnode1.lab.gov",
      "node1.evil.lab.gov",
      "evil.com",
      "nodes",
    ]) {
      const d = check(`ssh login1.lab.gov 'ssh ${host} hostname'`, { policy: p() });
      expect(d.allowed, host).toBe(false);
      expect(d.reasons.join("; ")).toMatch(/clusterHosts/);
    }
  });

  it("refuses patterns that could mean any host", () => {
    for (const bad of ["*", "node*", "*.*", "login1;rm"]) {
      expect(() => policy({ clusterHosts: [bad] }), bad).toThrow(/clusterHosts/);
    }
  });
});
