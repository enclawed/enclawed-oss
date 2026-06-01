import { t as resolveBundledPluginsDir } from "./bundled-dir-BQ0Gl6Jw.js";
import { i as openBoundaryFileSync } from "./boundary-file-read-CQh3KACR.js";
import { i as resolveBundledPluginSourcePublicSurfacePath, r as resolveBundledPluginPublicSurfacePath } from "./public-surface-runtime-BofpEZUp.js";
import { l as resolveLoaderPackageRoot } from "./sdk-alias-C8kG0ZRH.js";
import { t as getCachedPluginJitiLoader } from "./jiti-loader-cache-B3dId7bg.js";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
//#region src/plugin-sdk/facade-loader.ts
const CURRENT_MODULE_PATH = fileURLToPath(import.meta.url);
const nodeRequire = createRequire(import.meta.url);
const jitiLoaders = /* @__PURE__ */ new Map();
const loadedFacadeModules = /* @__PURE__ */ new Map();
const loadedFacadePluginIds = /* @__PURE__ */ new Set();
const cachedFacadeModuleLocationsByKey = /* @__PURE__ */ new Map();
let facadeLoaderJitiFactory;
let cachedEnclawedPackageRoot;
function getJitiFactory() {
	if (facadeLoaderJitiFactory) return facadeLoaderJitiFactory;
	const { createJiti } = nodeRequire("jiti");
	facadeLoaderJitiFactory = createJiti;
	return facadeLoaderJitiFactory;
}
function getEnclawedPackageRoot() {
	if (cachedEnclawedPackageRoot) return cachedEnclawedPackageRoot;
	cachedEnclawedPackageRoot = resolveLoaderPackageRoot({
		modulePath: fileURLToPath(import.meta.url),
		moduleUrl: import.meta.url
	}) ?? fileURLToPath(new URL("../..", import.meta.url));
	return cachedEnclawedPackageRoot;
}
function createFacadeResolutionKey(params) {
	const bundledPluginsDir = resolveBundledPluginsDir(params.env ?? process.env);
	return `${params.dirName}::${params.artifactBasename}::${bundledPluginsDir ? path.resolve(bundledPluginsDir) : "<default>"}`;
}
function resolveFacadeModuleLocationUncached(params) {
	const bundledPluginsDir = resolveBundledPluginsDir(params.env ?? process.env);
	if (!CURRENT_MODULE_PATH.includes(`${path.sep}dist${path.sep}`)) {
		const modulePath = resolveBundledPluginSourcePublicSurfacePath({
			...params,
			sourceRoot: bundledPluginsDir ?? path.resolve(getEnclawedPackageRoot(), "extensions")
		}) ?? resolveBundledPluginPublicSurfacePath({
			rootDir: getEnclawedPackageRoot(),
			env: params.env,
			...bundledPluginsDir ? { bundledPluginsDir } : {},
			dirName: params.dirName,
			artifactBasename: params.artifactBasename
		});
		if (modulePath) return {
			modulePath,
			boundaryRoot: bundledPluginsDir && modulePath.startsWith(path.resolve(bundledPluginsDir) + path.sep) ? path.resolve(bundledPluginsDir) : getEnclawedPackageRoot()
		};
		return null;
	}
	const modulePath = resolveBundledPluginPublicSurfacePath({
		rootDir: getEnclawedPackageRoot(),
		env: params.env,
		...bundledPluginsDir ? { bundledPluginsDir } : {},
		dirName: params.dirName,
		artifactBasename: params.artifactBasename
	});
	if (!modulePath) return null;
	return {
		modulePath,
		boundaryRoot: bundledPluginsDir && modulePath.startsWith(path.resolve(bundledPluginsDir) + path.sep) ? path.resolve(bundledPluginsDir) : getEnclawedPackageRoot()
	};
}
function resolveFacadeModuleLocation(params) {
	const key = createFacadeResolutionKey(params);
	if (cachedFacadeModuleLocationsByKey.has(key)) return cachedFacadeModuleLocationsByKey.get(key) ?? null;
	const resolved = resolveFacadeModuleLocationUncached(params);
	cachedFacadeModuleLocationsByKey.set(key, resolved);
	return resolved;
}
function getJiti(modulePath) {
	return getCachedPluginJitiLoader({
		cache: jitiLoaders,
		modulePath,
		importerUrl: import.meta.url,
		preferBuiltDist: true,
		jitiFilename: import.meta.url,
		createLoader: getJitiFactory()
	});
}
function createLazyFacadeValueLoader(load) {
	let loaded = false;
	let value;
	return () => {
		if (!loaded) {
			value = load();
			loaded = true;
		}
		return value;
	};
}
function createLazyFacadeProxyValue(params) {
	const resolve = createLazyFacadeValueLoader(params.load);
	return new Proxy(params.target, {
		defineProperty(_target, property, descriptor) {
			return Reflect.defineProperty(resolve(), property, descriptor);
		},
		deleteProperty(_target, property) {
			return Reflect.deleteProperty(resolve(), property);
		},
		get(_target, property, receiver) {
			return Reflect.get(resolve(), property, receiver);
		},
		getOwnPropertyDescriptor(_target, property) {
			return Reflect.getOwnPropertyDescriptor(resolve(), property);
		},
		getPrototypeOf() {
			return Reflect.getPrototypeOf(resolve());
		},
		has(_target, property) {
			return Reflect.has(resolve(), property);
		},
		isExtensible() {
			return Reflect.isExtensible(resolve());
		},
		ownKeys() {
			return Reflect.ownKeys(resolve());
		},
		preventExtensions() {
			return Reflect.preventExtensions(resolve());
		},
		set(_target, property, value, receiver) {
			return Reflect.set(resolve(), property, value, receiver);
		},
		setPrototypeOf(_target, prototype) {
			return Reflect.setPrototypeOf(resolve(), prototype);
		}
	});
}
function createLazyFacadeObjectValue(load) {
	return createLazyFacadeProxyValue({
		load,
		target: {}
	});
}
function loadFacadeModuleAtLocationSync(params) {
	const cached = loadedFacadeModules.get(params.location.modulePath);
	if (cached) return cached;
	const opened = openBoundaryFileSync({
		absolutePath: params.location.modulePath,
		rootPath: params.location.boundaryRoot,
		boundaryLabel: params.location.boundaryRoot === getEnclawedPackageRoot() ? "Enclawed package root" : (() => {
			const bundledDir = resolveBundledPluginsDir();
			return bundledDir && path.resolve(params.location.boundaryRoot) === path.resolve(bundledDir) ? "bundled plugin directory" : "plugin root";
		})(),
		rejectHardlinks: false
	});
	if (!opened.ok) throw new Error(`Unable to open bundled plugin public surface ${params.location.modulePath}`, { cause: opened.error });
	fs.closeSync(opened.fd);
	const sentinel = {};
	loadedFacadeModules.set(params.location.modulePath, sentinel);
	let loaded;
	try {
		loaded = params.loadModule?.(params.location.modulePath) ?? getJiti(params.location.modulePath)(params.location.modulePath);
		Object.assign(sentinel, loaded);
		loadedFacadePluginIds.add(typeof params.trackedPluginId === "function" ? params.trackedPluginId() : params.trackedPluginId);
	} catch (err) {
		loadedFacadeModules.delete(params.location.modulePath);
		throw err;
	}
	return sentinel;
}
function loadBundledPluginPublicSurfaceModuleSync(params) {
	const location = resolveFacadeModuleLocation(params);
	if (!location) throw new Error(`Unable to resolve bundled plugin public surface ${params.dirName}/${params.artifactBasename}`);
	return loadFacadeModuleAtLocationSync({
		location,
		trackedPluginId: params.trackedPluginId ?? params.dirName
	});
}
function listImportedBundledPluginFacadeIds() {
	return [...loadedFacadePluginIds].toSorted((left, right) => left.localeCompare(right));
}
function resetFacadeLoaderStateForTest() {
	loadedFacadeModules.clear();
	loadedFacadePluginIds.clear();
	jitiLoaders.clear();
	cachedFacadeModuleLocationsByKey.clear();
	facadeLoaderJitiFactory = void 0;
	cachedEnclawedPackageRoot = void 0;
}
//#endregion
export { resetFacadeLoaderStateForTest as a, loadFacadeModuleAtLocationSync as i, listImportedBundledPluginFacadeIds as n, loadBundledPluginPublicSurfaceModuleSync as r, createLazyFacadeObjectValue as t };
