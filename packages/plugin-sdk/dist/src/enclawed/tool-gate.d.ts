import { type Decision } from "./policy.js";
export declare function filterToolsByEnclawedPolicy<T extends {
    name: string;
}>(tools: T[], normalize: (name: string) => string, warn?: (message: string) => void): T[];
export declare function checkEnclawedToolCall(toolName: string, actor?: string): Decision;
export declare function resetToolGateForTest(): void;
