// Stub. The anthropic-vertex extension is stripped from this fork; the real
// implementation is preserved in
// attic/channels-pending-security-review/src/agents/anthropic-vertex-stream.ts
// and will be restored if the channel is reintroduced after passing the
// enclawed security review (see attic/README.md).
//
// The stub keeps the module path valid so consumers
// (simple-completion-transport, pi-embedded-runner stream-resolution) and
// their test mocks continue to compile. Calling the stubbed functions is a
// runtime error: it indicates the agent is configured for a stripped
// provider, which is itself a misconfiguration.

import type { StreamFn } from "@mariozechner/pi-agent-core";

const stripped = (): never => {
  throw new Error(
    "anthropic-vertex provider is stripped from this fork. Restore from attic/ after passing enclawed security review.",
  );
};

export function createAnthropicVertexStreamFn(): StreamFn {
  return stripped();
}

export function createAnthropicVertexStreamFnForModel(_model: unknown): StreamFn {
  return stripped();
}
