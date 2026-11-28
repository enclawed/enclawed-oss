import { describe, expect, it } from "vitest";
import { buildVitestCapabilityShimAliasMap } from "./bundled-capability-runtime.js";

describe("buildVitestCapabilityShimAliasMap", () => {
  it("keeps scoped and unscoped capability shim aliases aligned", () => {
    const aliasMap = buildVitestCapabilityShimAliasMap();

    expect(aliasMap["@enclawed/plugin-sdk/llm-task"]).toBe(
      aliasMap["@enclawed/plugin-sdk/llm-task"],
    );
    expect(aliasMap["@enclawed/plugin-sdk/config-runtime"]).toBe(
      aliasMap["@enclawed/plugin-sdk/config-runtime"],
    );
    expect(aliasMap["@enclawed/plugin-sdk/media-runtime"]).toBe(
      aliasMap["@enclawed/plugin-sdk/media-runtime"],
    );
    expect(aliasMap["@enclawed/plugin-sdk/provider-onboard"]).toBe(
      aliasMap["@enclawed/plugin-sdk/provider-onboard"],
    );
    expect(aliasMap["@enclawed/plugin-sdk/speech-core"]).toBe(
      aliasMap["@enclawed/plugin-sdk/speech-core"],
    );
  });
});
