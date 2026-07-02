import { t as getMatrixScopedEnvVarNames } from "./env-vars-DXko9lyN.js";
import { i as resolveScopedMatrixEnvConfig, r as resolveMatrixEnvAuthReadiness, t as hasReadyMatrixEnvAuth } from "./env-auth-CDK7szhr.js";
import { n as validateMatrixHomeserverUrl, t as resolveValidatedMatrixHomeserverUrl } from "./url-validation-BWedr5IE.js";
import { t as isBunRuntime } from "./runtime-DiBMfDfS.js";
import { i as resolveMatrixConfigForAccount, n as resolveMatrixAuth, r as resolveMatrixAuthContext, t as backfillMatrixAuthDeviceIdAfterStartup } from "./config-CFUaLxNA.js";
import { t as createMatrixClient } from "./create-client-BBoaIzal.js";
import { i as resolveSharedMatrixClient, n as releaseSharedClientInstance, o as stopSharedClientForAccount, r as removeSharedClientInstance, s as stopSharedClientInstance, t as acquireSharedMatrixClient } from "./shared-DBxkgKON.js";
import "./client-Dm3VJhrR.js";
export { acquireSharedMatrixClient, backfillMatrixAuthDeviceIdAfterStartup, createMatrixClient, getMatrixScopedEnvVarNames, hasReadyMatrixEnvAuth, isBunRuntime, releaseSharedClientInstance, removeSharedClientInstance, resolveMatrixAuth, resolveMatrixAuthContext, resolveMatrixConfigForAccount, resolveMatrixEnvAuthReadiness, resolveScopedMatrixEnvConfig, resolveSharedMatrixClient, resolveValidatedMatrixHomeserverUrl, stopSharedClientForAccount, stopSharedClientInstance, validateMatrixHomeserverUrl };
