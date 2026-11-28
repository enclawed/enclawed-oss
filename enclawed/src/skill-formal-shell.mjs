// Method A, second pass, shell: every simple command a script runs is
// classified (see ./skill-formal-uses.mjs for the whole pass). Also used for
// the command lines Python and JavaScript code start (os.system,
// subprocess, child_process).

import path from "node:path";

/** A set of words given as one space-separated string. */
const words = (text) => new Set(text.split(/\s+/).filter(Boolean));

const READ = "fs.read";
const REV = "fs.write.rev";
const IRREV = "fs.write.irrev";
const NET = "net.egress";
const SPAWN = "spawn.proc";

// ─────────────────────────────────────────────────────────────── shell ──

/**
 * Split shell source into simple commands. Each: { words: [{text, computed}],
 * end } where `end` is the separator that ended it. Command substitutions
 * ($(...), `...`, <(...), >(...)) and the substitutions inside unquoted
 * here-documents are returned in `subs` (analysed as scripts of their own);
 * a word that holds an expansion is `computed`.
 */
export function shellCommands(src) {
  const commands = [];
  const subs = [];
  let words = [];
  let w = null; // { text, computed }
  let redirectNext = false;
  const heredocs = [];
  let i = 0;
  const n = src.length;
  const flushWord = () => {
    if (w) {
      if (redirectNext) {
        redirectNext = false;
      } else {
        words.push(w);
      }
      w = null;
    }
  };
  const endCommand = (sep) => {
    flushWord();
    commands.push({ words, end: sep });
    words = [];
  };
  const word = () => (w ??= { text: "", computed: false });
  // The body of a $( ... ) starting after the opening "(" at j: returns the index of the closing ")".
  const matchParen = (j) => {
    let depth = 1;
    let q = null;
    for (; j < n; j++) {
      const c = src[j];
      if (q) {
        if (c === "\\" && q === '"') {
          j++;
        } else if (c === q) {
          q = null;
        }
        continue;
      }
      if (c === "\\") {
        j++;
      } else if (c === "'" || c === '"' || c === "`") {
        q = c;
      } else if (c === "(") {
        depth++;
      } else if (c === ")") {
        depth--;
        if (depth === 0) {
          return j;
        }
      }
    }
    return n;
  };
  const matchBrace = (j) => {
    let depth = 1;
    for (; j < n; j++) {
      if (src[j] === "\\") {
        j++;
      } else if (src[j] === "{") {
        depth++;
      } else if (src[j] === "}") {
        if (--depth === 0) {
          return j;
        }
      }
    }
    return n;
  };
  // A "$..." expansion at i (src[i] === "$"): consumes it, records substitutions.
  const dollar = () => {
    const nx = src[i + 1];
    if (nx === "(" && src[i + 2] === "(") {
      const close = matchParen(i + 3);
      const body = src.slice(i + 3, close);
      for (const m of body.matchAll(/\$\(([^()]*)\)/g)) {
        subs.push(m[1]);
      }
      i = src[close + 1] === ")" ? close + 2 : close + 1;
    } else if (nx === "(") {
      const close = matchParen(i + 2);
      subs.push(src.slice(i + 2, close));
      i = close + 1;
    } else if (nx === "{") {
      const close = matchBrace(i + 2);
      const inner = src.slice(i + 2, close);
      for (const m of inner.matchAll(/\$\(|`/g)) {
        const at = i + 2 + m.index;
        if (m[0] === "`") {
          const e = src.indexOf("`", at + 1);
          subs.push(src.slice(at + 1, e < 0 ? n : e));
        } else {
          subs.push(src.slice(at + 2, matchParen(at + 2)));
        }
      }
      i = close + 1;
    } else {
      i++;
      while (i < n && /[A-Za-z0-9_@*#?$!-]/.test(src[i])) {
        i++;
        if (!/[A-Za-z0-9_]/.test(src[i - 1])) {
          break;
        }
      }
    }
    word().computed = true;
  };
  const backtick = () => {
    const e = src.indexOf("`", i + 1);
    subs.push(src.slice(i + 1, e < 0 ? n : e));
    i = e < 0 ? n : e + 1;
    word().computed = true;
  };
  const readHeredocs = () => {
    // At a newline: each pending here-document's body follows, up to its delimiter line.
    for (const h of heredocs.splice(0)) {
      const lines = [];
      while (i < n) {
        let e = src.indexOf("\n", i);
        if (e < 0) {
          e = n;
        }
        const line = src.slice(i, e);
        i = e + 1;
        if ((h.strip ? line.replace(/^\t+/, "") : line) === h.delim) {
          break;
        }
        lines.push(line);
      }
      if (!h.quoted) {
        const body = lines.join("\n");
        for (const m of body.matchAll(/\$\(/g)) {
          const s = m.index + 2;
          let depth = 1;
          let j = s;
          for (; j < body.length && depth; j++) {
            if (body[j] === "(") {
              depth++;
            } else if (body[j] === ")") {
              depth--;
            }
          }
          subs.push(body.slice(s, j - 1));
        }
        for (const m of body.matchAll(/`([^`]*)`/g)) {
          subs.push(m[1]);
        }
      }
    }
  };
  while (i < n) {
    const c = src[i];
    if (c === "\\") {
      if (src[i + 1] === "\n") {
        i += 2;
        continue;
      }
      word().text += src[i + 1] ?? "";
      i += 2;
      continue;
    }
    if (c === "'") {
      const e = src.indexOf("'", i + 1);
      word().text += src.slice(i + 1, e < 0 ? n : e);
      i = e < 0 ? n : e + 1;
      continue;
    }
    if (c === '"') {
      word();
      i++;
      while (i < n && src[i] !== '"') {
        if (src[i] === "\\") {
          w.text += src[i + 1] ?? "";
          i += 2;
        } else if (src[i] === "$") {
          dollar();
        } else if (src[i] === "`") {
          backtick();
        } else {
          w.text += src[i++];
        }
      }
      i++;
      continue;
    }
    if (c === "$") {
      dollar();
      continue;
    }
    if (c === "`") {
      backtick();
      continue;
    }
    if (c === "#" && !w) {
      while (i < n && src[i] !== "\n") {
        i++;
      }
      continue;
    }
    if (c === "\n") {
      endCommand("\n");
      i++;
      readHeredocs();
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") {
      flushWord();
      i++;
      continue;
    }
    if ((c === "<" || c === ">") && src[i + 1] === "(") {
      // Process substitution.
      flushWord();
      const close = matchParen(i + 2);
      subs.push(src.slice(i + 2, close));
      i = close + 1;
      continue;
    }
    if (c === "<" && src[i + 1] === "<" && src[i + 2] !== "<") {
      // Here-document: its delimiter word, then its body after the next newline.
      if (w && /^\d+$/.test(w.text) && !w.computed) {
        w = null;
      }
      flushWord();
      i += 2;
      let strip = false;
      if (src[i] === "-") {
        strip = true;
        i++;
      }
      while (src[i] === " " || src[i] === "\t") {
        i++;
      }
      const m = /^(?:'([^']*)'|"([^"]*)"|\\?([^\s;&|<>()]+))/.exec(src.slice(i));
      if (m) {
        const quoted = m[1] !== undefined || m[2] !== undefined || m[0].startsWith("\\");
        heredocs.push({
          delim: (m[1] ?? m[2] ?? m[3]).replace(/['"]/g, ""),
          quoted: quoted || /['"]/.test(m[3] ?? ""),
          strip,
        });
        i += m[0].length;
      }
      continue;
    }
    if (c === "<" || c === ">") {
      // A redirection: the operator (and a file-descriptor number before it), then its target word.
      if (w && /^\d+$/.test(w.text) && !w.computed) {
        w = null;
      }
      flushWord();
      i++;
      while (i < n && /[<>&|]/.test(src[i])) {
        i++;
      }
      if (/^\d+|^-/.test(src.slice(i)) && src[i - 1] === "&") {
        while (i < n && /[\d-]/.test(src[i])) {
          i++;
        }
        continue;
      }
      redirectNext = true;
      continue;
    }
    if (c === "&" && src[i + 1] === ">") {
      flushWord();
      i += src[i + 2] === ">" ? 3 : 2;
      redirectNext = true;
      continue;
    }
    if (c === "(" && src[i + 1] === "(") {
      // Arithmetic command: no program runs, but substitutions inside do.
      flushWord();
      let depth = 2;
      let j = i + 2;
      for (; j < n && depth; j++) {
        if (src[j] === "(") {
          depth++;
        } else if (src[j] === ")") {
          depth--;
        }
      }
      for (const m of src.slice(i + 2, j).matchAll(/\$\(([^()]*)\)/g)) {
        subs.push(m[1]);
      }
      i = j;
      continue;
    }
    if (c === ";" || c === "&" || c === "|" || c === "(" || c === ")") {
      let sep = c;
      if ((c === ";" && src[i + 1] === ";") || (c === "&" && src[i + 1] === "&")) {
        sep = c + c;
      } else if (c === "|" && (src[i + 1] === "|" || src[i + 1] === "&")) {
        sep = c + src[i + 1];
      }
      endCommand(sep);
      i += sep.length;
      continue;
    }
    word().text += c;
    i++;
  }
  endCommand("eof");
  return { commands: commands.filter((x) => x.words.length || x.end === "("), subs };
}

const KEYWORDS = words("if then else elif fi do done while until ! { } time esac in");

const NO_EFFECT = words(
  "echo printf true false test [ [[ ]] cd pwd export unset local readonly declare typeset read set shift return exit : wait sleep basename dirname seq tr expr getopts shopt break continue let type hash umask id whoami uname hostname date tty nproc printenv pushd popd dirs",
);

const READERS = words(
  "cat head tail less more grep egrep fgrep rg cut wc od xxd base64 strings diff cmp comm ls stat file du df readlink realpath md5sum sha1sum sha256sum sha512sum cksum shasum jq nl tac rev paste fold column iconv hexdump which",
);

// Programs whose operands they write: [capability, which operands].
const WRITERS = {
  rm: [IRREV, "all"],
  rmdir: [IRREV, "all"],
  unlink: [IRREV, "all"],
  shred: [IRREV, "all"],
  truncate: [IRREV, "all"],
  chmod: [IRREV, "rest"],
  chown: [IRREV, "rest"],
  chgrp: [IRREV, "rest"],
  mv: [IRREV, "all"],
  touch: [REV, "all"],
  mkdir: [REV, "all"],
  tee: [REV, "all"],
  mktemp: [REV, "star"],
  cp: [REV, "last"],
  install: [REV, "last"],
  ln: [REV, "last"],
  dd: [IRREV, "star"],
};

const INTERPRETERS = words(
  "sh bash dash zsh ksh ash python python2 python3 node nodejs perl ruby php deno bun tsx ts-node",
);

const NETWORK = words(
  "curl wget nc ncat netcat ssh scp sftp rsync ftp telnet socat openssl http https httpie dig nslookup host ping",
);

// Programs that run code they are configured to run (package scripts, build
// files, setup.py): their effects are those of code this analysis never reads.
const RUNS_CONFIGURED_CODE = words(
  "npm npx pnpm yarn pip pip3 pipx uv poetry make cmake cargo go java mvn gradle docker podman sudo doas su kill pkill killall crontab at systemctl launchctl service eval exec source . trap alias xdg-open open",
);

const GIT_READ = words(
  "status log diff show ls-files ls-tree rev-parse cat-file blame describe shortlog rev-list name-rev merge-base show-ref for-each-ref check-ignore check-attr count-objects version --version",
);
const GIT_NET = words("fetch pull push clone ls-remote submodule remote");

const ARCHIVERS = words("tar unzip zip gzip gunzip bzip2 xz unxz 7z");

const WRAPPERS = { nohup: 0, nice: 0, ionice: 0, stdbuf: 0, setsid: 0, chronic: 0, command: 0 };

/** The effects of one simple command's words (after assignments), as [capability, value] or "TOP:<why>". */
export function classifyCommand(argv, fns) {
  const out = [];
  let w = argv;
  // Wrappers that run the rest of the line (env with assignments, timeout DURATION, xargs, ...).
  for (let guard = 0; guard < 8 && w.length; guard++) {
    const p = w[0].text;
    if (w[0].computed) {
      break;
    }
    if (p === "env") {
      w = w.slice(1);
      while (w.length && (w[0].text.startsWith("-") || /^[A-Za-z_]\w*=/.test(w[0].text))) {
        w = w.slice(1);
      }
      continue;
    }
    if (p === "timeout") {
      w = w.slice(1);
      while (w.length && w[0].text.startsWith("-")) {
        w = w.slice(1);
      }
      w = w.slice(1);
      continue;
    }
    if (p === "xargs") {
      // The program xargs runs gets operands from its input: values unknown.
      w = w.slice(1);
      while (w.length && w[0].text.startsWith("-")) {
        w = w.slice(/^-[IdLnPsE]$/.test(w[0].text) ? 2 : 1);
      }
      w = [...w, { text: "*", computed: true }];
      continue;
    }
    if (p === "command" && w[1] && /^-[vV]$/.test(w[1].text)) {
      return out;
    }
    if (Object.hasOwn(WRAPPERS, p)) {
      w = w.slice(1);
      while (w.length && w[0].text.startsWith("-")) {
        w = w.slice(p === "nice" && w[0].text === "-n" ? 2 : 1);
      }
      continue;
    }
    if (p === "time") {
      w = w.slice(1);
      continue;
    }
    break;
  }
  if (!w.length) {
    return out;
  }
  const prog = w[0];
  if (prog.computed) {
    return [`TOP:computed-command`];
  }
  let name = prog.text;
  if (name.includes("/")) {
    if (/^\/(?:usr\/(?:local\/)?)?s?bin\/[^/]+$/.test(name)) {
      name = path.posix.basename(name);
    } else if (!path.posix.isAbsolute(name) && !name.split("/").includes("..")) {
      // A file of the skill run by its path (analysed as part of the skill).
      return [[SPAWN, name]];
    } else {
      return [`TOP:runs-a-file-outside-the-skill: ${name}`];
    }
  }
  const args = w.slice(1);
  const operands = args.filter((a) => a.computed || !a.text.startsWith("-") || a.text === "-");
  const value = (a) => (a.computed ? "*" : a.text);
  if (fns.has(name) || NO_EFFECT.has(name)) {
    return out;
  }
  if (READERS.has(name)) {
    return [[READ, "*"]];
  }
  if (Object.hasOwn(WRITERS, name)) {
    const [cap, which] = WRITERS[name];
    if (which === "star") {
      return [[cap, "*"]];
    }
    let targets = operands;
    if (which === "rest") {
      targets = operands.slice(1);
    } else if (which === "last") {
      const t = args.findIndex((a) => a.text === "-t" || a.text.startsWith("--target-directory"));
      if (t >= 0) {
        const v = args[t].text.includes("=") ? args[t] : args[t + 1];
        targets = v ? [{ ...v, text: v.text.replace(/^--target-directory=/, "") }] : [];
      } else {
        targets = operands.slice(-1);
      }
      if (operands.length > 1) {
        out.push([READ, "*"]);
      }
    }
    if (!targets.length) {
      return [...out, [cap, "*"]];
    }
    return [...out, ...targets.map((a) => [cap, value(a)])];
  }
  if (name === "sed") {
    const inPlace = args.some((a) => /^-[A-Za-z]*i|^--in-place/.test(a.text));
    const script = args.find((a) => !a.text.startsWith("-"));
    if (
      script &&
      /(?:^|[;\n{}]\s*)[ewW](?:\s|$)|s(.)(?:\\.|(?!\1).)*\1(?:\\.|(?!\1).)*\1[gpIiMm0-9]*[ewW]/.test(
        script.text,
      )
    ) {
      return [`TOP:sed-runs-or-writes`];
    }
    return inPlace
      ? [
          [READ, "*"],
          [REV, "*"],
        ]
      : [[READ, "*"]];
  }
  if (name === "awk" || name === "gawk" || name === "mawk" || name === "nawk") {
    const prog2 = args.find((a) => !a.text.startsWith("-"));
    if (
      !prog2 ||
      prog2.computed ||
      /\bsystem\s*\(|\|\s*getline|\bgetline\b[^;]*<|print[^;]*[>|]|printf[^;]*[>|]/.test(prog2.text)
    ) {
      return [`TOP:awk-runs-or-writes`];
    }
    return [[READ, "*"]];
  }
  if (name === "sort") {
    return args.some((a) => /^-o|^--output/.test(a.text))
      ? [
          [READ, "*"],
          [REV, "*"],
        ]
      : [[READ, "*"]];
  }
  if (name === "uniq") {
    return operands.length > 1
      ? [
          [READ, "*"],
          [REV, value(operands[1])],
        ]
      : [[READ, "*"]];
  }
  if (name === "tree") {
    return args.some((a) => a.text === "-o")
      ? [
          [READ, "*"],
          [REV, "*"],
        ]
      : [[READ, "*"]];
  }
  if (name === "find") {
    const caps = [[READ, "*"]];
    for (let k = 0; k < args.length; k++) {
      const a = args[k].text;
      if (a === "-delete") {
        caps.push([IRREV, "*"]);
      } else if (/^-(?:fprint0?|fprintf|fls)$/.test(a)) {
        caps.push([REV, "*"]);
      } else if (/^-(?:exec|execdir|ok|okdir)$/.test(a)) {
        // The command it runs, with the found files as operands.
        let e = k + 1;
        while (e < args.length && args[e].text !== ";" && args[e].text !== "+") {
          e++;
        }
        const sub = args
          .slice(k + 1, e)
          .map((x) => (x.text === "{}" ? { text: "*", computed: true } : x));
        if (!sub.length) {
          return [`TOP:find-exec`];
        }
        for (const r of classifyCommand(sub, fns)) {
          if (typeof r === "string") {
            return [r];
          }
          caps.push(r);
        }
        caps.push([SPAWN, sub[0].text]);
        k = e;
      }
    }
    return caps;
  }
  if (name === "git") {
    let k = 0;
    while (k < args.length && args[k].text.startsWith("-")) {
      const a = args[k].text;
      if (a === "-c" || a.startsWith("--config-env") || a.startsWith("--exec-path")) {
        return [`TOP:git-sets-a-program`];
      }
      k += a === "-C" || a === "--git-dir" || a === "--work-tree" ? 2 : 1;
    }
    const sub = args[k];
    if (!sub || sub.computed) {
      return [`TOP:computed-git-command`];
    }
    // git runs programs its configuration names (hooks, textconv, fsmonitor, pager).
    if (GIT_READ.has(sub.text)) {
      return [
        [READ, "*"],
        [SPAWN, "git"],
      ];
    }
    if (sub.text === "grep" && !args.some((a) => /^-O|^--open-files-in-pager/.test(a.text))) {
      return [
        [READ, "*"],
        [SPAWN, "git"],
      ];
    }
    const caps = [
      [READ, "*"],
      [IRREV, "*"],
      [SPAWN, "git"],
    ];
    if (GIT_NET.has(sub.text)) {
      caps.push([NET, "*"]);
    }
    return caps;
  }
  if (INTERPRETERS.has(name)) {
    // A file operand inside the skill is analysed with the skill; inline code
    // (-c, -e, -m, stdin) or a file the analysis does not read is not.
    const file = args.find((a) => !a.text.startsWith("-"));
    if (
      !file ||
      file.computed ||
      args.some((a) =>
        /^-(?:[A-Za-z]*[cemp]|-eval|-print|-command|-input-type|-require|-import|-loader)/.test(
          a.text,
        ),
      ) ||
      path.posix.isAbsolute(file.text) ||
      file.text.split("/").includes("..") ||
      file.text === "-"
    ) {
      return [`TOP:${name}-runs-code-the-analysis-does-not-read`];
    }
    return [[SPAWN, file.text]];
  }
  if (NETWORK.has(name)) {
    return [
      [NET, "*"],
      [READ, "*"],
    ];
  }
  if (ARCHIVERS.has(name)) {
    return [
      [READ, "*"],
      [REV, "*"],
      [IRREV, "*"],
    ];
  }
  if (RUNS_CONFIGURED_CODE.has(name)) {
    return [`TOP:${name}-runs-code-the-analysis-does-not-read`];
  }
  return [`TOP:unknown-program: ${name}`];
}

/** Effects of a shell script: { effects: [[cap, value]], top: reason | null }. */
export function shellUses(src, depth = 0) {
  if (depth > 8) {
    return { effects: [], top: "nesting-too-deep" };
  }
  const { commands, subs } = shellCommands(src);
  const fns = new Set();
  for (const m of src.matchAll(/(?:^|[\n;&|{(]\s*)(?:function\s+)?([A-Za-z_][\w-]*)\s*\(\s*\)/g)) {
    fns.add(m[1]);
  }
  for (const m of src.matchAll(/(?:^|[\n;&|]\s*)function\s+([A-Za-z_][\w-]*)/g)) {
    fns.add(m[1]);
  }
  const effects = [];
  let top = null;
  let inCase = 0;
  let prevEnd = "\n";
  let last = "start";
  for (const c of commands) {
    let argv = c.words;
    // Assignments before the program (their values' substitutions are in subs).
    while (argv.length && /^[A-Za-z_]\w*(?:\[[^\]]*\])?\+?=/.test(argv[0].text)) {
      argv = argv.slice(1);
    }
    // A function definition `name()`: the name, then "(" and ")".
    if (c.end === "(" && argv.length === 1 && fns.has(argv[0].text)) {
      prevEnd = c.end;
      continue;
    }
    while (argv.length && !argv[0].computed && KEYWORDS.has(argv[0].text)) {
      argv = argv.slice(1);
    }
    const head = argv[0]?.text;
    if (head === "case" && !argv[0].computed) {
      inCase++;
      prevEnd = c.end;
      last = "case";
      continue;
    }
    if (c.words.some((x) => x.text === "esac" && !x.computed)) {
      inCase = Math.max(0, inCase - 1);
    }
    // A case pattern (a | b | c) ends with ")": it comes right after the
    // `case ... in` line, after ";;" (";&", ";;&"), or after another
    // alternative of the same pattern. Anything else is a command.
    if (
      inCase &&
      (c.end === ")" || c.end === "|") &&
      (last === "case" ||
        prevEnd === ";;" ||
        prevEnd === ";&" ||
        (last === "pattern" && prevEnd === "|"))
    ) {
      prevEnd = c.end;
      last = c.end === "|" ? "pattern" : "pattern-end";
      continue;
    }
    prevEnd = c.end;
    last = "command";
    if (!argv.length) {
      continue;
    }
    if ((head === "for" || head === "select") && !argv[0].computed) {
      continue;
    }
    for (const r of classifyCommand(argv, fns)) {
      if (typeof r === "string") {
        top ??= r.slice(4);
      } else {
        effects.push(r);
      }
    }
  }
  for (const s of subs) {
    const r = shellUses(s, depth + 1);
    effects.push(...r.effects);
    top ??= r.top;
  }
  return { effects, top };
}

// ───────────────────────────────────────────── programs code starts ──

// A string literal (single, double, or a template without substitutions), and a list of them.
const BT = "\x60";
const STR = `(?:'((?:\\\\.|[^'\\\\\\n])*)'|"((?:\\\\.|[^"\\\\\\n])*)"|${BT}([^${BT}$\\\\]*)${BT})`;
export const STR_RE = new RegExp(`^\\s*${STR}`);
const LIST_RE = new RegExp(`^\\s*\\[\\s*((?:${STR}\\s*,?\\s*)*)\\]`);

/** The program a call starts, from the text right after its "(": effects, or a TOP reason. */
export function spawnedBy(argText, form) {
  const out = { effects: [[SPAWN, "*"]], top: null };
  const str = STR_RE.exec(argText);
  const list = LIST_RE.exec(argText);
  const words = (inner) =>
    [...inner.matchAll(new RegExp(STR, "g"))].map((m) => ({
      text: m[1] ?? m[2] ?? m[3] ?? "",
      computed: false,
    }));
  if (form === "shell" && str) {
    const r = shellUses(str[1] ?? str[2] ?? str[3] ?? "");
    out.effects.push(...r.effects);
    out.top = r.top;
    return out;
  }
  if (form === "argv" && str) {
    // execFile/spawn("prog", ["a", "b"]): the program, then its argument array.
    const after = argText.slice(str[0].length).replace(/^\s*,/, "");
    const arr = LIST_RE.exec(after);
    const argv = [{ text: str[1] ?? str[2] ?? str[3] ?? "", computed: false }];
    if (arr) {
      argv.push(...words(arr[1]));
    } else if (!/^\s*\)/.test(after) && !/^\s*\{/.test(after)) {
      out.top = "starts a program with arguments the code computes";
      return out;
    }
    return classifiedInto(out, argv);
  }
  if (form === "py" && list) {
    return classifiedInto(out, words(list[1]));
  }
  if (form === "py" && str) {
    // A string: the shell runs it with shell=True; otherwise it is the program alone.
    const text = str[1] ?? str[2] ?? str[3] ?? "";
    if (/\bshell\s*=\s*True\b/.test(argText.split(/\n/)[0])) {
      const r = shellUses(text);
      out.effects.push(...r.effects);
      out.top = r.top;
      return out;
    }
    return classifiedInto(out, [{ text, computed: false }]);
  }
  out.top = "starts a program the code computes";
  return out;
}

function classifiedInto(out, argv) {
  if (!argv.length) {
    out.top = "starts no program it names";
    return out;
  }
  for (const r of classifyCommand(argv, new Set())) {
    if (typeof r === "string") {
      out.top ??= r.slice(4);
    } else {
      out.effects.push(r);
    }
  }
  return out;
}
