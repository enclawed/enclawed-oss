// Contained builds: what a build tool's run gets inside the containment.
//
// A build (cmake, make, ninja, meson, ctest, cargo, go) runs code Enclawed
// does not read: the project's build scripts (CMakeLists.txt, Makefiles,
// build.rs, ...), the compilers and what they generate. Code pins cannot
// apply, so a build runs in the containment's unpinned form, with every
// protection of the containment layer itself kept and tightened where an
// unread program could otherwise leave something that runs later on the
// host (./plan.ts `build`, ./name-guard.ts buildNameGuardNames):
//
//   - no network at all (no destination, not even the project policy's);
//   - writes only to the project (snapshotted first by the engine) and the
//     run's own private /tmp and HOME, which are discarded with it;
//   - the files that configure what runs later refused by name everywhere in
//     the project, dependency trees (node_modules, virtual environments)
//     included, and in build mode also: every path inside any .git directory,
//     package.json (its scripts run at a later install), and .pth files;
//   - the project's secret files masked (they read as empty);
//   - git's history read-only; no ptrace or cross-process memory access; a
//     read-only /proc; every process of the run killed when it ends.
//
// Kept small and free of heavy imports: the engine's decision path reads it.

import fs from "node:fs";
import path from "node:path";

/** Directories the containment finds programs in (./plan.ts PROGRAM_DIRS). */
export const BUILD_PROGRAM_DIRS = ["/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"];

/**
 * The toolchain a build may run besides the project-script tools: build
 * systems, compilers, binutils and what build scripts commonly call. A name
 * this host does not have is left out; a build that needs something missing
 * fails, which changes nothing.
 */
export const BUILD_TOOLCHAIN_PROGRAMS = [
  "cmake",
  "ctest",
  "cpack",
  "make",
  "gmake",
  "ninja",
  "ninja-build",
  "samu",
  "meson",
  "cargo",
  "rustc",
  "rustdoc",
  "cargo-clippy",
  "clippy-driver",
  "rustfmt",
  "cargo-fmt",
  "go",
  "gofmt",
  "cc",
  "c++",
  "cpp",
  "gcc",
  "g++",
  "clang",
  "clang++",
  "gfortran",
  "f95",
  "ld",
  "ld.bfd",
  "ld.gold",
  "ld.lld",
  "lld",
  "as",
  "ar",
  "ranlib",
  "nm",
  "objcopy",
  "objdump",
  "strip",
  "readelf",
  "size",
  "strings",
  "c++filt",
  "addr2line",
  "gcc-ar",
  "gcc-nm",
  "gcc-ranlib",
  "pkg-config",
  "pkgconf",
  "python3",
  "perl",
  "install",
  "m4",
  "bison",
  "flex",
  "patch",
  "file",
  "nproc",
  "getconf",
  "hostname",
  "git",
  "ccache",
];

/**
 * The read-only system trees a toolchain loads besides its programs' own
 * libraries: headers, compiler internals (cc1, collect2, crt files, libgcc),
 * static and shared libraries, CMake's modules and package files.
 */
export const BUILD_TOOLCHAIN_DIRS = [
  // Every system program: a build runs code nobody read anyway, so the
  // program allowlist protects nothing in this form; what protects is the
  // containment (no network, the name guard, history). Contained runs with
  // code pins keep their exact program list and interpreter wrappers.
  "/usr/bin",
  "/usr/sbin",
  "/usr/include",
  "/usr/lib",
  "/usr/lib32",
  "/usr/lib64",
  "/usr/libexec",
  "/usr/share",
];

/**
 * Where vendor toolchains install themselves (CUDA in /usr/local/cuda-*,
 * MPICH or Open MPI in /usr/local/<name>, /opt/rocm, /opt/intel,
 * /opt/nvidia/hpc_sdk): each entry of these directories is offered to a
 * build read-only, a link (/usr/local/cuda -> /etc/alternatives/cuda ->
 * /usr/local/cuda-13.1) with the links it goes through, unless it holds a
 * file that may hold a credential (buildToolchainTrees). /usr/local/etc and
 * /usr/local/src are configuration and sources, not toolchains: never.
 */
export const BUILD_TOOLCHAIN_PARENTS = ["/usr/local", "/opt"];
const NOT_TOOLCHAIN = new Set(["etc", "src", "games"]);

/** Environment of every contained build: the tools that could reach the network told they cannot. */
export const BUILD_ENV: Readonly<Record<string, string>> = {
  CARGO_NET_OFFLINE: "true",
  GOPROXY: "off",
  GOTOOLCHAIN: "local",
  GOFLAGS: "-mod=readonly",
};

/** Mount points of this host (from /proc/self/mountinfo), or null when they cannot be read. */
function hostMountPoints(): string[] | null {
  try {
    return fs
      .readFileSync("/proc/self/mountinfo", "utf8")
      .split("\n")
      .map((l) => l.split(" ")[4])
      .filter((p): p is string => typeof p === "string" && p.startsWith("/"))
      .map((p) => p.replace(/\\040/g, " "));
  } catch {
    return null;
  }
}

/**
 * The toolchain trees of this host as directories to bind read-only. A tree
 * with another file system mounted below it (WSL mounts its GPU drivers under
 * /usr/lib) cannot be bound whole from a user namespace (the kernel refuses
 * a bind that would uncover what the inner mount hides): its subdirectories
 * are bound instead, each one holding a mount point split again, and the
 * mount points themselves are left out. Files directly in such a tree are
 * left out too (a build that needs one fails, which changes nothing).
 */
export function buildToolchainDirs(dirs: readonly string[] = BUILD_TOOLCHAIN_DIRS): string[] {
  const mounts = hostMountPoints() ?? [];
  const isDir = (p: string) => {
    try {
      return fs.lstatSync(p).isDirectory();
    } catch {
      return false;
    }
  };
  const out: string[] = [];
  const add = (d: string, depth: number) => {
    if (!isDir(d) || mounts.includes(d)) {
      return;
    }
    if (!mounts.some((m) => m.startsWith(`${d}/`))) {
      out.push(d);
      return;
    }
    if (depth > 4) {
      return;
    }
    let names: string[] = [];
    try {
      names = fs.readdirSync(d).toSorted();
    } catch {
      return;
    }
    for (const n of names) {
      add(path.join(d, n), depth + 1);
    }
  };
  for (const d of dirs) {
    add(d, 0);
  }
  return out;
}

/**
 * A file name that may hold a credential (private keys, key stores, token
 * files, environment files): a tree holding one is not offered to a build.
 * A .pem or .key file only when it holds a private key (toolchains ship CA
 * bundles and public certificates).
 */
const CREDENTIAL_NAME =
  /^(?:\.env(?:\..+)?|id_(?:rsa|dsa|ecdsa|ed25519|xmss)(?:_sk)?|\.netrc|\.pgpass|\.git-credentials|\.npmrc|\.pypirc|\.htpasswd|credentials(?:\.json|\.toml|\.yml|\.yaml)?|.*\.(?:p12|pfx|jks|keystore|kdbx|ppk|ovpn|gpg))$/i;
const KEY_FILE = /\.(?:pem|key)$/i;

/** Whether `p` (a file) may hold a credential, by its name (and, for .pem/.key, a private key in it). */
function credentialFile(p: string): boolean {
  const base = path.basename(p);
  if (/\.env\.(?:example|sample|template|dist|defaults)$/i.test(base)) {
    return false;
  }
  if (CREDENTIAL_NAME.test(base)) {
    return true;
  }
  if (KEY_FILE.test(base)) {
    try {
      const fd = fs.openSync(p, "r");
      try {
        const buf = Buffer.alloc(64 * 1024);
        const n = fs.readSync(fd, buf, 0, buf.length, 0);
        return /PRIVATE KEY/.test(buf.subarray(0, n).toString("latin1"));
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      return true; // unreadable here: not known to be harmless
    }
  }
  return false;
}

/** A tree that holds no credential file (bounded walk, links not followed); false when too large to tell. */
function credentialFree(root: string, maxEntries = 400_000): boolean {
  let left = maxEntries;
  const stack = [root];
  while (stack.length) {
    const d = stack.pop() as string;
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      continue; // unreadable to this user: unreadable inside too
    }
    for (const e of ents) {
      if (--left < 0) {
        return false;
      }
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        stack.push(p);
      } else if (e.isFile() && credentialFile(p)) {
        return false;
      }
    }
  }
  return true;
}

const treeVerdicts = new Map<string, boolean>();

/**
 * The vendor toolchain trees offered to a build (BUILD_TOOLCHAIN_PARENTS):
 * each directory entry (bound read-only as it is) and each link to a
 * directory (shown with its chain of links), when the tree it leads to holds
 * no credential file. Walked once per process.
 */
export function buildToolchainTrees(
  parents: readonly string[] = BUILD_TOOLCHAIN_PARENTS,
): string[] {
  const out: string[] = [];
  for (const parent of parents) {
    let names: string[] = [];
    try {
      names = fs.readdirSync(parent).toSorted();
    } catch {
      continue;
    }
    for (const n of names) {
      const p = path.join(parent, n);
      if (NOT_TOOLCHAIN.has(n)) {
        continue;
      }
      let real: string;
      try {
        real = fs.realpathSync(p);
        if (!fs.statSync(real).isDirectory()) {
          continue;
        }
      } catch {
        continue; // a dangling link
      }
      // A link must lead to a vendor tree or a system tree, never into a home or the system's configuration.
      if (
        ![...parents, "/usr"].some((x) => real.startsWith(`${x}/`)) ||
        ["/usr/local/etc", "/usr/local/src", ...parents.map((x) => path.join(x, "etc"))].some(
          (x) => real === x || real.startsWith(`${x}/`),
        )
      ) {
        continue;
      }
      let ok = treeVerdicts.get(real);
      if (ok === undefined) {
        ok = credentialFree(real);
        treeVerdicts.set(real, ok);
      }
      if (ok) {
        out.push(p);
      }
    }
  }
  return out;
}

/** The program directories of the vendor trees a build sees (each tree's bin), for its PATH. */
export function buildToolchainPath(trees: readonly string[]): string[] {
  const dirs = trees.flatMap((t) => (/\/s?bin$/.test(t) ? [t] : [path.join(t, "bin")]));
  return [...new Set(dirs)].filter((b) => {
    try {
      return fs.statSync(b).isDirectory();
    } catch {
      return false;
    }
  });
}

// ─── GPU access for a contained build (per-project grant) ───────────────

/**
 * The device nodes a GPU grant may show a contained build, and the driver
 * directories (read-only) the user-space driver loads from:
 *
 *   WSL:            /dev/dxg (the Windows GPU paravirtualization device),
 *                   /usr/lib/wsl/lib (libcuda, libdxcore, libd3d12) and
 *                   /usr/lib/wsl/drivers (the driver store);
 *   NVIDIA (Linux): /dev/nvidia[0-9]*, /dev/nvidiactl, /dev/nvidia-uvm,
 *                   /dev/nvidia-uvm-tools, /dev/nvidia-modeset,
 *                   /dev/nvidia-caps/*;
 *   DRM:            render nodes only (/dev/dri/renderD*), never the
 *                   display (card*) nodes.
 *
 * Device nodes give no file and no network access, but they reach the GPU
 * kernel driver (on WSL, through the hypervisor to the Windows host's
 * graphics driver): code in the build can use the GPU and the driver's full
 * request surface. So they are shown only to a contained build of a project
 * the person granted GPU use (never to a run with code pins, never by an
 * environment variable or a project file).
 */
export const GPU_DEVICE =
  /^\/dev\/(?:dxg|nvidia\d+|nvidiactl|nvidia-uvm|nvidia-uvm-tools|nvidia-modeset|nvidia-caps\/nvidia-cap\d+|dri\/renderD\d+)$/;
export const GPU_DRIVER_DIRS = ["/usr/lib/wsl/lib", "/usr/lib/wsl/drivers"];

export type HostGpu = Readonly<{ devices: readonly string[]; dirs: readonly string[] }>;

/** The GPU device nodes and driver directories this host has (empty when it has none). */
export function hostGpu(): HostGpu {
  const devices: string[] = [];
  const add = (p: string) => {
    try {
      if (GPU_DEVICE.test(p) && fs.statSync(p).isCharacterDevice()) {
        devices.push(p);
      }
    } catch {
      /* absent */
    }
  };
  add("/dev/dxg");
  for (const [dir, prefix] of [
    ["/dev", "/dev/"],
    ["/dev/nvidia-caps", "/dev/nvidia-caps/"],
    ["/dev/dri", "/dev/dri/"],
  ] as const) {
    let names: string[] = [];
    try {
      names = fs.readdirSync(dir).toSorted();
    } catch {
      continue;
    }
    for (const n of names) {
      if (prefix + n !== "/dev/dxg") {
        add(prefix + n);
      }
    }
  }
  const dirs = GPU_DRIVER_DIRS.filter((d) => {
    try {
      return fs.statSync(d).isDirectory();
    } catch {
      return false;
    }
  });
  return { devices, dirs: devices.length ? dirs : [] };
}

/** What a contained build without the GPU grant says when it fails on a host that has a GPU. */
export const NO_GPU_NOTICE =
  "this build ran without the GPU: the contained build shows no GPU device unless the person granted GPU use for this project";
