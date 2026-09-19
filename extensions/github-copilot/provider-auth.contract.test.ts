import { describeGithubCopilotProviderAuthContract } from "@enclawed/plugin-sdk/provider-test-contracts";

describeGithubCopilotProviderAuthContract(() => import("./index.js"));
