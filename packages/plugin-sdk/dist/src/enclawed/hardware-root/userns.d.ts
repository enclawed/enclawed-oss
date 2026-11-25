/** True when this process is in a user namespace other than the initial one (Linux). */
export declare function inNonInitialUserNamespace(): boolean;
/** The HOST uid this process runs as (not the namespace-mapped one); null when unknown. */
export declare function hostUid(): number | null;
