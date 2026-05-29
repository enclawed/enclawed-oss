import { resolveConfiguredBindingRecord } from "../../channels/plugins/binding-registry.js";
import { listAcpBindings } from "../../config/bindings.js";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
import { getSessionBindingService } from "../../infra/outbound/session-binding-service.js";
export declare const __testing: {
    setDepsForTest(overrides?: Partial<{
        getSessionBindingService: typeof getSessionBindingService;
        listAcpBindings: typeof listAcpBindings;
        resolveConfiguredBindingRecord: typeof resolveConfiguredBindingRecord;
    }>): void;
};
export declare function resolveEffectiveResetTargetSessionKey(params: {
    cfg: EnclawedConfig;
    channel?: string | null;
    accountId?: string | null;
    conversationId?: string | null;
    parentConversationId?: string | null;
    activeSessionKey?: string | null;
    allowNonAcpBindingSessionKey?: boolean;
    skipConfiguredFallbackWhenActiveSessionNonAcp?: boolean;
    fallbackToActiveAcpWhenUnbound?: boolean;
}): string | undefined;
