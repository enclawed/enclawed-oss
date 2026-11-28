import { describeGithubCopilotProviderRuntimeContract } from "@enclawed/plugin-sdk/provider-test-contracts";

describeGithubCopilotProviderRuntimeContract(() => import("./index.js"));
