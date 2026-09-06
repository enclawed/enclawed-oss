// How this copy of the assistant was deployed, which decides who is
// responsible for updating it.
//
// Three shapes exist and they have three different answers:
//
//   repo        installed by install.mjs from a git checkout. Updating itself
//               is the feature: it compares HEAD against origin and tells the
//               principal when something newer exists.
//
//   store       shipped through an application store. The store owns updates
//               and a build that probes for its own is doing the one thing
//               store policy forbids, whatever it does with the answer.
//
//   standalone  downloaded from our own site and installed by our own
//               installer. Nobody else will ever update it, so it has to
//               update itself -- over signed HTTPS, not from a git checkout
//               that is not there.
//
// The distinction between the last two is the whole reason this module is not
// a boolean. "Packaged" answers the wrong question: both store and standalone
// builds are packaged, and they need opposite behaviour. A build that
// conflates them either violates store policy or leaves every customer
// permanently on the version they first downloaded.
//
// The mode is a BUILD-TIME constant, not configuration. The bundler compiles
// it in, so no environment variable, config file or launcher mistake can turn
// a store build into one that self-updates. The environment variable exists so
// the repo build can be exercised in a packaged shape during development; it
// cannot override a mode that was compiled in.

/**
 * Injected by the bundler (`define`) when building a shippable artifact.
 * Absent in a repo run, hence every read is guarded by `typeof`.
 */
declare const __ENCLAWED_DEPLOYMENT__: string | undefined;

export type DeploymentMode = "repo" | "store" | "standalone";

/** Who is responsible for delivering the next version. */
export type UpdateOwner =
  /** This build, by comparing its git checkout against origin. */
  | "git"
  /** The application store. This build must not look. */
  | "store"
  /** This build, through its own signed update channel. */
  | "self";

const MODES: ReadonlySet<string> = new Set<DeploymentMode>(["repo", "store", "standalone"]);

function asMode(value: string | undefined): DeploymentMode | null {
  return value !== undefined && MODES.has(value) ? (value as DeploymentMode) : null;
}

export function deploymentMode(env: NodeJS.ProcessEnv = process.env): DeploymentMode {
  // Compiled-in wins. An unrecognised value is treated as absent rather than
  // guessed at: a typo in a build script must not silently pick a mode.
  if (typeof __ENCLAWED_DEPLOYMENT__ !== "undefined") {
    const baked = asMode(__ENCLAWED_DEPLOYMENT__);
    if (baked !== null) {
      return baked;
    }
  }
  return asMode(env.ENCLAWED_DEPLOYMENT) ?? "repo";
}

export function updateOwner(env: NodeJS.ProcessEnv = process.env): UpdateOwner {
  switch (deploymentMode(env)) {
    case "store":
      return "store";
    case "standalone":
      return "self";
    default:
      return "git";
  }
}

/** True for any build shipped as an artifact rather than run from a checkout. */
export function isPackagedBuild(env: NodeJS.ProcessEnv = process.env): boolean {
  return deploymentMode(env) !== "repo";
}

/**
 * Whether the git-based update check may run.
 *
 * Only a repo build has a checkout to compare, and only a repo build is
 * allowed to. Both packaged shapes refuse -- for different reasons, which is
 * why the caller gets a reason string rather than just `false`.
 */
export function gitUpdateCheckAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return updateOwner(env) === "git";
}

export function updateRefusalReason(env: NodeJS.ProcessEnv = process.env): string {
  return updateOwner(env) === "store"
    ? "store build: updates are delivered by the application store, so the " +
        "assistant does not check for them"
    : "standalone build: updates arrive through the app's own signed update " +
        "channel, not from a git checkout";
}
