// enclawed adapter kit: whether a `find` expression may print a given file.
//
// Used where a command reads the files a find lists (`for f in $(find ...);
// do cat "$f"`): a file the expression can never print is not read. The
// evaluation is a superset of find's: a predicate or action it does not know
// counts as true (the file may be printed), -prune does not stop the descent
// (more files considered, never fewer), and -maxdepth/-mindepth are ignored.
// Known: -name, -iname, -path, -wholename, -ipath, -iwholename (fnmatch, `*`
// crossing `/` in paths as find's does), -type f|d|l, -print, -print0, -true,
// -false, !, -not, -a, -and, -o, -or, `(`, `)`.

function fnmatch(pattern: string, text: string, fold: boolean): boolean {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") {
      re += "[\\s\\S]*";
    } else if (c === "?") {
      re += "[\\s\\S]";
    } else if (c === "[") {
      const end = pattern.indexOf("]", i + 2);
      if (end < 0) {
        re += "\\[";
        continue;
      }
      re += `[${pattern
        .slice(i + 1, end)
        .replace(/^!/, "^")
        .replace(/\\/g, "\\\\")}]`;
      i = end;
    } else if (c === "\\" && i + 1 < pattern.length) {
      re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    } else {
      re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  try {
    return new RegExp(`^${re}$`, fold ? "i" : "").test(text);
  } catch {
    return true; // a pattern the kit cannot read: the file may match
  }
}

type Entry = Readonly<{ printed: string; base: string; type: "f" | "d" | "l" }>;
type Val = { value: boolean; printed: boolean };

/**
 * May `find START EXPR` print this file? `printed` is the path as find prints
 * it (START joined with the path below it), `type` its kind.
 */
export function findMayPrint(expr: readonly string[], entry: Entry): boolean {
  const toks = [...expr];
  let pos = 0;
  let hasAction = false;
  const peek = () => toks[pos];
  // Each returns whether the file passes and whether a print ran on the way.
  function primary(): Val {
    const t = toks[pos++];
    if (t === undefined) {
      return { value: true, printed: false };
    }
    if (t === "(") {
      const v = or();
      if (toks[pos] === ")") {
        pos++;
      }
      return v;
    }
    if (t === "!" || t === "-not") {
      const v = primary();
      return { value: !v.value, printed: v.printed };
    }
    const arg = () => toks[pos++] ?? "";
    switch (t) {
      case "-name":
        return { value: fnmatch(arg(), entry.base, false), printed: false };
      case "-iname":
        return { value: fnmatch(arg(), entry.base, true), printed: false };
      case "-path":
      case "-wholename":
        return { value: fnmatch(arg(), entry.printed, false), printed: false };
      case "-ipath":
      case "-iwholename":
        return { value: fnmatch(arg(), entry.printed, true), printed: false };
      case "-type": {
        const k = arg();
        return { value: k.split(",").includes(entry.type), printed: false };
      }
      case "-print":
      case "-print0":
        hasAction = true;
        return { value: true, printed: true };
      case "-true":
      case "-prune":
        return { value: true, printed: false };
      case "-false":
        return { value: false, printed: false };
      case "-maxdepth":
      case "-mindepth":
        arg();
        return { value: true, printed: false };
      default:
        // Unknown: it may be true, and it may print (an action of its own).
        hasAction = true;
        if (
          pos < toks.length &&
          !toks[pos].startsWith("-") &&
          !["(", ")", "!"].includes(toks[pos])
        ) {
          pos++;
        }
        return { value: true, printed: true };
    }
  }
  function and(): Val {
    let v = primary();
    while (
      pos < toks.length &&
      peek() !== "-o" &&
      peek() !== "-or" &&
      peek() !== ")" &&
      peek() !== ","
    ) {
      if (peek() === "-a" || peek() === "-and") {
        pos++;
      }
      if (!v.value) {
        // Short-circuit: the right side does not run (skip it without evaluating its prints).
        const save = hasAction;
        primary();
        hasAction = save || hasAction;
        continue;
      }
      const r = primary();
      v = { value: r.value, printed: v.printed || r.printed };
    }
    return v;
  }
  function or(): Val {
    let v = and();
    while (peek() === "-o" || peek() === "-or" || peek() === ",") {
      const op = toks[pos++];
      if (op !== "," && v.value) {
        const save = hasAction;
        and();
        hasAction = save || hasAction;
        continue;
      }
      const r = and();
      v = { value: op === "," ? r.value : r.value, printed: v.printed || r.printed };
    }
    return v;
  }
  const v = or();
  // Leftover tokens (an unbalanced `)`): not read, the file may be printed.
  if (pos < toks.length) {
    return true;
  }
  return hasAction ? v.printed : v.value;
}
