// Run the inference engine that ships inside the application package.
//
// A store build cannot install anything on the side, so the engine travels
// with the app and this module owns its lifetime. Three properties matter
// more than anything else here, and all three are about not disturbing a
// machine that is not ours:
//
//   1. A PRIVATE PORT, chosen at start from the ephemeral range. The engine's
//      default is 11434, and a developer with their own install is already
//      using it. Binding it would either fail or -- worse -- succeed and let
//      the two instances fight over the same address across restarts.
//
//   2. A PRIVATE MODEL DIRECTORY, under the app's own per-user data. Sharing
//      the default store means the app's downloads appear in someone else's
//      `ollama list`, an uninstall takes their models with it, and disk usage
//      shows up somewhere they never agreed to.
//
//   3. AN EXISTING INSTANCE IS THE USER'S TO OFFER, not ours to take. If
//      something is already listening on the default port, that is their
//      engine, their models and their configuration -- possibly with the
//      model we are about to spend gigabytes downloading already in it.
//      Silently adopting it would make the app's behaviour depend on a
//      machine's history; silently ignoring it wastes their disk and their
//      bandwidth. So we detect it, describe it, and let setup ask.
//
// Measured on 0.24.0: an instance started the private way coexists with a
// default one and sees none of its models, so choosing "bundled" on a
// machine that already runs one is safe.

import { spawn as nodeSpawn } from "node:child_process";

/**
 * The spawned process type, derived from `nodeSpawn` rather than imported as
 * `ChildProcess`.
 *
 * Declared with `?` rather than `| null` on purpose. Linting a single file
 * cannot resolve node:child_process, so the type degrades to `any` there and a
 * written `X | null` union gets flagged as redundant -- while a full-repo lint
 * resolves it fine and would then call any suppression dead. An optional field
 * has no written union, so it reads the same in both contexts.
 */
type SpawnedProcess = ReturnType<typeof nodeSpawn>;
import { createServer } from "node:net";

export type SpawnLike = typeof nodeSpawn;

export type SupervisorOptions = {
  /** Absolute path to the engine binary shipped in the package. */
  binaryPath: string;
  /** Where models are stored. Per-user app data, never the shared default. */
  modelsDir: string;
  /** Injected for tests. */
  spawnImpl?: SpawnLike;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
  /** How long to wait for the engine to answer before giving up. */
  readyTimeoutMs?: number;
};

export type PullProgress = Readonly<{
  status: string;
  /** Bytes expected for the current layer, when the engine reports it. */
  total?: number;
  /** Bytes fetched so far for the current layer. */
  completed?: number;
  /** 0..1 across the current layer, or null before sizes are known. */
  fraction: number | null;
}>;

export type ExistingInstance = Readonly<{
  apiBase: string;
  version: string | null;
  /** Model names already present, so setup can say "you already have this". */
  models: ReadonlyArray<string>;
}>;

/**
 * Look for an engine the user already runs.
 *
 * Deliberately only a probe. The decision -- reuse theirs, or run the bundled
 * one privately -- belongs to the person whose machine it is, and setup asks.
 * Reusing an existing instance means their models are already there and
 * nothing needs downloading; it also means the app inherits whatever version
 * and configuration they keep, which is a trade worth stating out loud rather
 * than making for them.
 */
export async function detectExistingInstance(opts?: {
  apiBase?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<ExistingInstance | null> {
  const base = opts?.apiBase ?? "http://127.0.0.1:11434";
  const doFetch = opts?.fetchImpl ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? 2_000);
  try {
    const v = await doFetch(`${base}/api/version`, { signal: ctrl.signal });
    if (!v.ok) {
      return null;
    }
    const version = ((await v.json()) as { version?: string }).version ?? null;
    let models: string[] = [];
    try {
      const t = await doFetch(`${base}/api/tags`, { signal: ctrl.signal });
      if (t.ok) {
        const j = (await t.json()) as { models?: Array<{ name?: string }> };
        models = (j.models ?? []).flatMap((m) => (typeof m.name === "string" ? [m.name] : []));
      }
    } catch {
      // Version answered but tags did not; still a usable instance, we just
      // cannot say what is in it.
    }
    return Object.freeze({ apiBase: base, version, models: Object.freeze(models) });
  } catch {
    // Nothing listening, or it did not answer in time. Not an error: the
    // common case is a machine with no engine at all.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type CoexistenceAdvisory = Readonly<{
  /** The other engine's address, for the notice. */
  apiBase: string;
  version: string | null;
  /** True when the user already has the model this app wants. */
  alreadyHasModel: boolean;
  /** One paragraph, written for someone who is not a developer. */
  message: string;
}>;

/**
 * What to tell the user after installation when they already run an engine.
 *
 * Not a question and not an error. The bundled engine runs on its own port
 * with its own model directory and the two coexist -- measured, not assumed --
 * so nothing is broken and setup does not need to stop and ask. But a second
 * copy of a multi-gigabyte model appearing on a disk is the kind of surprise
 * people are entitled to be told about, especially when they already have the
 * exact model this app is about to download.
 */
export function coexistenceAdvisory(
  existing: ExistingInstance,
  wantedModel: string,
): CoexistenceAdvisory {
  const wanted = wantedModel.includes(":") ? wantedModel : `${wantedModel}:latest`;
  const alreadyHasModel = existing.models.includes(wanted);
  const message = alreadyHasModel
    ? `Ollama is already running on this PC and already has ${wanted}. ` +
      `Enclawed runs its own private copy, so nothing of yours changes -- but that ` +
      `means downloading ${wanted} a second time. You can point Enclawed at your ` +
      `existing Ollama in Settings to use the copy you already have.`
    : `Ollama is already running on this PC. Enclawed runs its own private copy ` +
      `on a separate port with its own model folder, so the two do not interfere ` +
      `and your models are untouched. If you would rather Enclawed used your ` +
      `existing Ollama, you can switch that in Settings.`;
  return Object.freeze({
    apiBase: existing.apiBase,
    version: existing.version,
    alreadyHasModel,
    message,
  });
}

/** Ask the OS for a free port by binding one and letting go. */
export async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr === null || typeof addr === "string") {
        srv.close(() => reject(new Error("could not determine a free port")));
        return;
      }
      const { port } = addr;
      srv.close(() => resolve(port));
    });
  });
}

export class OllamaSupervisor {
  private child?: SpawnedProcess;
  private port: number | null = null;
  private readonly opts: SupervisorOptions;
  private readonly spawnImpl: SpawnLike;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: SupervisorOptions) {
    this.opts = opts;
    this.spawnImpl = opts.spawnImpl ?? nodeSpawn;
    // Resolved per call rather than captured, so the egress guard still sees
    // this traffic. Loopback, but the rule holds everywhere.
    this.fetchImpl = opts.fetchImpl ?? ((...a) => globalThis.fetch(...a));
  }

  /** Where this instance listens. Null until start() succeeds. */
  apiBase(): string | null {
    return this.port === null ? null : `http://127.0.0.1:${this.port}`;
  }

  isRunning(): boolean {
    return this.child !== undefined && this.child.exitCode === null && !this.child.killed;
  }

  /**
   * The environment the engine runs in.
   *
   * Exported shape rather than an inline object because it is the whole
   * isolation story, and a test can read it without launching anything.
   */
  static environment(port: number, modelsDir: string): Record<string, string> {
    return {
      OLLAMA_HOST: `127.0.0.1:${port}`,
      OLLAMA_MODELS: modelsDir,
    };
  }

  async start(): Promise<string> {
    if (this.isRunning() && this.port !== null) {
      return `http://127.0.0.1:${this.port}`;
    }
    const port = await findFreePort();
    this.port = port;
    const child = this.spawnImpl(this.opts.binaryPath, ["serve"], {
      env: { ...process.env, ...OllamaSupervisor.environment(port, this.opts.modelsDir) },
      stdio: ["ignore", "pipe", "pipe"],
      // The engine must not outlive the app or hold a console window open.
      windowsHide: true,
      detached: false,
    });
    this.child = child;

    await this.waitUntilReady(this.opts.readyTimeoutMs ?? 30_000);
    return `http://127.0.0.1:${port}`;
  }

  private async waitUntilReady(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastError = "no response";
    while (Date.now() < deadline) {
      if (this.child !== undefined && this.child.exitCode !== null) {
        throw new Error(`inference engine exited during startup (code ${this.child.exitCode})`);
      }
      try {
        const r = await this.fetchImpl(`${this.apiBase()}/api/version`);
        if (r.ok) {
          return;
        }
        lastError = `HTTP ${r.status}`;
      } catch (err) {
        lastError = (err as Error).message;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    await this.stop();
    throw new Error(`inference engine did not become ready within ${timeoutMs}ms (${lastError})`);
  }

  /**
   * Download a model, reporting progress.
   *
   * The engine streams newline-delimited JSON with byte counts, so setup can
   * show real progress rather than a spinner -- which matters when the thing
   * being downloaded is measured in gigabytes and the user is deciding
   * whether the app has hung.
   */
  async pullModel(
    model: string,
    onProgress?: (p: PullProgress) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const base = this.apiBase();
    if (base === null) {
      throw new Error("inference engine is not running");
    }
    const res = await this.fetchImpl(`${base}/api/pull`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, stream: true }),
      ...(signal ? { signal } : {}),
    });
    if (!res.ok || res.body === null) {
      throw new Error(`model download failed to start: HTTP ${res.status}`);
    }
    for await (const line of ndjson(res.body)) {
      if (typeof line.error === "string") {
        throw new Error(`model download failed: ${line.error}`);
      }
      const total = typeof line.total === "number" ? line.total : undefined;
      const completed = typeof line.completed === "number" ? line.completed : undefined;
      onProgress?.({
        status: typeof line.status === "string" ? line.status : "",
        ...(total !== undefined ? { total } : {}),
        ...(completed !== undefined ? { completed } : {}),
        fraction: total && total > 0 && completed !== undefined ? completed / total : null,
      });
    }
  }

  /** Is this model already present in the private store? */
  async hasModel(model: string): Promise<boolean> {
    const base = this.apiBase();
    if (base === null) {
      return false;
    }
    const r = await this.fetchImpl(`${base}/api/tags`);
    if (!r.ok) {
      return false;
    }
    const j = (await r.json()) as { models?: Array<{ name?: string }> };
    // The engine reports "name:tag"; a bare name means the default tag.
    const wanted = model.includes(":") ? model : `${model}:latest`;
    return (j.models ?? []).some((m) => m.name === wanted);
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.child = undefined;
    this.port = null;
    if (child === null || child.exitCode !== null) {
      return;
    }
    child.kill("SIGTERM");
    // Give it a moment to close its listener, then insist. An engine left
    // holding the port would block the next start.
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 5_000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

/** Yield each JSON object from a newline-delimited stream. */
async function* ndjson(body: ReadableStream<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    let nl = buffer.indexOf("\n");
    while (nl >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line.length > 0) {
        try {
          yield JSON.parse(line) as Record<string, unknown>;
        } catch {
          // A partial or malformed line is not worth failing a multi-gigabyte
          // download over; the next one carries the same running totals.
        }
      }
      nl = buffer.indexOf("\n");
    }
  }
  const tail = buffer.trim();
  if (tail.length > 0) {
    try {
      yield JSON.parse(tail) as Record<string, unknown>;
    } catch {
      /* trailing fragment at end of stream */
    }
  }
}
