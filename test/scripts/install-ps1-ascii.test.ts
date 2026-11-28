import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Windows PowerShell 5.1 reads a script file without a byte-order mark as ANSI,
// and the installer runs a saved copy of itself, so any non-ASCII character in
// install.ps1 breaks every install there. `e (the escape character) exists only
// in PowerShell 7.
describe("install.ps1", () => {
  const text = fs.readFileSync(path.join(__dirname, "..", "..", "scripts", "install.ps1"), "utf8");

  it("is pure ASCII", () => {
    const lines = text
      .split("\n")
      .flatMap((l, i) =>
        Array.from({ length: l.length }, (_, k) => l.charCodeAt(k)).some((c) => c > 0x7f)
          ? [`${i + 1}: ${l}`]
          : [],
      );
    expect(lines).toEqual([]);
  });

  it("does not use the PowerShell 7-only `e escape", () => {
    expect(text.includes("`e[")).toBe(false);
  });

  it("never assigns to a PowerShell automatic variable (names are case-insensitive)", () => {
    const automatic = new Set([
      "error",
      "host",
      "input",
      "args",
      "matches",
      "home",
      "pid",
      "pwd",
      "profile",
      "psitem",
      "this",
      "true",
      "false",
      "null",
    ]);
    const bad = text.split("\n").flatMap((l, i) => {
      const m = /^\s*\$([A-Za-z_]+)\s*=[^=]/.exec(l);
      return m && automatic.has(m[1].toLowerCase()) ? [`${i + 1}: ${l.trim()}`] : [];
    });
    expect(bad).toEqual([]);
  });
});
