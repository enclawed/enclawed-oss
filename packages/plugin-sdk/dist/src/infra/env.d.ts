type AcceptedEnvOption = {
    key: string;
    description: string;
    value?: string;
    redact?: boolean;
};
export declare function logAcceptedEnvOption(option: AcceptedEnvOption): void;
export declare function isTruthyEnvValue(value?: string): boolean;
export {};
