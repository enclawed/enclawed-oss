import { describeOpenAIProviderRuntimeContract } from "@enclawed/plugin-sdk/provider-test-contracts";

describeOpenAIProviderRuntimeContract(() => import("./index.js"));
