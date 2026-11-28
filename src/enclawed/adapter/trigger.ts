// enclawed adapter kit: who may start an agent run (CI and other triggers).
//
// A CI adapter (a GitHub Action, a GitLab job, a webhook runner) hands the
// kit the event's actor as data it read from the platform; the KIT decides
// whether a session may start. The adapter's own permission check is not
// part of the security claim.
//
// The rule: the actor must be on the policy's explicit allowlist of
// principals, matched on the platform's stable numeric id, never on a name.
// A name is not trusted: anyone can create an app or a bot whose login ends
// in "[bot]" or copies a trusted one. Bots and apps are admitted only by
// their app id (or installation-bound id), listed explicitly. A human user
// must also hold at least the policy's minimum permission on the repository,
// as the platform reports it. Missing or inconsistent actor data: no session.

export type TriggerActorType = "User" | "Bot" | "App" | "Organization" | "Unknown";

export type TriggerActor = Readonly<{
  /** The platform's stable numeric id of the account. */
  id: number | null;
  login: string | null;
  type: TriggerActorType;
  /** For a Bot or App actor: the app's id, as the platform reports it (not parsed from a login). */
  appId?: number | null;
  /** The actor's permission on the repository, read from the platform API by the adapter. */
  permission?: "admin" | "maintain" | "write" | "triage" | "read" | "none" | null;
}>;

export type TriggerEvent = Readonly<{
  platform: string;
  /** owner/name. */
  repository: string;
  actor: TriggerActor;
  /** The event that started the run (issue_comment, pull_request, ...), for the record. */
  event?: string;
}>;

export type TriggerPolicy = Readonly<{
  /** Users allowed to start a run, by platform id. */
  users: readonly { id: number; note?: string }[];
  /** Apps allowed to start a run, by app id (Dependabot, Renovate, an organization's own app). */
  apps: readonly { appId: number; note?: string }[];
  /** The least repository permission a listed user must hold now. Default "write". */
  minPermission?: "admin" | "maintain" | "write" | "triage";
  /** Repositories the policy covers (owner/name); an event from another one is refused. */
  repositories?: readonly string[];
}>;

const RANK = { none: 0, read: 1, triage: 2, write: 3, maintain: 4, admin: 5 } as const;

export type TriggerDecision =
  | Readonly<{ ok: true; principal: string }>
  | Readonly<{ ok: false; code: TriggerRefusal; reason: string }>;

export type TriggerRefusal =
  | "actor-unknown"
  | "repository-not-covered"
  | "user-not-allowlisted"
  | "permission-too-low"
  | "app-not-allowlisted"
  | "actor-type-refused";

/** May this event start an agent run? */
export function decideTrigger(e: TriggerEvent, policy: TriggerPolicy): TriggerDecision {
  const a = e.actor;
  const who = `${JSON.stringify(a.login ?? "(no login)")} (${a.type}, id ${a.id ?? "none"})`;
  const no = (code: TriggerRefusal, why: string): TriggerDecision => ({
    ok: false,
    code,
    reason: `no agent run is started for ${who}: ${why}`,
  });
  if (policy.repositories && !policy.repositories.includes(e.repository)) {
    return no(
      "repository-not-covered",
      `the policy does not cover the repository ${JSON.stringify(e.repository)}`,
    );
  }
  if (!a || typeof a.id !== "number" || !Number.isInteger(a.id) || a.id <= 0) {
    return no("actor-unknown", "the platform reported no account id for the actor");
  }
  if (a.type === "User") {
    // A login that looks like a bot's is not a user, whatever the type field says.
    if (/\[bot\]$/i.test(a.login ?? "") || (a.appId !== undefined && a.appId !== null)) {
      return no(
        "actor-unknown",
        "the actor's data is inconsistent (a user with a bot's login or an app id)",
      );
    }
    if (!policy.users.some((u) => u.id === a.id)) {
      return no(
        "user-not-allowlisted",
        "the account is not on the policy's list of users who may start a run",
      );
    }
    const need = policy.minPermission ?? "write";
    const have = a.permission ?? "none";
    if (!(have in RANK) || RANK[have] < RANK[need]) {
      return no(
        "permission-too-low",
        `the account's permission on the repository is ${have}, below ${need}`,
      );
    }
    return { ok: true, principal: `user:${a.id}` };
  }
  if (a.type === "Bot" || a.type === "App") {
    // Never by name: an app id the platform reported, on the explicit list.
    if (typeof a.appId !== "number" || !policy.apps.some((p) => p.appId === a.appId)) {
      return no(
        "app-not-allowlisted",
        "bots and apps start a run only when their app id is on the policy's list; a name ending in [bot] proves nothing",
      );
    }
    return { ok: true, principal: `app:${a.appId}` };
  }
  return no("actor-type-refused", `actors of type ${a.type} never start a run`);
}
