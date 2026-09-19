import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildOpenAICodexProviderPlugin } from "./openai-codex-provider.js";
import { buildOpenAIProvider } from "./openai-provider.js";

const manifest = JSON.parse(
  readFileSync(new URL("./enclawed.plugin.json", import.meta.url), "utf8"),
) as {
  providerAuthChoices?: Array<{
    provider?: string;
    method?: string;
    choiceLabel?: string;
    choiceHint?: string;
    choiceId?: string;
    deprecatedChoiceIds?: string[];
    groupHint?: string;
  }>;
};

const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as {
  dependencies?: Record<string, string>;
};

function manifestComparableWizardFields(choice: {
  choiceId?: string;
  choiceLabel?: string;
  choiceHint?: string;
  groupId?: string;
  groupLabel?: string;
  groupHint?: string;
}) {
  return Object.fromEntries(
    Object.entries({
      choiceId: choice.choiceId,
      choiceLabel: choice.choiceLabel,
      choiceHint: choice.choiceHint,
      groupId: choice.groupId,
      groupLabel: choice.groupLabel,
      groupHint: choice.groupHint,
    }).filter(([, value]) => value !== undefined),
  );
}

function providerWizardByKey() {
  const providers = [buildOpenAIProvider(), buildOpenAICodexProviderPlugin()];
  const wizards = new Map<string, Record<string, unknown>>();

  for (const provider of providers) {
    for (const authMethod of provider.auth ?? []) {
      if (authMethod.wizard) {
        wizards.set(`${provider.id}:${authMethod.id}`, authMethod.wizard);
      }
    }
  }

  return wizards;
}

describe("OpenAI plugin manifest", () => {
  it("keeps runtime dependencies in the package manifest", () => {
    // Checked against the root pin rather than a hard-coded version. The Pi
    // family has to move in lockstep -- a literal here drifts into exactly the
    // mixed graph pi-package-graph guards against, and it had: this said 0.71.1
    // while the tree ran 0.80.2. Only the version is compared, since the root
    // pins exactly and an extension may carry a compatible range.
    const readPinnedVersion = (spec: string | undefined): string | undefined => {
      if (!spec) {
        return undefined;
      }
      const at = spec.lastIndexOf("@");
      const version = at > 0 ? spec.slice(at + 1) : spec;
      return version.replace(/^[\^~]/, "");
    };
    const rootPackageJson = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { dependencies?: Record<string, string> };

    const rootPiAi = readPinnedVersion(rootPackageJson.dependencies?.["@mariozechner/pi-ai"]);
    expect(rootPiAi, "root must pin @mariozechner/pi-ai").toBeTruthy();
    expect(readPinnedVersion(packageJson.dependencies?.["@mariozechner/pi-ai"])).toBe(rootPiAi);
    // Declared, not pinned to a literal: what this case is for is that the
    // plugin still carries its runtime dependency in its own manifest, and a
    // hard-coded range broke on every routine bump (it said ^8.20.0 against an
    // ^8.21.0 tree) without telling anyone anything useful.
    expect(packageJson.dependencies?.ws).toMatch(/^\^?\d+\.\d+\.\d+$/);
  });

  it("keeps removed Codex CLI import auth choice as a deprecated browser-login alias", () => {
    const codexBrowserLogin = manifest.providerAuthChoices?.find(
      (choice) => choice.choiceId === "openai-codex",
    );

    expect(codexBrowserLogin?.deprecatedChoiceIds).toContain("openai-codex-import");
  });

  it("labels OpenAI API key and Codex auth choices without stale mixed OAuth wording", () => {
    const choices = manifest.providerAuthChoices ?? [];
    const codexBrowserLogin = choices.find((choice) => choice.choiceId === "openai-codex");
    const codexDeviceCode = choices.find(
      (choice) => choice.choiceId === "openai-codex-device-code",
    );
    const apiKey = choices.find(
      (choice) => choice.provider === "openai" && choice.method === "api-key",
    );

    expect(codexBrowserLogin).toMatchObject({
      choiceLabel: "OpenAI Codex Browser Login",
      choiceHint: "Sign in with OpenAI in your browser",
      groupId: "openai-codex",
      groupLabel: "OpenAI Codex",
      groupHint: "ChatGPT/Codex sign-in",
    });
    expect(codexDeviceCode).toMatchObject({
      choiceLabel: "OpenAI Codex Device Pairing",
      choiceHint: "Pair in browser with a device code",
      groupId: "openai-codex",
      groupLabel: "OpenAI Codex",
      groupHint: "ChatGPT/Codex sign-in",
    });
    expect(apiKey).toMatchObject({
      choiceLabel: "OpenAI API Key",
      groupId: "openai",
      groupLabel: "OpenAI",
      groupHint: "Direct API key",
    });
    expect(choices.map((choice) => choice.choiceLabel)).not.toContain(
      "OpenAI Codex (ChatGPT OAuth)",
    );
    expect(choices.map((choice) => choice.groupHint)).not.toContain("Codex OAuth + API key");
    expect(choices.map((choice) => choice.groupHint)).not.toContain("API key or Codex sign-in");
  });

  it("keeps auth choice copy aligned with provider wizard metadata", () => {
    const wizards = providerWizardByKey();

    for (const choice of manifest.providerAuthChoices ?? []) {
      const key = `${choice.provider}:${choice.method}`;

      expect(wizards.get(key), key).toMatchObject(manifestComparableWizardFields(choice));
    }
  });
});
