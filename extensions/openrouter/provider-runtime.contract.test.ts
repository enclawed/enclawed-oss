import { describeOpenRouterProviderRuntimeContract } from "@enclawed/plugin-sdk/provider-test-contracts";

describeOpenRouterProviderRuntimeContract(() => import("./index.js"));
