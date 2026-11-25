import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { planContainment, type ContainmentDeclaration } from "./plan.js";
import { strictExecSeccompFilter } from "./seccomp.js";
import { createContainerCa, createContainerCaWithKeyForTest } from "./x509.js";

let root: string;
let home: string;
const ctx = () => ({ home, uid: 1000, gid: 1000 });
beforeAll(() => {
  root = fs.mkdtempSync(
    path.join(process.env.ENCLAWED_CONTAINMENT_TEST_DIR ?? os.tmpdir(), "plan-"),
  );
  home = path.join(root, "home");
  fs.mkdirSync(path.join(home, ".aws"), { recursive: true });
  fs.mkdirSync(path.join(root, "proj", ".git", "hooks"), { recursive: true });
  fs.writeFileSync(path.join(root, "proj", ".git", "config"), "");
  fs.mkdirSync(path.join(root, "proj", "pkg", ".vscode"), { recursive: true });
  fs.writeFileSync(path.join(root, "proj", ".mcp.json"), "{}");
  fs.mkdirSync(path.join(root, "proj", "node_modules", "x", ".claude"), { recursive: true });
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const decl = (over: Partial<ContainmentDeclaration> = {}): ContainmentDeclaration => ({
  kind: "mcp-server",
  label: "t",
  command: "node",
  args: [],
  cwd: path.join(root, "proj"),
  roots: [{ path: path.join(root, "proj"), access: "rw" }],
  programs: ["node"],
  ...over,
});

describe("planContainment", () => {
  it("protects exec-config (git hooks read-only, no placeholders), masks nothing absent, and builds env from nothing", () => {
    const r = planContainment(decl({ env: { A: "1" } }), ctx());
    expect(r.ok).toBe(true);
    if (!r.ok) {
      return;
    }
    const p = r.plan;
    const proj = fs.realpathSync(path.join(root, "proj"));
    expect(p.execConfigReadOnly).toEqual(
      expect.arrayContaining([
        path.join(proj, ".git", "hooks"),
        path.join(proj, ".git", "config"),
        path.join(proj, "pkg", ".vscode"),
        path.join(proj, ".mcp.json"),
      ]),
    );
    expect(p.execConfigReadOnly.some((x) => x.includes("node_modules"))).toBe(false);
    // Nothing is made to exist in the project: missing names are refused by
    // the name guard, not pre-empted by placeholder files.
    expect(p.placeholders).toEqual([]);
    // Anchors: every directory between a protected path and the root, bound
    // onto itself BEFORE the protected binds beneath it.
    expect(p.anchored).toEqual(
      expect.arrayContaining([path.join(proj, ".git"), path.join(proj, "pkg")]),
    );
    const at = (x: string, ro: boolean) =>
      p.ops.findIndex((o) => o.op === "bind" && o.path === x && o.ro === ro);
    expect(at(path.join(proj, ".git"), false)).toBeGreaterThan(-1);
    expect(at(path.join(proj, ".git"), false)).toBeLessThan(
      at(path.join(proj, ".git", "hooks"), true),
    );
    // A read-only mount for git's hooks only; tracked exec-config and git's
    // config stay writable for the contained git (the name guard decides).
    expect(at(path.join(proj, ".git", "config"), true)).toBe(-1);
    expect(at(path.join(proj, "pkg", ".vscode"), true)).toBe(-1);
    expect(at(path.join(proj, ".mcp.json"), true)).toBe(-1);
    expect(p.protect.find((x) => x.path === path.join(proj, ".mcp.json"))).toMatchObject({
      origin: "original",
      file: true,
    });
    expect(Object.keys(p.env).toSorted()).toEqual([
      "A",
      "ENCLAWED_CONTAINED",
      "HOME",
      "LANG",
      "LOGNAME",
      "PATH",
      "TMPDIR",
      "USER",
    ]);
    expect(p.strictExec).toBe(true);
    const projBind = p.ops.find((o) => o.op === "bind" && o.path === proj);
    expect(projBind).toMatchObject({ ro: false, exec: false });
    expect(p.ops.some((o) => o.op === "bind" && o.path === "/usr/bin/sh")).toBe(false);
  });

  it("refuses what it cannot contain, naming the reason", () => {
    const cases: Array<[Partial<ContainmentDeclaration>, string]> = [
      [{ roots: [{ path: "/", access: "ro" }], cwd: "/" }, "containment-root-too-broad"],
      [{ roots: [{ path: "/etc", access: "ro" }], cwd: "/etc" }, "containment-root-too-broad"],
      [
        { roots: [{ path: path.join(home, ".aws"), access: "ro" }], cwd: path.join(home, ".aws") },
        "containment-root-is-credential-store",
      ],
      [{ roots: [{ path: path.join(root, "missing"), access: "ro" }] }, "containment-root-missing"],
      [{ cwd: home }, "containment-cwd-outside-roots"],
      [{ command: "sh" }, "containment-command-not-allowed"],
      [{ programs: ["node", "no-such-program-xyz"] }, "containment-program-missing"],
      [
        { env: { GITHUB_TOKEN: "ghp_abcdefghijklmnopqrstuvwxyz0123456789" } },
        "containment-env-inline-secret",
      ],
      [{ env: { NODE_EXTRA_CA_CERTS: "/x" } }, "containment-env-reserved"],
      [
        { secrets: [{ variable: "T", id: "t", destinations: ["api.x.test:443"] }] },
        "containment-declaration-invalid",
      ],
    ];
    for (const [over, code] of cases) {
      const r = planContainment(decl(over), ctx());
      expect([JSON.stringify(over), r.ok ? "ok" : r.code]).toEqual([JSON.stringify(over), code]);
    }
  });

  it("package install: every existing top-level entry read-only except outputs, lockfiles, the manifest and ignored output", () => {
    const proj = path.join(root, "inst");
    fs.mkdirSync(path.join(proj, "src"), { recursive: true });
    fs.mkdirSync(path.join(proj, "node_modules"));
    fs.mkdirSync(path.join(proj, "dist"));
    fs.writeFileSync(path.join(proj, "package.json"), "{}");
    fs.writeFileSync(path.join(proj, "package-lock.json"), "{}");
    fs.writeFileSync(path.join(proj, "README.md"), "r");
    fs.writeFileSync(path.join(proj, ".env"), "A=1");
    execFileSync("git", ["init", "-q", proj]);
    fs.writeFileSync(path.join(proj, ".gitignore"), "dist/\nnode_modules/\n.env\n");
    const r = planContainment(
      decl({
        kind: "package-install",
        cwd: proj,
        roots: [{ path: proj, access: "rw" }],
        programs: ["node"],
      }),
      ctx(),
    );
    expect(r.ok, r.ok ? "" : r.message).toBe(true);
    if (!r.ok) {
      return;
    }
    const real = fs.realpathSync(proj);
    const roBind = (n: string) =>
      r.plan.ops.some((o) => o.op === "bind" && o.path === path.join(real, n) && o.ro);
    for (const n of ["src", "README.md", ".gitignore", ".env", ".git"]) {
      expect([n, roBind(n)]).toEqual([n, true]);
    }
    for (const n of ["node_modules", "dist", "package.json", "package-lock.json"]) {
      expect([n, roBind(n)]).toEqual([n, false]);
    }
    const g = r.plan.installGuards[0];
    expect(g.writable).toEqual(
      expect.arrayContaining(["node_modules", "dist", "package.json", "package-lock.json"]),
    );
    expect(g.writable).not.toContain(".env"); // ignored, but hidden: config, not output
    expect(g.manifests).toEqual(["package.json"]);
  });

  it("refuses a program that lives inside a writable root", () => {
    const bin = path.join(root, "proj", "tool");
    fs.copyFileSync("/usr/bin/true", bin);
    fs.chmodSync(bin, 0o755);
    const r = planContainment(decl({ programs: ["node", bin] }), ctx());
    expect(r.ok ? "ok" : r.code).toBe("containment-program-writable");
  });
});

const hasOpenssl = (() => {
  try {
    execFileSync("openssl", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

function opensslVerify(dir: string, caPem: string, leafPem: string): { ok: boolean; out: string } {
  fs.writeFileSync(path.join(dir, "ca.pem"), caPem);
  fs.writeFileSync(path.join(dir, "leaf.pem"), leafPem);
  try {
    const out = execFileSync(
      "openssl",
      [
        "verify",
        "-x509_strict",
        "-purpose",
        "sslserver",
        "-CAfile",
        path.join(dir, "ca.pem"),
        path.join(dir, "leaf.pem"),
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return { ok: true, out };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

describe("container CA", () => {
  it("issues leaves a strict verifier accepts, and keeps one CA per container", () => {
    const ca = createContainerCa("t", ["api.postmarkapp.com"]);
    const leaf = ca.leafFor("api.postmarkapp.com");
    expect(ca.leafFor("API.postmarkapp.com")).toBe(leaf);
    expect(createContainerCa("t", ["api.postmarkapp.com"]).certPem).not.toBe(ca.certPem);
    if (hasOpenssl) {
      const v = opensslVerify(fs.mkdtempSync(path.join(root, "ca-")), ca.certPem, leaf.certPem);
      expect(v.out).toContain("OK");
    }
  });

  it("is name-constrained to the declared destinations: it refuses to sign others, and a verifier rejects one it did sign", async () => {
    const ca = createContainerCa("t", ["api.weather.test"]);
    expect(() => ca.leafFor("evil.test")).toThrow(/not a declared destination/);
    expect(() => ca.leafFor("sub.api.weather.test")).toThrow(/not a declared destination/);
    expect(() => createContainerCa("t", ["bad name"])).toThrow(/not a DNS name/);
    // A leaf for an undeclared name, signed with the CA's own key (as a key
    // compromise would): the name constraint makes every verifier refuse it.
    const forged = createContainerCaWithKeyForTest("t", ["api.weather.test"]);
    const evil = forged.signLeaf("evil.test");
    const good = forged.signLeaf("api.weather.test");
    const ip = forged.signLeaf("198.51.100.7");
    if (hasOpenssl) {
      const dir = fs.mkdtempSync(path.join(root, "nc-"));
      expect(opensslVerify(dir, forged.ca.certPem, good.certPem).ok).toBe(true);
      const bad = opensslVerify(dir, forged.ca.certPem, evil.certPem);
      expect(bad.ok).toBe(false);
      expect(bad.out).toMatch(/subtree violation|name constraint/i);
      expect(opensslVerify(dir, forged.ca.certPem, ip.certPem).ok).toBe(false);
    }
    // Node's TLS client (what a contained node process uses) refuses it too.
    const tls = await import("node:tls");
    const check = (leaf: { keyPem: string; certPem: string }, servername: string) =>
      new Promise<string>((resolve) => {
        const server = tls.createServer({ key: leaf.keyPem, cert: leaf.certPem }, (s) => s.end());
        server.listen(0, "127.0.0.1", () => {
          const port = (server.address() as { port: number }).port;
          const c = tls.connect({ host: "127.0.0.1", port, servername, ca: forged.ca.certPem });
          c.on("secureConnect", () => {
            c.destroy();
            server.close();
            resolve("ok");
          });
          c.on("error", (e: NodeJS.ErrnoException) => {
            server.close();
            resolve(`${e.code ?? ""} ${e.message}`);
          });
        });
      });
    expect(await check(good, "api.weather.test")).toBe("ok");
    expect(await check(evil, "evil.test")).toMatch(/permitted subtree violation/i);
  });
});

describe("strict-exec seccomp filter", () => {
  it("has a program for x64 and arm64 and none for unknown architectures", () => {
    expect(strictExecSeccompFilter("x64")!.length % 8).toBe(0);
    expect(strictExecSeccompFilter("arm64")!.length % 8).toBe(0);
    expect(strictExecSeccompFilter("mips")).toBeNull();
  });
});
