// enclawed adapter kit: credentials the session's tools make stay in the session.
//
// An agent session runs command-line tools that log in and keep what they get: `gh auth login`
// (its hosts.yml or the OS keyring), git's credential store, `npm login` (.npmrc), the cloud CLIs
// (aws, gcloud, az), `docker login`, a kubeconfig, a key added to the ssh agent. Kept where those
// tools keep it by default, such a credential outlives the session and is usable by any process of
// the person's user, and by root, with no Enclawed in the way. With an Enclaweder bound
// (command set 0.5), therefore:
//
//   redirect   the session's tools are pointed (each through its own documented variable) at a
//              directory private to the session, mirrored on the home directory: seeded with a
//              copy of the person's own configuration (so what the person had keeps working), with
//              the credentials earlier sessions made opened over it from the store sealed under
//              the launch's tools box (credential-keys.ts boxes.tools: its own purpose), and with
//              the OS keyring out of reach (so a tool that would use it keeps its credential in the
//              redirected file instead);
//   seal       at the end of the session only what the session made or changed there is sealed
//              (the seed is not), with context-seal.ts's records, digest and audit binding, and the
//              directory is erased;
//   sweep      as a floor below the redirection, the person's own credential locations
//              (credentials.ts HOME_CREDENTIAL_PATHS) are snapshotted at launch, and the home
//              directory's dot-entries are indexed; at the end, a credential that appeared there
//              (by location, by name: credentialPathOf, or by content: secretContentOf) is sealed
//              into the store and erased, and a floor file the session changed is restored to
//              its bytes at launch (the session's version sealed). What was there before is never
//              removed. An identity added to the person's ssh agent during the session is
//              removed from it.
//
// What it does not do, said plainly: while the session runs, its credentials are plaintext in the
// session's directory and the tools' memory, which root can read; a credential the person writes
// into the swept locations from outside the session while it runs is taken as the session's (it
// is sealed, not lost); tools that keep credentials only in a platform store the session cannot
// redirect (the macOS Keychain) are outside this.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ContextBaseline, ContextLayout } from "./context-seal.js";
import { credentialFindings, credentialPathOf, HOME_CREDENTIAL_PATHS } from "./credentials.js";
import { secretContentOf } from "./secret-content.js";

/** A redirected tool: the variable that moves its store, and where under the mirrored home it points. */
export type ToolRedirect = Readonly<{
  tool: string;
  env: string;
  /** Relative to the (mirrored) home directory. */
  rel: string;
  /** What is seeded from the person's home: these relative paths, when present. */
  seed: readonly string[];
}>;

/** The tools and their documented variables. */
export const TOOL_REDIRECTS: readonly ToolRedirect[] = [
  { tool: "gh", env: "GH_CONFIG_DIR", rel: ".config/gh", seed: [".config/gh"] },
  { tool: "npm", env: "NPM_CONFIG_USERCONFIG", rel: ".npmrc", seed: [".npmrc"] },
  {
    tool: "aws",
    env: "AWS_SHARED_CREDENTIALS_FILE",
    rel: ".aws/credentials",
    seed: [".aws/credentials"],
  },
  { tool: "aws", env: "AWS_CONFIG_FILE", rel: ".aws/config", seed: [".aws/config"] },
  { tool: "gcloud", env: "CLOUDSDK_CONFIG", rel: ".config/gcloud", seed: [".config/gcloud"] },
  { tool: "az", env: "AZURE_CONFIG_DIR", rel: ".azure", seed: [".azure"] },
  { tool: "docker", env: "DOCKER_CONFIG", rel: ".docker", seed: [".docker/config.json"] },
  { tool: "kubectl", env: "KUBECONFIG", rel: ".kube/config", seed: [".kube/config"] },
  {
    tool: "huggingface",
    env: "HF_TOKEN_PATH",
    rel: ".cache/huggingface/token",
    seed: [".cache/huggingface/token"],
  },
  { tool: "terraform", env: "TF_CLI_CONFIG_FILE", rel: ".terraformrc", seed: [".terraformrc"] },
  { tool: "vault", env: "VAULT_CONFIG_PATH", rel: ".vault", seed: [".vault"] },
];

/** Git: a global config of the session's own that includes the person's, with a store of the session's. */
const GIT_CREDENTIALS = ".git-credentials";
const GIT_CONFIG = ".gitconfig-session";
/** The variables removed from the session's environment: the OS keyring (secret service) and the agent's own git config overrides. */
export const TOOL_ENV_REMOVED: readonly string[] = [
  "DBUS_SESSION_BUS_ADDRESS",
  "GIT_CONFIG_GLOBAL",
  "GNOME_KEYRING_CONTROL",
];

/** The tools store's layout (context-seal.ts): the mirrored names, and what the sweep found elsewhere. */
export const SWEPT = "swept";
export function toolCredentialLayout(): ContextLayout {
  const tops = new Set<string>([SWEPT, GIT_CREDENTIALS]);
  for (const r of TOOL_REDIRECTS) {
    tops.add(r.rel.split("/")[0]);
  }
  return { context: [...tops].toSorted(), linked: {}, copied: {} };
}

const SEED_FILE_MAX = 16 * 1024 * 1024;
const SEED_FILES_MAX = 2000;

/**
 * Seed the session's directory (opened by context-seal.ts openContextInto) with a copy of the
 * person's own configuration of each redirected tool: a path already opened from the store wins.
 * Returns the baseline extended by the seed, so that only what the session makes or changes is
 * sealed. Regular files only; links are not followed.
 */
export function seedToolCredentials(
  o: Readonly<{ dir: string; home: string; baseline: ContextBaseline }>,
): ContextBaseline {
  const files: Record<string, { sha256: string; blob: string }> = { ...o.baseline.files };
  let count = 0;
  const copy = (rel: string, depth: number) => {
    const src = path.join(o.home, ...rel.split("/"));
    let st: fs.Stats;
    try {
      st = fs.lstatSync(src);
    } catch {
      return;
    }
    if (st.isDirectory() && depth < 8) {
      for (const n of fs.readdirSync(src).toSorted()) {
        copy(`${rel}/${n}`, depth + 1);
      }
      return;
    }
    if (!st.isFile() || st.size > SEED_FILE_MAX || count >= SEED_FILES_MAX) {
      return;
    }
    const dst = path.join(o.dir, ...rel.split("/"));
    if (fs.existsSync(dst)) {
      return;
    }
    fs.mkdirSync(path.dirname(dst), { recursive: true, mode: 0o700 });
    const bytes = fs.readFileSync(src);
    fs.writeFileSync(dst, bytes, { mode: 0o600, flag: "wx" });
    files[rel] = { sha256: createHash("sha256").update(bytes).digest("hex"), blob: "" };
    bytes.fill(0);
    count++;
  };
  for (const r of TOOL_REDIRECTS) {
    for (const s of r.seed) {
      copy(s, 0);
    }
  }
  copy(GIT_CREDENTIALS, 0);
  const baseline = { files, superseded: o.baseline.superseded };
  const manifest = path.join(o.dir, ".enclawed-context.json");
  try {
    const m = JSON.parse(fs.readFileSync(manifest, "utf8")) as Record<string, unknown>;
    fs.writeFileSync(manifest, JSON.stringify({ ...m, baseline }), { mode: 0o600 });
  } catch {
    /* no manifest: nothing to keep in step */
  }
  return baseline;
}

/**
 * The session's environment for its tools: each redirected variable pointed into `dir`, git's
 * global config replaced by the session's own (which includes the person's, then keeps
 * credentials only in the session's store), and the OS keyring removed.
 */
export function toolCredentialEnv(
  o: Readonly<{ dir: string; home: string; env: Readonly<Record<string, string | undefined>> }>,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = { ...o.env };
  for (const name of TOOL_ENV_REMOVED) {
    delete out[name];
  }
  for (const r of TOOL_REDIRECTS) {
    out[r.env] = path.join(o.dir, ...r.rel.split("/"));
  }
  const gitconfig = path.join(o.dir, GIT_CONFIG);
  if (!fs.existsSync(gitconfig)) {
    const includes = [
      path.join(o.home, ".gitconfig"),
      path.join(o.home, ".config", "git", "config"),
    ]
      .filter((p) => fs.existsSync(p))
      .map((p) => `[include]\n\tpath = ${JSON.stringify(p)}\n`)
      .join("");
    // An empty helper resets every helper the person's config named: git then keeps (and reads)
    // credentials only in the session's store, seeded with a copy of the person's.
    const store = path.join(o.dir, GIT_CREDENTIALS);
    fs.writeFileSync(
      gitconfig,
      `${includes}[credential]\n\thelper =\n\thelper = ${JSON.stringify(`store --file=${store}`)}\n`,
      { mode: 0o600, flag: "wx" },
    );
  }
  out.GIT_CONFIG_GLOBAL = gitconfig;
  return out;
}

// ---- the floor: the person's own credential locations, and the home directory's dot-entries ----

type FloorEntry = Readonly<{ sha256: string; bytes: Buffer | null }>;
type IndexEntry = Readonly<{ mtimeMs: number; size: number; ino: number }>;

/** The person's credential locations and home dot-entries as found at launch. */
export type CredentialFloor = Readonly<{
  home: string;
  /** Files below HOME_CREDENTIAL_PATHS: their digest and (small ones) bytes, to restore. */
  floor: ReadonlyMap<string, FloorEntry>;
  /** Every other file below the home directory's dot-entries (bounded): its stat. */
  index: ReadonlyMap<string, IndexEntry>;
}>;

/** Dot-entries never indexed: caches and stores of other kinds, and the host's own state (never touched). */
const INDEX_SKIP = new Set([
  ".cache",
  ".npm",
  ".pnpm-store",
  ".local",
  ".vscode-server",
  ".vscode",
  ".cursor-server",
  ".rustup",
  ".nvm",
  ".bun",
  ".deno",
  ".gradle",
  ".m2",
  ".cargo",
  ".pyenv",
  ".conda",
  ".mozilla",
  ".java",
  ".dotnet",
]);
const INDEX_MAX = 20_000;
const INDEX_DEPTH = 4;
const RESTORE_MAX = 4 * 1024 * 1024;
/**
 * The floor's locations: HOME_CREDENTIAL_PATHS without the stores that change on their own in
 * ordinary use (gpg's state, the desktop keyrings, password managers' stores): restoring those to
 * their bytes at launch would undo the person's own work, and the session cannot reach the keyring
 * (its bus is removed) or is not given them.
 */
export const FLOOR_PATHS: readonly string[] = HOME_CREDENTIAL_PATHS.filter(
  (p) => ![".gnupg", ".local/share/keyrings", ".password-store", ".config/op"].includes(p),
);

function walkFiles(
  root: string,
  rel: string,
  depth: number,
  out: (rel: string, st: fs.Stats) => boolean,
): void {
  let st: fs.Stats;
  try {
    st = fs.lstatSync(path.join(root, ...rel.split("/")));
  } catch {
    return;
  }
  if (st.isDirectory()) {
    if (depth >= INDEX_DEPTH) {
      return;
    }
    let names: string[] = [];
    try {
      names = fs.readdirSync(path.join(root, ...rel.split("/")));
    } catch {
      return;
    }
    for (const n of names.toSorted()) {
      if (n === "node_modules" || n === ".git") {
        continue;
      }
      walkFiles(root, `${rel}/${n}`, depth + 1, out);
    }
  } else if (st.isFile()) {
    out(rel, st);
  }
}

/**
 * Snapshot the floor at launch. `excluded`: names at the top of the home directory that are never
 * indexed or swept (the host's own state directories, Enclawed's state).
 */
export function snapshotCredentialFloor(
  o: Readonly<{ home: string; excluded: readonly string[] }>,
): CredentialFloor {
  const floor = new Map<string, FloorEntry>();
  const index = new Map<string, IndexEntry>();
  const floorTops = new Set(FLOOR_PATHS);
  for (const fp of FLOOR_PATHS) {
    walkFiles(o.home, fp, 0, (rel, st) => {
      const bytes = fs.readFileSync(path.join(o.home, ...rel.split("/")));
      floor.set(rel, {
        sha256: createHash("sha256").update(bytes).digest("hex"),
        bytes: st.size <= RESTORE_MAX ? bytes : null,
      });
      return true;
    });
  }
  let names: string[] = [];
  try {
    names = fs.readdirSync(o.home);
  } catch {
    names = [];
  }
  for (const n of names.toSorted()) {
    if (!n.startsWith(".") || INDEX_SKIP.has(n) || o.excluded.includes(n)) {
      continue;
    }
    walkFiles(o.home, n, 0, (rel, st) => {
      if (index.size >= INDEX_MAX || floorTops.has(rel)) {
        return false;
      }
      index.set(rel, { mtimeMs: st.mtimeMs, size: st.size, ino: st.ino });
      return true;
    });
  }
  return { home: o.home, floor, index };
}

/** Whether `rel` is below one of the floor's locations. */
const underFloor = (rel: string) =>
  HOME_CREDENTIAL_PATHS.some((fp) => rel === fp || rel.startsWith(`${fp}/`));
const underSweptFloor = (rel: string) =>
  FLOOR_PATHS.some((fp) => rel === fp || rel.startsWith(`${fp}/`));

export type SweepFinding = Readonly<{
  rel: string;
  /** "new": appeared during the session; "changed": a floor file the session changed (restored). */
  change: "new" | "changed" | "changed-unrestorable";
  why: string;
}>;

/**
 * At the end of the session: what appeared in the floor or the dot-entries that is a credential
 * (by location, name or content), and the floor files that changed. Each new one is copied into
 * `into` (the session's tools directory, under `swept/`, to be sealed with it) and erased from the
 * home directory; each changed floor file is copied likewise and restored to its bytes at launch
 * (one too large to have been kept is reported, never erased). Nothing that existed at launch is
 * removed. `excluded` as for the snapshot.
 */
export function sweepCredentialFloor(
  o: Readonly<{ snapshot: CredentialFloor; into: string; excluded: readonly string[] }>,
): SweepFinding[] {
  const home = o.snapshot.home;
  const found: SweepFinding[] = [];
  const keep = (rel: string, bytes: Buffer) => {
    const dst = path.join(o.into, SWEPT, ...rel.split("/"));
    fs.mkdirSync(path.dirname(dst), { recursive: true, mode: 0o700 });
    fs.writeFileSync(dst, bytes, { mode: 0o600 });
  };
  const eraseOne = (abs: string) => {
    try {
      const st = fs.lstatSync(abs);
      if (st.isFile()) {
        const fd = fs.openSync(abs, fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW);
        try {
          fs.writeSync(fd, Buffer.alloc(Math.max(st.size, 1)), 0, Math.max(st.size, 1), 0);
        } finally {
          fs.closeSync(fd);
        }
      }
      fs.unlinkSync(abs);
    } catch {
      /* reported by the caller's next sweep */
    }
  };
  const credentialWhy = (rel: string, abs: string): string | null => {
    if (underSweptFloor(rel)) {
      return "a credential location";
    }
    const byName = credentialPathOf(abs, home);
    if (byName) {
      return byName.what;
    }
    return secretContentOf(abs, credentialFindings);
  };
  // The floor: new files, and changed ones (restored).
  for (const fp of FLOOR_PATHS) {
    walkFiles(home, fp, 0, (rel) => {
      const abs = path.join(home, ...rel.split("/"));
      let bytes: Buffer;
      try {
        const fd = fs.openSync(abs, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        try {
          bytes = fs.readFileSync(fd);
        } finally {
          fs.closeSync(fd);
        }
      } catch {
        return true;
      }
      const was = o.snapshot.floor.get(rel);
      const sha = createHash("sha256").update(bytes).digest("hex");
      if (!was) {
        keep(rel, bytes);
        eraseOne(abs);
        found.push({ rel, change: "new", why: "a credential location" });
      } else if (was.sha256 !== sha) {
        keep(rel, bytes);
        if (was.bytes) {
          fs.writeFileSync(abs, was.bytes);
          found.push({ rel, change: "changed", why: "a credential location" });
        } else {
          found.push({ rel, change: "changed-unrestorable", why: "a credential location" });
        }
      }
      bytes.fill(0);
      return true;
    });
  }
  // The dot-entries: new files that are credentials by name or content.
  let names: string[] = [];
  try {
    names = fs.readdirSync(home);
  } catch {
    names = [];
  }
  for (const n of names.toSorted()) {
    if (!n.startsWith(".") || INDEX_SKIP.has(n) || o.excluded.includes(n)) {
      continue;
    }
    walkFiles(home, n, 0, (rel, st) => {
      if (underFloor(rel) || o.snapshot.index.has(rel)) {
        const was = o.snapshot.index.get(rel);
        if (was && (was.mtimeMs !== st.mtimeMs || was.size !== st.size)) {
          const abs = path.join(home, ...rel.split("/"));
          const why = !underFloor(rel) ? secretContentOf(abs, credentialFindings) : null;
          if (why) {
            found.push({ rel, change: "changed-unrestorable", why });
          }
        }
        return true;
      }
      const abs = path.join(home, ...rel.split("/"));
      const why = credentialWhy(rel, abs);
      if (why) {
        const bytes = fs.readFileSync(abs);
        keep(rel, bytes);
        bytes.fill(0);
        eraseOne(abs);
        found.push({ rel, change: "new", why });
      }
      return true;
    });
  }
  return found.toSorted((a, b) => (a.rel < b.rel ? -1 : 1));
}

// ---- the ssh agent ----

/** The identities the ssh agent at `env.SSH_AUTH_SOCK` holds (public key lines), or null (no agent). */
export function sshAgentIdentities(
  env: Readonly<Record<string, string | undefined>>,
): string[] | null {
  if (!env.SSH_AUTH_SOCK) {
    return null;
  }
  const r = spawnSync("ssh-add", ["-L"], {
    env: { PATH: env.PATH ?? process.env.PATH, SSH_AUTH_SOCK: env.SSH_AUTH_SOCK },
    encoding: "utf8",
    timeout: 10_000,
  });
  if (r.error || (r.status !== 0 && r.status !== 1)) {
    return null;
  }
  return (r.stdout ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^(ssh-|ecdsa-|sk-)/.test(l))
    .toSorted();
}

/**
 * Remove from the agent the identities it holds now that it did not hold at launch (`before`).
 * Returns the removed key types and fingerprints (never key material), and those it could not remove.
 */
export function removeAddedSshIdentities(
  env: Readonly<Record<string, string | undefined>>,
  before: readonly string[] | null,
): { removed: string[]; failed: string[] } {
  const now = sshAgentIdentities(env);
  if (!now || before === null) {
    return { removed: [], failed: [] };
  }
  const had = new Set(before);
  const removed: string[] = [];
  const failed: string[] = [];
  for (const line of now.filter((l) => !had.has(l))) {
    const [type, b64] = line.split(/\s+/);
    const fp = `${type} SHA256:${createHash("sha256")
      .update(Buffer.from(b64 ?? "", "base64"))
      .digest("base64")
      .replace(/=+$/, "")}`;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-ssh-"));
    const pub = path.join(tmp, "k.pub");
    fs.writeFileSync(pub, `${type} ${b64}\n`, { mode: 0o600 });
    const r = spawnSync("ssh-add", ["-d", pub], {
      env: { PATH: env.PATH ?? process.env.PATH, SSH_AUTH_SOCK: env.SSH_AUTH_SOCK },
      encoding: "utf8",
      timeout: 10_000,
    });
    fs.rmSync(tmp, { recursive: true, force: true });
    (r.status === 0 ? removed : failed).push(fp);
  }
  return { removed, failed };
}
