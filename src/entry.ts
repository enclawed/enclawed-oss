#!/usr/bin/env node
import { spawn } from "node:child_process";
import { enableCompileCache } from "node:module";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { isRootHelpInvocation, isRootVersionInvocation } from "./cli/argv.js";
import { parseCliContainerArgs, resolveCliContainerTarget } from "./cli/container-target.js";
import { applyCliProfileEnv, parseCliProfileArgs } from "./cli/profile.js";
import { normalizeWindowsArgv } from "./cli/windows-argv.js";
import { buildCliRespawnPlan } from "./entry.respawn.js";
import { mirrorBrandEnv } from "./infra/brand-env.js";
import { isTruthyEnvValue, normalizeEnv } from "./infra/env.js";
import { isMainModule } from "./infra/is-main.js";
import { ensureEnclawedExecMarkerOnProcess } from "./infra/enclawed-exec-env.js";
import { installProcessWarningFilter } from "./infra/warning-filter.js";
import {
  logWorkspaceDirResolution,
  resolveWorkspaceDirInfo,
} from "./infra/workspace-dir.js";
import { attachChildProcessBridge } from "./process/child-process-bridge.js";

const ENTRY_WRAPPER_PAIRS = [
  { wrapperBasename: "enclawed.mjs", entryBasename: "entry.js" },
  { wrapperBasename: "enclawed.js", entryBasename: "entry.js" },
] as const;

function shouldForceReadOnlyAuthStore(argv: string[]): boolean {
  const tokens = argv.slice(2).filter((token) => token.length > 0 && !token.startsWith("-"));
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (tokens[index] === "secrets" && tokens[index + 1] === "audit") {
      return true;
    }
  }
  return false;
}

// Guard: only run entry-point logic when this file is the main module.
// The bundler may import entry.js as a shared dependency when dist/index.js
// is the actual entry point; without this guard the top-level code below
// would call runCli a second time, starting a duplicate gateway that fails
// on the lock / port and crashes the process.
if (
  !isMainModule({
    currentFile: fileURLToPath(import.meta.url),
    wrapperEntryPairs: [...ENTRY_WRAPPER_PAIRS],
  })
) {
  // Imported as a dependency — skip all entry-point side effects.
} else {
  // Mirror ENCLAWED_*/ENCLAWED_* env vars in both directions before anything
  // else loads — bootstrapEnclawed() and downstream extensions read either
  // prefix, and the mirror keeps both alive (ENCLAWED_* wins on conflict).
  mirrorBrandEnv();

  // Emit one info-level line announcing which user workspace dir we picked
  // and which precedence rule fired. Helps users debug surprises when an
  // existing `~/.enclawed/` shadows a new `~/.enclawed/` install (or vice
  // versa). Uses the project logger lazily to avoid bootstrap cycles.
  try {
    const resolution = resolveWorkspaceDirInfo();
    const { logInfo } = await import("./logger.js");
    logWorkspaceDirResolution(resolution, (msg) => logInfo(msg));
  } catch {
    // Diagnostic logging must never block startup.
  }

  const { installGaxiosFetchCompat } = await import("./infra/gaxios-fetch-compat.js");

  await installGaxiosFetchCompat();

  // enclawed: activate the classified-mode framework before any plugin or
  // transit module loads so the egress guard, audit logger, and policy are
  // visible to everything downstream. Always on in the enclawed fork.
  // See src/enclawed/bootstrap.ts and enclawed/FORK.md.
  const { bootstrapEnclawed } = await import("./enclawed/bootstrap.js");
  // Point the host admission gate at the same bundled-plugins dir the plugin
  // registry discovers from (dist/extensions in an installed package, source
  // extensions in a dev checkout). Without this, preloadModuleDecisions falls
  // back to a CWD-relative "extensions" path that does not exist in a packaged
  // install, leaving the decision map empty so every bundled plugin is treated
  // as having no module manifest. Falls back to the bootstrap default when the
  // resolver can't locate a bundled tree.
  const { resolveBundledPluginsDir } = await import("./plugins/bundled-dir.js");
  await bootstrapEnclawed({ modulesRoot: resolveBundledPluginsDir() });

  process.title = "enclawed";
  ensureEnclawedExecMarkerOnProcess();
  installProcessWarningFilter();
  normalizeEnv();
  if (!isTruthyEnvValue(process.env.NODE_DISABLE_COMPILE_CACHE)) {
    try {
      enableCompileCache();
    } catch {
      // Best-effort only; never block startup.
    }
  }

  if (shouldForceReadOnlyAuthStore(process.argv)) {
    process.env.ENCLAWED_AUTH_STORE_READONLY = "1";
  }

  if (process.argv.includes("--no-color")) {
    process.env.NO_COLOR = "1";
    process.env.FORCE_COLOR = "0";
  }

  function ensureCliRespawnReady(): boolean {
    const plan = buildCliRespawnPlan();
    if (!plan) {
      return false;
    }

    const child = spawn(process.execPath, plan.argv, {
      stdio: "inherit",
      env: plan.env,
    });

    attachChildProcessBridge(child);

    child.once("exit", (code, signal) => {
      if (signal) {
        process.exitCode = 1;
        return;
      }
      process.exit(code ?? 1);
    });

    child.once("error", (error) => {
      console.error(
        "[enclawed] Failed to respawn CLI:",
        error instanceof Error ? (error.stack ?? error.message) : error,
      );
      process.exit(1);
    });

    // Parent must not continue running the CLI.
    return true;
  }

  function tryHandleRootVersionFastPath(argv: string[]): boolean {
    if (resolveCliContainerTarget(argv)) {
      return false;
    }
    if (!isRootVersionInvocation(argv)) {
      return false;
    }
    Promise.all([import("./version.js"), import("./infra/git-commit.js")])
      .then(([{ VERSION }, { resolveCommitHash }]) => {
        const commit = resolveCommitHash({ moduleUrl: import.meta.url });
        console.log(commit ? `enclawed ${VERSION} (${commit})` : `enclawed ${VERSION}`);
        process.exit(0);
      })
      .catch((error) => {
        console.error(
          "[enclawed] Failed to resolve version:",
          error instanceof Error ? (error.stack ?? error.message) : error,
        );
        process.exitCode = 1;
      });
    return true;
  }

  process.argv = normalizeWindowsArgv(process.argv);

  if (!ensureCliRespawnReady()) {
    const parsedContainer = parseCliContainerArgs(process.argv);
    if (!parsedContainer.ok) {
      console.error(`[enclawed] ${parsedContainer.error}`);
      process.exit(2);
    }

    const parsed = parseCliProfileArgs(parsedContainer.argv);
    if (!parsed.ok) {
      // Keep it simple; Commander will handle rich help/errors after we strip flags.
      console.error(`[enclawed] ${parsed.error}`);
      process.exit(2);
    }

    const containerTargetName = resolveCliContainerTarget(process.argv);
    if (containerTargetName && parsed.profile) {
      console.error("[enclawed] --container cannot be combined with --profile/--dev");
      process.exit(2);
    }

    if (parsed.profile) {
      applyCliProfileEnv({ profile: parsed.profile });
      // Keep Commander and ad-hoc argv checks consistent.
      process.argv = parsed.argv;
    }

    if (!tryHandleRootVersionFastPath(process.argv)) {
      runMainOrRootHelp(process.argv);
    }
  }
}

export function tryHandleRootHelpFastPath(
  argv: string[],
  deps: {
    outputRootHelp?: () => void | Promise<void>;
    onError?: (error: unknown) => void;
    env?: NodeJS.ProcessEnv;
  } = {},
): boolean {
  if (resolveCliContainerTarget(argv, deps.env)) {
    return false;
  }
  if (!isRootHelpInvocation(argv)) {
    return false;
  }
  const handleError =
    deps.onError ??
    ((error: unknown) => {
      console.error(
        "[enclawed] Failed to display help:",
        error instanceof Error ? (error.stack ?? error.message) : error,
      );
      process.exitCode = 1;
    });
  if (deps.outputRootHelp) {
    Promise.resolve()
      .then(() => deps.outputRootHelp?.())
      .catch(handleError);
    return true;
  }
  import("./cli/root-help-metadata.js")
    .then(async ({ outputPrecomputedRootHelpText }) => {
      if (outputPrecomputedRootHelpText()) {
        return;
      }
      const { outputRootHelp } = await import("./cli/program/root-help.js");
      await outputRootHelp();
    })
    .catch(handleError);
  return true;
}

function runMainOrRootHelp(argv: string[]): void {
  if (tryHandleRootHelpFastPath(argv)) {
    return;
  }
  import("./cli/run-main.js")
    .then(({ runCli }) => runCli(argv))
    .catch((error) => {
      console.error(
        "[enclawed] Failed to start CLI:",
        error instanceof Error ? (error.stack ?? error.message) : error,
      );
      process.exitCode = 1;
    });
}
