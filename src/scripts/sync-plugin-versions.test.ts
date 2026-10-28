import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { syncPluginVersions } from "../../scripts/sync-plugin-versions.js";
import { cleanupTempDirs, makeTempDir } from "../../test/helpers/temp-dir.js";

const tempDirs: string[] = [];

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

describe("syncPluginVersions", () => {
  afterEach(() => {
    cleanupTempDirs(tempDirs);
  });

  it("preserves workspace enclawed devDependencies and plugin host floors", () => {
    const rootDir = makeTempDir(tempDirs, "enclawed-sync-plugin-versions-");

    writeJson(path.join(rootDir, "package.json"), {
      name: "enclawed",
      version: "2026.4.1",
    });
    writeJson(path.join(rootDir, "extensions/bluebubbles/package.json"), {
      name: "@enclawed/bluebubbles",
      version: "2026.3.30",
      devDependencies: {
        enclawed: "workspace:*",
      },
      peerDependencies: {
        enclawed: ">=2026.3.30",
      },
      enclawed: {
        install: {
          minHostVersion: ">=2026.3.30",
        },
        compat: {
          pluginApi: ">=2026.3.30",
        },
        build: {
          enclawedVersion: "2026.3.30",
        },
      },
    });

    const summary = syncPluginVersions(rootDir);
    const updatedPackage = JSON.parse(
      fs.readFileSync(path.join(rootDir, "extensions/bluebubbles/package.json"), "utf8"),
    ) as {
      version?: string;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      enclawed?: {
        install?: {
          minHostVersion?: string;
        };
        compat?: {
          pluginApi?: string;
        };
        build?: {
          enclawedVersion?: string;
        };
      };
    };

    expect(summary.updated).toContain("@enclawed/bluebubbles");
    expect(updatedPackage.version).toBe("2026.4.1");
    expect(updatedPackage.devDependencies?.enclawed).toBe("workspace:*");
    expect(updatedPackage.peerDependencies?.enclawed).toBe(">=2026.4.1");
    expect(updatedPackage.enclawed?.install?.minHostVersion).toBe(">=2026.3.30");
    expect(updatedPackage.enclawed?.compat?.pluginApi).toBe(">=2026.4.1");
    expect(updatedPackage.enclawed?.build?.enclawedVersion).toBe("2026.4.1");
  });
});
