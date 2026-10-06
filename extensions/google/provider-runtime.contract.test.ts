import { describeGoogleProviderRuntimeContract } from "@enclawed/plugin-sdk/provider-test-contracts";

describeGoogleProviderRuntimeContract(() => import("./index.js"));
