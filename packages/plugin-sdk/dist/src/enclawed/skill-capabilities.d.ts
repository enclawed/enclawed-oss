export declare const CAPABILITY: Readonly<{
    readonly NET_EGRESS: "net.egress";
    readonly FS_READ: "fs.read";
    readonly FS_WRITE_REV: "fs.write.rev";
    readonly FS_WRITE_IRREV: "fs.write.irrev";
    readonly TOOL_INVOKE: "tool.invoke";
    readonly SPAWN_PROC: "spawn.proc";
    readonly PUBLISH: "publish";
    readonly PAY: "pay";
    readonly MUTATE_SCHEMA: "mutate.schema";
}>;
export type CapabilityToken = (typeof CAPABILITY)[keyof typeof CAPABILITY];
export declare const ALL_CAPABILITIES: ReadonlyArray<CapabilityToken>;
export declare function isCapabilityToken(value: unknown): value is CapabilityToken;
export declare function isReversible(cap: CapabilityToken): boolean;
export declare function isIrreversible(cap: CapabilityToken): boolean;
export type CapabilityCall = Readonly<{
    cap: CapabilityToken;
    target: string;
    args?: Readonly<Record<string, unknown>>;
}>;
export declare function makeCall(input: {
    cap: CapabilityToken;
    target: string;
    args?: Record<string, unknown>;
}): CapabilityCall;
export { canonicalEgressTarget, egressTargetString, parseEgressTarget, type EgressTarget, } from "./egress-target.js";
export declare function makeEgressCall(target: string, args?: Record<string, unknown>): CapabilityCall;
export declare function projectionKey(call: {
    cap: string;
    target: string;
}): string;
