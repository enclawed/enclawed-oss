import fs from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
//#region extensions/memory-lancedb/config.ts
const MEMORY_CATEGORIES = [
	"preference",
	"fact",
	"decision",
	"entity",
	"other"
];
const DEFAULT_MODEL = "text-embedding-3-small";
const DEFAULT_CAPTURE_MAX_CHARS = 500;
const LEGACY_STATE_DIRS = [];
function resolveDefaultDbPath() {
	const home = homedir();
	const preferred = join(home, ".enclawed", "memory", "lancedb");
	try {
		if (fs.existsSync(preferred)) return preferred;
	} catch {}
	for (const legacy of LEGACY_STATE_DIRS) {
		const candidate = join(home, legacy, "memory", "lancedb");
		try {
			if (fs.existsSync(candidate)) return candidate;
		} catch {}
	}
	return preferred;
}
const DEFAULT_DB_PATH = resolveDefaultDbPath();
const EMBEDDING_DIMENSIONS = {
	"text-embedding-3-small": 1536,
	"text-embedding-3-large": 3072
};
function assertAllowedKeys(value, allowed, label) {
	const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
	if (unknown.length === 0) return;
	throw new Error(`${label} has unknown keys: ${unknown.join(", ")}`);
}
function vectorDimsForModel(model) {
	const dims = EMBEDDING_DIMENSIONS[model];
	if (!dims) throw new Error(`Unsupported embedding model: ${model}`);
	return dims;
}
function parseCorporaConfig(raw) {
	if (raw === void 0 || raw === null) return [];
	if (!Array.isArray(raw)) throw new Error("memory.corpora must be an array");
	const out = [];
	const seen = /* @__PURE__ */ new Set();
	for (const entry of raw) {
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("memory.corpora entries must be objects");
		const obj = entry;
		const allowed = [
			"id",
			"path",
			"embeddingURL",
			"embeddingModel",
			"chunkSize",
			"chunkOverlap"
		];
		for (const k of Object.keys(obj)) if (!allowed.includes(k)) throw new Error(`memory.corpora[].${k}: unknown key`);
		if (typeof obj.id !== "string" || !obj.id.length) throw new Error("memory.corpora[].id is required (non-empty string)");
		if (seen.has(obj.id)) throw new Error(`memory.corpora[]: duplicate id "${obj.id}"`);
		seen.add(obj.id);
		if (typeof obj.path !== "string" || !obj.path.length) throw new Error(`memory.corpora[id=${obj.id}].path is required`);
		if (obj.embeddingURL !== void 0 && typeof obj.embeddingURL !== "string") throw new Error(`memory.corpora[id=${obj.id}].embeddingURL must be a string`);
		if (obj.embeddingModel !== void 0 && typeof obj.embeddingModel !== "string") throw new Error(`memory.corpora[id=${obj.id}].embeddingModel must be a string`);
		const chunkSize = typeof obj.chunkSize === "number" ? Math.floor(obj.chunkSize) : 1e3;
		if (chunkSize <= 0 || chunkSize > 1e5) throw new Error(`memory.corpora[id=${obj.id}].chunkSize must be in (0, 100000]`);
		const chunkOverlap = typeof obj.chunkOverlap === "number" ? Math.floor(obj.chunkOverlap) : 100;
		if (chunkOverlap < 0 || chunkOverlap >= chunkSize) throw new Error(`memory.corpora[id=${obj.id}].chunkOverlap must be in [0, chunkSize)`);
		out.push(Object.freeze({
			id: obj.id,
			path: resolveEnvVars(obj.path),
			...typeof obj.embeddingURL === "string" ? { embeddingURL: resolveEnvVars(obj.embeddingURL) } : {},
			...typeof obj.embeddingModel === "string" ? { embeddingModel: obj.embeddingModel } : {},
			chunkSize,
			chunkOverlap
		}));
	}
	return out;
}
function resolveEnvVars(value) {
	return value.replace(/\$\{([^}]+)\}/g, (_, envVar) => {
		const envValue = process.env[envVar];
		if (!envValue) throw new Error(`Environment variable ${envVar} is not set`);
		return envValue;
	});
}
function resolveEmbeddingModel(embedding) {
	const model = typeof embedding.model === "string" ? embedding.model : DEFAULT_MODEL;
	if (typeof embedding.dimensions !== "number") vectorDimsForModel(model);
	return model;
}
const memoryConfigSchema = {
	parse(value) {
		if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("memory config required");
		const cfg = value;
		assertAllowedKeys(cfg, [
			"embedding",
			"dreaming",
			"dbPath",
			"autoCapture",
			"autoRecall",
			"captureMaxChars",
			"storageOptions",
			"corpora"
		], "memory config");
		const embedding = cfg.embedding;
		if (!embedding || typeof embedding.apiKey !== "string") throw new Error("embedding.apiKey is required");
		assertAllowedKeys(embedding, [
			"apiKey",
			"model",
			"baseUrl",
			"dimensions"
		], "embedding config");
		const model = resolveEmbeddingModel(embedding);
		const captureMaxChars = typeof cfg.captureMaxChars === "number" ? Math.floor(cfg.captureMaxChars) : void 0;
		if (typeof captureMaxChars === "number" && (captureMaxChars < 100 || captureMaxChars > 1e4)) throw new Error("captureMaxChars must be between 100 and 10000");
		const dreaming = typeof cfg.dreaming === "undefined" ? void 0 : cfg.dreaming && typeof cfg.dreaming === "object" && !Array.isArray(cfg.dreaming) ? cfg.dreaming : (() => {
			throw new Error("dreaming config must be an object");
		})();
		let storageOptions;
		const storageOpts = cfg.storageOptions;
		if (storageOpts !== void 0 && storageOpts !== null) {
			if (!storageOpts || typeof storageOpts !== "object" || Array.isArray(storageOpts)) throw new Error("storageOptions must be an object");
			storageOptions = {};
			for (const [key, value] of Object.entries(storageOpts)) {
				if (typeof value !== "string") throw new Error(`storageOptions.${key} must be a string`);
				storageOptions[key] = resolveEnvVars(value);
			}
		}
		const corpora = parseCorporaConfig(cfg.corpora);
		return {
			embedding: {
				provider: "openai",
				model,
				apiKey: resolveEnvVars(embedding.apiKey),
				baseUrl: typeof embedding.baseUrl === "string" ? resolveEnvVars(embedding.baseUrl) : void 0,
				dimensions: typeof embedding.dimensions === "number" ? embedding.dimensions : void 0
			},
			dreaming,
			dbPath: typeof cfg.dbPath === "string" ? cfg.dbPath : DEFAULT_DB_PATH,
			autoCapture: cfg.autoCapture === true,
			autoRecall: cfg.autoRecall !== false,
			captureMaxChars: captureMaxChars ?? 500,
			...storageOptions ? { storageOptions } : {},
			...corpora.length > 0 ? { corpora } : {}
		};
	},
	uiHints: {
		"embedding.apiKey": {
			label: "OpenAI API Key",
			sensitive: true,
			placeholder: "sk-proj-...",
			help: "API key for OpenAI embeddings (or use ${OPENAI_API_KEY})"
		},
		"embedding.baseUrl": {
			label: "Base URL",
			placeholder: "https://api.openai.com/v1",
			help: "Base URL for compatible providers (e.g. http://localhost:11434/v1)",
			advanced: true
		},
		"embedding.dimensions": {
			label: "Dimensions",
			placeholder: "1536",
			help: "Vector dimensions for custom models (required for non-standard models)",
			advanced: true
		},
		"embedding.model": {
			label: "Embedding Model",
			placeholder: DEFAULT_MODEL,
			help: "OpenAI embedding model to use"
		},
		dbPath: {
			label: "Database Path",
			placeholder: "~/.enclawed/memory/lancedb",
			advanced: true,
			help: "Local filesystem path or cloud storage URI (s3://, gs://) for LanceDB database"
		},
		autoCapture: {
			label: "Auto-Capture",
			help: "Automatically capture important information from conversations"
		},
		autoRecall: {
			label: "Auto-Recall",
			help: "Automatically inject relevant memories into context"
		},
		captureMaxChars: {
			label: "Capture Max Chars",
			help: "Maximum message length eligible for auto-capture",
			advanced: true,
			placeholder: String(500)
		},
		storageOptions: {
			label: "Storage Options",
			sensitive: true,
			advanced: true,
			help: "Storage configuration options (access_key, secret_key, endpoint, etc.); supports ${ENV_VAR} values"
		}
	}
};
//#endregion
export { vectorDimsForModel as i, MEMORY_CATEGORIES as n, memoryConfigSchema as r, DEFAULT_CAPTURE_MAX_CHARS as t };
