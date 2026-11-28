// enclawed adapter kit: the getopt-style option specs of the read-only shell
// allowlist (./shell-readonly.ts), a leaf module so the per-program checks
// (./shell-readonly-gh.ts) share them without an import cycle.

// ─── Option specs ───────────────────────────────────────────────────────
//
//   flags     short options without a value
//   args      short options that take a value (rest of the cluster, or next word)
//   optArgs   short options with an optional value, attached only (`-M50`, `-Iseconds`)
//   long      long options without a value
//   longArgs  long options that take a value (`--x=v` or `--x v`)
//   longOpt   long options with an optional value, `=` form only (`--color[=when]`)
//   numeric   `-<digits>` is accepted (head -5, grep -3, git log -20)
//   maxPos    most positionals allowed
//   check     extra check on the parsed result

export type Parsed = { positionals: string[]; options: { name: string; value?: string }[] };

export type OptionSpec = Readonly<{
  flags: ReadonlySet<string>;
  args: ReadonlySet<string>;
  optArgs: ReadonlySet<string>;
  long: ReadonlySet<string>;
  longArgs: ReadonlySet<string>;
  longOpt: ReadonlySet<string>;
  numeric: boolean;
  maxPos: number;
  check: ((p: Parsed) => boolean) | null;
}>;

export type ParseResult = (Parsed & { ok: true }) | Readonly<{ ok: false; detail: string }>;

export const words = (s: string) => s.split(/\s+/).filter(Boolean);

export function spec(
  o: {
    flags?: string;
    args?: string;
    optArgs?: string;
    long?: string;
    longArgs?: string;
    longOpt?: string;
    numeric?: boolean;
    maxPos?: number;
    check?: ((p: Parsed) => boolean) | null;
  } = {},
): OptionSpec {
  return {
    flags: new Set(o.flags ?? ""),
    args: new Set(o.args ?? ""),
    optArgs: new Set(o.optArgs ?? ""),
    long: new Set(words(o.long ?? "")),
    longArgs: new Set(words(o.longArgs ?? "")),
    longOpt: new Set(words(o.longOpt ?? "")),
    numeric: o.numeric ?? false,
    maxPos: o.maxPos ?? Infinity,
    check: o.check ?? null,
  };
}

/** Parse `args` against `s`, getopt style, exact long-option names only. */
export function parseOptions(args: readonly string[], s: OptionSpec): ParseResult {
  const positionals: string[] = [];
  const options: { name: string; value?: string }[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--") {
      positionals.push(...args.slice(i + 1));
      break;
    }
    if (a === "-" || !a.startsWith("-")) {
      positionals.push(a);
      continue;
    }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      const name = eq < 0 ? a.slice(2) : a.slice(2, eq);
      const value = eq < 0 ? undefined : a.slice(eq + 1);
      if (s.long.has(name) && value === undefined) {
        options.push({ name: `--${name}` });
      } else if (s.longOpt.has(name)) {
        options.push({ name: `--${name}`, value });
      } else if (s.longArgs.has(name)) {
        if (value !== undefined) {
          options.push({ name: `--${name}`, value });
        } else if (i + 1 < args.length) {
          options.push({ name: `--${name}`, value: args[++i] });
        } else {
          return { ok: false, detail: `${a} needs a value` };
        }
      } else {
        return {
          ok: false,
          detail: `option ${eq < 0 ? a : a.slice(0, eq)} is not on the read-only list`,
        };
      }
      continue;
    }
    if (s.numeric && /^-\d+$/.test(a)) {
      options.push({ name: "-N", value: a.slice(1) });
      continue;
    }
    // A short-option cluster.
    for (let j = 1; j < a.length; j++) {
      const c = a[j];
      if (s.flags.has(c)) {
        options.push({ name: `-${c}` });
      } else if (s.optArgs.has(c)) {
        options.push({ name: `-${c}`, value: a.slice(j + 1) || undefined });
        break;
      } else if (s.args.has(c)) {
        const rest = a.slice(j + 1);
        if (rest) {
          options.push({ name: `-${c}`, value: rest });
        } else if (i + 1 < args.length) {
          options.push({ name: `-${c}`, value: args[++i] });
        } else {
          return { ok: false, detail: `-${c} needs a value` };
        }
        break;
      } else {
        return {
          ok: false,
          detail: `option -${c}${j === 1 && a.length > 2 ? ` (in ${a})` : ""} is not on the read-only list`,
        };
      }
    }
  }
  if (positionals.length > s.maxPos) {
    return { ok: false, detail: `at most ${s.maxPos} operand(s)` };
  }
  return { ok: true, positionals, options };
}
