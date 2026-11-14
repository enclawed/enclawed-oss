import { type Label } from "./classification.js";
export type Decision = {
    allowed: true;
} | {
    allowed: false;
    reason: string;
};
export type Policy = Readonly<{
    enforceAllowlists: boolean;
    allowedChannels: ReadonlySet<string>;
    allowedProviders: ReadonlySet<string>;
    allowedTools: ReadonlySet<string>;
    allowedHosts: ReadonlySet<string>;
    maxOutputClearance: Label;
    defaultDataLabel: Label;
}>;
export declare function createPolicy(input: {
    enforceAllowlists?: boolean;
    allowedChannels?: Iterable<string>;
    allowedProviders?: Iterable<string>;
    allowedTools?: Iterable<string>;
    allowedHosts?: Iterable<string>;
    maxOutputClearance: Label;
    defaultDataLabel: Label;
}): Policy;
export declare function checkChannel(policy: Policy, id: string): Decision;
export declare function checkProvider(policy: Policy, id: string): Decision;
export declare function checkTool(policy: Policy, id: string): Decision;
export declare function defaultEnclavedPolicy(opts?: {
    localModelProviderId?: string;
    controlChannelId?: string;
}): Policy;
export declare function defaultOpenPolicy(): Policy;
export declare const defaultClassifiedPolicy: typeof defaultEnclavedPolicy;
