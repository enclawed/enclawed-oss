// What a later tool of the person runs without a decision: implicit execution
// caches and virtual environments' entry points and packages. One list for
// both enforcements: the name guard's supervisor inside every contained run but
// an install (./name-guard.ts nameGuardConfig, ./name-guard.c), and the
// host-side write decisions (../adapter/path-rules.ts): an agent's write there
// (a new file included) waits for a person. Deleting a cache plants nothing:
// not covered.

/**
 * Implicit execution caches: what a later tool of the person runs, or prefers
 * to its source, without any decision. Python's bytecode (a __pycache__
 * entry, any .pyc or .pyo, a PEP 582 __pypackages__ tree: python imports a
 * .pyc whose header matches the source's size and mtime), and the caches of
 * transpilers and bundlers whose contents a dev server executes
 * (node_modules/.cache: babel-loader, webpack, terser; node_modules/.vite;
 * .parcel-cache; .turbo, whose outputs are restored in place). Never written
 * by a contained run but an install (pip compiles its packages' bytecode).
 * Data-only caches (.pytest_cache, .mypy_cache, .eslintcache) are not listed.
 */
export const IMPLICIT_EXEC_CACHES = {
  dirs: ["__pycache__", "__pypackages__", ".parcel-cache", ".turbo"],
  suffixes: [".pyc", ".pyo"],
  pairs: [
    ["node_modules", ".cache"],
    ["node_modules", ".vite"],
    // A virtual environment's entry points by name, found at the start or not
    // (activate, pip, python: what the person runs next).
    [".venv", "bin"],
    [".venv", "Scripts"],
    ["venv", "bin"],
    ["venv", "Scripts"],

    // conda's activation hooks (etc/conda/activate.d).
    ["conda", "activate.d"],
    ["conda", "deactivate.d"],
    // yarn berry's own code in the project: the release yarn runs, its plugins
    // and the editor SDKs (wrappers an editor starts).
    [".yarn", "releases"],
    [".yarn", "plugins"],
    [".yarn", "sdks"],
    // Dev servers' caches of transformed code, reused without a rebuild.
    [".angular", "cache"],
    [".next", "cache"],
    // Nx's computation cache: outputs restored in place, as .turbo's.
    [".nx", "cache"],
  ] as [string, string][],
  // [a, b]: a name b anywhere below a name a. node_modules/.bin (and a nested
  // package's): the programs npx, npm run and an editor start by name.
  under: [["node_modules", ".bin"]] as [string, string][],
  // Settings a host tool reads from the project when it starts (clangd: a
  // build writes compile_commands.json, never .clangd).
  // yarn's Plug'n'Play loader: node runs it before the project's code.
  files: [".clangd", ".pnp.cjs", ".pnp.loader.mjs", ".pnp.data.json"],
} as const;

/**
 * Package-manager state: what the next run of any tool loads as installed
 * code, structurally (not cache by cache). Written only by an install (or a
 * person): never by a build, a test, a script a person approved or an MCP
 * server.
 *
 *   node_modules/**: every installed package (but a package's own build/
 *     tree: a native addon's outputs, node-gyp and cmake-js);
 *   dirs: yarn's state (.yarn: its cache zips PnP loads code from, unplugged,
 *     releases, plugins, sdks, patches, install-state), pnpm's store, Ruby's
 *     Bundler settings (.bundle), Maven's wrapper (.mvn), Cargo's
 *     configuration directory (.cargo);
 *   pairs: Bundler's installed gems (vendor/bundle), Gradle's wrapper
 *     (gradle/wrapper);
 *   prefixes: yarn's PnP loaders by any name (.pnp.js, .pnp.cjs, ...), pnpm's
 *     hooks (.pnpmfile.cjs, pnpmfile.js);
 *   files: JavaScript lockfiles (which package code an install fetches);
 *   a Composer project's vendor directory (vendor/autoload.php: every php run
 *     of the project loads it), found by its autoloader.
 *
 * Go's vendor/ (source an explicit go build reads) and Elixir's deps/ are not
 * listed: their contents are built by the explicit command, not loaded.
 */
export const PACKAGE_STATE = {
  nodeModules: true,
  dirs: [".yarn", ".pnpm-store", ".bundle", ".mvn", ".cargo"],
  pairs: [
    ["vendor", "bundle"],
    ["gradle", "wrapper"],
    // Composer's autoloader and its generated class maps, made or not yet.
    ["vendor", "autoload.php"],
    ["vendor", "composer"],
  ] as [string, string][],
  prefixes: [".pnp.", ".pnpmfile.", "pnpmfile."],
  files: [
    "package-lock.json",
    "npm-shrinkwrap.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "bun.lock",
    "bun.lockb",
  ],
} as const;

/** The components of `abs` from its last node_modules on: inside a package's own build/? */
function nodeModulesWrite(ps: readonly string[]): boolean {
  const j = ps.lastIndexOf("node_modules");
  if (j < 0) {
    return false;
  }
  const pkgEnd = ps[j + 1]?.startsWith("@") ? j + 2 : j + 1;
  return !(ps.length > pkgEnd + 1 && ps[pkgEnd + 1] === "build");
}

/**
 * Is writing `abs` writing package-manager state (PACKAGE_STATE)? `isComposerVendor`:
 * whether a directory named vendor holds Composer's autoloader.
 */
export function packageStateTarget(
  abs: string,
  isComposerVendor: (dir: string) => boolean = () => false,
): boolean {
  const ps = parts(abs);
  if (ps.length === 0) {
    return false;
  }
  if (nodeModulesWrite(ps)) {
    return true;
  }
  const dirs = lower(PACKAGE_STATE.dirs);
  for (let i = 0; i < ps.length; i++) {
    if (dirs.includes(ps[i])) {
      return true;
    }
    if (i > 0 && PACKAGE_STATE.pairs.some(([a, b]) => ps[i - 1] === a && ps[i] === b)) {
      return true;
    }
  }
  const last = ps[ps.length - 1];
  if (
    lower(PACKAGE_STATE.prefixes).some((p) => last.startsWith(p)) ||
    lower(PACKAGE_STATE.files).includes(last)
  ) {
    return true;
  }
  const comps = abs.split("/").filter((c) => c !== "" && c !== ".");
  for (let i = 1; i <= comps.length; i++) {
    if (
      comps[i - 1].toLowerCase() === "vendor" &&
      isComposerVendor(`/${comps.slice(0, i).join("/")}`)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * The files a protected yarn configuration names to run: .yarnrc.yml's
 * yarnPath (berry) and .yarnrc's yarn-path (classic), each resolved against
 * its file's directory, from the configurations in `dirs`. yarn runs that
 * file in place of itself.
 */
export function yarnPathTargets(
  dirs: readonly string[],
  read: (file: string) => string | null,
): string[] {
  const out = new Set<string>();
  for (const d of new Set(dirs)) {
    for (const [name, re] of [
      [".yarnrc.yml", /^\s*["']?yarnPath["']?\s*:\s*(.+?)\s*$/gm],
      [".yarnrc", /^\s*["']?yarn-path["']?\s+(.+?)\s*$/gm],
      // pnpm's hook file, run at every pnpm invocation (pnpm --version included).
      ["pnpm-workspace.yaml", /^\s*["']?(?:pnpmfile|globalPnpmfile)["']?\s*:\s*(.+?)\s*$/gm],
      [".npmrc", /^\s*(?:pnpmfile|global-pnpmfile)\s*=\s*(.+?)\s*$/gm],
    ] as const) {
      const text = read(`${d}/${name}`);
      if (text === null) {
        continue;
      }
      for (const m of text.matchAll(re)) {
        const v = m[1].replace(/\s+#.*$/, "").replace(/^(["'])(.*)\1$/, "$2");
        if (v) {
          out.add(v.startsWith("/") ? normalizeAbs(v) : normalizeAbs(`${d}/${v}`));
        }
      }
    }
  }
  return [...out].toSorted();
}

/** An absolute path with `.` and `..` taken as written (the configuration's own text). */
function normalizeAbs(p: string): string {
  const out: string[] = [];
  for (const c of p.split("/")) {
    if (c === "" || c === ".") {
      continue;
    }
    if (c === "..") {
      out.pop();
    } else {
      out.push(c);
    }
  }
  return `/${out.join("/")}`;
}

/**
 * A virtual environment's packages (lib/pythonX.Y/site-packages; Lib on
 * Windows), by name: a contained run of the environment's Python trusts them
 * as toolchain code, so no contained run but an install writes them (builds
 * and runs a person approved included). Every environment found at the start
 * (a directory holding pyvenv.cfg) is covered by path too (./name-guard.c).
 */
export const VENV_PACKAGE_PAIRS: readonly (readonly [string, string])[] = [
  [".venv", "lib"],
  [".venv", "lib64"],
  [".venv", "Lib"],
  ["venv", "lib"],
  ["venv", "lib64"],
  ["venv", "Lib"],
];

/** The components of an absolute path, as the name guard compares them (case-insensitive). */
function parts(abs: string): string[] {
  return abs
    .split("/")
    .filter((c) => c !== "" && c !== ".")
    .map((c) => c.toLowerCase());
}

const lower = (xs: readonly string[]) => xs.map((x) => x.toLowerCase());

/**
 * Is writing `abs` (a file or directory to create or change) writing an
 * implicit execution cache or a virtual environment's entry points or
 * packages (the name guard's rules, ./name-guard.c)? `isVenv`: whether a
 * directory is a virtual environment found on disk (holding pyvenv.cfg or
 * conda-meta), for environments not named .venv or venv.
 */
export function implicitExecTarget(
  abs: string,
  isVenv: (dir: string) => boolean = () => false,
): boolean {
  const ps = parts(abs);
  if (ps.length === 0) {
    return false;
  }
  const dirs = lower(IMPLICIT_EXEC_CACHES.dirs);
  const pairs = [...IMPLICIT_EXEC_CACHES.pairs, ...VENV_PACKAGE_PAIRS].map(([a, b]) => [
    a.toLowerCase(),
    b.toLowerCase(),
  ]);
  const under = IMPLICIT_EXEC_CACHES.under.map(([a, b]) => [a.toLowerCase(), b.toLowerCase()]);
  for (let i = 0; i < ps.length; i++) {
    if (dirs.includes(ps[i])) {
      return true;
    }
    if (i > 0 && pairs.some(([a, b]) => ps[i - 1] === a && ps[i] === b)) {
      return true;
    }
    if (under.some(([a, b]) => ps[i] === b && ps.slice(0, i).includes(a))) {
      return true;
    }
  }
  const last = ps[ps.length - 1];
  if (lower(IMPLICIT_EXEC_CACHES.files).includes(last)) {
    return true;
  }
  if (
    lower(IMPLICIT_EXEC_CACHES.suffixes).some((x) => last.length > x.length && last.endsWith(x))
  ) {
    return true;
  }
  if (last === "pyvenv.cfg") {
    return true; // a new virtual environment, or one changed
  }
  // A virtual environment found on disk: its entry points, packages and mark,
  // and the environment's directory itself.
  const comps = abs.split("/").filter((c) => c !== "" && c !== ".");
  for (let i = comps.length; i >= 1; i--) {
    const dir = `/${comps.slice(0, i).join("/")}`;
    if (isVenv(dir)) {
      const next = (comps[i] ?? "").toLowerCase();
      return (
        i === comps.length ||
        next === "bin" ||
        next === "scripts" ||
        next.startsWith("lib") ||
        next === "include" ||
        next === ".enclawed-tainted"
      );
    }
  }
  return false;
}
