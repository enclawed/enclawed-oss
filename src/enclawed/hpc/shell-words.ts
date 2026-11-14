// Just enough of POSIX shell to find the commands an agent's exec line runs.
//
// The HPC gate has to know which launchers a command line starts and with
// what arguments. It does not have to run the line, so this splits words and
// operators the way sh does (quotes, backslashes, ;, &&, ||, |, &, newlines,
// subshell parentheses, redirections) and marks every word whose value the
// shell would compute at run time ($VAR, $(...), backticks, globs). The gate
// treats a computed word in a position that matters as unknowable and, when
// enforcing, refuses it: an agent can always write the literal value instead.

export type Word = {
  /** The word with quotes and backslashes removed. */
  text: string;
  /** True if the shell would expand part of it (variable, command substitution, glob). */
  dynamic: boolean;
};

export type SimpleCommand = {
  words: Word[];
  /** File redirected to stdin with `<`, if any; `sbatch < job.sh` reads its script from it. */
  stdinFile: Word | null;
  /** True when a heredoc (<<) feeds this command; its body is not parsed. */
  heredoc: boolean;
};

export type ParseResult = { ok: true; commands: SimpleCommand[] } | { ok: false; reason: string };

const OPERATOR_CHARS = new Set([";", "&", "|", "\n", "(", ")"]);
const REDIRECT_RE = /^[0-9]*(>>|>&|<&|<<-?|<>|>\||>|<)$/;

/** Splits a command line into simple commands. */
export function parseCommandLine(input: string): ParseResult {
  const commands: SimpleCommand[] = [];
  let current: SimpleCommand = { words: [], stdinFile: null, heredoc: false };
  let pendingRedirect: string | null = null;
  let i = 0;

  const endCommand = () => {
    if (current.words.length > 0 || current.heredoc || current.stdinFile) {
      commands.push(current);
    }
    current = { words: [], stdinFile: null, heredoc: false };
  };

  const pushWord = (w: Word) => {
    if (pendingRedirect !== null) {
      if (pendingRedirect.startsWith("<<")) {
        current.heredoc = true;
      } else if (pendingRedirect === "<") {
        current.stdinFile = w;
      }
      pendingRedirect = null;
      return;
    }
    if (REDIRECT_RE.test(w.text) && !w.dynamic) {
      pendingRedirect = w.text.replace(/^[0-9]+/, "");
      return;
    }
    // "2>file" and ">file" glued to their target.
    const glued = /^[0-9]*(>>|>|<)(.+)$/.exec(w.text);
    if (glued && !w.dynamic && !w.text.startsWith("<<")) {
      if (glued[1] === "<") {
        current.stdinFile = { text: glued[2], dynamic: false };
      }
      return;
    }
    current.words.push(w);
  };

  while (i < input.length) {
    const c = input[i];
    if (c === " " || c === "\t" || c === "\r") {
      i += 1;
      continue;
    }
    if (c === "#") {
      // Comment to end of line (only at a word start, which is where we are).
      while (i < input.length && input[i] !== "\n") {
        i += 1;
      }
      continue;
    }
    if (c === "&" && pendingRedirect !== null) {
      // `2>&1`: the & belongs to the redirection; the next word is its fd.
      i += 1;
      continue;
    }
    if (OPERATOR_CHARS.has(c)) {
      if (pendingRedirect !== null) {
        return { ok: false, reason: "redirection without a target" };
      }
      endCommand();
      i += c === "&" || c === "|" ? (input[i + 1] === c ? 2 : 1) : 1;
      continue;
    }
    let text = "";
    let dynamic = false;
    while (i < input.length) {
      const ch = input[i];
      if (ch === " " || ch === "\t" || ch === "\r" || OPERATOR_CHARS.has(ch)) {
        break;
      }
      if (ch === "\\") {
        if (input[i + 1] === "\n") {
          i += 2; // line continuation
          continue;
        }
        text += input[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (ch === "'") {
        const end = input.indexOf("'", i + 1);
        if (end < 0) {
          return { ok: false, reason: "unterminated single quote" };
        }
        text += input.slice(i + 1, end);
        i = end + 1;
        continue;
      }
      if (ch === '"') {
        i += 1;
        let closed = false;
        while (i < input.length) {
          const d = input[i];
          if (d === '"') {
            closed = true;
            i += 1;
            break;
          }
          if (d === "\\" && i + 1 < input.length && '"\\$`\n'.includes(input[i + 1])) {
            if (input[i + 1] !== "\n") {
              text += input[i + 1];
            }
            i += 2;
            continue;
          }
          if (d === "$" || d === "`") {
            dynamic = true;
          }
          text += d;
          i += 1;
        }
        if (!closed) {
          return { ok: false, reason: "unterminated double quote" };
        }
        continue;
      }
      if (ch === "$" || ch === "`") {
        dynamic = true;
        // Swallow a $( ... ) or ` ... ` group whole so its operators do not split us.
        const close =
          ch === "`" ? "`" : input[i + 1] === "(" ? ")" : input[i + 1] === "{" ? "}" : null;
        if (close) {
          const open = ch === "`" ? null : input[i + 1];
          let depth = 0;
          let j = ch === "`" ? i + 1 : i + 2;
          for (; j < input.length; j++) {
            if (open && input[j] === open) {
              depth += 1;
            } else if (input[j] === close) {
              if (depth === 0) {
                break;
              }
              depth -= 1;
            }
          }
          if (j >= input.length) {
            return { ok: false, reason: "unterminated substitution" };
          }
          text += input.slice(i, j + 1);
          i = j + 1;
          continue;
        }
      }
      if (ch === "*" || ch === "?" || ch === "[") {
        dynamic = true;
      }
      text += ch;
      i += 1;
    }
    pushWord({ text, dynamic });
  }
  if (pendingRedirect !== null) {
    return { ok: false, reason: "redirection without a target" };
  }
  endCommand();
  return { ok: true, commands };
}
