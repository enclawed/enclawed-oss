import { parseFrontmatterBlock } from "../markdown/frontmatter.js";
import {
  applyEnclawedManifestInstallCommonFields,
  getFrontmatterString,
  normalizeStringList,
  parseEnclawedManifestInstallBase,
  parseFrontmatterBool,
  resolveEnclawedManifestBlock,
  resolveEnclawedManifestInstall,
  resolveEnclawedManifestOs,
  resolveEnclawedManifestRequires,
} from "../shared/frontmatter.js";
import { readStringValue } from "../shared/string-coerce.js";
import type {
  EnclawedHookMetadata,
  HookEntry,
  HookInstallSpec,
  HookInvocationPolicy,
  ParsedHookFrontmatter,
} from "./types.js";

export function parseFrontmatter(content: string): ParsedHookFrontmatter {
  return parseFrontmatterBlock(content);
}

function parseInstallSpec(input: unknown): HookInstallSpec | undefined {
  const parsed = parseEnclawedManifestInstallBase(input, ["bundled", "npm", "git"]);
  if (!parsed) {
    return undefined;
  }
  const { raw } = parsed;
  const spec = applyEnclawedManifestInstallCommonFields<HookInstallSpec>(
    {
      kind: parsed.kind as HookInstallSpec["kind"],
    },
    parsed,
  );
  if (typeof raw.package === "string") {
    spec.package = raw.package;
  }
  if (typeof raw.repository === "string") {
    spec.repository = raw.repository;
  }

  return spec;
}

export function resolveEnclawedMetadata(
  frontmatter: ParsedHookFrontmatter,
): EnclawedHookMetadata | undefined {
  const metadataObj = resolveEnclawedManifestBlock({ frontmatter });
  if (!metadataObj) {
    return undefined;
  }
  const requires = resolveEnclawedManifestRequires(metadataObj);
  const install = resolveEnclawedManifestInstall(metadataObj, parseInstallSpec);
  const osRaw = resolveEnclawedManifestOs(metadataObj);
  const eventsRaw = normalizeStringList(metadataObj.events);
  return {
    always: typeof metadataObj.always === "boolean" ? metadataObj.always : undefined,
    emoji: readStringValue(metadataObj.emoji),
    homepage: readStringValue(metadataObj.homepage),
    hookKey: readStringValue(metadataObj.hookKey),
    export: readStringValue(metadataObj.export),
    os: osRaw.length > 0 ? osRaw : undefined,
    events: eventsRaw.length > 0 ? eventsRaw : [],
    requires: requires,
    install: install.length > 0 ? install : undefined,
  };
}

export function resolveHookInvocationPolicy(
  frontmatter: ParsedHookFrontmatter,
): HookInvocationPolicy {
  return {
    enabled: parseFrontmatterBool(getFrontmatterString(frontmatter, "enabled"), true),
  };
}

export function resolveHookKey(hookName: string, entry?: HookEntry): string {
  return entry?.metadata?.hookKey ?? hookName;
}
