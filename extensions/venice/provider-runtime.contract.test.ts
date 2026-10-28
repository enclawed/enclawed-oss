import { describeVeniceProviderRuntimeContract } from "@enclawed/plugin-sdk/provider-test-contracts";

describeVeniceProviderRuntimeContract(() => import("./index.js"));
