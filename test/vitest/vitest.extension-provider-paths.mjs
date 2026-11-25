import { bundledPluginRoot } from "../../scripts/lib/bundled-plugin-paths.mjs";

export const providerExtensionIds = [
  "amazon-bedrock",
  "amazon-bedrock-mantle",
  "anthropic",
  "anthropic-vertex",
  "chutes",
  "comfy",
  "github-copilot",
  "google",
  "groq",
  "huggingface",
  "microsoft",
  "microsoft-foundry",
  "mistral",
  "nvidia",
  "ollama",
  "openai",
  "openrouter",
  "together",
  "venice",
  "xai",
];

export const providerExtensionTestRoots = providerExtensionIds.map((id) => bundledPluginRoot(id));

export function isProviderExtensionRoot(root) {
  return providerExtensionTestRoots.includes(root);
}
