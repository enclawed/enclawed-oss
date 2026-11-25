import { afterEach, describe, expect, it } from "vitest";
import type { EnclawedConfig } from "../config/types.enclawed.js";
import { clearActiveAdminPolicy, setActiveAdminPolicy } from "../enclawed/admin-policy.js";
import {
  assertEnclavedEscapeHatchesAllowed,
  collectConfigEscapeHatches,
  EnclavedEscapeHatchError,
  findRefusedEscapeHatches,
} from "./enclaved-escape-hatches.js";

function setAdminAllow(allow: { dangerousConfigFlags?: string[]; gatewayAuthNone?: boolean }) {
  setActiveAdminPolicy({
    admin: {
      source: { kind: "root-file", path: "/etc/enclawed/policy.json" },
      doc: { v: 1, allow },
    },
    ignored: [],
    invalid: null,
  });
}

function noAdmin() {
  setActiveAdminPolicy({ admin: null, ignored: [], invalid: null });
}

const insecureCfg = {
  gateway: { controlUi: { allowInsecureAuth: true } },
  agents: { defaults: { sandbox: { docker: { dangerouslyAllowContainerNamespaceJoin: true } } } },
} as unknown as EnclawedConfig;

describe("enclaved escape hatches", () => {
  afterEach(() => {
    clearActiveAdminPolicy();
  });

  it("finds curated and generic escape-hatch keys", () => {
    expect(collectConfigEscapeHatches(insecureCfg)).toEqual([
      "agents.defaults.sandbox.docker.dangerouslyAllowContainerNamespaceJoin=true",
      "gateway.controlUi.allowInsecureAuth=true",
    ]);
  });

  it("refuses every escape hatch in the enclaved flavor without an admin policy", () => {
    noAdmin();
    expect(() => assertEnclavedEscapeHatchesAllowed(insecureCfg, { flavor: "enclaved" })).toThrow(
      EnclavedEscapeHatchError,
    );
    expect(
      findRefusedEscapeHatches(insecureCfg, { flavor: "enclaved" }).map((r) => r.flag),
    ).toEqual([
      "agents.defaults.sandbox.docker.dangerouslyAllowContainerNamespaceJoin=true",
      "gateway.controlUi.allowInsecureAuth=true",
    ]);
  });

  it("allows exactly the flags the admin policy lists", () => {
    setAdminAllow({ dangerousConfigFlags: ["gateway.controlUi.allowInsecureAuth"] });
    expect(
      findRefusedEscapeHatches(insecureCfg, { flavor: "enclaved" }).map((r) => r.flag),
    ).toEqual(["agents.defaults.sandbox.docker.dangerouslyAllowContainerNamespaceJoin=true"]);
  });

  it("refuses gateway auth mode none in enclaved unless the admin allows it", () => {
    noAdmin();
    const cfg = { gateway: { auth: { mode: "none" } } } as unknown as EnclawedConfig;
    expect(findRefusedEscapeHatches(cfg, { flavor: "enclaved" }).map((r) => r.flag)).toEqual([
      "gateway.auth.mode=none",
    ]);
    setAdminAllow({ gatewayAuthNone: true });
    expect(findRefusedEscapeHatches(cfg, { flavor: "enclaved" })).toEqual([]);
  });

  it("attack: refuses the weakening settings the escape-hatch regex misses (audit X3)", () => {
    noAdmin();
    const cfg = {
      models: {
        providers: {
          lan: { request: { tls: { insecureSkipVerify: true }, allowPrivateNetwork: true } },
        },
      },
      agents: {
        defaults: { sandbox: { ssh: { strictHostKeyChecking: false } } },
        list: [{ id: "a", tools: { exec: { security: "full", ask: "off" } } }],
      },
      tools: {
        exec: { askFallback: "full", strictInlineEval: false },
        elevated: { enabled: true },
        fs: { workspaceOnly: false },
        web: { fetch: { ssrfPolicy: { allowRfc2544BenchmarkRange: true } } },
      },
      logging: { redactSensitive: "off" },
      gateway: { allowRealIpFallback: true, auth: { rateLimit: { exemptLoopback: true } } },
      enclawed: { hpc: { enforce: false } },
      plugins: {
        entries: {
          "voice-call": {
            config: {
              skipSignatureVerification: true,
              tunnel: { allowNgrokFreeTierLoopbackBypass: true },
              webhookSecurity: { trustForwardingHeaders: true },
            },
          },
          "memory-wiki": { config: { unsafeLocal: { allowPrivateMemoryCoreAccess: true } } },
          diffs: { config: { security: { allowRemoteViewer: true } } },
        },
      },
    } as unknown as EnclawedConfig;
    const refused = findRefusedEscapeHatches(cfg, { flavor: "enclaved" }).map((r) => r.flag);
    expect(refused).toEqual(
      expect.arrayContaining([
        "models.providers.lan.request.tls.insecureSkipVerify=true",
        "models.providers.lan.request.allowPrivateNetwork=true",
        "agents.defaults.sandbox.ssh.strictHostKeyChecking=false",
        "agents.list[0].tools.exec.security=full",
        "agents.list[0].tools.exec.ask=off",
        "tools.exec.askFallback=full",
        "tools.exec.strictInlineEval=false",
        "tools.elevated.enabled=true",
        "tools.fs.workspaceOnly=false",
        "tools.web.fetch.ssrfPolicy.allowRfc2544BenchmarkRange=true",
        "logging.redactSensitive=off",
        "gateway.allowRealIpFallback=true",
        "enclawed.hpc.enforce=false",
        "gateway.auth.rateLimit.exemptLoopback=true",
        "plugins.entries.voice-call.config.skipSignatureVerification=true",
        "plugins.entries.voice-call.config.tunnel.allowNgrokFreeTierLoopbackBypass=true",
        "plugins.entries.voice-call.config.webhookSecurity.trustForwardingHeaders=true",
        "plugins.entries.memory-wiki.config.unsafeLocal.allowPrivateMemoryCoreAccess=true",
        "plugins.entries.diffs.config.security.allowRemoteViewer=true",
      ]),
    );
    expect(refused).toHaveLength(19);
    expect(() => assertEnclavedEscapeHatchesAllowed(cfg, { flavor: "enclaved" })).toThrow(
      EnclavedEscapeHatchError,
    );
  });

  it("FP: the safe values of the same settings are not refused", () => {
    noAdmin();
    const cfg = {
      models: { providers: { lan: { request: { tls: { insecureSkipVerify: false } } } } },
      agents: {
        defaults: { sandbox: { ssh: { strictHostKeyChecking: true } } },
        list: [{ id: "a", tools: { exec: { security: "allowlist", ask: "on-miss" } } }],
      },
      tools: {
        exec: { askFallback: "deny", strictInlineEval: true },
        elevated: { enabled: false },
        fs: { workspaceOnly: true },
      },
      logging: { redactSensitive: "tools" },
      gateway: {
        allowRealIpFallback: false,
        auth: { rateLimit: { maxAttempts: 10, exemptLoopback: false } },
      },
      enclawed: { hpc: { enforce: true } },
      // Same words in unrelated places are not the weakening setting.
      channels: { slack: { security: "full", ask: "off" } },
    } as unknown as EnclawedConfig;
    expect(findRefusedEscapeHatches(cfg, { flavor: "enclaved" })).toEqual([]);
    expect(findRefusedEscapeHatches({} as EnclawedConfig, { flavor: "enclaved" })).toEqual([]);
  });

  it("FP: the admin policy can allow one weakening setting by path", () => {
    setAdminAllow({ dangerousConfigFlags: ["models.providers.lan.request.allowPrivateNetwork"] });
    const cfg = {
      models: { providers: { lan: { request: { allowPrivateNetwork: true } } } },
    } as unknown as EnclawedConfig;
    expect(findRefusedEscapeHatches(cfg, { flavor: "enclaved" })).toEqual([]);
  });

  it("keeps the open flavor unchanged", () => {
    noAdmin();
    expect(findRefusedEscapeHatches(insecureCfg, { flavor: "open" })).toEqual([]);
  });
});
