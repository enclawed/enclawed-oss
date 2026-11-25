// enclawed adapter kit: the verified effects of one MCP tool call, from the
// server's own code.
//
// At admission the launcher hands the kit the stdio server's definition (its
// command and arguments). The kit captures the program it runs (a Node
// script) and the regular files its arguments name (the server's static
// inputs: a configuration, a data file), as they are when the server starts.
// For each call the kit then interprets the server's request handler on the
// exact request the host will send ({method: "tools/call", name, arguments})
// with an abstract interpreter and collects every system effect the handler
// can produce: reads, writes, deletions, programs started, network peers.
//
// SOUNDNESS. The interpreter over-approximates:
//   - a value it cannot know is TOP; a condition on TOP runs both branches;
//     a loop over TOP runs its body once with every variable the body
//     assigns set to TOP first; a callback handed to a builtin runs (it may);
//   - a try block, a catch block and every branch taken under an unknown
//     condition run "uncertain": an assignment there to a variable or object
//     from outside the region makes it TOP;
//   - before the call, a discovery pass runs the handler on an unknown
//     request (every branch) and makes TOP every module variable and shared
//     object any request could change, so earlier calls (another tool,
//     other arguments, a rug-pull counter) are covered;
//   - every construct outside the modeled subset (classes, generators, eval,
//     dynamic import, unmodeled modules or members, getters, a step budget)
//     fails the whole analysis: no effect set, and the call keeps the
//     ordinary rule (it asks).
// What the analysis never uses: the server's description of its tools,
// annotations or names. A tool annotated read-only that deletes is a tool
// that deletes.

import fs from "node:fs";
import path from "node:path";
import { parse } from "acorn";
import { gitCommandStarts, type GitProgram } from "./git-programs.js";
import { classifyArgv } from "./shell-readonly.js";

export type McpEffect =
  | Readonly<{ kind: "read"; path: string | null }>
  | Readonly<{ kind: "write"; path: string | null }>
  | Readonly<{ kind: "delete"; path: string | null }>
  | Readonly<{
      kind: "spawn";
      program: string | null;
      /** Its arguments when every one is known (an argument array), else null. */
      argv?: readonly string[] | null;
      /** The directory it runs in, when known; null when computed or inherited. */
      cwd?: string | null;
      /** The environment it is given, when every name and value is known; null otherwise (inherited or computed). */
      env?: Readonly<Record<string, string>> | null;
    }>
  | Readonly<{ kind: "net"; dest: string | null }>;

export type McpCallEffects =
  | Readonly<{ ok: true; effects: readonly McpEffect[] }>
  | Readonly<{ ok: false; why: string }>;

/** A stdio server's program as it starts: its code and the files its arguments name. */
export type McpProgramImage = Readonly<{
  entry: string;
  cwd: string;
  /** process.argv.slice(2) of the server, absolute when they name files. */
  argv: readonly string[];
  /** Regular files the arguments name, with their content at start. */
  files: ReadonlyMap<string, string>;
  ast: unknown;
}>;

const MAX_FILE = 1024 * 1024;
const MAX_STEPS = 400_000;
const MAX_OR = 24;

/**
 * Capture the program a stdio definition runs: `node <script.mjs|.js> args...`
 * (no interpreter option). Anything else is not analyzable (null + why).
 */
export function loadMcpProgram(
  def: Readonly<{ command?: string | null; args?: readonly unknown[] }>,
  o: Readonly<{ cwd: string }>,
): { image: McpProgramImage } | { why: string } {
  const cmd = typeof def.command === "string" ? def.command : "";
  const args = (def.args ?? []).map((a) => (typeof a === "string" ? a : null));
  if (path.basename(cmd) !== "node" && cmd !== process.execPath) {
    return { why: "it is not a Node program" };
  }
  if (args.some((a) => a === null)) {
    return { why: "an argument is not a string" };
  }
  const [script, ...rest] = args as string[];
  if (!script || script.startsWith("-") || !/\.(?:mjs|cjs|js)$/.test(script)) {
    return { why: "it does not run one script file" };
  }
  const entry = path.resolve(o.cwd, script);
  let source: string;
  try {
    if (fs.statSync(entry).size > MAX_FILE) {
      return { why: "its script is too large to analyze" };
    }
    source = fs.readFileSync(entry, "utf8");
  } catch {
    return { why: "its script cannot be read" };
  }
  let ast: unknown;
  try {
    ast = parse(source, {
      ecmaVersion: "latest",
      sourceType: entry.endsWith(".cjs") ? "script" : "module",
      allowHashBang: true,
    });
  } catch (err) {
    return { why: `its script does not parse (${(err as Error).message})` };
  }
  const files = new Map<string, string>();
  for (const a of rest) {
    const p = path.resolve(o.cwd, a);
    try {
      const st = fs.lstatSync(p);
      if (st.isFile() && st.size <= MAX_FILE) {
        files.set(p, fs.readFileSync(p, "utf8"));
      }
    } catch {
      /* not a file */
    }
  }
  return { image: { entry, cwd: o.cwd, argv: rest, files, ast } };
}

// ─── Abstract values ────────────────────────────────────────────────────

class Top {
  constructor(readonly truth: boolean | null = null) {}
}
const TOP = new Top();
const FALSY_TOP = new Top(false);
const TRUTHY_TOP = new Top(true);
class Or {
  constructor(readonly vs: readonly unknown[]) {}
}
class Native {
  constructor(
    readonly name: string,
    readonly call: (args: unknown[], self: unknown, n: Node) => unknown,
    readonly ctor = false,
  ) {}
}
class PromiseVal {
  constructor(readonly value: unknown) {}
}
// An ESTree node from acorn. The interpreter dispatches on `type` and reads
// each node kind's fields by the ESTree specification; acorn's own union type
// would need a cast at every field read, which checks nothing more.
// oxlint-disable-next-line typescript-eslint/no-explicit-any
type Node = { type: string; [k: string]: any };
class Closure {
  constructor(
    readonly node: Node,
    readonly scope: Scope,
  ) {}
}
class Unsupported extends Error {}
class Ret {
  constructor(readonly v: unknown) {}
}
class Brk {
  readonly kind = "break";
}
class Cont {
  readonly kind = "continue";
}
class Thrown {
  constructor(readonly v: unknown) {}
}

type Binding = { v: unknown; constant: boolean };
class Scope {
  readonly vars = new Map<string, Binding>();
  constructor(
    readonly parent: Scope | null,
    readonly level: number,
  ) {}
  find(name: string): { scope: Scope; b: Binding } | null {
    const b = this.vars.get(name);
    if (b) {
      return { scope: this, b };
    }
    return this.parent ? this.parent.find(name) : null;
  }
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" &&
  v !== null &&
  !(v instanceof Top) &&
  !(v instanceof Or) &&
  !(v instanceof Native) &&
  !(v instanceof Closure) &&
  !(v instanceof PromiseVal) &&
  !(v instanceof RegExp);
const unsupported = (what: string): never => {
  throw new Unsupported(what);
};

const STRING_METHODS = new Set([
  "startsWith",
  "endsWith",
  "slice",
  "substring",
  "replace",
  "replaceAll",
  "split",
  "trim",
  "trimStart",
  "trimEnd",
  "toLowerCase",
  "toUpperCase",
  "includes",
  "indexOf",
  "lastIndexOf",
  "match",
  "padStart",
  "padEnd",
  "repeat",
  "charAt",
  "charCodeAt",
  "at",
  "concat",
  "normalize",
  "search",
  "toString",
]);
const ARRAY_PURE = new Set([
  "map",
  "flatMap",
  "filter",
  "find",
  "findIndex",
  "some",
  "every",
  "forEach",
  "reduce",
  "join",
  "includes",
  "indexOf",
  "slice",
  "concat",
  "at",
  "flat",
  "keys",
  "values",
  "entries",
]);
const ARRAY_MUTATING = new Set([
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "sort",
  "reverse",
  "fill",
]);

// ─── The interpreter ────────────────────────────────────────────────────

class Interp {
  uncertain = 0;
  steps = 0;
  effects: McpEffect[] = [];
  recording = false;
  readonly handlers: Closure[] = [];
  readonly lifecycle: Closure[] = [];
  /** Objects whose content is unknown (mutated where it may or may not run). */
  readonly havocked = new WeakSet<object>();
  /** Objects created during the current call (fresh), with the uncertain level of their creation. */
  readonly born = new WeakMap<object, number>();
  readonly module: Scope;
  private readonly fnReturns: unknown[][] = [];

  constructor(readonly image: McpProgramImage) {
    this.module = new Scope(null, 0);
    this.installGlobals();
  }

  effect(e: McpEffect): void {
    if (this.recording) {
      this.effects.push(e);
    }
  }

  tick(): void {
    if (++this.steps > MAX_STEPS) {
      unsupported("the analysis step budget");
    }
  }

  // ── values ──
  obj<T extends object>(o: T): T {
    this.born.set(o, this.uncertain);
    return o;
  }

  havoc(v: unknown, seen = new Set<unknown>()): void {
    if (v instanceof Or) {
      for (const x of v.vs) {
        this.havoc(x, seen);
      }
      return;
    }
    if (!isObj(v) || seen.has(v)) {
      return;
    }
    seen.add(v);
    this.havocked.add(v);
    for (const x of Object.values(v)) {
      this.havoc(x, seen);
    }
  }

  /** A mutation of `o` where it may not happen (or that earlier calls may have made): its content is unknown. */
  mutate(o: unknown): boolean {
    if (!isObj(o)) {
      return false;
    }
    const lvl = this.born.get(o);
    if (lvl === undefined || lvl < this.uncertain) {
      this.havoc(o);
      return false;
    }
    return !this.havocked.has(o);
  }

  truth(v: unknown): boolean | null {
    if (v instanceof Top) {
      return v.truth;
    }
    if (v instanceof Or) {
      const ts = v.vs.map((x) => this.truth(x));
      return ts.every((t) => t === ts[0]) ? ts[0] : null;
    }
    if (v instanceof Native || v instanceof Closure || v instanceof PromiseVal) {
      return true;
    }
    return Boolean(v);
  }

  or(vs: unknown[]): unknown {
    const flat: unknown[] = [];
    for (const v of vs) {
      if (v instanceof Or) {
        flat.push(...v.vs);
      } else {
        flat.push(v);
      }
    }
    if (flat.some((v) => v instanceof Top && v.truth === null)) {
      return TOP;
    }
    const uniq = [...new Set(flat)];
    if (uniq.length === 1) {
      return uniq[0];
    }
    return uniq.length > MAX_OR ? TOP : new Or(uniq);
  }

  /** Apply f to each alternative of v (an Or) under uncertainty, or to v. */
  each(v: unknown, f: (x: unknown) => unknown): unknown {
    if (v instanceof Or) {
      return this.unsure(() => this.or(v.vs.map((x) => f(x))));
    }
    return f(v);
  }

  unsure<T>(f: () => T): T {
    this.uncertain++;
    try {
      return f();
    } finally {
      this.uncertain--;
    }
  }

  // ── scopes ──
  declare(scope: Scope, name: string, v: unknown, constant: boolean): void {
    scope.vars.set(name, { v, constant });
  }

  assign(scope: Scope, name: string, v: unknown): void {
    const f = scope.find(name);
    if (!f) {
      unsupported(`assignment to an undeclared name ${name}`);
      return;
    }
    if (f.b.constant) {
      unsupported(`assignment to a constant ${name}`);
    }
    f.b.v = f.scope.level < this.uncertain ? TOP : v;
  }

  /** Every name a subtree assigns and every root a subtree mutates: made TOP in `scope`. */
  havocAssigned(node: Node, scope: Scope): void {
    const names = new Set<string>();
    const roots = new Set<string>();
    walk(node, (n) => {
      if (n.type === "AssignmentExpression" || n.type === "UpdateExpression") {
        const t = n.type === "AssignmentExpression" ? n.left : n.argument;
        if (t.type === "Identifier") {
          names.add(t.name);
        } else {
          const r = rootName(t);
          if (r) {
            roots.add(r);
          } else {
            roots.add("*");
          }
        }
        if (t.type === "ObjectPattern" || t.type === "ArrayPattern") {
          walk(t, (p) => p.type === "Identifier" && names.add(p.name));
        }
      } else if (n.type === "UnaryExpression" && n.operator === "delete") {
        roots.add(rootName(n.argument) ?? "*");
      } else if (
        n.type === "CallExpression" &&
        n.callee.type === "MemberExpression" &&
        !n.callee.computed &&
        ARRAY_MUTATING.has(n.callee.property.name)
      ) {
        roots.add(rootName(n.callee.object) ?? "*");
      }
    });
    if (roots.has("*")) {
      unsupported("a mutation through a computed reference inside a loop or branch");
    }
    for (const name of names) {
      const f = scope.find(name);
      if (f && !f.b.constant) {
        f.b.v = TOP;
      }
    }
    for (const r of roots) {
      const f = scope.find(r);
      if (f) {
        this.havoc(f.b.v);
      }
    }
  }

  // ── statements ──
  hoist(body: Node[], scope: Scope): void {
    for (const s of body) {
      const d = s.type === "ExportNamedDeclaration" ? s.declaration : s;
      if (d?.type === "FunctionDeclaration") {
        this.declare(scope, d.id.name, new Closure(d, scope), false);
      }
    }
  }

  block(body: Node[], scope: Scope): void {
    this.hoist(body, scope);
    for (const s of body) {
      this.stmt(s, scope);
    }
  }

  stmt(s: Node, scope: Scope): void {
    this.tick();
    switch (s.type) {
      case "EmptyStatement":
      case "FunctionDeclaration":
        return;
      case "ImportDeclaration":
        return this.importDecl(s, scope);
      case "ExportNamedDeclaration":
        if (s.declaration) {
          this.stmt(s.declaration, scope);
        }
        return;
      case "VariableDeclaration":
        for (const d of s.declarations) {
          const v = d.init ? this.expr(d.init, scope) : undefined;
          this.bind(d.id, v, scope, s.kind === "const");
        }
        return;
      case "ExpressionStatement":
        this.expr(s.expression, scope);
        return;
      case "BlockStatement":
        return this.block(s.body, new Scope(scope, this.uncertain));
      case "IfStatement": {
        const c = this.truth(this.expr(s.test, scope));
        if (c === true) {
          return this.stmt(s.consequent, scope);
        }
        if (c === false) {
          return s.alternate ? this.stmt(s.alternate, scope) : undefined;
        }
        this.maybe(() => this.stmt(s.consequent, scope));
        if (s.alternate) {
          this.maybe(() => this.stmt(s.alternate, scope));
        }
        return;
      }
      case "ReturnStatement":
        throw new Ret(s.argument ? this.expr(s.argument, scope) : undefined);
      case "ThrowStatement":
        throw new Thrown(this.expr(s.argument, scope));
      case "BreakStatement":
        if (s.label) {
          unsupported("a labeled break");
        }
        throw new Brk();
      case "ContinueStatement":
        if (s.label) {
          unsupported("a labeled continue");
        }
        throw new Cont();
      case "TryStatement":
        return this.tryStmt(s, scope);
      case "ForOfStatement":
        return this.forOf(s, scope);
      case "ForStatement":
      case "WhileStatement":
      case "DoWhileStatement":
      case "ForInStatement":
        return this.looseLoop(s, scope);
      case "SwitchStatement":
        return this.switchStmt(s, scope);
      default:
        unsupported(`the statement ${s.type}`);
    }
  }

  /** Run f where it may or may not run: control transfers inside are absorbed. */
  maybe(f: () => void): void {
    this.uncertain++;
    try {
      f();
    } catch (e) {
      if (e instanceof Ret) {
        this.fnReturns.at(-1)?.push(e.v);
      } else if (!(e instanceof Brk || e instanceof Cont || e instanceof Thrown)) {
        throw e;
      }
    } finally {
      this.uncertain--;
    }
  }

  tryStmt(s: Node, scope: Scope): void {
    // The try block runs as written (its effects all counted). It may stop at
    // any step, and then the handler runs: the handler runs uncertain, and
    // unless it surely leaves (return, throw, break, continue), what the try
    // block assigned is unknown afterwards. A throw the analysis is sure of
    // goes to the handler for certain.
    let definite: Thrown | null = null;
    let leaving: Ret | Brk | Cont | null = null;
    try {
      this.stmt(s.block, scope);
    } catch (e) {
      if (e instanceof Thrown) {
        definite = e;
      } else if (e instanceof Ret) {
        this.fnReturns.at(-1)?.push(e.v);
        leaving = e;
      } else if (e instanceof Brk || e instanceof Cont) {
        leaving = e;
      } else {
        throw e;
      }
    }
    const runHandler = () => {
      const sc = new Scope(scope, this.uncertain);
      if (s.handler.param) {
        this.bind(s.handler.param, definite ? definite.v : TOP, sc, false);
      }
      this.block(s.handler.body.body, sc);
    };
    const exits = s.handler ? surelyLeaves(s.handler.body.body) : false;
    if (s.handler && definite) {
      // Certain: the handler runs, with what is known.
      try {
        runHandler();
      } finally {
        if (s.finalizer) {
          this.stmt(s.finalizer, scope);
        }
      }
      return;
    }
    if (s.handler) {
      this.maybe(runHandler);
      if (!exits) {
        this.havocAssigned(s.block, scope);
      }
    } else {
      this.havocAssigned(s.block, scope);
    }
    if (s.finalizer) {
      this.stmt(s.finalizer, scope);
    }
    if (definite && !s.handler) {
      throw definite;
    }
    if (leaving && (exits || !s.handler)) {
      throw leaving;
    }
  }

  forOf(s: Node, scope: Scope): void {
    const it = this.expr(s.right, scope);
    const decl = s.left.type === "VariableDeclaration" ? s.left : null;
    const target = decl ? decl.declarations[0].id : s.left;
    const runBody = (x: unknown) => {
      const sc = new Scope(scope, this.uncertain);
      if (decl) {
        this.bind(target, x, sc, decl.kind === "const");
      } else {
        this.assignPattern(target, x, sc);
      }
      this.stmt(s.body, sc);
    };
    const concrete = (v: unknown): unknown[] | null =>
      Array.isArray(v) && !this.havocked.has(v)
        ? [...v]
        : typeof v === "string"
          ? Array.from(v)
          : null;
    const alts = it instanceof Or ? it.vs : [it];
    const lists = alts.map(concrete);
    if (lists.every((l) => l !== null) && alts.length === 1) {
      // A known list: unrolled, in order.
      for (const x of lists[0]) {
        try {
          runBody(x);
        } catch (e) {
          if (e instanceof Brk) {
            return;
          }
          if (!(e instanceof Cont)) {
            throw e;
          }
        }
      }
      return;
    }
    // Unknown list, or one of several: the body once per known element and once with TOP, all uncertain.
    this.havocAssigned(s, scope);
    this.maybe(() => {
      for (const l of lists) {
        for (const x of l ?? [TOP]) {
          this.maybe(() => runBody(x));
        }
      }
    });
  }

  looseLoop(s: Node, scope: Scope): void {
    // Any other loop: its body once, every variable it assigns unknown, uncertain.
    const sc = new Scope(scope, this.uncertain);
    if (s.type === "ForStatement" && s.init) {
      if (s.init.type === "VariableDeclaration") {
        this.stmt(s.init, sc);
      } else {
        this.expr(s.init, sc);
      }
    }
    this.havocAssigned(s, sc);
    this.maybe(() => {
      if (s.test) {
        this.expr(s.test, sc);
      }
      if (s.type === "ForInStatement") {
        this.expr(s.right, sc);
        const isDecl = s.left.type === "VariableDeclaration";
        const inner = new Scope(sc, this.uncertain);
        if (isDecl) {
          this.bind(s.left.declarations[0].id, TOP, inner, false);
        } else {
          this.assignPattern(s.left, TOP, inner);
        }
        this.maybe(() => this.stmt(s.body, inner));
      } else {
        this.maybe(() => this.stmt(s.body, sc));
      }
      if (s.type === "ForStatement" && s.update) {
        this.expr(s.update, sc);
      }
    });
  }

  switchStmt(s: Node, scope: Scope): void {
    const d = this.expr(s.discriminant, scope);
    const sc = new Scope(scope, this.uncertain);
    // The first case that surely matches, when every earlier one surely does not.
    let start = -1;
    let known = true;
    for (let i = 0; i < s.cases.length && known; i++) {
      const c = s.cases[i];
      if (!c.test) {
        continue;
      }
      const eq = this.truth(this.binary("===", d, this.expr(c.test, scope)));
      if (eq === true) {
        start = i;
        break;
      }
      if (eq === null) {
        known = false;
      }
    }
    if (known) {
      if (start < 0) {
        start = s.cases.findIndex((c: Node) => !c.test);
      }
      if (start < 0) {
        return;
      }
      try {
        for (let i = start; i < s.cases.length; i++) {
          this.block(s.cases[i].consequent, sc);
        }
      } catch (e) {
        if (!(e instanceof Brk)) {
          throw e;
        }
      }
      return;
    }
    // Unknown: every case may be entered.
    for (let i = 0; i < s.cases.length; i++) {
      this.maybe(() => {
        for (let j = i; j < s.cases.length; j++) {
          this.block(s.cases[j].consequent, sc);
        }
      });
    }
  }

  // ── bindings ──
  bind(pat: Node, v: unknown, scope: Scope, constant: boolean): void {
    switch (pat.type) {
      case "Identifier":
        return this.declare(scope, pat.name, v, constant);
      case "AssignmentPattern":
        return this.bind(
          pat.left,
          v === undefined
            ? this.expr(pat.right, scope)
            : v instanceof Top || v instanceof Or
              ? this.or([v, this.unsure(() => this.expr(pat.right, scope))])
              : v,
          scope,
          constant,
        );
      case "ArrayPattern":
        pat.elements.forEach((el: Node | null, i: number) => {
          if (!el) {
            return;
          }
          if (el.type === "RestElement") {
            this.bind(
              el.argument,
              Array.isArray(v) && !this.havocked.has(v) ? this.obj(v.slice(i)) : TOP,
              scope,
              constant,
            );
          } else {
            this.bind(el, this.member(v, i), scope, constant);
          }
        });
        return;
      case "ObjectPattern":
        for (const p of pat.properties) {
          if (p.type === "RestElement") {
            this.bind(p.argument, TOP, scope, constant);
          } else {
            const key = p.computed ? this.expr(p.key, scope) : (p.key.name ?? p.key.value);
            this.bind(p.value, this.member(v, key), scope, constant);
          }
        }
        return;
      default:
        unsupported(`the pattern ${pat.type}`);
    }
  }

  assignPattern(pat: Node, v: unknown, scope: Scope): void {
    if (pat.type === "Identifier") {
      return this.assign(scope, pat.name, v);
    }
    if (pat.type === "MemberExpression") {
      return this.setMember(this.expr(pat.object, scope), this.propKey(pat, scope), v);
    }
    unsupported(`assignment to ${pat.type}`);
  }

  // ── expressions ──
  expr(e: Node, scope: Scope): unknown {
    this.tick();
    switch (e.type) {
      case "Literal":
        return e.regex ? new RegExp(e.regex.pattern, e.regex.flags) : e.value;
      case "Identifier": {
        if (e.name === "undefined") {
          return undefined;
        }
        const f = scope.find(e.name);
        return f ? f.b.v : unsupported(`the global ${e.name}`);
      }
      case "TemplateLiteral": {
        let out = e.quasis[0].value.cooked;
        for (let i = 0; i < e.expressions.length; i++) {
          const v = this.expr(e.expressions[i], scope);
          const s = this.toStr(v);
          if (s instanceof Top) {
            return TRUTHY_TOP;
          }
          out += s + e.quasis[i + 1].value.cooked;
        }
        return out;
      }
      case "ArrayExpression": {
        const out: unknown[] = [];
        for (const el of e.elements) {
          if (!el) {
            out.push(undefined);
          } else if (el.type === "SpreadElement") {
            const v = this.expr(el.argument, scope);
            if (!Array.isArray(v) || this.havocked.has(v)) {
              return this.obj(this.topArray());
            }
            out.push(...v);
          } else {
            out.push(this.expr(el, scope));
          }
        }
        return this.obj(out);
      }
      case "ObjectExpression": {
        const out: Record<string, unknown> = {};
        let unknownSpread = false;
        for (const p of e.properties) {
          if (p.type === "SpreadElement") {
            const v = this.expr(p.argument, scope);
            if (v === undefined || v === null) {
              continue;
            }
            if (!isObj(v) || this.havocked.has(v)) {
              unknownSpread = true;
              continue;
            }
            Object.assign(out, v);
          } else {
            if (p.kind !== "init") {
              unsupported("a getter or setter");
            }
            const key = p.computed ? this.expr(p.key, scope) : (p.key.name ?? p.key.value);
            if (typeof key !== "string" && typeof key !== "number") {
              unknownSpread = true;
              continue;
            }
            if (key === "__proto__") {
              unsupported("a __proto__ key");
            }
            out[String(key)] = this.expr(p.value, scope);
          }
        }
        const o = this.obj(out);
        if (unknownSpread) {
          this.havocked.add(o);
        }
        return o;
      }
      case "FunctionExpression":
      case "ArrowFunctionExpression":
        if (e.generator) {
          unsupported("a generator");
        }
        return new Closure(e, scope);
      case "UnaryExpression": {
        if (e.operator === "delete") {
          const o = this.expr(e.argument.object, scope);
          const k = this.propKey(e.argument, scope);
          this.each(o, (x) => {
            if (this.mutate(x) && (typeof k === "string" || typeof k === "number")) {
              delete (x as Record<string, unknown>)[k];
            } else if (isObj(x)) {
              this.havoc(x);
            }
            return true;
          });
          return true;
        }
        const v = this.expr(e.argument, scope);
        return this.unary(e.operator, v);
      }
      case "UpdateExpression": {
        if (e.argument.type !== "Identifier") {
          this.setMember(this.expr(e.argument.object, scope), this.propKey(e.argument, scope), TOP);
          return TOP;
        }
        const old = this.expr(e.argument, scope);
        const nv = typeof old === "number" ? old + (e.operator === "++" ? 1 : -1) : TOP;
        this.assign(scope, e.argument.name, nv);
        return e.prefix ? nv : old;
      }
      case "BinaryExpression":
        return this.binary(e.operator, this.expr(e.left, scope), this.expr(e.right, scope));
      case "LogicalExpression": {
        const l = this.expr(e.left, scope);
        const decided =
          e.operator === "??"
            ? l instanceof Top || l instanceof Or
              ? null
              : !(l === null || l === undefined)
            : this.truth(l);
        const takeLeft = e.operator === "&&" ? decided === false : decided === true;
        const takeRight = e.operator === "&&" ? decided === true : decided === false;
        if (e.operator === "??") {
          if (decided === true) {
            return l;
          }
          if (decided === false) {
            return this.expr(e.right, scope);
          }
        } else if (takeLeft) {
          return l;
        } else if (takeRight) {
          return this.expr(e.right, scope);
        }
        const r = this.unsure(() => this.expr(e.right, scope));
        // `a && b` with `a` unknown: `a` when falsy, else `b`.
        if (e.operator === "&&") {
          return this.or([l instanceof Top ? FALSY_TOP : this.falsyPart(l), r]);
        }
        if (e.operator === "||") {
          return this.or([l instanceof Top ? TRUTHY_TOP : this.truthyPart(l), r]);
        }
        return this.or([l, r]);
      }
      case "ConditionalExpression": {
        const c = this.truth(this.expr(e.test, scope));
        if (c === true) {
          return this.expr(e.consequent, scope);
        }
        if (c === false) {
          return this.expr(e.alternate, scope);
        }
        return this.unsure(() =>
          this.or([this.expr(e.consequent, scope), this.expr(e.alternate, scope)]),
        );
      }
      case "AssignmentExpression": {
        let v = this.expr(e.right, scope);
        if (e.operator !== "=") {
          const cur = this.expr(e.left, scope);
          v = this.binary(e.operator.slice(0, -1), cur, v);
        }
        if (e.left.type === "Identifier") {
          this.assign(scope, e.left.name, v);
        } else if (e.left.type === "MemberExpression") {
          this.setMember(this.expr(e.left.object, scope), this.propKey(e.left, scope), v);
        } else {
          unsupported("a destructuring assignment");
        }
        return v;
      }
      case "SequenceExpression": {
        let v: unknown;
        for (const x of e.expressions) {
          v = this.expr(x, scope);
        }
        return v;
      }
      case "ChainExpression":
        return this.expr(e.expression, scope);
      case "MemberExpression": {
        const o = this.expr(e.object, scope);
        if (e.optional && (o === null || o === undefined)) {
          return undefined;
        }
        const k = this.propKey(e, scope);
        return this.each(o, (x) =>
          e.optional && (x === null || x === undefined) ? undefined : this.member(x, k),
        );
      }
      case "CallExpression":
        return this.callExpr(e, scope);
      case "NewExpression": {
        const c = this.expr(e.callee, scope);
        const args = this.args(e.arguments, scope);
        if (c instanceof Native && c.ctor) {
          return c.call(args, undefined, e);
        }
        return unsupported("a constructor call");
      }
      case "AwaitExpression": {
        const v = this.expr(e.argument, scope);
        return v instanceof PromiseVal ? v.value : v;
      }
      case "ThisExpression":
        return undefined;
      case "MetaProperty":
        return this.obj({ url: TRUTHY_TOP });
      default:
        return unsupported(`the expression ${e.type}`);
    }
  }

  falsyPart(v: unknown): unknown {
    return v instanceof Or ? this.or(v.vs.filter((x) => this.truth(x) !== true)) : v;
  }

  truthyPart(v: unknown): unknown {
    return v instanceof Or ? this.or(v.vs.filter((x) => this.truth(x) !== false)) : v;
  }

  topArray(): unknown[] {
    const a: unknown[] = [];
    this.havocked.add(a);
    return a;
  }

  propKey(e: Node, scope: Scope): unknown {
    return e.computed ? this.expr(e.property, scope) : e.property.name;
  }

  toStr(v: unknown): string | Top {
    if (v instanceof Top || v instanceof Or || v instanceof PromiseVal) {
      return TOP;
    }
    if (isObj(v) || typeof v === "function" || v instanceof Native || v instanceof Closure) {
      return Array.isArray(v) && !this.havocked.has(v) && v.every((x) => typeof x === "string")
        ? v.join(",")
        : TOP;
    }
    return String(v);
  }

  unary(op: string, v: unknown): unknown {
    if (op === "!") {
      const t = this.truth(v);
      return t === null ? TOP : !t;
    }
    if (op === "typeof") {
      if (v instanceof Closure || v instanceof Native) {
        return "function";
      }
      return v instanceof Top || v instanceof Or ? TOP : isObj(v) ? "object" : typeof v;
    }
    if (op === "void") {
      return undefined;
    }
    if (v instanceof Top || v instanceof Or || isObj(v)) {
      return TOP;
    }
    switch (op) {
      case "-":
        return -(v as number);
      case "+":
        return Number(v);
      case "~":
        return ~(v as number);
      default:
        return TOP;
    }
  }

  binary(op: string, l: unknown, r: unknown): unknown {
    if (l instanceof Or || r instanceof Or) {
      const ls = l instanceof Or ? l.vs : [l];
      const rs = r instanceof Or ? r.vs : [r];
      const out: unknown[] = [];
      for (const a of ls) {
        for (const b of rs) {
          out.push(this.binary(op, a, b));
        }
      }
      return this.or(out);
    }
    if (op === "===" || op === "!==") {
      if (l instanceof Top || r instanceof Top) {
        return TOP;
      }
      if (isObj(l) || isObj(r)) {
        return op === "===" ? l === r : l !== r;
      }
      return op === "===" ? l === r : l !== r;
    }
    if (l instanceof Top || r instanceof Top || isObj(l) || isObj(r)) {
      if (op === "+" && (typeof l === "string" || typeof r === "string")) {
        return TRUTHY_TOP;
      }
      return TOP;
    }
    if (
      l instanceof Native ||
      r instanceof Native ||
      l instanceof Closure ||
      r instanceof Closure ||
      l instanceof RegExp ||
      r instanceof RegExp ||
      l instanceof PromiseVal ||
      r instanceof PromiseVal
    ) {
      return TOP;
    }
    // Primitives only here; JavaScript's own operator semantics apply.
    const a = l as number;
    const b = r as number;
    switch (op) {
      case "+":
        return a + b;
      case "-":
        return a - b;
      case "*":
        return a * b;
      case "/":
        return a / b;
      case "%":
        return a % b;
      case "==":
        return a == b;
      case "!=":
        return a != b;
      case "<":
        return a < b;
      case ">":
        return a > b;
      case "<=":
        return a <= b;
      case ">=":
        return a >= b;
      default:
        return TOP;
    }
  }

  member(o: unknown, k: unknown): unknown {
    if (o === null || o === undefined) {
      // A TypeError at run time: what follows does not run; nothing is learned.
      return TOP;
    }
    if (o instanceof Top || o instanceof PromiseVal) {
      return TOP;
    }
    if (typeof k !== "string" && typeof k !== "number") {
      if (isObj(o) || typeof o === "string") {
        return TOP;
      }
      return unsupported("a computed member of a builtin");
    }
    const key = String(k);
    if (o instanceof Native) {
      return unsupported(`the member ${key} of ${o.name}`);
    }
    if (o instanceof Closure) {
      return unsupported(`the member ${key} of a function`);
    }
    if (typeof o === "string") {
      if (key === "length") {
        return o.length;
      }
      if (/^\d+$/.test(key)) {
        return o[Number(key)];
      }
      if (STRING_METHODS.has(key)) {
        return this.method(o, key);
      }
      return unsupported(`the string member ${key}`);
    }
    if (o instanceof RegExp) {
      if (key === "test" || key === "exec") {
        return this.method(o, key);
      }
      return unsupported(`the regular-expression member ${key}`);
    }
    if (Array.isArray(o)) {
      if (key === "length") {
        return this.havocked.has(o) ? TOP : o.length;
      }
      if (ARRAY_PURE.has(key) || ARRAY_MUTATING.has(key)) {
        return this.method(o, key);
      }
      if (/^\d+$/.test(key)) {
        return this.havocked.has(o) ? TOP : o[Number(key)];
      }
      return TOP;
    }
    if (isObj(o)) {
      const special = modeledOf(o);
      if (special) {
        const m = special[key];
        return m === undefined ? unsupported(`the member ${key} of ${String(special[NAME])}`) : m;
      }
      if (this.havocked.has(o)) {
        return TOP;
      }
      return Object.hasOwn(o, key) ? o[key] : undefined;
    }
    if (typeof o === "number" || typeof o === "boolean") {
      return key === "toString" ? this.method(o, key) : TOP;
    }
    return TOP;
  }

  setMember(o: unknown, k: unknown, v: unknown): void {
    this.each(o, (x) => {
      if (isObj(x) && modeledOf(x)) {
        return unsupported("assignment to a builtin");
      }
      if (this.mutate(x) && (typeof k === "string" || typeof k === "number")) {
        if (k === "__proto__") {
          unsupported("a __proto__ assignment");
        }
        (x as Record<string, unknown>)[String(k)] = v;
      } else if (isObj(x)) {
        this.havoc(x);
      }
      return undefined;
    });
  }

  args(list: Node[], scope: Scope): unknown[] {
    const out: unknown[] = [];
    for (const a of list) {
      if (a.type === "SpreadElement") {
        const v = this.expr(a.argument, scope);
        if (!Array.isArray(v) || this.havocked.has(v)) {
          out.push(TOP);
          continue;
        }
        out.push(...v);
      } else {
        out.push(this.expr(a, scope));
      }
    }
    return out;
  }

  callExpr(e: Node, scope: Scope): unknown {
    let self: unknown;
    let fn: unknown;
    if (e.callee.type === "MemberExpression") {
      self = this.expr(e.callee.object, scope);
      if (e.callee.optional && (self === null || self === undefined)) {
        return undefined;
      }
      const k = this.propKey(e.callee, scope);
      fn = this.each(self, (x) => this.member(x, k));
    } else {
      fn = this.expr(e.callee, scope);
    }
    if (e.optional && (fn === null || fn === undefined)) {
      return undefined;
    }
    const args = this.args(e.arguments, scope);
    return this.each(fn, (f) => this.invoke(f, args, self, e));
  }

  invoke(f: unknown, args: unknown[], self: unknown, n: Node): unknown {
    if (f instanceof Native) {
      return f.call(args, self, n);
    }
    if (f instanceof Closure) {
      return this.callClosure(f, args);
    }
    if (f instanceof Top) {
      // An unknown function: a plain-data value's method (no I/O). Callbacks may run.
      this.runCallbacks(args);
      return TOP;
    }
    return unsupported("a call of a value that is not a function");
  }

  /** Callbacks handed to code the analysis does not follow: each may run, with unknown arguments. */
  runCallbacks(args: unknown[]): void {
    for (const a of args) {
      if (a instanceof Closure) {
        this.maybe(() => {
          this.callClosure(a, [TOP, TOP, TOP]);
        });
      } else if (isObj(a)) {
        for (const v of Object.values(a)) {
          if (v instanceof Closure) {
            this.maybe(() => {
              this.callClosure(v, [TOP, TOP, TOP]);
            });
          }
        }
      }
    }
  }

  depth = 0;
  callClosure(c: Closure, args: unknown[]): unknown {
    if (++this.depth > 64) {
      unsupported("recursion deeper than the analysis follows");
    }
    const n = c.node;
    const sc = new Scope(c.scope, this.uncertain);
    n.params.forEach((p: Node, i: number) => {
      if (p.type === "RestElement") {
        this.bind(p.argument, this.obj(args.slice(i)), sc, false);
      } else {
        this.bind(p, args[i], sc, false);
      }
    });
    this.fnReturns.push([]);
    let v: unknown;
    try {
      if (n.body.type === "BlockStatement") {
        try {
          this.block(n.body.body, sc);
          v = undefined;
        } catch (e) {
          if (e instanceof Ret) {
            v = e.v;
          } else {
            throw e;
          }
        }
      } else {
        v = this.expr(n.body, sc);
      }
      const maybes = this.fnReturns.at(-1) ?? [];
      if (maybes.length) {
        v = this.or([v, ...maybes]);
      }
    } finally {
      this.fnReturns.pop();
      this.depth--;
    }
    return n.async ? new PromiseVal(v) : v;
  }

  /** A closure as a JS function, for a builtin that calls it with known values. */
  jsFn(c: unknown): (...a: unknown[]) => unknown {
    return (...a: unknown[]) => {
      const v = this.invoke(c, a, undefined, { type: "callback" });
      if (v instanceof Top || v instanceof Or || v instanceof PromiseVal) {
        throw new UnknownResult();
      }
      return v;
    };
  }

  method(o: unknown, key: string): Native {
    return new Native(`.${key}`, (args) => {
      const known =
        !(Array.isArray(o) && this.havocked.has(o)) &&
        args.every((a) => !(a instanceof Top || a instanceof Or || a instanceof PromiseVal));
      if (Array.isArray(o) && ARRAY_MUTATING.has(key)) {
        if (!this.mutate(o) || !known) {
          this.havoc(o);
          this.runCallbacks(args);
          return TOP;
        }
      }
      if (!known) {
        this.runCallbacks(args);
        return TOP;
      }
      const real = args.map((a) => (a instanceof Closure ? this.jsFn(a) : a));
      if (real.some((a) => a instanceof Native || (isObj(a) && modeledOf(a)))) {
        return unsupported(`a builtin passed to ${key}`);
      }
      try {
        const out = (o as Record<string, (...x: unknown[]) => unknown>)[key](...real);
        if (isObj(out)) {
          this.obj(out);
        }
        if (key === "keys" || key === "values" || key === "entries") {
          return this.obj([...(out as Iterable<unknown>)]);
        }
        return out;
      } catch (err) {
        if (err instanceof UnknownResult) {
          // A callback whose result is unknown stopped the builtin: every
          // callback may still run on every element, uncertain.
          if (Array.isArray(o)) {
            if (ARRAY_MUTATING.has(key)) {
              this.havoc(o);
            }
            for (const a of args) {
              if (a instanceof Closure) {
                o.forEach((el, i) => this.maybe(() => void this.callClosure(a, [el, i, o])));
              }
            }
          } else {
            this.runCallbacks(args);
          }
          return TOP;
        }
        if (err instanceof Unsupported || err instanceof Ret || err instanceof Thrown) {
          throw err;
        }
        return TOP;
      }
    });
  }

  // ── modules and globals ──
  importDecl(s: Node, scope: Scope): void {
    const mod = this.moduleNamed(String(s.source.value));
    for (const sp of s.specifiers) {
      const v =
        sp.type === "ImportSpecifier"
          ? this.member(mod, sp.imported.name ?? sp.imported.value)
          : mod;
      this.declare(scope, sp.local.name, v, true);
    }
  }

  moduleNamed(name: string): unknown {
    const n = name.replace(/^node:/, "");
    const m = this.modules()[n];
    return m ?? unsupported(`the module ${name}`);
  }

  private modCache: Record<string, unknown> | null = null;
  modules(): Record<string, unknown> {
    if (this.modCache) {
      return this.modCache;
    }
    const p1 = (a: unknown): string | null => (typeof a === "string" ? a : null);
    const cwd = this.image.cwd;
    const strs = (args: unknown[]) => (args.every((a) => typeof a === "string") ? args : null);
    const pathFn = (name: string, f: (...a: string[]) => unknown) =>
      new Native(`path.${name}`, (args) => {
        const s = strs(args);
        return s ? f(...s) : TRUTHY_TOP;
      });
    const pathMod = modeled("path", {
      resolve: pathFn("resolve", (...a) => path.resolve(cwd, ...a)),
      join: pathFn("join", (...a) => path.join(...a)),
      dirname: pathFn("dirname", (a) => path.dirname(a)),
      basename: pathFn("basename", (...a) => path.basename(a[0], a[1])),
      extname: pathFn("extname", (a) => path.extname(a)),
      relative: pathFn("relative", (a, b) =>
        path.relative(path.resolve(cwd, a), path.resolve(cwd, b)),
      ),
      normalize: pathFn("normalize", (a) => path.normalize(a)),
      isAbsolute: pathFn("isAbsolute", (a) => path.isAbsolute(a)),
      sep: path.sep,
      delimiter: path.delimiter,
    });
    const at = (a: unknown) => {
      const s = p1(a);
      return s === null ? null : path.resolve(cwd, s);
    };
    const fsEffect = (kind: "read" | "write" | "delete", ret: (p: string | null) => unknown) =>
      new Native(`fs.${kind}`, (args) => {
        const p = at(args[0]);
        this.effect({ kind, path: p });
        this.runCallbacks(args.slice(1));
        return ret(p);
      });
    const readFile = new Native("fs.readFileSync", (args) => {
      const p = at(args[0]);
      this.effect({ kind: "read", path: p });
      if (p !== null && this.image.files.has(p)) {
        return this.image.files.get(p);
      }
      return TRUTHY_TOP;
    });
    const fsMod = modeled("fs", {
      readFileSync: readFile,
      readdirSync: fsEffect("read", () => this.obj(this.topArray())),
      existsSync: fsEffect("read", () => TOP),
      statSync: fsEffect("read", () => TRUTHY_TOP),
      lstatSync: fsEffect("read", () => TRUTHY_TOP),
      realpathSync: fsEffect("read", () => TRUTHY_TOP),
      accessSync: fsEffect("read", () => undefined),
      writeFileSync: fsEffect("write", () => undefined),
      appendFileSync: fsEffect("write", () => undefined),
      mkdirSync: fsEffect("write", () => TOP),
      copyFileSync: new Native("fs.copyFileSync", (args) => {
        this.effect({ kind: "read", path: at(args[0]) });
        this.effect({ kind: "write", path: at(args[1]) });
        return undefined;
      }),
      renameSync: new Native("fs.renameSync", (args) => {
        this.effect({ kind: "delete", path: at(args[0]) });
        this.effect({ kind: "write", path: at(args[1]) });
        return undefined;
      }),
      rmSync: fsEffect("delete", () => undefined),
      unlinkSync: fsEffect("delete", () => undefined),
      rmdirSync: fsEffect("delete", () => undefined),
      chmodSync: fsEffect("write", () => undefined),
      symlinkSync: new Native("fs.symlinkSync", (args) => {
        this.effect({ kind: "write", path: at(args[1]) });
        return undefined;
      }),
    });
    // What a started program is given, when known: its argument array, its
    // directory and its environment (spawnSync/spawn/execFile*: (file, args, options)).
    const knownArgv = (a: unknown): string[] | null =>
      Array.isArray(a) && !this.havocked.has(a) && a.every((x) => typeof x === "string")
        ? [...a]
        : null;
    const knownEnv = (o: unknown): Record<string, string> | null => {
      if (!isObj(o) || this.havocked.has(o) || !("env" in o)) {
        return null;
      }
      const e = o.env;
      if (!isObj(e) || this.havocked.has(e)) {
        return null;
      }
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(e)) {
        if (typeof v !== "string") {
          return null;
        }
        out[k] = v;
      }
      return out;
    };
    const spawn = (name: string) =>
      new Native(`child_process.${name}`, (args) => {
        const withArgs = name !== "execSync" && name !== "exec" && name !== "fork";
        const argv = withArgs ? knownArgv(args[1]) : null;
        const o = withArgs ? args[2] : null;
        const dir = isObj(o) && !this.havocked.has(o) && typeof o.cwd === "string" ? o.cwd : null;
        this.effect({
          kind: "spawn",
          program: p1(args[0]),
          argv,
          cwd: dir === null ? null : path.resolve(cwd, dir),
          env: argv ? knownEnv(o) : null,
        });
        this.runCallbacks(args.slice(1));
        return modeled("child", {
          stdout: TRUTHY_TOP,
          stderr: TRUTHY_TOP,
          status: TOP,
          on: noop(this),
          pid: TOP,
        });
      });
    const cp = modeled("child_process", {
      spawnSync: spawn("spawnSync"),
      spawn: spawn("spawn"),
      execSync: spawn("execSync"),
      exec: spawn("exec"),
      execFile: spawn("execFile"),
      execFileSync: spawn("execFileSync"),
      fork: spawn("fork"),
    });
    const request = (proto: string) =>
      new Native(`${proto}.request`, (args) => {
        const o = args[0];
        let dest: string | null = null;
        if (typeof o === "string") {
          dest = o;
        } else if (isObj(o) && !this.havocked.has(o)) {
          const host = o.host ?? o.hostname;
          const port = o.port;
          if (
            typeof host === "string" &&
            (typeof port === "number" || typeof port === "string" || port === undefined)
          ) {
            dest = `${proto}://${host}${port !== undefined ? `:${port}` : ""}`;
          }
        }
        this.effect({ kind: "net", dest });
        this.runCallbacks(args.slice(1));
        const req: Record<string, unknown> = modeled("request", {});
        Object.assign(modeledOf(req) as object, {
          on: new Native("request.on", (a) => {
            this.runCallbacks(a.slice(1));
            return req;
          }),
          end: noop(this),
          write: noop(this),
          destroy: noop(this),
          setTimeout: noop(this),
        });
        return req;
      });
    const httpMod = (proto: string) =>
      modeled(proto, { request: request(proto), get: request(proto) });
    const readline = modeled("readline", {
      createInterface: new Native("readline.createInterface", (args) => {
        const o = args[0];
        const fromStdin = isObj(o) && !this.havocked.has(o) && o.input === this.stdin;
        const rl: Record<string, unknown> = modeled("readline.Interface", {});
        (modeledOf(rl) as Record<string, unknown>).on = new Native("Interface.on", (a) => {
          if (a[0] === "line" && fromStdin && a[1] instanceof Closure) {
            this.handlers.push(a[1]);
          } else {
            for (const x of a.slice(1)) {
              if (x instanceof Closure) {
                this.lifecycle.push(x);
              }
            }
          }
          return rl;
        });
        (modeledOf(rl) as Record<string, unknown>).close = noop(this);
        return rl;
      }),
    });
    this.modCache = {
      fs: fsMod,
      path: pathMod,
      child_process: cp,
      http: httpMod("http"),
      https: httpMod("https"),
      readline,
    };
    return this.modCache;
  }

  stdin: unknown = null;
  installGlobals(): void {
    this.stdin = modeled("process.stdin", {
      on: noop(this),
      setEncoding: noop(this),
      resume: noop(this),
    });
    const write = noop(this);
    const proc = modeled("process", {
      argv: this.obj(["node", this.image.entry, ...this.image.argv]),
      stdin: this.stdin,
      stdout: modeled("process.stdout", { write }),
      stderr: modeled("process.stderr", { write }),
      exit: new Native("process.exit", () => {
        throw new Thrown(undefined);
      }),
      execPath: process.execPath,
      env: (() => {
        const e = this.obj({});
        this.havocked.add(e);
        return e;
      })(),
      pid: TOP,
      platform: process.platform,
      cwd: new Native("process.cwd", () => this.image.cwd),
      on: new Native("process.on", (a) => {
        for (const x of a.slice(1)) {
          if (x instanceof Closure) {
            this.lifecycle.push(x);
          }
        }
        return undefined;
      }),
    });
    const json = modeled("JSON", {
      parse: new Native("JSON.parse", (args) => {
        if (typeof args[0] !== "string") {
          return TOP;
        }
        try {
          return this.objDeep(JSON.parse(args[0]));
        } catch {
          throw new Thrown(TOP);
        }
      }),
      stringify: new Native("JSON.stringify", (args) => this.stringify(args[0])),
    });
    const conv = (name: string, f: (v: unknown) => unknown) =>
      new Native(name, (args) => {
        const v = args[0];
        if (v instanceof Top || v instanceof Or || v instanceof PromiseVal) {
          return name === "String" ? TOP : TOP;
        }
        if (isObj(v)) {
          return name === "Boolean" ? true : name === "String" ? this.toStr(v) : TOP;
        }
        return f(v);
      });
    const errorCtor = (name: string) =>
      new Native(name, (args) => this.obj({ name, message: args[0] }), true);
    const promise = new Native(
      "Promise",
      (args) => {
        let resolved: unknown = TOP;
        const resolve = new Native("resolve", (a) => {
          resolved = this.or([resolved === TOP ? a[0] : resolved, a[0]]);
          return undefined;
        });
        if (args[0] instanceof Closure) {
          this.callClosure(args[0], [resolve, noop(this)]);
        }
        void resolved;
        return new PromiseVal(TOP);
      },
      true,
    );
    const g: Record<string, unknown> = {
      process: proc,
      JSON: json,
      String: conv("String", (v) => String(v)),
      Number: conv("Number", (v) => Number(v)),
      Boolean: conv("Boolean", (v) => Boolean(v)),
      Error: errorCtor("Error"),
      TypeError: errorCtor("TypeError"),
      RangeError: errorCtor("RangeError"),
      Promise: promise,
      Date: new Native(
        "Date",
        () => modeled("Date", { toISOString: topFn(), getTime: topFn(), valueOf: topFn() }),
        true,
      ),
      console: modeled("console", {
        log: noop(this),
        error: noop(this),
        warn: noop(this),
        info: noop(this),
      }),
      Object: modeled("Object", {
        keys: new Native("Object.keys", (a) =>
          isObj(a[0]) && !this.havocked.has(a[0])
            ? this.obj(Object.keys(a[0]))
            : this.obj(this.topArray()),
        ),
        values: new Native("Object.values", (a) =>
          isObj(a[0]) && !this.havocked.has(a[0])
            ? this.obj(Object.values(a[0]))
            : this.obj(this.topArray()),
        ),
        entries: new Native("Object.entries", (a) =>
          isObj(a[0]) && !this.havocked.has(a[0])
            ? this.obj(Object.entries(a[0]).map((x) => this.obj(x)))
            : this.obj(this.topArray()),
        ),
        hasOwn: new Native("Object.hasOwn", (a) =>
          isObj(a[0]) && !this.havocked.has(a[0]) && typeof a[1] === "string"
            ? Object.hasOwn(a[0], a[1])
            : TOP,
        ),
      }),
      Array: modeled("Array", {
        isArray: new Native("Array.isArray", (a) =>
          a[0] instanceof Top || a[0] instanceof Or ? TOP : Array.isArray(a[0]),
        ),
        from: new Native("Array.from", (a) => {
          this.runCallbacks(a.slice(1));
          return this.obj(this.topArray());
        }),
      }),
      Math: modeled("Math", {
        max: topFn(),
        min: topFn(),
        floor: topFn(),
        random: topFn(),
        abs: topFn(),
      }),
      setTimeout: new Native("setTimeout", (a) => {
        this.runCallbacks(a.slice(0, 1));
        return TOP;
      }),
      clearTimeout: noop(this),
      fetch: new Native("fetch", (a) => {
        this.effect({ kind: "net", dest: typeof a[0] === "string" ? a[0] : null });
        return new PromiseVal(TOP);
      }),
      NaN,
      Infinity,
    };
    for (const [k, v] of Object.entries(g)) {
      this.declare(this.module, k, v, true);
    }
  }

  objDeep(v: unknown): unknown {
    if (Array.isArray(v)) {
      v.forEach((x) => this.objDeep(x));
      return this.obj(v);
    }
    if (v && typeof v === "object") {
      if (Object.hasOwn(v, "__proto__")) {
        unsupported("a __proto__ key in parsed data");
      }
      Object.values(v).forEach((x) => this.objDeep(x));
      return this.obj(v);
    }
    return v;
  }

  stringify(v: unknown): unknown {
    const bad = (x: unknown): boolean =>
      x instanceof Top ||
      x instanceof Or ||
      x instanceof PromiseVal ||
      x instanceof Native ||
      x instanceof Closure ||
      (isObj(x) && (this.havocked.has(x) || Boolean(modeledOf(x)) || Object.values(x).some(bad)));
    if (bad(v)) {
      return TRUTHY_TOP;
    }
    return JSON.stringify(v);
  }
}

class UnknownResult extends Error {}

const MODELED = Symbol("modeled");
/** The members of a builtin the analysis models, or undefined for plain data. */
function modeledOf(o: unknown): Record<string | symbol, unknown> | undefined {
  return isObj(o)
    ? ((o as Record<symbol, unknown>)[MODELED] as Record<string | symbol, unknown> | undefined)
    : undefined;
}
const NAME = Symbol("name");
function modeled(name: string, members: Record<string, unknown>): Record<string, unknown> {
  const o: Record<string | symbol, unknown> = {};
  o[MODELED] = { ...members, [NAME]: name };
  return o as Record<string, unknown>;
}
const noop = (I: Interp) =>
  new Native("noop", (a) => {
    I.runCallbacks(a);
    return undefined;
  });
const topFn = () => new Native("top", () => TOP);

/** Does a statement list surely end by leaving (return, throw, break, continue)? */
function surelyLeaves(body: Node[]): boolean {
  const last = body.at(-1);
  if (!last) {
    return false;
  }
  if (
    ["ReturnStatement", "ThrowStatement", "BreakStatement", "ContinueStatement"].includes(last.type)
  ) {
    return true;
  }
  if (last.type === "BlockStatement") {
    return surelyLeaves(last.body);
  }
  if (last.type === "IfStatement" && last.alternate) {
    return surelyLeaves([last.consequent]) && surelyLeaves([last.alternate]);
  }
  return false;
}

function rootName(n: Node): string | null {
  let x = n;
  while (x.type === "MemberExpression" || x.type === "ChainExpression") {
    x = x.type === "ChainExpression" ? x.expression : x.object;
  }
  return x.type === "Identifier" ? x.name : null;
}

function walk(n: unknown, f: (n: Node) => void): void {
  if (!n || typeof n !== "object") {
    return;
  }
  if (Array.isArray(n)) {
    n.forEach((x) => walk(x, f));
    return;
  }
  const node = n as Node;
  if (typeof node.type === "string") {
    f(node);
  }
  for (const [k, v] of Object.entries(node)) {
    if (k !== "loc" && k !== "range" && v && typeof v === "object") {
      walk(v, f);
    }
  }
}

// Module-level setup, done once per image: the module scope after the
// server's top level ran, and the discovery pass's havoc (what any call may
// change). Rebuilt per call (cheap), so no state leaks between analyses.
function prepared(image: McpProgramImage): Interp {
  const I = new Interp(image);
  const program = image.ast as Node;
  try {
    I.block(program.body, I.module);
  } catch (e) {
    if (e instanceof Unsupported) {
      throw e;
    }
    // The top level threw or exited (a refused argument): no handler runs.
  }
  if (I.handlers.length !== 1) {
    unsupported(
      I.handlers.length === 0
        ? "no request handler on its standard input (a server shape the analysis does not read)"
        : "more than one request handler",
    );
  }
  // Discovery: any request, every branch; whatever it may change is unknown from here on.
  I.uncertain = 1;
  I.havocAssigned(
    { type: "Program", body: [...I.handlers, ...I.lifecycle].map((c) => c.node) },
    I.module,
  );
  const runAll = () => {
    for (const c of [I.handlers[0], ...I.lifecycle]) {
      I.maybe(() => {
        I.callClosure(c, [TRUTHY_TOP]);
      });
    }
  };
  runAll();
  I.uncertain = 0;
  return I;
}

/** The effects one tools/call request can have, by the server's code. */
export function mcpCallEffects(
  image: McpProgramImage,
  tool: string,
  args: Readonly<Record<string, unknown>>,
): McpCallEffects {
  try {
    const I = prepared(image);
    I.recording = true;
    const line = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: tool, arguments: args },
    });
    try {
      I.callClosure(I.handlers[0], [line]);
    } catch (e) {
      if (!(e instanceof Thrown || e instanceof Ret || e instanceof Brk || e instanceof Cont)) {
        throw e;
      }
    }
    // Lifecycle callbacks (close, error, timers) may run around any call.
    for (const c of I.lifecycle) {
      I.maybe(() => {
        I.callClosure(c, [TOP, TOP]);
      });
    }
    const seen = new Set<string>();
    const effects = I.effects.filter((e) => {
      const k = JSON.stringify(e);
      return seen.has(k) ? false : (seen.add(k), true);
    });
    return { ok: true, effects };
  } catch (e) {
    if (e instanceof Unsupported) {
      return { ok: false, why: `its code uses ${e.message}, which the analysis does not follow` };
    }
    return { ok: false, why: `the analysis failed (${(e as Error)?.message ?? String(e)})` };
  }
}

/**
 * Decide an MCP call by its verified effects. Effect-free means: no write
 * the person could lose, no deletion, no program started, no network peer,
 * and reads only of the project or of the server's own files; a call with
 * arguments must also leave them nowhere (no write at all). `reads` are
 * returned for the caller's secret and credential checks.
 */
// The variables a started git may be given without changing what it runs
// (the rest, GIT_* included, can name programs, directories or configuration).
const GIT_SAFE_ENV = /^(?:PATH|HOME|LANG|LANGUAGE|LC_[A-Z]+|TZ|GIT_CONFIG_NOSYSTEM)$/;

/**
 * Why a started program is an effect, or null when it is a read-only git
 * command of the project's repository: the program `git` found on a PATH of
 * system directories, every argument known and on the read-only allowlist
 * (./shell-readonly.ts), run in a known directory inside the project, given
 * a known environment that names no program or configuration of its own,
 * and starting none of the programs the repository's configuration can make
 * it start (./git-programs.ts). Anything not known stays an effect.
 */
function gitReadOf(
  e: Extract<McpEffect, { kind: "spawn" }>,
  o: Readonly<{
    projectDir: string;
    home: string | null;
    gitPrograms?: ((cwd: string) => readonly GitProgram[] | null) | null;
  }>,
): string | null {
  const started = `it starts a program (${e.program ?? "computed"})`;
  const inside = (p: string, dir: string) => p === dir || p.startsWith(dir + path.sep);
  if (e.program !== "git" || !e.argv || !e.env || !e.cwd || !o.gitPrograms) {
    return started;
  }
  if (!inside(e.cwd, o.projectDir)) {
    return `${started} outside the project (${e.cwd})`;
  }
  const env = e.env;
  if (Object.keys(env).some((k) => !GIT_SAFE_ENV.test(k))) {
    return `${started} with an environment that can change what it runs`;
  }
  const dirs = (env.PATH ?? "").split(":");
  const own = (d: string) =>
    !path.isAbsolute(d) ||
    inside(path.resolve(d), o.projectDir) ||
    (o.home !== null && inside(path.resolve(d), o.home));
  if (!env.PATH || dirs.some(own)) {
    return `${started} found on a PATH that is not the system's`;
  }
  // A HOME other than the person's: git reads its configuration from there.
  if (env.HOME !== undefined && env.HOME !== o.home) {
    for (const f of [
      path.join(env.HOME, ".gitconfig"),
      path.join(env.HOME, ".config", "git", "config"),
    ]) {
      if (fs.existsSync(f)) {
        return `${started} that reads the configuration ${f}`;
      }
    }
  }
  const v = classifyArgv(["git", ...e.argv]);
  if (!v.readOnly || !v.git) {
    return `${started}: git ${e.argv.join(" ").slice(0, 200)} is not read-only`;
  }
  let at = 1;
  const argv = ["git", ...e.argv];
  while (at < argv.length && argv[at].startsWith("-")) {
    at += argv[at] === "-C" ? 2 : 1;
  }
  const gitCwd = v.git.cdirs.reduce((acc, x) => path.resolve(acc, x), e.cwd);
  if (!inside(gitCwd, o.projectDir)) {
    return `${started} outside the project (${gitCwd})`;
  }
  const programs = o.gitPrograms(gitCwd);
  if (!programs) {
    return `${started}: the repository's git configuration could not be read`;
  }
  const hit = gitCommandStarts(
    { sub: v.git.sub, args: argv.slice(at + 1), global: argv.slice(1, at) },
    programs,
  );
  return hit ? `${started}: the repository's configuration makes git start ${hit.kind}` : null;
}

export function mcpEffectVerdict(
  image: McpProgramImage,
  tool: string,
  args: Readonly<Record<string, unknown>>,
  o: Readonly<{
    projectDir: string;
    home: string | null;
    /** The programs the repository at a directory can make git start (FsProbe.gitPrograms). */
    gitPrograms?: ((cwd: string) => readonly GitProgram[] | null) | null;
  }>,
):
  | Readonly<{ effectFree: true; reads: readonly string[] }>
  | Readonly<{ effectFree: false; why: string }> {
  const r = mcpCallEffects(image, tool, args);
  if (!r.ok) {
    return { effectFree: false, why: r.why };
  }
  const own = new Set(image.argv.map((a) => path.resolve(image.cwd, a)));
  const inside = (p: string, dir: string) => p === dir || p.startsWith(dir + path.sep);
  const serverOwn = (p: string) =>
    own.has(p) && !inside(p, o.projectDir) && !(o.home !== null && inside(p, o.home));
  const hasArgs = Object.keys(args).length > 0;
  const reads: string[] = [];
  for (const e of r.effects) {
    switch (e.kind) {
      case "read":
        if (e.path === null) {
          return { effectFree: false, why: "it reads a path it computes" };
        }
        if (!inside(e.path, o.projectDir) && !serverOwn(e.path)) {
          return { effectFree: false, why: `it reads ${e.path}, outside the project` };
        }
        reads.push(e.path);
        break;
      case "write":
        if (e.path === null || !serverOwn(e.path)) {
          return {
            effectFree: false,
            why: `it writes ${e.path ?? "a path it computes"}`,
          };
        }
        if (hasArgs) {
          return {
            effectFree: false,
            why: `it keeps what it is sent: it writes to ${e.path}, so the call's arguments leave this session`,
          };
        }
        break;
      case "delete":
        return { effectFree: false, why: `it deletes ${e.path ?? "a path it computes"}` };
      case "spawn": {
        const why = gitReadOf(e, o);
        if (why !== null) {
          return { effectFree: false, why };
        }
        // A read-only git command of the repository at e.cwd (inside the project).
        reads.push(e.cwd as string);
        break;
      }
      case "net":
        return {
          effectFree: false,
          why: `it reaches the network (${e.dest ?? "a computed peer"})`,
        };
    }
  }
  return { effectFree: true, reads };
}
