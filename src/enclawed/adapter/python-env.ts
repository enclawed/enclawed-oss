// enclawed adapter kit: what a Python environment and a deno lock install,
// checked by content (./runner-pins.ts, ./code-pins.ts).

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { McpServerDefinition } from "./contracts.js";
import { cachedSha256, treeDigest, type TreeHashCache } from "./tree-digest.js";

export const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

export function canonical(v: unknown): string {
  if (Array.isArray(v)) {
    return `[${v.map(canonical).join(",")}]`;
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .toSorted()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

export function readJson(p: string, loose = false): Record<string, unknown> | null {
  try {
    let text = fs.readFileSync(p, "utf8");
    if (loose) {
      // bun.lock is JSON with trailing commas.
      text = text.replace(/,(\s*[}\]])/g, "$1");
    }
    const v: unknown = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const normName = (n: string) => n.toLowerCase().replace(/[-_.]+/g, "_");

export type RecordEntry = Readonly<{ rel: string; algo: string; hash: string }>;

export function parseRecord(text: string): RecordEntry[] {
  const out: RecordEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    // path,algo=b64hash,size (a path may be quoted with commas inside)
    const m = /^(?:"((?:[^"]|"")*)"|([^,]*)),([^,]*),([^,]*)$/.exec(line);
    if (!m) {
      throw new Error(`a RECORD line is malformed: ${line.slice(0, 120)}`);
    }
    const rel = m[1] !== undefined ? m[1].replaceAll('""', '"') : (m[2] ?? "");
    const [algo, hash] = (m[3] ?? "").split("=", 2);
    out.push({ rel, algo: algo ?? "", hash: hash ?? "" });
  }
  return out;
}

export const b64urlDigest = (algo: string, buf: Buffer) =>
  createHash(algo)
    .update(buf)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/**
 * Every distribution in `site` checked against its RECORD (each hashed file
 * has its recorded hash), and no file Python would load that no RECORD lists
 * (a stray .pth or module runs at startup). Returns the distributions, or
 * throws why the tree is not what was installed.
 */
export function verifySitePackages(
  site: string,
  cache?: TreeHashCache,
): { name: string; version: string; record: string }[] {
  const listed = new Set<string>();
  const dists: { name: string; version: string; record: string }[] = [];
  for (const d of fs.readdirSync(site).toSorted()) {
    const m = /^(.+)-([^-]+)\.dist-info$/.exec(d);
    if (!m) {
      continue;
    }
    const recordPath = path.join(site, d, "RECORD");
    const text = fs.readFileSync(recordPath, "utf8");
    for (const e of parseRecord(text)) {
      const abs = path.resolve(site, e.rel);
      listed.add(abs);
      if (!e.hash) {
        continue; // RECORD itself, bytecode
      }
      if (e.algo !== "sha256" && e.algo !== "sha384" && e.algo !== "sha512") {
        throw new Error(`${d} records ${e.rel} with the hash ${e.algo}, which is not accepted`);
      }
      let got: string;
      try {
        // sha256 (nearly every RECORD) goes through the hash cache.
        got =
          e.algo === "sha256"
            ? Buffer.from(cachedSha256(abs, cache), "hex").toString("base64url")
            : b64urlDigest(e.algo, fs.readFileSync(abs));
      } catch {
        throw new Error(`${e.rel} of ${d} is missing`);
      }
      if (got !== e.hash) {
        throw new Error(
          `${e.rel} of ${d} is not the installed file (its hash differs from RECORD)`,
        );
      }
    }
    dists.push({ name: normName(m[1]), version: m[2], record: sha256(text) });
  }
  const walk = (p: string) => {
    for (const n of fs.readdirSync(p)) {
      const abs = path.join(p, n);
      const st = fs.lstatSync(abs);
      if (st.isDirectory()) {
        if (n !== "__pycache__") {
          walk(abs);
        }
      } else if (!listed.has(abs) && !n.endsWith(".pyc") && !/^_virtualenv\.(pth|py)$/.test(n)) {
        throw new Error(
          `${path.relative(site, abs)} is in the environment but no installed distribution lists it`,
        );
      }
    }
  };
  walk(site);
  return dists;
}

/** The site-packages directory of a Python environment, or null. */
export function sitePackagesIn(env: string): string | null {
  for (const lib of ["lib", "lib64", "Lib"]) {
    let entries: string[];
    try {
      entries = fs.readdirSync(path.join(env, lib));
    } catch {
      continue;
    }
    for (const e of entries.toSorted()) {
      const site = path.join(env, lib, e, "site-packages");
      if (/^python\d/.test(e) && fs.existsSync(site)) {
        return site;
      }
    }
    if (fs.existsSync(path.join(env, lib, "site-packages"))) {
      return path.join(env, lib, "site-packages");
    }
  }
  return null;
}

// ─── deno ───────────────────────────────────────────────────────────────

/** The npm packages a deno.lock names, each measured in deno's npm cache. Throws when one is missing. */
export function denoLockedNpm(
  lockFile: string,
  denoDir: string,
  cache?: TreeHashCache,
): { lockDigest: string; packages: number } {
  const lock = readJson(lockFile);
  if (!lock) {
    throw new Error(`${lockFile} is not a deno lock file`);
  }
  const npm = (lock.npm ?? {}) as Record<string, { integrity?: unknown }>;
  const cached: Record<string, string> = {};
  for (const key of Object.keys(npm).toSorted()) {
    // "name@version" or "name@version_peer..." (the version is before the first "_").
    const m = /^(@?[^@]+)@([^_]+)/.exec(key);
    if (!m) {
      throw new Error(`deno.lock names an npm package it does not spell: ${key.slice(0, 80)}`);
    }
    const dirs: string[] = [];
    let registries: string[] = [];
    try {
      registries = fs.readdirSync(path.join(denoDir, "npm"));
    } catch {
      /* none */
    }
    for (const reg of registries) {
      const d = path.join(denoDir, "npm", reg, m[1], m[2]);
      if (fs.existsSync(d)) {
        dirs.push(d);
      }
    }
    if (dirs.length === 0) {
      throw new Error(
        `${m[1]}@${m[2]} (in deno.lock) is not in deno's npm cache; run the server once with deno, then pin`,
      );
    }
    const digests = new Set(dirs.map((d) => treeDigest(d, { cache }).digest));
    if (digests.size > 1) {
      throw new Error(`deno's npm cache holds different copies of ${m[1]}@${m[2]}`);
    }
    const integrity = npm[key]?.integrity;
    cached[key] = `${typeof integrity === "string" ? integrity : ""} ${[...digests][0]}`;
  }
  return {
    lockDigest: sha256(canonical({ lock: sha256(fs.readFileSync(lockFile)), cached })),
    packages: Object.keys(cached).length,
  };
}

/** The lock file a deno definition uses (--lock[=file], else deno.lock beside its config), or null; "off" when remote imports are switched off. */
const argsOf = (def: McpServerDefinition) => (def.args ?? []).map(String);

export function denoLockOf(def: McpServerDefinition, root: string, cwd: string): string | null {
  const args = argsOf(def);
  if (args.includes("--no-lock")) {
    return null;
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--lock=")) {
      return path.resolve(cwd, a.slice(7));
    }
    if (
      a === "--lock" &&
      args[i + 1] &&
      !args[i + 1].startsWith("-") &&
      /\.(lock|json)$/.test(args[i + 1])
    ) {
      return path.resolve(cwd, args[i + 1]);
    }
  }
  const lock = path.join(root, "deno.lock");
  if (fs.existsSync(lock)) {
    return lock;
  }
  return args.includes("--no-remote") && args.includes("--no-npm") ? "off" : null;
}

/** Where deno's HTTP cache keeps a URL's module: remote/<scheme>/<host[_PORTn]>/<sha256 of path?query>. */
export function denoRemoteCacheFile(denoDir: string, url: string): string {
  const u = new URL(url);
  const host = u.port ? `${u.hostname}_PORT${u.port}` : u.hostname;
  const rest = `${u.pathname}${u.search}`;
  return path.join(denoDir, "remote", u.protocol.replace(/:$/, ""), host, sha256(rest));
}

const DENO_META = Buffer.from("\n// denoCacheMetadata=");

/** A cached remote module's body (deno appends its metadata to the file), or null when it is not cached. */
function denoCachedBody(denoDir: string, url: string): Buffer | null {
  let buf: Buffer;
  try {
    buf = fs.readFileSync(denoRemoteCacheFile(denoDir, url));
  } catch {
    return null;
  }
  const at = buf.lastIndexOf(DENO_META);
  return at >= 0 ? buf.subarray(0, at) : buf;
}

/**
 * Every remote module a deno.lock names, measured in deno's own cache
 * independently of deno: each `remote` URL's cached body has the lock's
 * SHA-256; each `jsr` package's version metadata has the lock's integrity,
 * and every file of the package that is cached has the metadata's checksum.
 * Throws when a locked module is not cached or a cached one differs. (The
 * launcher starts deno with its cache only, so nothing uncached loads.)
 */
export function denoLockedRemote(
  lockFile: string,
  denoDir: string,
  jsrUrl = "https://jsr.io/",
): { remoteDigest: string; modules: number } {
  const lock = readJson(lockFile);
  if (!lock) {
    throw new Error(`${lockFile} is not a deno lock file`);
  }
  const seen: Record<string, string> = {};
  const remote = (lock.remote ?? {}) as Record<string, unknown>;
  for (const url of Object.keys(remote).toSorted()) {
    const want = remote[url];
    if (typeof want !== "string" || !/^[0-9a-f]{64}$/.test(want)) {
      throw new Error(`deno.lock records ${url.slice(0, 200)} without a SHA-256`);
    }
    const body = denoCachedBody(denoDir, url);
    if (!body) {
      throw new Error(
        `${url.slice(0, 200)} (in deno.lock) is not in deno's cache; run the server once with deno, then pin`,
      );
    }
    if (sha256(body) !== want) {
      throw new Error(
        `deno's cached ${url.slice(0, 200)} is not the module deno.lock records (its hash differs)`,
      );
    }
    seen[url] = want;
  }
  const jsr = (lock.jsr ?? {}) as Record<string, { integrity?: unknown }>;
  const base = jsrUrl.replace(/\/?$/, "/");
  for (const key of Object.keys(jsr).toSorted()) {
    const m = /^(@[^/@]+\/[^/@]+)@([^@/_]+)/.exec(key);
    const integrity = jsr[key]?.integrity;
    if (!m || typeof integrity !== "string" || !/^[0-9a-f]{64}$/.test(integrity)) {
      throw new Error(`deno.lock names a jsr package it does not spell: ${key.slice(0, 80)}`);
    }
    const pkgBase = `${base}${m[1]}/${m[2]}`;
    const metaUrl = `${pkgBase}_meta.json`;
    const meta = denoCachedBody(denoDir, metaUrl);
    if (!meta) {
      throw new Error(
        `${m[1]}@${m[2]} (in deno.lock) is not in deno's cache; run the server once with deno, then pin`,
      );
    }
    if (sha256(meta) !== integrity) {
      throw new Error(
        `deno's cached metadata of ${m[1]}@${m[2]} is not what deno.lock records (its hash differs)`,
      );
    }
    let manifest: Record<string, { checksum?: unknown }>;
    try {
      manifest =
        (JSON.parse(meta.toString("utf8")) as { manifest?: typeof manifest }).manifest ?? {};
    } catch {
      throw new Error(`deno's cached metadata of ${m[1]}@${m[2]} is not JSON`);
    }
    for (const file of Object.keys(manifest).toSorted()) {
      const sum = manifest[file]?.checksum;
      const body = denoCachedBody(denoDir, `${pkgBase}${file}`);
      if (!body) {
        continue; // never loaded, and deno runs from its cache only
      }
      if (typeof sum !== "string" || sum !== `sha256-${sha256(body)}`) {
        throw new Error(
          `deno's cached ${m[1]}@${m[2]}${file} is not the file its metadata records (its hash differs)`,
        );
      }
      seen[`${pkgBase}${file}`] = sum;
    }
    seen[metaUrl] = integrity;
  }
  return { remoteDigest: sha256(canonical(seen)), modules: Object.keys(seen).length };
}

// ─── uv.lock ────────────────────────────────────────────────────────────

/**
 * The packages a uv.lock pins: name -> versions (uv.lock is generated TOML:
 * `[[package]]` tables whose first keys are `name = "..."` and `version = "..."`).
 */
export function uvLockPackages(lockFile: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  let cur: { name?: string; version?: string } | null = null;
  const flush = () => {
    if (cur?.name) {
      const n = normName(cur.name);
      const set = out.get(n) ?? new Set<string>();
      set.add(cur.version ?? "");
      out.set(n, set);
    }
  };
  for (const line of fs.readFileSync(lockFile, "utf8").split(/\r?\n/)) {
    if (/^\s*\[\[package\]\]\s*$/.test(line)) {
      flush();
      cur = {};
      continue;
    }
    if (/^\s*\[/.test(line)) {
      flush();
      cur = null;
      continue;
    }
    const m = /^\s*(name|version)\s*=\s*"([^"\\]*)"\s*$/.exec(line);
    if (cur && m && cur[m[1] as "name" | "version"] === undefined) {
      cur[m[1] as "name" | "version"] = m[2];
    }
  }
  flush();
  return out;
}

/**
 * The environment is synced to the lock: every installed distribution is a
 * package uv.lock pins, at a version it pins. Throws what differs.
 */
export function uvEnvironmentSynced(
  dists: readonly { name: string; version: string }[],
  lockFile: string,
): void {
  const locked = uvLockPackages(lockFile);
  for (const d of dists) {
    const v = locked.get(normName(d.name));
    if (!v) {
      throw new Error(
        `${d.name} ${d.version} is installed in the project's environment but uv.lock does not pin it (run uv sync)`,
      );
    }
    if (!v.has(d.version) && !v.has("")) {
      throw new Error(
        `${d.name} ${d.version} is installed, but uv.lock pins ${[...v].join(", ")} (run uv sync)`,
      );
    }
  }
}
