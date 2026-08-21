import { describeAnthropicProviderRuntimeContract } from "@enclawed/plugin-sdk/provider-test-contracts";

describeAnthropicProviderRuntimeContract(() => import("./index.js"));
