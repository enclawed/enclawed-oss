// The Executive Assistant demo app runs the enclaved flavor WITHOUT the FIPS
// requirement on purpose (app.config.json service.extraEnv sets
// ENCLAWED_FIPS_REQUIRED=0) and brings its own policy. Bootstrap refuses that
// env var as a downgrade, so the app passes its choice programmatically
// (src/runApp.ts). This boots the real runApp() in a child process, up to
// bootstrap completion, and pins the result: enclaved, FIPS not required (by
// option), the app's own policy, nothing refused.
//
// The app imports "enclawed/framework", which the package exports from
// dist/framework.js: the test boots against that real build output. Only when
// dist/framework.js is absent (no `pnpm build` yet) does it fall back to
// mapping the import to src/framework.ts, and it says so on stderr.
//
// Isolation: a throwaway HOME and audit path, a private network namespace (no
// network), and /sys/class/hidraw masked so no Enclaweder on the host is
// bound. The run stops at the app's next gate (two-factor authentication),
// before any mail access.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const repo = path.resolve(import.meta.dirname, "../..");
const appDir = path.join(repo, "enclawed-apps", "executive-assistant");

function canIsolate(): boolean {
  if (process.platform !== "linux") {
    return false;
  }
  return spawnSync("unshare", ["-r", "-m", "-n", "true"]).status === 0;
}
const hostHasHidraw = (() => {
  try {
    return readdirSync("/sys/class/hidraw").length > 0;
  } catch {
    return false;
  }
})();
const runnable = existsSync(appDir) && canIsolate();

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "ea-boot-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe.skipIf(!runnable)("executive assistant boots with its intended posture", () => {
  it(
    "enclaved flavor, FIPS off by the app's own option, its own policy, no refusals",
    { timeout: 180_000 },
    () => {
      const distFramework = path.join(repo, "dist", "framework.js");
      const useDist = existsSync(distFramework);
      if (!useDist) {
        process.stderr.write(
          "executive-assistant-boot.test: dist/framework.js is absent (run `pnpm build`); " +
            "falling back to src/framework.ts for this run.\n",
        );
      }
      const srcFramework = pathToFileURL(path.join(repo, "src/framework.ts")).href;
      const resolvedLog = path.join(dir, "framework-url.txt");
      // Records where "enclawed/framework" resolved from the app, mapped to
      // this checkout's framework (dist, or the source in the fallback case):
      // a workspace install with the hoisted linker links no "enclawed"
      // package for the app, so the bare name would not resolve.
      writeFileSync(
        path.join(dir, "hooks.mjs"),
        `import { writeFileSync } from "node:fs";
export async function resolve(s, c, next) {
  if (s !== "enclawed/framework") return next(s, c);
  const r = await next(${JSON.stringify(useDist ? pathToFileURL(distFramework).href : srcFramework)}, c);
  writeFileSync(${JSON.stringify(resolvedLog)}, r.url);
  return r;
}\n`,
      );
      writeFileSync(
        path.join(dir, "boot.mts"),
        `import { register } from "node:module";
register(${JSON.stringify(pathToFileURL(path.join(dir, "hooks.mjs")).href)});
const { runApp } = await import(${JSON.stringify(pathToFileURL(path.join(appDir, "src/runApp.ts")).href)});
console.log("runApp exit=" + (await runApp({ auditPath: process.env.EA_AUDIT })));
process.exit(0);\n`,
      );
      const home = path.join(dir, "home");
      const audit = path.join(dir, "audit.jsonl");
      // The app's service environment, as app.config.json service.extraEnv
      // sets it, plus placeholder (non-secret) mailbox settings it requires.
      const env = {
        PATH: process.env.PATH ?? "",
        HOME: home,
        ENCLAWED_FLAVOR: "enclaved",
        ENCLAWED_FIPS_REQUIRED: "0",
        EA_AUDIT: audit,
        ENCLAWED_EXECUTIVE_ASSISTANT_MAILBOX_EMAIL: "assistant@example.invalid",
        ENCLAWED_IMAP_APP_PASSWORD: "placeholder-not-a-secret",
        ENCLAWED_IMAP_HOST: "imap.example.invalid",
        ENCLAWED_SMTP_HOST: "smtp.example.invalid",
        ENCLAWED_CALDAV_URL: "https://cal.example.invalid/",
        ENCLAWED_CARDDAV_URL: "https://card.example.invalid/",
      };
      const mask = hostHasHidraw ? "mount -t tmpfs none /sys/class/hidraw && " : "";
      const res = spawnSync(
        "unshare",
        ["-r", "-m", "-n", "sh", "-c", `${mask}cd "$EA_APP" && exec node --import tsx "$EA_BOOT"`],
        {
          cwd: appDir,
          encoding: "utf8",
          env: { ...env, EA_APP: appDir, EA_BOOT: path.join(dir, "boot.mts") },
        },
      );
      expect(res.stderr).not.toMatch(/bootstrap failed/);
      expect(res.stderr).not.toMatch(/REFUSED/);
      expect(res.stdout).toMatch(/runApp exit=/);
      expect(readFileSync(resolvedLog, "utf8")).toBe(
        useDist ? pathToFileURL(distFramework).href : srcFramework,
      );
      const records = readFileSync(audit, "utf8")
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l) as { type: string; payload: Record<string, unknown> });
      const boot = records.find((r) => r.type === "enclawed.boot")?.payload;
      expect(boot).toMatchObject({
        flavor: "enclaved",
        flavorSource: "option",
        fipsRequired: false,
        fipsSource: "option",
        fipsDowngrade: true,
        enforceAllowlists: true,
        allowedProviders: ["ollama-local"],
        policyRefusals: [],
        rawSocketGuard: true,
      });
      expect(records.some((r) => r.type === "enclawed.policy.refused")).toBe(false);
    },
  );
});
