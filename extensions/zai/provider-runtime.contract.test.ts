import { describeZAIProviderRuntimeContract } from "@enclawed/plugin-sdk/provider-test-contracts";

describeZAIProviderRuntimeContract(() => import("./index.js"));
