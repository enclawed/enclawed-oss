// enclawed adapter kit: which build-tool commands run as a contained build.
//
// Owner policy (2026-11-27): a step that needs a person is one that cannot be
// undone AND is consequential (files changed for good with no history, data
// or code crossing the network, settings of a running task changed so they
// open attack surface, a secret reaching the model). A build tool run inside
// the containment (../containment/build-mode.ts) has none of those: what it
// changes in the project is snapshotted first or regenerable, what it could
// plant for later is refused by name, it has no network and no secret. So a
// build runs with no person even though its scripts are not read here; that
// is the point (they are code Enclawed does not read).
//
// What this module reads is only the build tool's own command line: that it
// is one of a small list of build forms (configure, build, test), names no
// network address, no installer, publisher or downloader form, and puts its
// outputs inside the project (or the run's private /tmp). The rest of the
// line is read by ./contained-exec.ts as before.

import fs from "node:fs";
import path from "node:path";
import { BUILD_PROGRAM_DIRS } from "../containment/build-mode.js";
import { credentialFindings, credentialPathOf, hardLinkedCredential } from "./credentials.js";
import { isInside, type FsProbe } from "./fs-probe.js";
import { secretContentOf } from "./secret-content.js";

export type BuildRead =
  | Readonly<{
      ok: true;
      /** The build tool (its name as the line gives it). */
      tool: string;
      /**
       * Directories the tool writes its outputs into (absolute, as named),
       * each with what marks it as that tool's build tree. History may leave
       * their files git does not track out of the snapshot when they are a
       * build tree already (or do not exist yet): regenerable outputs.
       */
      outputs: readonly Readonly<{ dir: string; marker: readonly string[] }>[];
    }>
  | Readonly<{ ok: false; why: string }>;

/** The build tools a line may run as a contained build. */
export const BUILD_TOOLS: ReadonlySet<string> = new Set([
  "cmake",
  "ctest",
  "make",
  "gmake",
  "ninja",
  "meson",
  "cargo",
  "go",
]);

const URL = /\b(?:https?|wss?|ftp|git|ssh|sftp|rsync):\/\//i;
const CMAKE_MARK = ["CMakeCache.txt"];
const NINJA_MARK = ["build.ninja", ".ninja_log"];
const MESON_MARK = ["meson-private"];
const CARGO_MARK = ["CACHEDIR.TAG", ".rustc_info.json"];

type Ctx = Readonly<{
  cwd: string;
  projectDir: string;
  realpathNearest: (p: string) => string;
}>;

class NotBuild extends Error {}
function no(why: string): never {
  throw new NotBuild(why);
}

/** The program the containment runs for `name`: a system program, never one in the project or a home. */
export function systemBuildProgram(name: string): string | null {
  for (const d of BUILD_PROGRAM_DIRS) {
    const p = path.join(d, name);
    try {
      const st = fs.statSync(p);
      if (st.isFile() && st.mode & 0o111) {
        return p;
      }
    } catch {
      /* next */
    }
  }
  return null;
}

/** A directory the tool writes or reads: inside the project, or the run's private /tmp. */
function placeOf(ctx: Ctx, word: string, what: string): string {
  if (word === "" || /[*?[\]{}~$`\\]/.test(word)) {
    no(`${what} ${word.slice(0, 80)} is not one literal path`);
  }
  const abs = path.resolve(ctx.cwd, word);
  if (abs === "/tmp" || abs.startsWith("/tmp/")) {
    return abs; // the containment's own /tmp: gone with the run
  }
  if (!isInside(ctx.projectDir, ctx.realpathNearest(abs))) {
    no(`${what} ${abs} is outside the project`);
  }
  return abs;
}

/** A value an option takes: `--opt VALUE` or `--opt=VALUE` (and `-X VALUE` / `-XVALUE` for short ones). */
function takeValue(args: readonly string[], i: number, name: string): [string, number] {
  const a = args[i];
  if (a.startsWith(`${name}=`)) {
    return [a.slice(name.length + 1), i];
  }
  if (a !== name && !name.startsWith("--") && a.startsWith(name)) {
    return [a.slice(name.length), i];
  }
  if (i + 1 >= args.length) {
    no(`${name} without a value`);
  }
  return [args[i + 1], i + 1];
}

const isOpt = (a: string, ...names: string[]) =>
  names.some((n) => a === n || a.startsWith(`${n}=`) || (!n.startsWith("--") && a.startsWith(n)));

// ─── cmake ──────────────────────────────────────────────────────────────

function readCmake(ctx: Ctx, args: readonly string[]): BuildRead {
  if (args[0] === "--build") {
    // cmake --build DIR [--target T...] [-j N] [--parallel [N]] [--config C] [--clean-first] [-v] [-- -jN|-k]
    const dir = placeOf(ctx, args[1] ?? "", "the build directory");
    for (let i = 2; i < args.length; i++) {
      const a = args[i];
      if (a === "--") {
        for (const n of args.slice(i + 1)) {
          if (!/^-j\d*$|^-k$|^-k\d+$|^-v$|^--no-print-directory$|^-s$/.test(n)) {
            no(`cmake --build -- ${n.slice(0, 40)} is not a native build option Enclawed reads`);
          }
        }
        break;
      }
      if (/^(?:--clean-first|-v|--verbose)$/.test(a)) {
        continue;
      }
      if (isOpt(a, "--target", "-t", "--config", "-j", "--parallel")) {
        if (a === "--parallel" || a === "-j") {
          // An optional number.
          if (/^\d+$/.test(args[i + 1] ?? "")) {
            i++;
          }
          continue;
        }
        const [v, at] = takeValue(args, i, a.startsWith("--") ? a.split("=")[0] : a.slice(0, 2));
        i = at;
        if (/^(?:install|package|package_source|deploy|upload|publish)$/i.test(v)) {
          no(`cmake --build --target ${v} is not a build target`);
        }
        continue;
      }
      no(`cmake --build ${a.slice(0, 40)} is not an option Enclawed reads`);
    }
    return { ok: true, tool: "cmake", outputs: [{ dir, marker: CMAKE_MARK }] };
  }
  // Configure: cmake [-S SRC] [-B BUILD] [-G GEN] [-D NAME=VALUE]... [SRC]
  let source: string | null = null;
  let build: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (isOpt(a, "-S")) {
      const [v, at] = takeValue(args, i, "-S");
      source = placeOf(ctx, v, "the source directory");
      i = at;
    } else if (isOpt(a, "-B")) {
      const [v, at] = takeValue(args, i, "-B");
      build = placeOf(ctx, v, "the build directory");
      i = at;
    } else if (isOpt(a, "-D")) {
      const [v, at] = takeValue(args, i, "-D");
      i = at;
      if (!/^[A-Za-z_][A-Za-z0-9_.+-]*(?::[A-Z]+)?=/.test(v)) {
        no(`cmake -D ${v.slice(0, 60)} is not a cache entry`);
      }
    } else if (isOpt(a, "-U")) {
      i = takeValue(args, i, "-U")[1];
    } else if (isOpt(a, "-G", "-A", "-T")) {
      i = takeValue(args, i, a.slice(0, 2))[1];
    } else if (isOpt(a, "-C", "--toolchain")) {
      const name = a.startsWith("--") ? "--toolchain" : "-C";
      const [v, at] = takeValue(args, i, name);
      placeOf(ctx, v, `the ${name} file`);
      i = at;
    } else if (
      /^--log-level=[A-Za-z]+$|^--fresh$|^-W[A-Za-z-]*$|^-L[AH]*$|^--warn-uninitialized$/.test(a)
    ) {
      continue;
    } else if (a.startsWith("-")) {
      no(`cmake ${a.slice(0, 40)} is not a configure option Enclawed reads`);
    } else if (source === null) {
      source = placeOf(ctx, a, "the source directory");
    } else {
      no(`cmake ${a.slice(0, 40)}: more than one source directory`);
    }
  }
  if (source === null && build === null) {
    no("cmake with no source or build directory is not a configure step Enclawed reads");
  }
  return {
    ok: true,
    tool: "cmake",
    outputs: [{ dir: build ?? path.resolve(ctx.cwd), marker: CMAKE_MARK }],
  };
}

// ─── ctest ──────────────────────────────────────────────────────────────

function readCtest(ctx: Ctx, args: readonly string[]): BuildRead {
  let dir = path.resolve(ctx.cwd);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (isOpt(a, "--test-dir")) {
      const [v, at] = takeValue(args, i, "--test-dir");
      dir = placeOf(ctx, v, "the test directory");
      i = at;
    } else if (
      /^(?:--output-on-failure|-V|-VV|--verbose|--extra-verbose|-N|--show-only|-Q|--quiet|--rerun-failed|--stop-on-failure|--no-compress-output|--progress|--schedule-random|-U|--union)$/.test(
        a,
      ) ||
      /^--no-tests=(?:error|ignore)$/.test(a) ||
      a.startsWith("--output-junit=")
    ) {
      if (a.startsWith("--output-junit=")) {
        placeOf(ctx, path.resolve(dir, a.slice(15)), "the JUnit file");
      }
      continue;
    } else if (/^-j\d+$|^--parallel=\d+$/.test(a)) {
      continue;
    } else if (
      isOpt(
        a,
        "-j",
        "--parallel",
        "-R",
        "-E",
        "-L",
        "-LE",
        "-C",
        "--build-config",
        "--timeout",
        "--repeat",
        "-I",
      ) ||
      a === "--tests-regex" ||
      a === "--exclude-regex" ||
      a === "--label-regex"
    ) {
      i = takeValue(args, i, a.startsWith("--") ? a.split("=")[0] : a.slice(0, 2))[1];
    } else {
      // -D/-M/-T/-S (dashboards that submit results), --build-and-test, --script, ...: not a test run read here.
      no(`ctest ${a.slice(0, 40)} is not an option Enclawed reads`);
    }
  }
  return { ok: true, tool: "ctest", outputs: [{ dir, marker: CMAKE_MARK }] };
}

// ─── make, ninja ────────────────────────────────────────────────────────

const MAKE_NOT_BUILD =
  /^(?:install|uninstall|install-.*|deploy|deploy-.*|publish|publish-.*|upload|release|push|docker-push|dist-upload)$/i;

function readMake(ctx: Ctx, tool: string, args: readonly string[]): BuildRead {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (isOpt(a, "-C", "--directory")) {
      const name = a.startsWith("--") ? "--directory" : "-C";
      const [v, at] = takeValue(args, i, name);
      placeOf(ctx, v, "the directory");
      i = at;
    } else if (isOpt(a, "-f", "--file", "--makefile")) {
      const name = a.startsWith("--") ? a.split("=")[0] : "-f";
      const [v, at] = takeValue(args, i, name);
      placeOf(ctx, v, "the makefile");
      i = at;
    } else if (/^-j\d*$|^--jobs(?:=\d+)?$|^-l\d+(?:\.\d+)?$/.test(a)) {
      if ((a === "-j" || a === "--jobs") && /^\d+$/.test(args[i + 1] ?? "")) {
        i++;
      }
    } else if (
      /^-[ksBinqw]+$|^--(?:keep-going|silent|quiet|no-print-directory|always-make|print-directory|dry-run|just-print|question|warn-undefined-variables)$/.test(
        a,
      )
    ) {
      continue;
    } else if (a.startsWith("-")) {
      no(`${tool} ${a.slice(0, 40)} is not an option Enclawed reads`);
    } else if (/^[A-Za-z_][A-Za-z0-9_.]*=/.test(a)) {
      continue; // a make variable: what the unread makefile does with it is the build's
    } else if (MAKE_NOT_BUILD.test(a)) {
      no(`${tool} ${a.slice(0, 40)} installs or publishes, it does not build`);
    }
  }
  return { ok: true, tool, outputs: [] };
}

function readNinja(ctx: Ctx, args: readonly string[]): BuildRead {
  let dir = path.resolve(ctx.cwd);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (isOpt(a, "-C")) {
      const [v, at] = takeValue(args, i, "-C");
      dir = placeOf(ctx, v, "the build directory");
      i = at;
    } else if (/^-j\d+$|^-k\d+$|^-l\d+$/.test(a)) {
      continue;
    } else if (a === "-j" || a === "-k" || a === "-l") {
      if (!/^\d+$/.test(args[i + 1] ?? "")) {
        no(`ninja ${a} without a number`);
      }
      i++;
    } else if (a === "-v" || a === "--verbose" || a === "-n" || a === "--quiet") {
      continue;
    } else if (a.startsWith("-")) {
      // -t (tools), -f (another manifest), -d: not read here.
      no(`ninja ${a.slice(0, 40)} is not an option Enclawed reads`);
    } else if (MAKE_NOT_BUILD.test(a)) {
      no(`ninja ${a.slice(0, 40)} installs or publishes, it does not build`);
    }
  }
  return { ok: true, tool: "ninja", outputs: [{ dir, marker: NINJA_MARK }] };
}

// ─── meson ──────────────────────────────────────────────────────────────

function readMeson(ctx: Ctx, args: readonly string[]): BuildRead {
  const [sub, ...rest] = args;
  if (sub === "setup") {
    const dirs: string[] = [];
    for (let i = 0; i < rest.length; i++) {
      const a = rest[i];
      if (/^-D[A-Za-z_][A-Za-z0-9_:.-]*=/.test(a)) {
        continue;
      }
      if (a === "-D") {
        i++;
        continue;
      }
      if (
        /^--(?:buildtype|optimization|warnlevel|default-library|backend|prefix|libdir|bindir|includedir|unity|b_[a-z_]+)=\S+$/.test(
          a,
        ) ||
        /^--(?:wipe|reconfigure|werror|fatal-meson-warnings)$/.test(a) ||
        a === "--wrap-mode=nodownload" ||
        a === "--wrap-mode=nofallback"
      ) {
        continue;
      }
      if (a.startsWith("-")) {
        // --wrap-mode=forcefallback and the like fetch subprojects.
        no(`meson setup ${a.slice(0, 40)} is not an option Enclawed reads`);
      }
      dirs.push(placeOf(ctx, a, "the directory"));
    }
    if (dirs.length === 0 || dirs.length > 2) {
      no("meson setup needs a build directory (and at most a source directory)");
    }
    return { ok: true, tool: "meson", outputs: [{ dir: dirs[0], marker: MESON_MARK }] };
  }
  if (sub === "compile" || sub === "test") {
    let dir = path.resolve(ctx.cwd);
    for (let i = 0; i < rest.length; i++) {
      const a = rest[i];
      if (isOpt(a, "-C")) {
        const [v, at] = takeValue(rest, i, "-C");
        dir = placeOf(ctx, v, "the build directory");
        i = at;
      } else if (
        /^-j\d+$|^--jobs=\d+$|^-v$|^--verbose$|^--print-errorlogs$|^--no-rebuild$|^--clean$/.test(a)
      ) {
        continue;
      } else if (
        isOpt(a, "-j", "--jobs", "--suite", "--no-suite", "--num-processes", "--timeout-multiplier")
      ) {
        i = takeValue(rest, i, a.startsWith("--") ? a.split("=")[0] : "-j")[1];
      } else if (a.startsWith("-")) {
        no(`meson ${sub} ${a.slice(0, 40)} is not an option Enclawed reads`);
      }
    }
    return { ok: true, tool: "meson", outputs: [{ dir, marker: MESON_MARK }] };
  }
  // install, dist, subprojects (downloads), wrap (downloads), init, rewrite, ...
  no(`meson ${String(sub ?? "").slice(0, 40)} is not a build step Enclawed reads`);
}

// ─── cargo ──────────────────────────────────────────────────────────────

function readCargo(ctx: Ctx, args: readonly string[]): BuildRead {
  const [sub, ...rest] = args;
  if (!["build", "b", "test", "t", "check", "c", "clippy", "fmt"].includes(sub ?? "")) {
    // install, publish, update, fetch, login, search, add, new, run, ...: not a build.
    no(`cargo ${String(sub ?? "").slice(0, 40)} is not a build step Enclawed reads`);
  }
  let target: string | null = null;
  let manifestDir = path.resolve(ctx.cwd);
  let fmtCheck = false;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--") {
      if (sub === "fmt") {
        fmtCheck ||= rest.slice(i + 1).includes("--check");
      }
      break; // test binary or clippy arguments
    }
    if (isOpt(a, "--target-dir")) {
      const [v, at] = takeValue(rest, i, "--target-dir");
      target = placeOf(ctx, v, "the target directory");
      i = at;
    } else if (isOpt(a, "--manifest-path")) {
      const [v, at] = takeValue(rest, i, "--manifest-path");
      manifestDir = path.dirname(placeOf(ctx, v, "the manifest"));
      i = at;
    } else if (a === "--check") {
      fmtCheck = true;
    } else if (
      /^(?:--release|--all-targets|--workspace|--all|--lib|--bins|--tests|--benches|--examples|--doc|--all-features|--no-default-features|--offline|--frozen|--locked|-q|--quiet|-v|-vv|--verbose|--no-run|--no-fail-fast|--keep-going|--ignore-rust-version|--future-incompat-report)$/.test(
        a,
      ) ||
      /^-j\d+$|^--jobs=\d+$|^--message-format=[a-z-]+$|^--color=(?:auto|always|never)$/.test(a)
    ) {
      continue;
    } else if (
      isOpt(
        a,
        "-p",
        "--package",
        "--features",
        "-F",
        "--bin",
        "--test",
        "--bench",
        "--example",
        "--exclude",
        "--profile",
        "--target",
        "-j",
        "--jobs",
      )
    ) {
      i = takeValue(rest, i, a.startsWith("--") ? a.split("=")[0] : a.slice(0, 2))[1];
    } else {
      // --config and -Z change cargo's own settings (its network and registries included).
      no(`cargo ${sub} ${a.slice(0, 40)} is not an option Enclawed reads`);
    }
  }
  if (sub === "fmt" && !fmtCheck) {
    no("cargo fmt without --check rewrites the sources: it is an edit, not a build");
  }
  return {
    ok: true,
    tool: "cargo",
    outputs: [{ dir: target ?? path.join(manifestDir, "target"), marker: CARGO_MARK }],
  };
}

// ─── go ─────────────────────────────────────────────────────────────────

function readGo(ctx: Ctx, args: readonly string[]): BuildRead {
  const [sub, ...rest] = args;
  if (!["build", "test", "vet"].includes(sub ?? "")) {
    // get, install, mod download, run, generate, env -w, ...: not a build read here.
    no(`go ${String(sub ?? "").slice(0, 40)} is not a build step Enclawed reads`);
  }
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "-o") {
      placeOf(ctx, rest[i + 1] ?? "", "the output");
      i++;
    } else if (a.startsWith("-o=")) {
      placeOf(ctx, a.slice(3), "the output");
    } else if (/^-(?:v|x|race|cover|short|failfast|trimpath|json|n|a|benchmem)$/.test(a)) {
      continue;
    } else if (
      /^-(?:run|count|tags|timeout|bench|benchtime|cpu|p|parallel|covermode|coverpkg|ldflags|gcflags|buildvcs|mod)=/.test(
        a,
      )
    ) {
      if (a.startsWith("-mod=") && a !== "-mod=readonly" && a !== "-mod=vendor") {
        no(`go ${a} lets go change or fetch modules`);
      }
      continue;
    } else if (
      /^-(?:run|count|tags|timeout|bench|benchtime|cpu|p|parallel|covermode|coverpkg|ldflags|gcflags)$/.test(
        a,
      )
    ) {
      i++;
    } else if (a.startsWith("-")) {
      // -toolexec, -exec, -modfile, -overlay, -pkgdir, -C: not read here.
      no(`go ${sub} ${a.slice(0, 40)} is not an option Enclawed reads`);
    } else if (!/^(?:\.\.?(?:\/[A-Za-z0-9_./-]*)?|[A-Za-z0-9_./-]+)$/.test(a)) {
      no(`go ${sub} ${a.slice(0, 40)} is not a package pattern Enclawed reads`);
    }
  }
  return { ok: true, tool: "go", outputs: [] };
}

/**
 * Is this simple command a contained build? `prog` is the program word (no
 * path), `args` its arguments, `cwd` where it runs. Never throws.
 */
export function readBuildCommand(prog: string, args: readonly string[], ctx: Ctx): BuildRead {
  try {
    if (!BUILD_TOOLS.has(prog)) {
      no(`${prog} is not a build tool`);
    }
    if (!systemBuildProgram(prog)) {
      no(
        `${prog} is not a program of this machine's system directories (the containment runs only those)`,
      );
    }
    const url = args.find((a) => URL.test(a));
    if (url) {
      no(`${prog} names a network address (${url.slice(0, 80)})`);
    }
    switch (prog) {
      case "cmake":
        return readCmake(ctx, args);
      case "ctest":
        return readCtest(ctx, args);
      case "make":
      case "gmake":
        return readMake(ctx, prog, args);
      case "ninja":
        return readNinja(ctx, args);
      case "meson":
        return readMeson(ctx, args);
      case "cargo":
        return readCargo(ctx, args);
      case "go":
        return readGo(ctx, args);
      default:
        no(`${prog} is not a build tool`);
    }
  } catch (err) {
    if (err instanceof NotBuild) {
      return { ok: false, why: err.message };
    }
    return { ok: false, why: `it could not be read (${(err as Error)?.message ?? err})` };
  }
}

// ─── The project's secret files, masked in a build's view ───────────────

/**
 * Every file of the project a build could read a secret from (by name, by
 * content, or as another name of a credential file elsewhere): the build's
 * view shows each as an empty read-only file. A build's output reaches the
 * model, and its code is not read, so a secret is kept from it by the view,
 * not by reading. Bounded: a project too large to walk is no contained build
 * (null with why).
 */
/** Content verdicts by file identity (dev, inode, size, mtime, ctime): a build decision re-reads only changed files. */
const CONTENT_VERDICTS = new Map<string, boolean>();

const LOCKFILES = [
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "bun.lock",
];
const installedTree = (parent: string) =>
  fs.existsSync(path.join(parent, "package.json")) &&
  LOCKFILES.some((l) => fs.existsSync(path.join(parent, l)));

export function projectSecretMasks(
  projectDir: string,
  home: string | null,
  probe: Pick<FsProbe, "realpathNearest">,
  o: Readonly<{ maxEntries?: number }> = {},
): { ok: true; masks: string[] } | { ok: false; why: string } {
  const masks = new Set<string>();
  let left = o.maxEntries ?? 200_000;
  // What a read of the file shows (./credentials.ts readReachesCredential, per
  // file and cheaply): a secret by name, another name of a credential file
  // (a hard link: checked only for a file with more than one name), or a
  // secret by content.
  const holdsSecret = (p: string): boolean => {
    if (credentialPathOf(p, home)) {
      return true;
    }
    let st: fs.Stats;
    try {
      st = fs.statSync(p);
    } catch {
      return false;
    }
    if (st.nlink > 1 && hardLinkedCredential(probe.realpathNearest(p), home)) {
      return true;
    }
    // The content verdict of a file not changed since it was last read (same
    // inode, size and modification time) is the one found then.
    const key = `${st.dev}:${st.ino}:${st.size}:${st.mtimeMs}:${st.ctimeMs}`;
    const known = CONTENT_VERDICTS.get(key);
    if (known !== undefined) {
      return known;
    }
    const hit = secretContentOf(p, credentialFindings) !== null;
    if (CONTENT_VERDICTS.size > 500_000) {
      CONTENT_VERDICTS.clear();
    }
    CONTENT_VERDICTS.set(key, hit);
    return hit;
  };
  const stack: string[] = [projectDir];
  while (stack.length) {
    const d = stack.pop() as string;
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return { ok: false, why: `${d} could not be listed for secret files` };
    }
    for (const e of ents) {
      if (--left < 0) {
        return {
          ok: false,
          why: "the project holds more files than Enclawed checks for secrets before a build",
        };
      }
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (d === projectDir && e.name === ".git") {
          // git's objects hold no file a build reads by name; its own files
          // (config: a remote URL may carry a token) are checked.
          let top: fs.Dirent[] = [];
          try {
            top = fs.readdirSync(p, { withFileTypes: true });
          } catch {
            /* no readable git directory: nothing of it is in the view either */
          }
          for (const g of top) {
            if (g.isFile() && holdsSecret(path.join(p, g.name))) {
              masks.add(path.join(p, g.name));
            }
          }
          continue;
        }
        // A dependency tree a package manager installed from its registry
        // (beside a lockfile): published code, read by nothing as a secret.
        if (e.name === "node_modules" && installedTree(d)) {
          continue;
        }
        stack.push(p);
        continue;
      }
      if (!e.isFile()) {
        continue; // a link: its target is masked where it is in the project, absent otherwise
      }
      if (holdsSecret(p)) {
        masks.add(p);
      }
    }
  }
  return { ok: true, masks: [...masks].toSorted() };
}
