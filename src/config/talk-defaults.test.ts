import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildConfigDocBaseline,
  flattenConfigDocBaselineEntries,
  normalizeConfigDocBaselineHelpPath,
} from "./doc-baseline.js";
import { FIELD_HELP } from "./schema.help.js";
import {
  describeTalkSilenceTimeoutDefaults,
  TALK_SILENCE_TIMEOUT_MS_BY_PLATFORM,
} from "./talk-defaults.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("talk silence timeout defaults", () => {
  it("keeps help text and docs aligned with the policy", async () => {
    const defaultsDescription = describeTalkSilenceTimeoutDefaults();
    const baseline = await buildConfigDocBaseline();
    const talkEntry = flattenConfigDocBaselineEntries(baseline).find(
      (entry) => entry.path === normalizeConfigDocBaselineHelpPath("talk.silenceTimeoutMs"),
    );

    expect(FIELD_HELP["talk.silenceTimeoutMs"]).toContain(defaultsDescription);
    expect(talkEntry?.help).toContain(defaultsDescription);
    expect(readRepoFile("docs/gateway/configuration-reference.md")).toContain(defaultsDescription);
    expect(readRepoFile("docs/nodes/talk.md")).toContain(defaultsDescription);
  });

  // The native clients are not checked out in every tree -- the OSS repo has no
  // apps/ directory at all -- and a parity test has nothing to compare when the
  // other side is absent. Reported as skipped rather than failing on a missing
  // file, or quietly passing while asserting nothing.
  it.skipIf(!fs.existsSync(path.join(repoRoot, "apps")))(
    "matches the Apple and Android runtime constants",
    () => {
      const macDefaults = readRepoFile("apps/macos/Sources/Enclawed/TalkDefaults.swift");
      const iosDefaults = readRepoFile("apps/ios/Sources/Voice/TalkDefaults.swift");
      const androidDefaults = readRepoFile(
        "apps/android/app/src/main/java/ai/enclawed/app/voice/TalkDefaults.kt",
      );

      expect(macDefaults).toContain(
        `static let silenceTimeoutMs = ${TALK_SILENCE_TIMEOUT_MS_BY_PLATFORM.macos}`,
      );
      expect(iosDefaults).toContain(
        `static let silenceTimeoutMs = ${TALK_SILENCE_TIMEOUT_MS_BY_PLATFORM.ios}`,
      );
      expect(androidDefaults).toContain(
        `const val defaultSilenceTimeoutMs = ${TALK_SILENCE_TIMEOUT_MS_BY_PLATFORM.android}L`,
      );
    },
  );
});
