// enclawed adapter kit: which virtual environments a contained run may trust.
//
// A contained run of a project virtual environment's Python
// (./contained-exec.ts projectVenv) treats the environment's installed
// packages as toolchain code. Where they are says nothing about what they
// hold (the repository may commit a .venv; a person may edit it; a write the
// agent made outside a containment may have planted code there): the trust is
// in their content as a person or a decided install left it. A fingerprint of
// the environment's site-packages (every entry's path, kind, size,
// modification and change times, inode and link target, digested) is recorded in
// Enclawed's own state, outside the project, when a decided install into the
// environment completes or when a person approves trusting it at Enclawed's
// prompt. A contained run of it proceeds only while the fingerprint is the
// recorded one; otherwise the line asks.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** The recorded fingerprints of trusted virtual environments (by the environment's real path). */
export interface VenvTrustStore {
  trusted(dir: string): string | null;
  trust(dir: string, fingerprint: string): void;
}

export function memoryVenvTrustStore(): VenvTrustStore {
  const m = new Map<string, string>();
  return {
    trusted: (d) => m.get(d) ?? null,
    trust: (d, f) => {
      m.set(d, f);
    },
  };
}

function readStore(file: string): Record<string, string> {
  try {
    const v = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const out: Record<string, string> = {};
      for (const [k, x] of Object.entries(v)) {
        if (typeof x === "string") {
          out[k] = x;
        }
      }
      return out;
    }
  } catch {
    /* none yet */
  }
  return {};
}

/** The store's file in Enclawed's state directory (the script container's and the engine's). */
export function venvTrustFile(stateDir: string): string {
  return path.join(stateDir, "venv-trust.json");
}

/** A store in a file of Enclawed's own state (never in a project). */
export function fileVenvTrustStore(file: string): VenvTrustStore {
  return {
    trusted: (d) => readStore(file)[d] ?? null,
    trust: (d, f) => recordVenvTrust(file, d, f),
  };
}

/** Record a fingerprint in the store file (atomically). */
export function recordVenvTrust(file: string, dir: string, fingerprint: string): void {
  const cur = readStore(file);
  cur[dir] = fingerprint;
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(cur, null, 1)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/** Forget an environment's trust (a contained run changed its packages anyway). */
export function revokeVenvTrust(file: string, dir: string): void {
  const cur = readStore(file);
  if (!(dir in cur)) {
    return;
  }
  delete cur[dir];
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(cur, null, 1)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

const MAX_ENTRIES = 400_000;

/**
 * The fingerprint of a virtual environment `dir`: its pyvenv.cfg and every
 * entry below its lib* (site-packages, its .pth files and dist-info entry
 * points included), bin, Scripts and include directories, less bytecode
 * cache directories (__pycache__); every entry by its identity, size and
 * modification and change times. null: it could not
 * be read whole.
 */
export function venvFingerprint(dir: string): string | null {
  const lines: string[] = [];
  let budget = MAX_ENTRIES;
  const entry = (p: string): boolean => {
    let st: fs.BigIntStats;
    try {
      st = fs.lstatSync(p, { bigint: true });
    } catch {
      return false;
    }
    const rel = path.relative(dir, p);
    const kind = st.isSymbolicLink() ? "l" : st.isDirectory() ? "d" : st.isFile() ? "f" : "o";
    let target = "";
    if (kind === "l") {
      try {
        target = fs.readlinkSync(p);
      } catch {
        return false;
      }
    }
    // A directory by its name and entries (its own times change as bytecode
    // caches come and go); everything else by its identity and content's size.
    lines.push(
      kind === "d"
        ? `d\0${rel}\0${st.mode}`
        : `${kind}\0${rel}\0${st.size}\0${st.mtimeNs}\0${st.ctimeNs}\0${st.ino}\0${st.mode}\0${target}`,
    );
    if (kind === "d") {
      let names: string[];
      try {
        names = fs.readdirSync(p);
      } catch {
        return false;
      }
      for (const n of names) {
        // Bytecode caches: a contained run never reads them (its interpreter's
        // pycache prefix is the containment's own), and python writes them. A
        // .pyc anywhere else (a sourceless module) is content like any file.
        if (n === "__pycache__") {
          continue;
        }
        if (--budget < 0 || !entry(path.join(p, n))) {
          return false;
        }
      }
    }
    return true;
  };
  if (!entry(path.join(dir, "pyvenv.cfg"))) {
    return null;
  }
  let tops: string[];
  try {
    // Its packages (lib*), its programs (bin, Scripts: its python links) and its headers.
    tops = fs.readdirSync(dir).filter((n) => /^(?:lib.*|bin|scripts|include)$/i.test(n));
  } catch {
    return null;
  }
  for (const t of tops) {
    if (!entry(path.join(dir, t))) {
      return null;
    }
  }
  lines.sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}
