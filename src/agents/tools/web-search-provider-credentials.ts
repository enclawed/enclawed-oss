import { normalizeSecretInputString, resolveSecretInputRef } from "../../config/types.secrets.js";
import { normalizeSecretInput } from "../../utils/normalize-secret-input.js";

export function resolveWebSearchProviderCredential(params: {
  credentialValue: unknown;
  path: string;
  envVars: string[];
}): string | undefined {
  const fromConfigRaw = normalizeSecretInputString(params.credentialValue);
  const fromConfig = normalizeSecretInput(fromConfigRaw);
  if (fromConfig) {
    return fromConfig;
  }

  const credentialRef = resolveSecretInputRef({
    value: params.credentialValue,
  }).ref;
  if (credentialRef) {
    if (credentialRef.source === "env") {
      return normalizeSecretInput(process.env[credentialRef.id]) || undefined;
    }
    // A non-env ref names a secret this resolver cannot read -- a file, a
    // vault entry. Falling through to the ambient variable below would quietly
    // authenticate with a DIFFERENT credential than the one configured, which
    // is worse than failing.
    return undefined;
  }

  for (const envVar of params.envVars) {
    const fromEnv = normalizeSecretInput(process.env[envVar]);
    if (fromEnv) {
      return fromEnv;
    }
  }

  return undefined;
}
