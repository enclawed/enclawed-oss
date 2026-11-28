// enclawed: classify gateway agent tools into the skill capability vocabulary
// (./skill-capabilities.ts), so the gateway tool path can apply the same
// reversible/irreversible split framework apps get from SkillGate.
//
// File writes (write, edit, apply_patch) default to fs.write.irrev here; the
// gateway gate reclassifies each such call per target as fs.write.rev when
// its history is kept or irrelevant (./fs-reversibility.ts).
//
// The map is keyed by canonical (normalized) tool id. Anything not listed,
// including every plugin, MCP, harness-native and client tool, classifies as
// `tool.invoke`, which is irreversible: an unknown tool waits for a person
// (fail-closed).
//
// Reversible means the data's history exists or is irrelevant: reading
// files, memory and session state, updating the in-session plan, and file
// writes whose prior content is kept (or that land in scratch).
//
// Read-only web retrieval (web_search, web_fetch, x_search) is network
// egress, which the vocabulary tags irreversible. These tools only issue
// retrieval requests (web_fetch is GET-only) and change no remote state;
// where they may connect is governed by the egress host allowlist and DLP,
// not by a person approving each lookup. They are classified `net.egress`
// with an explicit read-only exemption so the audit trail stays truthful
// about the capability while the approval prompt is reserved for calls with
// side effects.

import { CAPABILITY, isReversible, type CapabilityToken } from "./skill-capabilities.js";

export type ToolCapabilityClass = Readonly<{
  capability: CapabilityToken;
  /** True when the call needs no human approval. */
  reversible: boolean;
  /** Why a non-reversible capability is still treated as reversible, if it is. */
  exemption?: "read-only-retrieval";
}>;

const TOOL_CAPABILITIES: Readonly<Record<string, CapabilityToken>> = Object.freeze({
  // Files and memory: reads.
  read: CAPABILITY.FS_READ,
  memory_search: CAPABILITY.FS_READ,
  memory_get: CAPABILITY.FS_READ,
  image: CAPABILITY.FS_READ,
  // Runtime and session state: reads.
  sessions_list: CAPABILITY.FS_READ,
  sessions_history: CAPABILITY.FS_READ,
  session_status: CAPABILITY.FS_READ,
  agents_list: CAPABILITY.FS_READ,
  // In-session bookkeeping with no effect outside the session.
  update_plan: CAPABILITY.FS_WRITE_REV,
  sessions_yield: CAPABILITY.FS_WRITE_REV,
  // Workspace writes: irreversible unless history is kept per call.
  write: CAPABILITY.FS_WRITE_IRREV,
  edit: CAPABILITY.FS_WRITE_IRREV,
  apply_patch: CAPABILITY.FS_WRITE_IRREV,
  // Processes and agents.
  exec: CAPABILITY.SPAWN_PROC,
  process: CAPABILITY.SPAWN_PROC,
  code_execution: CAPABILITY.SPAWN_PROC,
  sessions_spawn: CAPABILITY.SPAWN_PROC,
  subagents: CAPABILITY.SPAWN_PROC,
  // Outbound communication.
  message: CAPABILITY.PUBLISH,
  sessions_send: CAPABILITY.PUBLISH,
  // Network: interactive browsing can submit forms and click through actions.
  browser: CAPABILITY.NET_EGRESS,
  web_search: CAPABILITY.NET_EGRESS,
  web_fetch: CAPABILITY.NET_EGRESS,
  x_search: CAPABILITY.NET_EGRESS,
  // Paid third-party generation calls.
  image_generate: CAPABILITY.NET_EGRESS,
  music_generate: CAPABILITY.NET_EGRESS,
  video_generate: CAPABILITY.NET_EGRESS,
  tts: CAPABILITY.NET_EGRESS,
  // Devices, canvases and nodes act outside the gateway.
  canvas: CAPABILITY.TOOL_INVOKE,
  nodes: CAPABILITY.TOOL_INVOKE,
  // Configuration and schedules change what the system does later.
  gateway: CAPABILITY.MUTATE_SCHEMA,
  cron: CAPABILITY.MUTATE_SCHEMA,
});

const READ_ONLY_RETRIEVAL: ReadonlySet<string> = new Set(["web_search", "web_fetch", "x_search"]);

/** Classify a canonical tool id. Unknown tools are `tool.invoke` (irreversible). */
export function classifyToolCall(toolId: string): ToolCapabilityClass {
  const capability = Object.hasOwn(TOOL_CAPABILITIES, toolId)
    ? TOOL_CAPABILITIES[toolId]
    : CAPABILITY.TOOL_INVOKE;
  if (READ_ONLY_RETRIEVAL.has(toolId)) {
    return { capability, reversible: true, exemption: "read-only-retrieval" };
  }
  return { capability, reversible: isReversible(capability) };
}

const FS_WRITE_TOOLS: ReadonlySet<string> = new Set(["write", "edit", "apply_patch"]);

/** Tools whose calls write or delete files, classified per target. */
export function isFsWriteTool(toolId: string): boolean {
  return FS_WRITE_TOOLS.has(toolId);
}

// Shared, generic slot for the tool capability classifier. Consumers that
// cannot import core (bundled plugins, workspace packages) read it from
// `globalThis`; the key is a stable contract.
const TOOL_CLASSIFIER_KEY = Symbol.for("enclawed.tool-capability-classifier");

/**
 * Publish `classifyToolCall` on the shared classifier slot so plugin-side
 * consumers (for example the egress action batcher, which collapses repeats
 * only of read-only tools) classify tools by this map instead of a copy.
 */
export function publishToolCapabilityClassifier(): void {
  const globals = globalThis as unknown as Record<
    symbol,
    { classify: ((toolId: string) => ToolCapabilityClass) | null } | undefined
  >;
  const slot = globals[TOOL_CLASSIFIER_KEY] ?? { classify: null };
  slot.classify = classifyToolCall;
  globals[TOOL_CLASSIFIER_KEY] = slot;
}
