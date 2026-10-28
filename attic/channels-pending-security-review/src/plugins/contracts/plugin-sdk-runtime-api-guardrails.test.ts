import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { bundledPluginFile, getBundledPluginRoots } from "./test-helpers/bundled-plugin-roots.js";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const RUNTIME_API_EXPORT_GUARDS: Record<string, readonly string[]> = {
  [bundledPluginFile({ rootDir: ROOT_DIR, pluginId: "discord", relativePath: "runtime-api.ts" })]: [
    'export * from "./src/audit.js";',
    'export * from "./src/actions/runtime.js";',
    'export * from "./src/actions/runtime.moderation-shared.js";',
    'export * from "./src/actions/runtime.shared.js";',
    'export * from "./src/channel-actions.js";',
    'export * from "./src/directory-live.js";',
    'export * from "./src/monitor.js";',
    'export * from "./src/monitor/gateway-plugin.js";',
    'export * from "./src/monitor/gateway-registry.js";',
    'export * from "./src/monitor/presence-cache.js";',
    'export * from "./src/monitor/thread-bindings.js";',
    'export * from "./src/monitor/thread-bindings.manager.js";',
    'export * from "./src/monitor/timeouts.js";',
    'export * from "./src/probe.js";',
    'export * from "./src/resolve-channels.js";',
    'export * from "./src/resolve-users.js";',
    'export * from "./src/outbound-session-route.js";',
    'export * from "./src/send.js";',
    'export * from "./src/send.components.js";',
    'export { setDiscordRuntime } from "./src/runtime.js";',
  ],
  [bundledPluginFile({ rootDir: ROOT_DIR, pluginId: "imessage", relativePath: "runtime-api.ts" })]:
    [
      'export { DEFAULT_ACCOUNT_ID, getChatChannelMeta, type ChannelPlugin, type EnclawedConfig } from "@enclawed/plugin-sdk/core";',
      'export { buildChannelConfigSchema, IMessageConfigSchema } from "./config-api.js";',
      'export { PAIRING_APPROVED_MESSAGE } from "@enclawed/plugin-sdk/channel-status";',
      'export { buildComputedAccountStatusSnapshot, collectStatusIssuesFromLastError } from "@enclawed/plugin-sdk/status-helpers";',
      'export { formatTrimmedAllowFromEntries } from "@enclawed/plugin-sdk/channel-config-helpers";',
      'export { resolveIMessageConfigAllowFrom, resolveIMessageConfigDefaultTo } from "./src/config-accessors.js";',
      'export { looksLikeIMessageTargetId, normalizeIMessageMessagingTarget } from "./src/normalize.js";',
      'export { resolveChannelMediaMaxBytes } from "@enclawed/plugin-sdk/media-runtime";',
      'export { resolveIMessageGroupRequireMention, resolveIMessageGroupToolPolicy } from "./src/group-policy.js";',
      'export { monitorIMessageProvider } from "./src/monitor.js";',
      'export type { MonitorIMessageOpts } from "./src/monitor.js";',
      'export { probeIMessage } from "./src/probe.js";',
      'export type { IMessageProbe } from "./src/probe.js";',
      'export { sendMessageIMessage } from "./src/send.js";',
      'export { setIMessageRuntime } from "./src/runtime.js";',
      'export { chunkTextForOutbound } from "./src/channel-api.js";',
      'export type IMessageAccountConfig = Omit< NonNullable<NonNullable<RuntimeApiEnclawedConfig["channels"]>["imessage"]>, "accounts" | "defaultAccount" >;',
    ],
  [bundledPluginFile({
    rootDir: ROOT_DIR,
    pluginId: "googlechat",
    relativePath: "runtime-api.ts",
  })]: [
    'export { DEFAULT_ACCOUNT_ID } from "@enclawed/plugin-sdk/account-id";',
    'export { createActionGate, jsonResult, readNumberParam, readReactionParams, readStringParam } from "@enclawed/plugin-sdk/channel-actions";',
    'export { buildChannelConfigSchema } from "@enclawed/plugin-sdk/channel-config-primitives";',
    'export type { ChannelMessageActionAdapter, ChannelMessageActionName, ChannelStatusIssue } from "@enclawed/plugin-sdk/channel-contract";',
    'export { missingTargetError } from "@enclawed/plugin-sdk/channel-feedback";',
    'export { createAccountStatusSink, runPassiveAccountLifecycle } from "@enclawed/plugin-sdk/channel-lifecycle";',
    'export { createChannelPairingController } from "@enclawed/plugin-sdk/channel-pairing";',
    'export { createChannelReplyPipeline } from "@enclawed/plugin-sdk/channel-reply-pipeline";',
    'export { evaluateGroupRouteAccessForPolicy, resolveDmGroupAccessWithLists, resolveSenderScopedGroupPolicy } from "@enclawed/plugin-sdk/channel-policy";',
    'export { PAIRING_APPROVED_MESSAGE } from "@enclawed/plugin-sdk/channel-status";',
    'export { chunkTextForOutbound } from "@enclawed/plugin-sdk/text-chunking";',
    'export type { EnclawedConfig } from "@enclawed/plugin-sdk/config-runtime";',
    'export { GROUP_POLICY_BLOCKED_LABEL, isDangerousNameMatchingEnabled, resolveAllowlistProviderRuntimeGroupPolicy, resolveDefaultGroupPolicy, warnMissingProviderGroupPolicyFallbackOnce } from "@enclawed/plugin-sdk/config-runtime";',
    'export { fetchRemoteMedia, resolveChannelMediaMaxBytes } from "@enclawed/plugin-sdk/media-runtime";',
    'export { loadOutboundMediaFromUrl } from "@enclawed/plugin-sdk/outbound-media";',
    'export type { PluginRuntime } from "@enclawed/plugin-sdk/runtime-store";',
    'export { fetchWithSsrFGuard } from "@enclawed/plugin-sdk/ssrf-runtime";',
    'export { GoogleChatConfigSchema, type GoogleChatAccountConfig, type GoogleChatConfig } from "@enclawed/plugin-sdk/googlechat-runtime-shared";',
    'export { extractToolSend } from "@enclawed/plugin-sdk/tool-send";',
    'export { resolveInboundMentionDecision } from "@enclawed/plugin-sdk/channel-inbound";',
    'export { resolveInboundRouteEnvelopeBuilderWithRuntime } from "@enclawed/plugin-sdk/inbound-envelope";',
    'export { resolveWebhookPath } from "@enclawed/plugin-sdk/webhook-path";',
    'export { registerWebhookTargetWithPluginRoute, resolveWebhookTargetWithAuthOrReject, withResolvedWebhookRequestPipeline } from "@enclawed/plugin-sdk/webhook-targets";',
    'export { createWebhookInFlightLimiter, readJsonWebhookBodyOrReject, type WebhookInFlightLimiter } from "@enclawed/plugin-sdk/webhook-request-guards";',
    'export { setGoogleChatRuntime } from "./src/runtime.js";',
  ],
  [bundledPluginFile({ rootDir: ROOT_DIR, pluginId: "irc", relativePath: "runtime-api.ts" })]: [
    'export { setIrcRuntime } from "./src/runtime.js";',
  ],
  // matrix runtime-api guardrail entry quarantined to attic/ pending enclawed
  // security review (channel stripped from this fork; see attic/README.md).
  [bundledPluginFile({
    rootDir: ROOT_DIR,
    pluginId: "nextcloud-talk",
    relativePath: "runtime-api.ts",
  })]: [
    'export * from "@enclawed/plugin-sdk/nextcloud-talk";',
    'export { setNextcloudTalkRuntime } from "./src/runtime.js";',
  ],
  [bundledPluginFile({ rootDir: ROOT_DIR, pluginId: "signal", relativePath: "runtime-api.ts" })]: [
    'export * from "./src/runtime-api.js";',
    'export { setSignalRuntime } from "./src/runtime.js";',
  ],
  [bundledPluginFile({ rootDir: ROOT_DIR, pluginId: "slack", relativePath: "runtime-api.ts" })]: [
    'export * from "./src/action-runtime.js";',
    'export * from "./src/directory-live.js";',
    'export * from "./src/index.js";',
    'export * from "./src/resolve-channels.js";',
    'export * from "./src/resolve-users.js";',
    'export { registerSlackPluginHttpRoutes } from "./src/http/plugin-routes.js";',
    'export { setSlackRuntime } from "./src/runtime.js";',
  ],
  [bundledPluginFile({ rootDir: ROOT_DIR, pluginId: "telegram", relativePath: "runtime-api.ts" })]:
    [
      'export type { EnclawedPluginApi } from "@enclawed/plugin-sdk/plugin-entry";',
      'export type { ChannelMessageActionAdapter } from "@enclawed/plugin-sdk/channel-contract";',
      'export type { TelegramApiOverride } from "./src/send.js";',
      'export type { EnclawedPluginService, EnclawedPluginServiceContext, PluginLogger } from "@enclawed/plugin-sdk/plugin-entry";',
      'export type { PluginRuntime } from "@enclawed/plugin-sdk/runtime-store";',
      'export type { AcpRuntime, AcpRuntimeCapabilities, AcpRuntimeDoctorReport, AcpRuntimeEnsureInput, AcpRuntimeEvent, AcpRuntimeHandle, AcpRuntimeStatus, AcpRuntimeTurnInput, AcpRuntimeErrorCode, AcpSessionUpdateTag } from "@enclawed/plugin-sdk/acp-runtime";',
      'export { AcpRuntimeError } from "@enclawed/plugin-sdk/acp-runtime";',
      'export { emptyPluginConfigSchema, formatPairingApproveHint, getChatChannelMeta } from "@enclawed/plugin-sdk/channel-plugin-common";',
      'export { clearAccountEntryFields } from "@enclawed/plugin-sdk/channel-core";',
      'export { buildChannelConfigSchema, TelegramConfigSchema } from "./config-api.js";',
      'export { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "@enclawed/plugin-sdk/account-id";',
      'export { PAIRING_APPROVED_MESSAGE, buildTokenChannelStatusSummary, projectCredentialSnapshotFields, resolveConfiguredFromCredentialStatuses } from "@enclawed/plugin-sdk/channel-status";',
      'export { jsonResult, readNumberParam, readReactionParams, readStringArrayParam, readStringOrNumberParam, readStringParam, resolvePollMaxSelections } from "@enclawed/plugin-sdk/channel-actions";',
      'export type { TelegramProbe } from "./src/probe.js";',
      'export { auditTelegramGroupMembership, collectTelegramUnmentionedGroupIds } from "./src/audit.js";',
      'export { resolveTelegramRuntimeGroupPolicy } from "./src/group-access.js";',
      'export { buildTelegramExecApprovalPendingPayload, shouldSuppressTelegramExecApprovalForwardingFallback } from "./src/exec-approval-forwarding.js";',
      'export { telegramMessageActions } from "./src/channel-actions.js";',
      'export { monitorTelegramProvider } from "./src/monitor.js";',
      'export { probeTelegram } from "./src/probe.js";',
      'export { resolveTelegramFetch, resolveTelegramTransport, shouldRetryTelegramTransportFallback } from "./src/fetch.js";',
      'export { makeProxyFetch } from "./src/proxy.js";',
      'export { createForumTopicTelegram, deleteMessageTelegram, editForumTopicTelegram, editMessageReplyMarkupTelegram, editMessageTelegram, pinMessageTelegram, reactMessageTelegram, renameForumTopicTelegram, sendMessageTelegram, sendPollTelegram, sendStickerTelegram, sendTypingTelegram, unpinMessageTelegram } from "./src/send.js";',
      'export { createTelegramThreadBindingManager, getTelegramThreadBindingManager, resetTelegramThreadBindingsForTests, setTelegramThreadBindingIdleTimeoutBySessionKey, setTelegramThreadBindingMaxAgeBySessionKey } from "./src/thread-bindings.js";',
      'export { resolveTelegramToken } from "./src/token.js";',
      'export { setTelegramRuntime } from "./src/runtime.js";',
      'export type { ChannelPlugin } from "@enclawed/plugin-sdk/channel-core";',
      'export type { EnclawedConfig } from "@enclawed/plugin-sdk/config-runtime";',
      'export type TelegramAccountConfig = NonNullable< NonNullable<RuntimeEnclawedConfig["channels"]>["telegram"] >;',
      'export type TelegramActionConfig = NonNullable<TelegramAccountConfig["actions"]>;',
      'export type TelegramNetworkConfig = NonNullable<TelegramAccountConfig["network"]>;',
      'export { parseTelegramTopicConversation } from "./src/topic-conversation.js";',
      'export { resolveTelegramPollVisibility } from "./src/poll-visibility.js";',
    ],
  [bundledPluginFile({ rootDir: ROOT_DIR, pluginId: "whatsapp", relativePath: "runtime-api.ts" })]:
    [
      'export * from "./src/active-listener.js";',
      'export * from "./src/action-runtime.js";',
      'export * from "./src/agent-tools-login.js";',
      'export * from "./src/auth-store.js";',
      'export * from "./src/auto-reply.js";',
      'export * from "./src/inbound.js";',
      'export * from "./src/login.js";',
      'export * from "./src/media.js";',
      'export * from "./src/send.js";',
      'export * from "./src/session.js";',
      'export { setWhatsAppRuntime } from "./src/runtime.js";',
      'export { startWebLoginWithQr, waitForWebLogin } from "./login-qr-runtime.js";',
    ],
} as const;

function collectRuntimeApiFiles(): string[] {
  return [...getBundledPluginRoots().entries()]
    .filter(([, rootDir]) => existsSync(resolve(rootDir, "runtime-api.ts")))
    .map(([pluginId]) =>
      bundledPluginFile({
        rootDir: ROOT_DIR,
        pluginId,
        relativePath: "runtime-api.ts",
      }),
    );
}

function readExportStatements(path: string): string[] {
  const sourceText = readFileSync(resolve(ROOT_DIR, "..", path), "utf8");
  const sourceFile = ts.createSourceFile(path, sourceText, ts.ScriptTarget.Latest, true);

  return sourceFile.statements.flatMap((statement) => {
    if (!ts.isExportDeclaration(statement)) {
      const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
      if (!modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
        return [];
      }
      return [statement.getText(sourceFile).replaceAll(/\s+/g, " ").trim()];
    }

    const moduleSpecifier = statement.moduleSpecifier;
    if (!moduleSpecifier || !ts.isStringLiteral(moduleSpecifier)) {
      return [statement.getText(sourceFile).replaceAll(/\s+/g, " ").trim()];
    }

    if (!statement.exportClause) {
      const prefix = statement.isTypeOnly ? "export type *" : "export *";
      return [`${prefix} from ${moduleSpecifier.getText(sourceFile)};`];
    }

    if (!ts.isNamedExports(statement.exportClause)) {
      return [statement.getText(sourceFile).replaceAll(/\s+/g, " ").trim()];
    }

    const specifiers = statement.exportClause.elements.map((element) => {
      const imported = element.propertyName?.text;
      const exported = element.name.text;
      const alias = imported ? `${imported} as ${exported}` : exported;
      return element.isTypeOnly ? `type ${alias}` : alias;
    });
    const exportPrefix = statement.isTypeOnly ? "export type" : "export";
    return [
      `${exportPrefix} { ${specifiers.join(", ")} } from ${moduleSpecifier.getText(sourceFile)};`,
    ];
  });
}

describe("runtime api guardrails", () => {
  it("keeps runtime api surfaces on an explicit export allowlist", () => {
    const runtimeApiFiles = collectRuntimeApiFiles();
    expect(runtimeApiFiles).toEqual(
      expect.arrayContaining(Object.keys(RUNTIME_API_EXPORT_GUARDS).toSorted()),
    );

    for (const file of Object.keys(RUNTIME_API_EXPORT_GUARDS).toSorted()) {
      expect(readExportStatements(file), `${file} runtime api exports changed`).toEqual(
        RUNTIME_API_EXPORT_GUARDS[file],
      );
    }
  });
});
