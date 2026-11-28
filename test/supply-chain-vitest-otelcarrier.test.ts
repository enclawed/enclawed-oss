// Supply-chain tripwire for GHSA-2h32-95rg-cppp.
//
// Vitest browser mode served the `otelCarrier` query parameter unsanitized as
// inline script, letting a request that reached the browser-mode dev server
// inject arbitrary JS. First patched: 4.1.6 (the root devDependency floor
// `vitest: ^4.1.12` in package.json keeps the resolution above it).
//
// This test exists to guarantee that a future bump, downgrade, or transitive
// re-resolution can never land a vulnerable Vitest in the workspace without
// also flipping a deliberate test-suite red. Behaviour-style exploitation
// would require booting browser-mode and racing the dev server; the
// dependency-floor assertion is the right shape — short, deterministic, and
// it catches the only thing that re-opens the vulnerability (a sub-4.1.6
// resolution).
//
// Refs:
//   - https://github.com/advisories/GHSA-2h32-95rg-cppp
//   - https://github.com/vitest-dev/vitest/security/advisories/GHSA-2h32-95rg-cppp

import { describe, expect, test } from "vitest";
import vitestPkg from "vitest/package.json" with { type: "json" };

const FIRST_PATCHED = { major: 4, minor: 1, patch: 6 } as const;

describe("supply-chain: vitest GHSA-2h32-95rg-cppp", () => {
  test(`resolved vitest is >= ${FIRST_PATCHED.major}.${FIRST_PATCHED.minor}.${FIRST_PATCHED.patch}`, () => {
    const raw = vitestPkg.version;
    const m = raw.match(/^(\d+)\.(\d+)\.(\d+)/);
    expect(m, `unparseable vitest version: ${raw}`).not.toBeNull();
    const [, majS, minS, patS] = m as RegExpMatchArray;
    const major = Number(majS);
    const minor = Number(minS);
    const patch = Number(patS);
    const safe =
      major > FIRST_PATCHED.major ||
      (major === FIRST_PATCHED.major &&
        (minor > FIRST_PATCHED.minor ||
          (minor === FIRST_PATCHED.minor && patch >= FIRST_PATCHED.patch)));
    expect(
      safe,
      `vitest ${raw} is below ${FIRST_PATCHED.major}.${FIRST_PATCHED.minor}.${FIRST_PATCHED.patch}; ` +
        `GHSA-2h32-95rg-cppp is open. Raise the vitest devDependency floor in package.json.`,
    ).toBe(true);
  });
});
