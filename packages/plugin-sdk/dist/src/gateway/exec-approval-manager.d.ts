import type { ExecApprovalDecision, ExecApprovalRequestPayload as InfraExecApprovalRequestPayload } from "../infra/exec-approvals.js";
export type ExecApprovalRequestPayload = InfraExecApprovalRequestPayload;
export type ExecApprovalRecord<TPayload = ExecApprovalRequestPayload> = {
    id: string;
    request: TPayload;
    createdAtMs: number;
    expiresAtMs: number;
    requestedByConnId?: string | null;
    requestedByDeviceId?: string | null;
    requestedByClientId?: string | null;
    resolvedAtMs?: number;
    decision?: ExecApprovalDecision;
    resolvedBy?: string | null;
    /**
     * Set when a one-time use of this record was spent (an allow-once, or the
     * timed-out fallback). A spent record never authorizes another run.
     */
    consumedAtMs?: number;
};
export type ExecApprovalIdLookupResult = {
    kind: "exact" | "prefix";
    id: string;
} | {
    kind: "ambiguous";
    ids: string[];
} | {
    kind: "none";
};
export declare class ExecApprovalManager<TPayload = ExecApprovalRequestPayload> {
    private pending;
    create(request: TPayload, timeoutMs: number, id?: string | null): ExecApprovalRecord<TPayload>;
    /**
     * Register an approval record and return a promise that resolves when the decision is made.
     * This separates registration (synchronous) from waiting (async), allowing callers to
     * confirm registration before the decision is made.
     */
    register(record: ExecApprovalRecord<TPayload>, timeoutMs: number): Promise<ExecApprovalDecision | null>;
    /**
     * @deprecated Use register() instead for explicit separation of registration and waiting.
     */
    waitForDecision(record: ExecApprovalRecord<TPayload>, timeoutMs: number): Promise<ExecApprovalDecision | null>;
    resolve(recordId: string, decision: ExecApprovalDecision, resolvedBy?: string | null): boolean;
    expire(recordId: string, resolvedBy?: string | null): boolean;
    getSnapshot(recordId: string): ExecApprovalRecord<TPayload> | null;
    listPendingRecords(): ExecApprovalRecord<TPayload>[];
    consumeAllowOnce(recordId: string): boolean;
    /**
     * Spend the timed-out fallback of a record once. A record whose request
     * timed out (no decision, no resolver) may authorize one askFallback run;
     * a record whose allow-once was already consumed looks the same apart
     * from `consumedAtMs`, and is refused.
     */
    consumeTimedOutFallback(recordId: string): boolean;
    /**
     * Wait for decision on an already-registered approval.
     * Returns the decision promise if the ID is pending, null otherwise.
     */
    awaitDecision(recordId: string): Promise<ExecApprovalDecision | null> | null;
    lookupPendingId(input: string): ExecApprovalIdLookupResult;
}
