// Where the package runners keep their installs and which index a Python
// runner reads: options, environment, config files (project, user, system)
// in each runner's precedence, and the Linux, macOS and Windows layouts.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseIni, parseTomlStrings, pythonIndexUrls, runnerCacheDirs } from "./runner-config.js";

let root: string;
let home: string;
let proj: string;
beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-runner-config-")));
  home = path.join(root, "home");
  proj = path.join(root, "proj", "sub");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(proj, { recursive: true });
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const put = (p: string, body: string) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
};
const linuxEnv = () => ({
  HOME: home,
  XDG_CACHE_HOME: path.join(home, ".cache"),
  XDG_CONFIG_HOME: path.join(home, ".config"),
  XDG_DATA_HOME: path.join(home, ".local", "share"),
  XDG_CONFIG_DIRS: path.join(root, "etc-xdg"),
  TMPDIR: path.join(root, "tmp"),
  npm_config_globalconfig: path.join(root, "global-npmrc"),
});

describe("parsers", () => {
  it("reads npmrc / pip.conf and the TOML the runners write", () => {
    const ini = parseIni(
      "; c\ncache = ${X}/c\n[global]\nindex_url = https://a/simple\nextra-index-url =\n  https://b/simple\n  https://c/simple\n",
    );
    expect(ini.get("")?.get("cache")).toBe("${X}/c");
    expect(ini.get("global")?.get("index-url")).toBe("https://a/simple");
    expect(ini.get("global")?.get("extra-index-url")?.split(/\s+/).filter(Boolean)).toEqual([
      "https://b/simple",
      "https://c/simple",
    ]);
    const t = parseTomlStrings(
      '# x\ncache-dir = "/c"\n[install.cache]\ndir = \'~/b\'\n[tool.uv]\ncache-dir = "u"\n[[index]]\nurl = "https://i/simple"\ndefault = true\n[x]\ncache = { dir = "/inline", n = 1 }\n',
    );
    expect(t.get("cache-dir")).toBe("/c");
    expect(t.get("install.cache.dir")).toBe("~/b");
    expect(t.get("tool.uv.cache-dir")).toBe("u");
    expect(t.get("index[0].url")).toBe("https://i/simple");
    expect(t.get("index[0].default")).toBe(true);
    expect(t.get("x.cache.dir")).toBe("/inline");
  });
});

describe("caches on Linux, in each runner's precedence", () => {
  it("false positive: defaults with no config", () => {
    const c = runnerCacheDirs(linuxEnv(), home, "linux", { cwd: proj });
    expect(c.npm).toEqual([path.join(home, ".npm")]);
    expect(c.pnpm).toEqual([path.join(home, ".cache", "pnpm")]);
    expect(c.uv).toEqual([path.join(home, ".cache", "uv")]);
    expect(c.deno).toBe(path.join(home, ".cache", "deno"));
    expect(c.yarn).toEqual([path.join(home, ".yarn", "berry", "cache")]);
    expect(c.pipx).toEqual([
      path.join(home, ".cache", "pipx"),
      path.join(home, ".local", "pipx", ".cache"),
      path.join(home, ".local", "share", "pipx", ".cache"),
    ]);
    expect(c.bun).toContain(path.join(home, ".bun", "install", "cache"));
  });

  it("false positive: config files move the caches (project, then user, then global); options and the environment come first", () => {
    put(path.join(root, "proj", "package.json"), "{}");
    put(path.join(root, "proj", ".npmrc"), "cache=${PROJ_CACHE}/npm\ncache-dir=~/pnpm-proj\n");
    put(path.join(home, ".npmrc"), "cache=~/npm-user\ncache-dir=/pnpm-user\n");
    put(path.join(root, "global-npmrc"), "cache=/npm-global\n");
    put(path.join(home, ".config", "pnpm", "rc"), "cache-dir=/pnpm-global\n");
    put(path.join(root, "proj", "pnpm-workspace.yaml"), "cacheDir: ./ws-cache\n");
    put(path.join(proj, "bunfig.toml"), '[install.cache]\ndir = "./bun-proj"\n');
    put(path.join(home, ".config", ".bunfig.toml"), '[install.cache]\ndir = "/bun-global"\n');
    put(path.join(root, "proj", ".yarnrc.yml"), "cacheFolder: ./yarn-cache\n");
    put(
      path.join(root, "proj", "pyproject.toml"),
      '[project]\nname = "x"\n[tool.uv]\ncache-dir = "./uv-proj"\n',
    );
    put(path.join(home, ".config", "uv", "uv.toml"), 'cache-dir = "/uv-user"\n');
    put(path.join(root, "etc-xdg", "uv", "uv.toml"), 'cache-dir = "/uv-system"\n');
    const env = { ...linuxEnv(), PROJ_CACHE: "/pc" };
    const c = runnerCacheDirs(env, home, "linux", { cwd: proj });
    expect(c.npm).toEqual([
      "/pc/npm",
      path.join(home, "npm-user"),
      "/npm-global",
      path.join(home, ".npm"),
    ]);
    expect(c.pnpm).toEqual([
      path.join(root, "proj", "ws-cache"),
      path.join(home, "pnpm-proj"),
      "/pnpm-global",
      "/pnpm-user",
      path.join(home, ".cache", "pnpm"),
    ]);
    expect(c.bun.slice(0, 2)).toEqual([path.join(proj, "bun-proj"), "/bun-global"]);
    expect(c.yarn[0]).toBe(path.join(root, "proj", "yarn-cache"));
    expect(c.uv).toEqual([
      path.join(root, "proj", "uv-proj"),
      "/uv-user",
      "/uv-system",
      path.join(home, ".cache", "uv"),
    ]);
    // uvx and uv tool run read no project configuration (uv's rule).
    expect(
      runnerCacheDirs(env, home, "linux", { cwd: proj, def: { command: "uvx", args: ["x==1"] } })
        .uv,
    ).toEqual(["/uv-user", "/uv-system", path.join(home, ".cache", "uv")]);
    // A uv.toml beside the pyproject wins over it (uv's rule).
    put(path.join(root, "proj", "uv.toml"), 'cache-dir = "/uv-toml"\n');
    expect(runnerCacheDirs(env, home, "linux", { cwd: proj }).uv[0]).toBe("/uv-toml");
    // --no-config / UV_NO_CONFIG skip every file; --config-file names one.
    expect(
      runnerCacheDirs(env, home, "linux", {
        cwd: proj,
        def: { command: "uvx", args: ["--no-config", "x==1"] },
      }).uv,
    ).toEqual([path.join(home, ".cache", "uv")]);
    expect(runnerCacheDirs({ ...env, UV_NO_CONFIG: "1" }, home, "linux", { cwd: proj }).uv).toEqual(
      [path.join(home, ".cache", "uv")],
    );
    // Options, then the environment, come before every file.
    const opt = runnerCacheDirs(
      {
        ...env,
        UV_CACHE_DIR: "/uv-env",
        npm_config_cache: "/npm-env",
        BUN_INSTALL_CACHE_DIR: "/bun-env",
      },
      home,
      "linux",
      { cwd: proj, def: { command: "uvx", args: ["--cache-dir", "/uv-opt", "x==1"] } },
    );
    expect(opt.uv.slice(0, 2)).toEqual(["/uv-opt", "/uv-env"]);
    expect(opt.npm[0]).toBe("/npm-env");
    expect(opt.bun[0]).toBe("/bun-env");
    expect(
      runnerCacheDirs({ ...env, NPM_CONFIG_CACHE: "/npm-upper" }, home, "linux", { cwd: proj })
        .npm[0],
    ).toBe("/npm-upper");
  });
});

describe("caches on macOS and Windows (admission and pinning, before containment runs there)", () => {
  it("macOS: Library/Caches for pnpm, pipx and deno; uv keeps ~/.cache", () => {
    const c = runnerCacheDirs({ HOME: "/Users/u" }, "/Users/u", "darwin", { cwd: "/Users/u/p" });
    expect(c.pnpm.at(-1)).toBe("/Users/u/Library/Caches/pnpm");
    expect(c.deno).toBe("/Users/u/Library/Caches/deno");
    expect(c.uv.at(-1)).toBe("/Users/u/.cache/uv");
    expect(c.npm.at(-1)).toBe("/Users/u/.npm");
    expect(c.pipx[0]).toBe("/Users/u/Library/Caches/pipx");
    expect(c.pipx).toContain("/Users/u/Library/Application Support/pipx/.cache");
  });

  it("Windows: %LOCALAPPDATA% / %APPDATA% layouts, and env and options as on other systems", () => {
    const env = {
      USERPROFILE: "C:\\Users\\u",
      LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local",
      APPDATA: "C:\\Users\\u\\AppData\\Roaming",
      TEMP: "C:\\Users\\u\\AppData\\Local\\Temp",
    };
    const c = runnerCacheDirs(env, "C:\\Users\\u", "win32", { cwd: "C:\\work\\p" });
    expect(c.npm.at(-1)).toBe("C:\\Users\\u\\AppData\\Local\\npm-cache");
    expect(c.pnpm.at(-1)).toBe("C:\\Users\\u\\AppData\\Local\\pnpm-cache");
    expect(c.bun).toContain("C:\\Users\\u\\.bun\\install\\cache");
    expect(c.bun).toContain("C:\\Users\\u\\AppData\\Local\\Temp");
    expect(c.yarn.at(-1)).toBe("C:\\Users\\u\\AppData\\Local\\Yarn\\Berry\\cache");
    expect(c.uv.at(-1)).toBe("C:\\Users\\u\\AppData\\Local\\uv\\cache");
    expect(c.pipx).toEqual([
      "C:\\Users\\u\\AppData\\Local\\pipx\\pipx\\Cache",
      "C:\\Users\\u\\pipx\\.cache",
      "C:\\Users\\u\\AppData\\Local\\pipx\\pipx\\.cache",
    ]);
    expect(c.deno).toBe("C:\\Users\\u\\AppData\\Local\\deno");
    const moved = runnerCacheDirs(
      { ...env, DENO_DIR: "D:\\deno", UV_CACHE_DIR: "D:\\uv", PIPX_HOME: "D:\\pipx" },
      "C:\\Users\\u",
      "win32",
      { cwd: "C:\\work\\p", def: { command: "npx.cmd", args: ["--cache", "D:\\npm", "x@1.0.0"] } },
    );
    expect(moved.deno).toBe("D:\\deno");
    expect(moved.uv[0]).toBe("D:\\uv");
    expect(moved.npm[0]).toBe("D:\\npm");
    expect(moved.pipx).toContain("D:\\pipx\\.cache");
  });
});

describe("the Python index a runner reads", () => {
  it("false positive: PyPI by default; uv's options, environment and config ([[index]], extra first); pip.conf for pipx", () => {
    const env = linuxEnv();
    expect(
      pythonIndexUrls({ command: "uvx", args: ["x==1"] }, env, home, "linux", { cwd: root }),
    ).toEqual(["https://pypi.org/simple/"]);
    put(
      path.join(home, ".config", "uv", "uv.toml"),
      '[[index]]\nurl = "https://extra/simple"\n[[index]]\nurl = "https://corp/simple"\ndefault = true\n',
    );
    expect(
      pythonIndexUrls({ command: "uvx", args: ["x==1"] }, env, home, "linux", { cwd: root }),
    ).toEqual(["https://extra/simple/", "https://corp/simple/"]);
    expect(
      pythonIndexUrls(
        { command: "uvx", args: ["--index-url", "https://opt/simple", "x==1"] },
        { ...env, UV_INDEX_URL: "https://env/simple" },
        home,
        "linux",
        { cwd: root },
      ).at(-1),
    ).toBe("https://opt/simple/");
    expect(
      pythonIndexUrls(
        { command: "uvx", args: ["x==1"] },
        { ...env, UV_DEFAULT_INDEX: "https://env/simple" },
        home,
        "linux",
        { cwd: root },
      ).at(-1),
    ).toBe("https://env/simple/");
    put(
      path.join(home, ".config", "pip", "pip.conf"),
      "[global]\nindex-url = https://pipglobal/simple\n[install]\nindex-url = https://pipinstall/simple\nextra-index-url = https://pipextra/simple\n",
    );
    expect(pythonIndexUrls({ command: "pipx", args: ["run", "x==1"] }, env, home, "linux")).toEqual(
      ["https://pipinstall/simple/", "https://pipextra/simple/"],
    );
    expect(
      pythonIndexUrls(
        { command: "pipx", args: ["run", "x==1"] },
        { ...env, PIP_INDEX_URL: "https://envpip/simple" },
        home,
        "linux",
      )[0],
    ).toBe("https://envpip/simple/");
  });
});
