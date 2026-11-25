import type { Command } from "commander";
type RegisterLazyCommandParams = {
    program: Command;
    name: string;
    description: string;
    removeNames?: string[];
    /** Flags surfaced on the placeholder before its module is loaded. */
    options?: ReadonlyArray<{
        flags: string;
        description?: string;
    }>;
    register: () => Promise<void> | void;
};
export declare function registerLazyCommand({ program, name, description, removeNames, options, register, }: RegisterLazyCommandParams): void;
export {};
