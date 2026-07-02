import { normalizeOptionalString } from "../../../src/shared/string-coerce.js";
import { isRecord } from "../../../src/utils.js";

export type JsonObject = Record<string, unknown>;

export type ExternalPluginCompatibility = {
  pluginApiRange?: string;
  builtWithEnclawedVersion?: string;
  pluginSdkVersion?: string;
  minGatewayVersion?: string;
};

export type ExternalPluginValidationIssue = {
  fieldPath: string;
  message: string;
};

export type ExternalCodePluginValidationResult = {
  compatibility?: ExternalPluginCompatibility;
  issues: ExternalPluginValidationIssue[];
};

export const EXTERNAL_CODE_PLUGIN_REQUIRED_FIELD_PATHS = [
  "enclawed.compat.pluginApi",
  "enclawed.build.enclawedVersion",
] as const;

function readEnclawedBlock(packageJson: unknown) {
  const root = isRecord(packageJson) ? packageJson : undefined;
  const enclawed = isRecord(root?.enclawed) ? root.enclawed : undefined;
  const compat = isRecord(enclawed?.compat) ? enclawed.compat : undefined;
  const build = isRecord(enclawed?.build) ? enclawed.build : undefined;
  const install = isRecord(enclawed?.install) ? enclawed.install : undefined;
  return { root, enclawed, compat, build, install };
}

export function normalizeExternalPluginCompatibility(
  packageJson: unknown,
): ExternalPluginCompatibility | undefined {
  const { root, compat, build, install } = readEnclawedBlock(packageJson);
  const version = normalizeOptionalString(root?.version);
  const minHostVersion = normalizeOptionalString(install?.minHostVersion);
  const compatibility: ExternalPluginCompatibility = {};

  const pluginApi = normalizeOptionalString(compat?.pluginApi);
  if (pluginApi) {
    compatibility.pluginApiRange = pluginApi;
  }

  const minGatewayVersion = normalizeOptionalString(compat?.minGatewayVersion) ?? minHostVersion;
  if (minGatewayVersion) {
    compatibility.minGatewayVersion = minGatewayVersion;
  }

  const builtWithEnclawedVersion = normalizeOptionalString(build?.enclawedVersion) ?? version;
  if (builtWithEnclawedVersion) {
    compatibility.builtWithEnclawedVersion = builtWithEnclawedVersion;
  }

  const pluginSdkVersion = normalizeOptionalString(build?.pluginSdkVersion);
  if (pluginSdkVersion) {
    compatibility.pluginSdkVersion = pluginSdkVersion;
  }

  return Object.keys(compatibility).length > 0 ? compatibility : undefined;
}

export function listMissingExternalCodePluginFieldPaths(packageJson: unknown): string[] {
  const { compat, build } = readEnclawedBlock(packageJson);
  const missing: string[] = [];
  if (!normalizeOptionalString(compat?.pluginApi)) {
    missing.push("enclawed.compat.pluginApi");
  }
  if (!normalizeOptionalString(build?.enclawedVersion)) {
    missing.push("enclawed.build.enclawedVersion");
  }
  return missing;
}

export function validateExternalCodePluginPackageJson(
  packageJson: unknown,
): ExternalCodePluginValidationResult {
  const issues = listMissingExternalCodePluginFieldPaths(packageJson).map((fieldPath) => ({
    fieldPath,
    message: `${fieldPath} is required for external code plugins published to ClawHub.`,
  }));
  return {
    compatibility: normalizeExternalPluginCompatibility(packageJson),
    issues,
  };
}
