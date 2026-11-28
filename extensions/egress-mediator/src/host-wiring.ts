// Host wiring for the egress host seams.
//
// In the open build the egress-mediator plugin plays the "host" role for
// `@enclawed/egress-core`: it holds the plugin runtime, so it installs
//   - the LLM completer the egress-llm-scrambler stage calls, backed by the
//     configured model provider through the embedded agent runner with tools
//     disabled; and
//   - the outbound emitter the egress-cover-traffic service sends through,
//     backed by the target channel's outbound adapter.
// Core stays extension-agnostic: nothing in `src/` knows these seams exist.

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setLlmCompleter, setOutboundEmitter, type LlmCompleter } from "@enclawed/egress-core";
import type { EnclawedPluginApi } from "@enclawed/plugin-sdk/plugin-entry";
import type { EgressMediatorConfig } from "./config.js";

type RunPayload = { text?: string; isError?: boolean };

function collectText(result: unknown): string {
  const payloads =
    typeof result === "object" && result !== null && "payloads" in result
      ? (result as { payloads?: RunPayload[] }).payloads
      : undefined;
  return (payloads ?? [])
    .filter((p) => !p.isError && typeof p.text === "string")
    .map((p) => p.text ?? "")
    .join("\n")
    .trim();
}

type RunMeta = { aborted?: unknown; error?: unknown };

/**
 * Why a run result cannot be used as a rephrase, or null when it can. A turn
 * that was aborted (the timeout aborts it), that ended in an error, or that
 * carries any error payload is not a complete rephrase: the text it holds may
 * be cut short or be the runner's own error message.
 */
function unusableRunReason(result: unknown): string | null {
  if (typeof result !== "object" || result === null) {
    return "no run result";
  }
  const meta = (result as { meta?: RunMeta }).meta;
  if (meta?.aborted === true) {
    return "model turn aborted (timeout)";
  }
  if (meta?.error !== undefined && meta.error !== null) {
    return "model turn ended in an error";
  }
  const payloads = (result as { payloads?: RunPayload[] }).payloads ?? [];
  if (payloads.some((p) => p.isError === true)) {
    return "model turn returned an error payload";
  }
  return null;
}

/**
 * Model completer over the embedded agent runner: one tool-less turn, temp
 * session. `llm.timeoutMs` is a hard deadline: when it passes the turn is
 * aborted and the completer throws, and the LLM scrambler stage then blocks
 * the payload (enforce mode). It never returns a partial or error reply.
 */
export function createRuntimeLlmCompleter(
  api: Pick<EnclawedPluginApi, "runtime" | "config">,
  llm: EgressMediatorConfig["llm"],
): LlmCompleter {
  return async (system, user) => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "enclawed-egress-llm-"));
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        abort.abort();
        reject(new Error(`egress LLM completer: no reply within ${llm.timeoutMs} ms`));
      }, llm.timeoutMs);
    });
    try {
      const sessionId = `egress-llm-scrambler-${Date.now()}`;
      const run = api.runtime.agent.runEmbeddedPiAgent({
        sessionId,
        sessionFile: path.join(tmpDir, "session.json"),
        workspaceDir: tmpDir,
        config: api.config,
        prompt: `${system}\n\n${user}`,
        timeoutMs: llm.timeoutMs,
        abortSignal: abort.signal,
        runId: sessionId,
        provider: llm.provider,
        model: llm.model,
        disableTools: true,
      });
      // The run may still settle after the deadline; its result is ignored.
      run.catch(() => {});
      const result = await Promise.race([run, deadline]);
      const unusable = unusableRunReason(result);
      if (unusable) {
        throw new Error(`egress LLM completer: ${unusable}`);
      }
      const text = collectText(result);
      if (!text) {
        // The stage treats a throw as a failed rephrase and blocks the payload.
        throw new Error("egress LLM completer: empty model output");
      }
      return text;
    } finally {
      clearTimeout(timer);
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  };
}

/** Install the runtime-backed seams. No-op outside full registration. */
export function installEgressHostSeams(api: EnclawedPluginApi, config: EgressMediatorConfig): void {
  if (api.registrationMode !== "full") {
    return;
  }
  if (config.llm.enabled && typeof api.runtime?.agent?.runEmbeddedPiAgent === "function") {
    setLlmCompleter(createRuntimeLlmCompleter(api, config.llm));
  }
  const loadAdapter = api.runtime?.channel?.outbound?.loadAdapter;
  if (config.coverTraffic.enabled) {
    setOutboundEmitter(async (msg) => {
      if (msg.action) {
        // Batcher padding never comes this way: it goes through the padded
        // tool's own request client (egress-core `getToolRequestClient`), so
        // a dummy is indistinguishable from a real call. A plain fetch here
        // would differ in headers and egress path, so refuse it.
        throw new Error("egress padding: send through the tool request client, not cover traffic");
      }
      if (!msg.channel) {
        throw new Error("egress cover traffic: target.channel is required");
      }
      if (typeof loadAdapter !== "function") {
        throw new Error("egress cover traffic: no channel outbound runtime");
      }
      const adapter = await loadAdapter(msg.channel);
      if (!adapter?.sendText) {
        throw new Error(`egress cover traffic: channel "${msg.channel}" cannot send text`);
      }
      await adapter.sendText({ cfg: api.config, to: msg.to, text: msg.content });
    });
  }
}
