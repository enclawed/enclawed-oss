export type ModuleBinding = Readonly<{
    /** realpath of the verified module directory. */
    rootReal: string;
    /** sha256 over enclawed.module.json and enclawed.plugin.json (each length-prefixed; absent = empty). */
    manifestSha256: string;
}>;
/** Compute the binding for a module directory. Throws when the directory cannot be resolved. */
export declare function computeModuleBinding(moduleDir: string): ModuleBinding;
export declare function setModuleBindings(bindings: ReadonlyMap<string, ModuleBinding>): void;
export declare function getModuleBinding(id: string): ModuleBinding | undefined;
export declare function clearModuleBindings(): void;
export type BindingCheck = Readonly<{
    ok: true;
}> | Readonly<{
    ok: false;
    reason: string;
    expected: ModuleBinding;
    actual: ModuleBinding | null;
}>;
/** Compare a candidate directory against the binding recorded for its id. */
export declare function checkModuleBinding(expected: ModuleBinding, candidateDir: string): BindingCheck;
