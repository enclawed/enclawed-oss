type MockFactory<TModule extends object> = Partial<TModule> | ((actual: TModule) => Partial<TModule>);
export declare function mockNodeBuiltinModule<TModule extends object>(loadActual: () => Promise<TModule>, factory: MockFactory<TModule>, options?: {
    mirrorToDefault?: boolean;
}): Promise<TModule>;
export {};
