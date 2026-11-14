// ssh, scp and rsync, as the HPC gate sees them.
//
// At regulated sites SSH is the only way onto a cluster, so an agent's launch
// usually reads `ssh login1 sbatch job.sh`. The gate treats that as two
// questions: may the agent open this SSH connection at all, and is the
// command it carries a launch the policy allows? The first is answered here,
// conservatively: only listed hosts, and none of the options that would make
// ssh run something else locally, forward ports or credentials, or read a
// configuration the gate cannot see. The second is answered by walking the
// remote command like any local one (gate.ts).
//
// Nothing here relies on a cluster exposing more than its login node's SSH
// port, and the agent never picks a port: the site's SSH port and host keys
// come from the user's pinned ssh configuration, so -p, -o Port and scp -P
// are refused like any other attempt to change where ssh connects.

import path from "node:path";
import type { Word } from "./shell-words.js";

// OpenSSH client options, from ssh(1). Flags take no value; the rest take one.
const SSH_FLAGS = new Set("46AaCfGgKkMNnqsTtVvXxYy".split(""));
const SSH_VALUED = new Set("BbcDEeFIiJLlmOoPpQRSWw".split(""));

/** Options refused outright, and why. */
const SSH_REFUSED: Record<string, string> = {
  L: "forwards a local port",
  R: "forwards a remote port",
  D: "opens a SOCKS proxy",
  W: "forwards stdio to another host",
  w: "opens a tunnel device",
  F: "reads an ssh configuration the gate cannot see",
  A: "forwards the SSH agent",
  X: "forwards X11",
  Y: "forwards X11",
  f: "backgrounds the session",
  M: "creates a connection master",
  S: "chooses a control socket",
  G: "prints configuration instead of connecting",
  s: "requests a subsystem instead of a command",
  Q: "queries instead of connecting",
  O: "controls a connection master",
  B: "binds to an interface",
  b: "binds to an address",
  E: "writes a log file",
  p: "chooses the port; the site's SSH port is fixed by its configuration",
};

/** `-o Key=value` settings an agent may use; everything else is refused. */
const SSH_OPTIONS_ALLOWED: Record<string, (v: string) => boolean> = {
  batchmode: (v) => /^(yes|no)$/i.test(v),
  connecttimeout: (v) => /^\d+$/.test(v),
  serveraliveinterval: (v) => /^\d+$/.test(v),
  serveralivecountmax: (v) => /^\d+$/.test(v),
  stricthostkeychecking: (v) => /^yes$/i.test(v),
  loglevel: (v) => /^(quiet|fatal|error|info|verbose)$/i.test(v),
  identitiesonly: (v) => /^(yes|no)$/i.test(v),
  user: (v) => /^[A-Za-z0-9._-]+$/.test(v),
};

export type SshTarget = { user: string | null; host: string };

export type SshCall = {
  target: SshTarget | null;
  jumps: SshTarget[];
  /** The remote command as the remote shell will see it; null for an interactive login. */
  command: string | null;
  problems: string[];
};

export function parseTarget(text: string): SshTarget | null {
  const m = /^(?:([A-Za-z0-9._-]+)@)?([A-Za-z0-9.-]+)$/.exec(text.replace(/^ssh:\/\//, ""));
  return m ? { user: m[1] ?? null, host: m[2] } : null;
}

/** Parses `ssh [options] [user@]host [command...]` (the words after "ssh"). */
export function parseSsh(args: Word[]): SshCall {
  const out: SshCall = { target: null, jumps: [], command: null, problems: [] };
  let i = 0;
  for (; i < args.length; i++) {
    const w = args[i];
    if (w.dynamic) {
      out.problems.push(`ssh argument "${w.text}" is computed at run time`);
      return out;
    }
    if (w.text === "--") {
      i += 1;
      break;
    }
    if (!w.text.startsWith("-") || w.text === "-") {
      break;
    }
    // Clustered flags: -tt, -4v, or a valued flag with its value attached: -p2222.
    const letters = w.text.slice(1);
    for (let j = 0; j < letters.length; j++) {
      const f = letters[j];
      if (SSH_REFUSED[f]) {
        out.problems.push(`ssh -${f} ${SSH_REFUSED[f]}`);
      }
      if (SSH_VALUED.has(f)) {
        const attached = letters.slice(j + 1);
        const value = attached || args[i + 1]?.text;
        if (!attached) {
          i += 1;
        }
        if (value === undefined) {
          out.problems.push(`ssh -${f} needs a value`);
        } else if (args[i]?.dynamic) {
          out.problems.push(`ssh -${f} value is computed at run time`);
        } else if (f === "o") {
          const m = /^([A-Za-z]+)\s*[= ]\s*(.*)$/.exec(value);
          const check = m ? SSH_OPTIONS_ALLOWED[m[1].toLowerCase()] : undefined;
          if (!m || !check || !check(m[2])) {
            out.problems.push(`ssh -o ${value} is not an option the gate allows`);
          }
        } else if (f === "J") {
          for (const hop of value.split(",")) {
            const t = parseTarget(hop.replace(/:\d+$/, ""));
            if (t) {
              out.jumps.push(t);
            } else {
              out.problems.push(`ssh -J ${hop} is not a host`);
            }
          }
        }
        break;
      }
      if (!SSH_FLAGS.has(f)) {
        out.problems.push(`ssh -${f} is not an option the gate knows`);
      }
    }
  }
  const dest = args[i];
  if (!dest) {
    out.problems.push("ssh without a destination");
    return out;
  }
  out.target = parseTarget(dest.text);
  if (!out.target) {
    out.problems.push(`ssh destination "${dest.text}" is not a host`);
  }
  const rest = args.slice(i + 1);
  if (rest.some((w) => w.dynamic)) {
    out.problems.push("the remote command is computed at run time");
  }
  // ssh joins its arguments with spaces and the remote shell parses the result.
  out.command = rest.length > 0 ? rest.map((w) => w.text).join(" ") : null;
  return out;
}

export type CopyCall = {
  /** Files sent to the cluster: local source -> remote destination. */
  uploads: { local: string; host: SshTarget; remote: string }[];
  /** Files fetched from the cluster. */
  downloads: { host: SshTarget; remote: string; local: string }[];
  /** Copies that never touch a remote host. */
  localOnly: boolean;
  problems: string[];
};

/** Splits `[user@]host:path`; local paths have no colon before the first slash. */
function remotePath(text: string): { host: SshTarget; path: string } | null {
  const m = /^((?:[A-Za-z0-9._-]+@)?[A-Za-z0-9.-]+):(.*)$/.exec(text);
  if (!m || text.startsWith("/") || text.startsWith(".")) {
    return null;
  }
  const host = parseTarget(m[1]);
  return host ? { host, path: m[2] || "." } : null;
}

/** Parses scp or rsync (the words after the command name). */
export function parseCopy(tool: "scp" | "rsync", args: Word[]): CopyCall {
  const out: CopyCall = { uploads: [], downloads: [], localOnly: false, problems: [] };
  const operands: string[] = [];
  const scpValued = new Set(["-c", "-F", "-i", "-J", "-l", "-o", "-P", "-S", "-X"]);
  for (let i = 0; i < args.length; i++) {
    const w = args[i];
    if (w.dynamic) {
      out.problems.push(`${tool} argument "${w.text}" is computed at run time`);
      return out;
    }
    const t = w.text;
    if (tool === "scp" && t.startsWith("-") && t !== "-") {
      if (t === "-F" || t === "-S" || t === "-o" || t === "-J" || t === "-3" || t === "-P") {
        out.problems.push(`scp ${t} changes how or where scp connects`);
      }
      if (scpValued.has(t)) {
        i += 1;
      }
      continue;
    }
    if (tool === "rsync" && t.startsWith("-")) {
      if (/^(-e|--rsh|--rsync-path)/.test(t) || /^-[A-Za-z]*e/.test(t)) {
        out.problems.push(`rsync ${t} chooses the remote shell or program`);
      }
      if (/^--(daemon|server|files-from|include-from|exclude-from)/.test(t)) {
        out.problems.push(`rsync ${t} is not allowed`);
      }
      continue;
    }
    if (t.includes("::") || t.startsWith("rsync://")) {
      out.problems.push(`${tool} to an rsync daemon is not allowed`);
      continue;
    }
    operands.push(t);
  }
  if (operands.length < 2) {
    out.problems.push(`${tool} needs a source and a destination`);
    return out;
  }
  const dest = operands[operands.length - 1];
  const sources = operands.slice(0, -1);
  const destRemote = remotePath(dest);
  for (const src of sources) {
    const srcRemote = remotePath(src);
    if (srcRemote && destRemote) {
      out.problems.push(`${tool} between two remote hosts is not allowed`);
    } else if (destRemote) {
      out.uploads.push({ local: src, host: destRemote.host, remote: destRemote.path });
    } else if (srcRemote) {
      out.downloads.push({ host: srcRemote.host, remote: srcRemote.path, local: dest });
    }
  }
  out.localOnly =
    out.uploads.length === 0 && out.downloads.length === 0 && out.problems.length === 0;
  return out;
}

/** True when `p` (resolved against `base`) lies inside directory `dir`. */
export function within(dir: string, p: string, base = "/"): boolean {
  const root = path.posix.resolve(dir);
  const abs = path.posix.resolve(base, p);
  return abs === root || abs.startsWith(root.endsWith("/") ? root : `${root}/`);
}
