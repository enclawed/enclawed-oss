import { describe, expect, it } from "vitest";
import type { ChannelPlugin } from "../channels/plugins/types.js";
import type { EnclawedConfig } from "../config/config.js";
import { collectChannelSecurityFindings } from "./audit-channel.js";

function stubChannelPlugin(params: {
  id: "zalo";
  label: string;
  resolveAccount: (cfg: EnclawedConfig, accountId: string | null | undefined) => unknown;
}): ChannelPlugin {
  return {
    id: params.id,
    meta: {
      id: params.id,
      label: params.label,
      selectionLabel: params.label,
      docsPath: "/docs/testing",
      blurb: "test stub",
    },
    capabilities: {
      chatTypes: ["direct", "group"],
    },
    security: {},
    config: {
      listAccountIds: () => ["default"],
      resolveAccount: (cfg, accountId) => params.resolveAccount(cfg, accountId),
      isEnabled: () => true,
      isConfigured: () => true,
    },
  };
}

describe("security audit channel read-only resolution", () => {
  it("adds a read-only resolution warning when channel account resolveAccount throws", async () => {
    const plugin = stubChannelPlugin({
      id: "zalo",
      label: "Zalo",
      resolveAccount: () => {
        throw new Error("missing SecretRef");
      },
    });

    const cfg: EnclawedConfig = {
      channels: {
        zalo: {
          enabled: true,
        },
      },
    };

    const findings = await collectChannelSecurityFindings({
      cfg,
      plugins: [plugin],
    });

    const finding = findings.find(
      (entry) => entry.checkId === "channels.zalo.account.read_only_resolution",
    );
    expect(finding?.severity).toBe("warn");
    expect(finding?.title).toContain("could not be fully resolved");
    expect(finding?.detail).toContain("zalo:default: failed to resolve account");
    expect(finding?.detail).toContain("missing SecretRef");
  });
});
