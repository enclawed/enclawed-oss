// Operator-supplied path entries for write history: scratch directories
// (enclawed.policy.scratchPaths) and no-history paths
// (enclawed.policy.history.noHistoryPaths). Both widen what runs without a
// person, so entries that would cover the whole filesystem or a whole home
// directory are refused at load.

import os from "node:os";
import path from "node:path";

const GLOB_CHARS = /[*?[\]{}]/;

function isAncestorOrSelf(ancestor: string, target: string): boolean {
  const rel = path.relative(ancestor, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** The literal directory prefix of an entry, before its first glob segment. */
function staticPrefix(entry: string): string {
  const segments = entry.split("/");
  const literal: string[] = [];
  for (const segment of segments) {
    if (GLOB_CHARS.test(segment)) {
      break;
    }
    literal.push(segment);
  }
  const joined = literal.join("/");
  return joined === "" ? "/" : joined;
}

/**
 * Validate and normalize one entry. `allowGlob` permits `*` (one segment)
 * and `**` (any depth) wildcards; other glob syntax is refused.
 */
export function validateOperatorPathEntry(
  raw: string,
  field: string,
  opts: { allowGlob: boolean; homedir?: string },
): string {
  const entry = raw.trim();
  if (entry.length === 0) {
    throw new TypeError(`${field}: empty entry`);
  }
  if (!path.posix.isAbsolute(entry) && !path.win32.isAbsolute(entry)) {
    throw new TypeError(`${field}: "${entry}" must be an absolute path`);
  }
  if (/[?[\]{}]/.test(entry)) {
    throw new TypeError(`${field}: "${entry}" may only use * and ** wildcards`);
  }
  if (!opts.allowGlob && entry.includes("*")) {
    throw new TypeError(`${field}: "${entry}" must not contain wildcards`);
  }
  const normalized = path.normalize(entry).replace(/(.)\/+$/, "$1");
  const prefix = path.normalize(staticPrefix(normalized));
  const home = path.resolve(opts.homedir ?? os.homedir());
  if (prefix === path.parse(prefix).root) {
    throw new TypeError(`${field}: "${entry}" covers the filesystem root`);
  }
  if (isAncestorOrSelf(prefix, home)) {
    throw new TypeError(`${field}: "${entry}" covers a whole home directory`);
  }
  return normalized;
}

function globToRegExp(glob: string): RegExp {
  let out = "^";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        out += ".*";
        i++;
      } else {
        out += "[^/]*";
      }
    } else {
      out += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`${out}$`);
}

/**
 * True when `target` (absolute, normalized) is an entry or lies under one.
 * A plain entry matches itself and everything below it; a glob matches the
 * path itself or any of its ancestors, so `/data/**` and `/data/*.bin`
 * behave as expected.
 */
export function pathMatchesEntry(target: string, entry: string): boolean {
  if (!entry.includes("*")) {
    return isAncestorOrSelf(entry, target);
  }
  const re = globToRegExp(entry);
  for (let p = target; ; p = path.dirname(p)) {
    if (re.test(p)) {
      return true;
    }
    if (path.dirname(p) === p) {
      return false;
    }
  }
}

export function isInsideDir(dir: string, target: string): boolean {
  return isAncestorOrSelf(dir, target);
}
