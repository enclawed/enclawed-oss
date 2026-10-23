import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SwarmLedger } from "./chain.js";
import { runCoordinator, type CoordinatorHandle } from "./daemon.js";
import { SwarmHub } from "./net.js";
import { softwareSigner } from "./signer.js";
import {
  bridgeModel,
  controlPathSnippet,
  ensureMaster,
  remoteSwarmOutput,
  shq,
  sshDialers,
} from "./ssh.js";
import { coordinators, makeGenesis } from "./swarm-test-utils.js";
import type { Genesis } from "./types.js";

// A stand-in for the ssh client: it parses ssh's options the way ssh does,
// records them, and runs the remote command here. Everything after it (the
// relay, the coordinators, the chain follower) is the real code.
const FAKE_SSH = `#!/bin/sh
log="$FAKE_SSH_LOG"
echo "$*" >> "$log"
while [ $# -gt 0 ]; do
  case "$1" in
    -O) [ "$2" = check ] && { [ -n "$FAKE_NO_MASTER" ] && exit 255; exit 0; }; shift 2 ;;
    -G) [ -n "$FAKE_CONTROLPATH" ] && echo "controlpath $FAKE_CONTROLPATH"; exit 0 ;;
    -M|-N|-f|-a|-x|-t|-T) shift ;;
    -o|-J|-i|-l|-S|-F|-E) shift 2 ;;
    *) break ;;
  esac
done
host="$1"; shift
[ $# -eq 0 ] && exit 0
exec sh -c "$*"
`;

const admin = softwareSigner("admin-0");
const repo = path.resolve(__dirname, "../../..");
const remoteSwarm = [
  process.execPath,
  "--import",
  path.join(repo, "node_modules/tsx/dist/esm/index.mjs"),
  path.join(repo, "src/enclawed/swarm/cli.ts"),
];
let dir = "";
let genesis: Genesis;
let coords: CoordinatorHandle[] = [];
let sshBin = "";
let model: net.Server;

beforeAll(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "swarm-ssh-"));
  sshBin = path.join(dir, "ssh");
  writeFileSync(sshBin, FAKE_SSH);
  chmodSync(sshBin, 0o755);
  process.env.FAKE_SSH_LOG = path.join(dir, "ssh.log");
  const pair = coordinators(2);
  genesis = makeGenesis({ coordinators: pair, admins: [admin], leaseMs: 6000, heartbeatMs: 1000 });
  const fast = { proposeMs: 300, prevoteMs: 200, precommitMs: 200, blockIntervalMs: 200 };
  const a = await runCoordinator({
    genesis,
    signer: pair[0],
    dataDir: path.join(dir, "c0"),
    listen: { host: "127.0.0.1", port: 0 },
    peers: [],
    timeouts: fast,
  });
  const b = await runCoordinator({
    genesis,
    signer: pair[1],
    dataDir: path.join(dir, "c1"),
    listen: { host: "127.0.0.1", port: 0 },
    peers: [{ host: "127.0.0.1", port: a.hub.address!.port }],
    timeouts: fast,
  });
  coords = [a, b];
  // The swarm directory as it would sit on the login node.
  writeFileSync(path.join(dir, "genesis.json"), JSON.stringify(genesis));
  writeFileSync(
    path.join(dir, "coordinators.txt"),
    coords.map((c) => `127.0.0.1:${c.hub.address!.port}`).join(",") + "\n",
  );
  // A stand-in model server inside the cluster: it echoes.
  model = net.createServer((s) => s.pipe(s));
  await new Promise<void>((r) => model.listen(0, "127.0.0.1", () => r()));
  const mp = (model.address() as net.AddressInfo).port;
  writeFileSync(path.join(dir, "model.txt"), `127.0.0.1:${mp}\n`);
}, 30_000);

afterAll(async () => {
  for (const c of coords) {
    await c.stop();
  }
  model.close();
  rmSync(dir, { recursive: true, force: true });
});

const target = () => ({ host: "me@login1.lab.gov", sshBin, remoteSwarm, remoteDir: dir });

describe("swarm over SSH only", () => {
  it("quotes the remote command for the remote shell", () => {
    expect(shq("plain/path-1.2")).toBe("plain/path-1.2");
    expect(shq("it's here")).toBe(`'it'\\''s here'`);
  });

  it("opens no forwarding and pins host keys on every session", async () => {
    await ensureMaster(target());
    expect(JSON.parse(await remoteSwarmOutput(target(), ["genesis", "--dir", dir]))).toEqual(
      genesis,
    );
    const log = readFileSync(process.env.FAKE_SSH_LOG!, "utf8");
    const session = log.split("\n").find((l) => l.includes(" genesis "))!;
    expect(session).toMatch(/StrictHostKeyChecking=yes/);
    expect(session).toMatch(/ClearAllForwardings=yes/);
    expect(session).toMatch(/BatchMode=yes/);
    expect(session).toMatch(/ -a /);
    expect(session).toMatch(/ -x /);
    expect(log).not.toMatch(/ -[LRDW] /);
  }, 30_000);

  it("relays only to a coordinator or the model the swarm directory lists", () => {
    const r = spawnSync(
      remoteSwarm[0],
      [...remoteSwarm.slice(1), "relay", "--dir", dir, "--index", "7"],
      {
        input: "",
        encoding: "utf8",
      },
    );
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/no coordinator 7/);
  }, 30_000);

  it("follows the chain through SSH sessions and nothing else", async () => {
    const { ledger } = SwarmLedger.restore(genesis);
    const hub = new SwarmHub({
      id: "laptop",
      role: "monitor",
      dialers: sshDialers(target(), 2),
      ledger,
      onCommit: (cb) => {
        const r = ledger.commit(cb);
        if (!r.ok && r.code === "gap") {
          hub.requestSync(ledger.height + 1);
        }
      },
    });
    await hub.start();
    for (let i = 0; i < 100 && ledger.height < 5; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(ledger.height).toBeGreaterThanOrEqual(5);
    const h = ledger.height;
    expect(ledger.block(h)?.hash).toBe(coords[0].ledger.block(h)?.hash);
    await hub.close();
  }, 30_000);

  it("bridges a model server inside the cluster to the laptop's loopback", async () => {
    const server = await bridgeModel(target(), { host: "127.0.0.1", port: 0 });
    const port = (server.address() as net.AddressInfo).port;
    const reply = await new Promise<string>((resolve, reject) => {
      const s = net.connect(port, "127.0.0.1", () => s.write("ping\n"));
      s.setEncoding("utf8");
      s.on("data", (d: string) => {
        s.destroy();
        resolve(d);
      });
      s.on("error", reject);
    });
    expect(reply).toBe("ping\n");
    server.close();
  }, 30_000);
});

describe("logging in to the login node", () => {
  const lastMasterLine = () =>
    readFileSync(process.env.FAKE_SSH_LOG!, "utf8")
      .trim()
      .split("\n")
      .toReversed()
      .find((l) => l.startsWith("-M "))!;

  it("gets a Kerberos ticket first when there is none, then logs in with it", async () => {
    const klist = path.join(dir, "klist");
    const kinit = path.join(dir, "kinit");
    const kinitLog = path.join(dir, "kinit.log");
    writeFileSync(klist, "#!/bin/sh\nexit 1\n");
    writeFileSync(kinit, `#!/bin/sh\necho "$*" >> ${kinitLog}\n`);
    chmodSync(klist, 0o755);
    chmodSync(kinit, 0o755);
    process.env.FAKE_NO_MASTER = "1";
    try {
      await ensureMaster({
        ...target(),
        host: "me@krb1.lab.gov",
        kerberos: { principal: "me@LAB.GOV" },
        klistBin: klist,
        kinitBin: kinit,
      });
    } finally {
      delete process.env.FAKE_NO_MASTER;
    }
    expect(readFileSync(kinitLog, "utf8").trim()).toBe("me@LAB.GOV");
    const master = lastMasterLine();
    expect(master).toMatch(/GSSAPIAuthentication=yes/);
    // The ticket is forwarded only when the site asks for it.
    expect(master).not.toMatch(/GSSAPIDelegateCredentials/);
  }, 30_000);

  it("skips kinit with a valid ticket, and forwards it only when configured", async () => {
    const klist = path.join(dir, "klist-ok");
    const kinit = path.join(dir, "kinit-never");
    writeFileSync(klist, "#!/bin/sh\nexit 0\n");
    writeFileSync(kinit, "#!/bin/sh\necho called >&2; exit 9\n");
    chmodSync(klist, 0o755);
    chmodSync(kinit, 0o755);
    process.env.FAKE_NO_MASTER = "1";
    try {
      await ensureMaster({
        ...target(),
        host: "me@krb2.lab.gov",
        kerberos: { forwardTicket: true },
        klistBin: klist,
        kinitBin: kinit,
      });
    } finally {
      delete process.env.FAKE_NO_MASTER;
    }
    expect(lastMasterLine()).toMatch(/GSSAPIDelegateCredentials=yes/);
  }, 30_000);

  it("listens where the operator's ssh config says, so their own ssh shares the session", async () => {
    process.env.FAKE_CONTROLPATH = "/home/me/.ssh/cm-%C";
    try {
      const cp = await ensureMaster({ ...target(), host: "me@cfg.lab.gov" });
      expect(cp).toEqual({ path: "/home/me/.ssh/cm-%C", fromUserConfig: true });
    } finally {
      delete process.env.FAKE_CONTROLPATH;
    }
    const none = await ensureMaster({ ...target(), host: "me@nocfg.lab.gov" });
    expect(none.fromUserConfig).toBe(false);
    expect(controlPathSnippet({ ...target(), host: "me@nocfg.lab.gov" })).toMatch(
      /^Host nocfg\.lab\.gov\n {4}ControlPath .*cm-%C/,
    );
  }, 30_000);
});
