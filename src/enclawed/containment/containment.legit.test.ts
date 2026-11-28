// Live false-positive tests: legitimate servers and scripts work normally,
// contained, on their declared roots and hosts. Real namespaces; local
// stand-ins only (no external host is contacted).

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { containmentSupport } from "./host.js";
import {
  FIXTURES,
  POSTMARK_BODY,
  fakeHome,
  planContext,
  refusals,
  runContainedScript,
  startContainedServer,
  startStandIns,
  tempTree,
} from "./test-helpers.js";

const live = containmentSupport().ok;

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

const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: "Contained",
  GIT_AUTHOR_EMAIL: "contained@example.test",
  GIT_COMMITTER_NAME: "Contained",
  GIT_COMMITTER_EMAIL: "contained@example.test",
};

describe.skipIf(!live)("containment: legitimate use works unchanged", () => {
  let root: string;
  let home: string;
  let stateDir: string;
  beforeAll(() => {
    root = tempTree("contain-legit");
    home = fakeHome(root);
    stateDir = path.join(root, "state");
  });
  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("filesystem server: reads, lists and writes on its declared root, new top-level files included", async () => {
    const data = path.join(root, "notes");
    fs.mkdirSync(path.join(data, "sub"), { recursive: true });
    fs.writeFileSync(path.join(data, "sub", "a.md"), "alpha\n");
    const srv = await startContainedServer(
      { name: "filesystem", command: "node", args: [path.join(FIXTURES, "fs-server.cjs"), data] },
      { roots: [{ path: data, access: "rw" }], packageRoot: FIXTURES },
      planContext(home),
      { stateDir },
    );
    try {
      expect(await srv.call("read_file", { path: path.join(data, "sub", "a.md") })).toEqual({
        isError: false,
        text: "alpha\n",
      });
      expect((await srv.call("list_directory", { path: data })).text.split("\n")).toContain("sub");
      expect(
        (await srv.call("write_file", { path: path.join(data, "plan.md"), content: "beta" }))
          .isError,
      ).toBe(false);
      expect(
        (
          await srv.call("write_file", {
            path: path.join(data, "deep", "x", "y.md"),
            content: "gamma",
          })
        ).isError,
      ).toBe(false);
      // A file the host creates while the server runs is visible at once.
      fs.writeFileSync(path.join(data, "later.md"), "from host");
      expect(await srv.call("read_file", { path: path.join(data, "later.md") })).toEqual({
        isError: false,
        text: "from host",
      });
    } finally {
      await srv.close();
    }
    expect(fs.readFileSync(path.join(data, "plan.md"), "utf8")).toBe("beta");
    expect(fs.readFileSync(path.join(data, "deep", "x", "y.md"), "utf8")).toBe("gamma");
    // Placeholders made for the run are gone again.
    expect(fs.existsSync(path.join(data, ".claude"))).toBe(false);
    expect(fs.existsSync(path.join(data, ".github"))).toBe(false);
    expect(refusals(srv.events)).toEqual([]);
  });

  it("git server: status, add, commit, branch, checkout, log and diff work on its repository", async () => {
    const repo = path.join(root, "repo");
    gitInit(repo);
    const srv = await startContainedServer(
      {
        name: "git",
        command: "node",
        args: [path.join(FIXTURES, "git-server.cjs")],
        env: GIT_IDENTITY,
      },
      {
        roots: [{ path: repo, access: "rw" }],
        packageRoot: FIXTURES,
        programs: ["git"],
        env: Object.keys(GIT_IDENTITY),
      },
      planContext(home),
      { stateDir },
    );
    try {
      fs.writeFileSync(path.join(repo, "feature.txt"), "one\n");
      expect((await srv.call("git_status", { repo_path: repo })).text).toContain("feature.txt");
      expect((await srv.call("git_add", { repo_path: repo, files: ["feature.txt"] })).isError).toBe(
        false,
      );
      const commit = await srv.call("git_commit", { repo_path: repo, message: "add feature" });
      expect(commit.isError, commit.text).toBe(false);
      expect(
        (await srv.call("git_create_branch", { repo_path: repo, branch_name: "topic" })).isError,
      ).toBe(false);
      expect(
        (await srv.call("git_checkout", { repo_path: repo, branch_name: "topic" })).isError,
      ).toBe(false);
      expect((await srv.call("git_log", { repo_path: repo, max_count: 5 })).text).toContain(
        "add feature",
      );
      fs.writeFileSync(path.join(repo, "feature.txt"), "two\n");
      expect((await srv.call("git_diff", { repo_path: repo, target: "main" })).text).toContain(
        "+two",
      );
    } finally {
      await srv.close();
    }
    const log = execFileSync("git", ["log", "--format=%an %s", "-n", "1", "topic"], {
      cwd: repo,
      encoding: "utf8",
    });
    expect(log.trim()).toBe("Contained add feature");
    expect(refusals(srv.events)).toEqual([]);
  });

  it("HTTP-calling servers reach their declared hosts; secrets travel only as handles until the relay", async () => {
    const stand = await startStandIns({
      "api.weather.test": () => ({ status: 200, body: '{"forecast":"sun"}' }),
      "api.postmarkapp.com": () => ({ status: 200, body: '{"ErrorCode":0,"Message":"OK"}' }),
    });
    const weather = await startContainedServer(
      {
        name: "weather",
        command: "node",
        args: [path.join(FIXTURES, "fetch-server.cjs")],
        env: { WEATHER_API_KEY: "wk-live-12345678" },
      },
      {
        roots: [],
        packageRoot: FIXTURES,
        secrets: [
          { variable: "WEATHER_API_KEY", id: "weather", destinations: ["api.weather.test:443"] },
        ],
        destinations: [
          {
            host: "api.weather.test",
            port: 443,
            mode: "inspect",
            shape: {
              profile: "api",
              routes: [
                { method: "GET", path: "/v1/forecast", query: ["city"] },
                { method: "GET", path: "/v1/x", query: ["k"] },
              ],
            },
          },
        ],
      },
      planContext(home),
      { stateDir, upstream: stand.upstream },
    );
    const mail = await startContainedServer(
      {
        name: "postmark",
        command: "node",
        args: [path.join(FIXTURES, "postmark.cjs"), "1.0.15"],
        env: {
          POSTMARK_SERVER_TOKEN: "pm-server-token-0001",
          DEFAULT_SENDER_EMAIL: "bot@company.test",
        },
      },
      {
        roots: [],
        packageRoot: FIXTURES,
        env: ["DEFAULT_SENDER_EMAIL"],
        secrets: [
          {
            variable: "POSTMARK_SERVER_TOKEN",
            id: "postmark",
            destinations: ["api.postmarkapp.com:443"],
          },
        ],
        destinations: [
          {
            host: "api.postmarkapp.com",
            port: 443,
            mode: "inspect",
            profiles: ["postmark"],
            constants: ["bot@company.test"],
            shape: {
              profile: "api",
              routes: [
                {
                  method: "POST",
                  path: "/email",
                  body: { maxBytes: 65536, schema: POSTMARK_BODY },
                },
              ],
              headers: ["x-postmark-server-token"],
            },
          },
        ],
      },
      planContext(home),
      { stateDir, upstream: stand.upstream },
    );
    try {
      expect(await weather.call("forecast", { city: "Rome" })).toEqual({
        isError: false,
        text: '{"forecast":"sun"}',
      });
      const sent = await mail.call("send_email", {
        to: "Alice <alice@example.test>, bob@example.test",
        cc: "carol@example.test",
        subject: "hi",
        textBody: "hello",
      });
      expect(sent.isError, sent.text).toBe(false);
    } finally {
      await weather.close();
      await mail.close();
      await stand.close();
    }
    const w = stand.requests.find((r) => r.host === "api.weather.test")!;
    expect(w.headers.authorization).toBe("Bearer wk-live-12345678");
    const m = stand.requests.find((r) => r.host === "api.postmarkapp.com")!;
    expect(m.headers["x-postmark-server-token"]).toBe("pm-server-token-0001");
    expect(JSON.parse(m.body)).toMatchObject({
      From: "bot@company.test",
      To: "Alice <alice@example.test>, bob@example.test",
      Cc: "carol@example.test",
    });
    expect(refusals([...weather.events, ...mail.events])).toEqual([]);
  });

  it("npm test of a normal project runs to success and its outputs land in the project", async () => {
    const proj = path.join(root, "app");
    fs.mkdirSync(path.join(proj, "src"), { recursive: true });
    gitInit(proj);
    fs.writeFileSync(
      path.join(proj, "package.json"),
      JSON.stringify({
        name: "app",
        version: "1.0.0",
        scripts: {
          test: "node test/run.js && node -e \"require('fs').writeFileSync('coverage-summary.txt','ok')\"",
        },
      }),
    );
    fs.writeFileSync(path.join(proj, "src", "add.js"), "module.exports = (a, b) => a + b;\n");
    fs.mkdirSync(path.join(proj, "test"));
    fs.writeFileSync(
      path.join(proj, "test", "run.js"),
      [
        "const assert = require('assert'); const fs = require('fs'); const os = require('os'); const path = require('path');",
        "assert.strictEqual(require('../src/add.js')(2, 3), 5);",
        "fs.mkdirSync('coverage', { recursive: true }); fs.writeFileSync('coverage/lcov.info', 'TN:');",
        "const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't-')); fs.writeFileSync(path.join(tmp, 'x'), 'y');",
        "console.log('tests passed');",
      ].join("\n"),
    );
    const r = await runContainedScript(
      {
        label: "npm test",
        projectDir: proj,
        command: "npm",
        args: ["test"],
        env: { npm_config_update_notifier: "false" },
      },
      planContext(home),
      { stateDir },
    );
    expect(r.code, `${r.stdout}\n${r.stderr}`).toBe(0);
    expect(r.stdout).toContain("tests passed");
    expect(fs.readFileSync(path.join(proj, "coverage", "lcov.info"), "utf8")).toBe("TN:");
    expect(fs.readFileSync(path.join(proj, "coverage-summary.txt"), "utf8")).toBe("ok");
    expect(refusals(r.events)).toEqual([]);
  });

  it("npm scripts and make recipes with shell syntax (&&, pipes, env vars, pre/post hooks) run as they do uncontained", async () => {
    const proj = path.join(root, "shelly");
    fs.mkdirSync(path.join(proj, "src"), { recursive: true });
    gitInit(proj);
    fs.writeFileSync(path.join(proj, "src", "a.txt"), "beta\nalpha\ngamma\n");
    fs.writeFileSync(
      path.join(proj, "package.json"),
      JSON.stringify({
        name: "shelly",
        version: "1.0.0",
        scripts: {
          pretest: "mkdir -p out && echo pre > out/pre.txt",
          test: 'cat src/a.txt | sort | head -n 2 | tr a-z A-Z > out/sorted.txt && test "$(wc -l < out/sorted.txt)" -eq 2 && echo "mode=$MODE" >> out/sorted.txt && node -e "process.exit(0)"',
          posttest:
            "find out -name '*.txt' | xargs ls > out/listing.txt && grep -q pre out/pre.txt && sed -n 1p out/sorted.txt | awk '{print tolower($0)}' > out/first.txt",
        },
      }),
    );
    fs.writeFileSync(
      path.join(proj, "Makefile"),
      [
        "SRC := $(wildcard src/*.txt)",
        "all: build/out.tar.gz",
        "build/out.tar.gz: $(SRC)",
        "\t@mkdir -p build && for f in $(SRC); do cp $$f build/; done",
        "\t@cd build && tar -czf out.tar.gz *.txt && ls -l out.tar.gz | wc -l > count",
        '\t@if [ "$$(cat build/count)" = 1 ]; then echo made; else exit 1; fi',
        "",
      ].join("\n"),
    );
    const npm = await runContainedScript(
      {
        label: "npm test",
        projectDir: proj,
        command: "npm",
        args: ["test"],
        env: { npm_config_update_notifier: "false", MODE: "ci" },
      },
      planContext(home),
      { stateDir },
    );
    expect(npm.code, `${npm.stdout}\n${npm.stderr}`).toBe(0);
    expect(fs.readFileSync(path.join(proj, "out", "sorted.txt"), "utf8")).toBe(
      "ALPHA\nBETA\nmode=ci\n",
    );
    expect(fs.readFileSync(path.join(proj, "out", "first.txt"), "utf8")).toBe("alpha\n");
    expect(fs.readFileSync(path.join(proj, "out", "listing.txt"), "utf8")).toContain("out/pre.txt");
    const make = await runContainedScript(
      { label: "make", projectDir: proj, command: "make", args: [] },
      planContext(home),
      { stateDir },
    );
    expect(make.code, `${make.stdout}\n${make.stderr}`).toBe(0);
    expect(make.stdout).toContain("made");
    expect(fs.existsSync(path.join(proj, "build", "out.tar.gz"))).toBe(true);
    expect(refusals([...npm.events, ...make.events])).toEqual([]);
  }, 60_000);

  it("an MCP server that starts in its project (python -m <module>, uv run --directory): the definition's cwd is used; a cwd outside the roots is refused", async () => {
    const proj = path.join(root, "pyproj");
    const pkg = path.join(root, "pypkg");
    fs.mkdirSync(proj, { recursive: true });
    fs.mkdirSync(pkg, { recursive: true });
    // Importable only from the project directory (python -m puts the cwd on sys.path).
    fs.writeFileSync(
      path.join(proj, "projsrv.py"),
      [
        "import json, os, sys",
        "for line in sys.stdin:",
        "    m = json.loads(line)",
        "    if 'id' not in m:",
        "        continue",
        "    if m['method'] == 'initialize':",
        "        r = {'protocolVersion': '2025-06-18', 'capabilities': {'tools': {}}, 'serverInfo': {'name': 'projsrv', 'version': '0'}}",
        "    else:",
        "        r = {'content': [{'type': 'text', 'text': os.getcwd()}]}",
        "    sys.stdout.write(json.dumps({'jsonrpc': '2.0', 'id': m['id'], 'result': r}) + '\\n')",
        "    sys.stdout.flush()",
        "",
      ].join("\n"),
    );
    const rec = { roots: [{ path: proj, access: "ro" as const }], packageRoot: pkg };
    const def = { name: "projsrv", command: "python3", args: ["-m", "projsrv"] };
    // Without a cwd it starts in the package root, where the module is not importable.
    await expect(startContainedServer(def, rec, planContext(home), { stateDir })).rejects.toThrow(
      /No module named projsrv/,
    );
    const srv = await startContainedServer({ ...def, cwd: proj }, rec, planContext(home), {
      stateDir,
    });
    try {
      const r = await srv.call("whereami", {});
      expect(r.text).toBe(proj);
      expect(refusals(srv.events)).toEqual([]);
    } finally {
      await srv.close();
    }
    const outside = await startContainedServer({ ...def, cwd: home }, rec, planContext(home), {
      stateDir,
    }).catch((e: unknown) => e as { code?: string });
    expect((outside as { code?: string }).code).toBe("containment-cwd-outside-roots");
  }, 60_000);
});
