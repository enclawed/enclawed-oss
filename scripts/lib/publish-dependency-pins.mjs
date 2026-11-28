// Exact dependency pins for the published tarball.
//
// The published package must not resolve anything at install time that the
// release did not pin. This module computes the runtime dependency set the
// tarball declares: the root package's runtime dependencies plus every
// runtime dependency of the bundled plugins shipped under dist/extensions/
// (the set scripts/postinstall-bundled-plugins.mjs checks after install),
// each pinned to the exact version recorded in pnpm-lock.yaml (npm aliases
// become "npm:<real-name>@<exact>"). A dependency without an exact registry
// version in the lockfile (git/file specs, unresolved ranges) fails the
// release instead of shipping a floating dependency. When two packages ask for
// different versions of one dependency, the root package's pin (then the first
// plugin's, alphabetically) wins, as it does at runtime in the flat install;
// those are reported as warnings.
//
// It also validates an npm-shrinkwrap.json: every installed entry must carry
// an exact version, a registry tarball URL and a sha512 integrity hash, and
// every declared dependency must appear in it at its pinned version.

import { parse as parseYaml } from "yaml";

const EXACT_VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

export function isExactVersion(value) {
  return typeof value === "string" && EXACT_VERSION_RE.test(value);
}

/** pnpm records peer context as "1.2.3(peer@4.5.6)"; keep the version only. */
export function lockVersionToExact(version) {
  return lockVersionToSpec(version)?.spec ?? null;
}

/**
 * Turn a pnpm-lock importer version into an exact npm spec: "1.2.3" or, for
 * an alias recorded as "@scope/real@1.2.3(...)", "npm:@scope/real@1.2.3".
 */
export function lockVersionToSpec(version) {
  if (typeof version !== "string") {
    return null;
  }
  const base = version.split("(")[0].trim();
  if (isExactVersion(base)) {
    return { spec: base, version: base, realName: null };
  }
  const at = base.lastIndexOf("@");
  if (at > 0) {
    const realName = base.slice(0, at);
    const exact = base.slice(at + 1);
    if (isExactVersion(exact) && /^(@[^/@\s]+\/)?[^/@\s]+$/u.test(realName)) {
      return { spec: `npm:${realName}@${exact}`, version: exact, realName };
    }
  }
  return null;
}

/** Parse an exact publish spec ("1.2.3" or "npm:name@1.2.3"). */
export function parseExactSpec(spec) {
  if (isExactVersion(spec)) {
    return { version: spec, realName: null };
  }
  if (typeof spec === "string" && spec.startsWith("npm:")) {
    const parsed = lockVersionToSpec(spec.slice(4));
    return parsed?.realName ? { version: parsed.version, realName: parsed.realName } : null;
  }
  return null;
}

function runtimeSpecs(packageJson) {
  return {
    dependencies: { ...packageJson?.dependencies },
    optionalDependencies: { ...packageJson?.optionalDependencies },
  };
}

function lockImporterVersion(importer, name) {
  for (const section of ["dependencies", "optionalDependencies"]) {
    const entry = importer?.[section]?.[name];
    if (entry && typeof entry === "object") {
      return entry.version;
    }
  }
  return undefined;
}

/**
 * @param {{
 *   rootPackageJson: Record<string, unknown>,
 *   lockText: string,
 *   plugins: Array<{ id: string, importer: string, packageJson: Record<string, unknown> }>,
 * }} params
 * @returns {{ dependencies: Record<string,string>, optionalDependencies: Record<string,string>, errors: string[], warnings: string[] }}
 */
export function computePublishDependencyPins(params) {
  const lock = parseYaml(params.lockText);
  const importers = lock?.importers ?? {};
  const errors = [];
  const warnings = [];
  const dependencies = {};
  const optionalDependencies = {};

  const pin = (target, name, spec, importerKey, owner) => {
    if (typeof spec === "string" && /^(workspace|link|file):/u.test(spec)) {
      // Workspace-internal packages are compiled into dist/; nothing to install.
      return;
    }
    const exact = lockVersionToSpec(lockImporterVersion(importers[importerKey], name))?.spec;
    if (!exact) {
      errors.push(
        `${owner}: ${name}@${String(spec)} has no exact registry version in pnpm-lock.yaml (importer "${importerKey}")`,
      );
      return;
    }
    const existing = dependencies[name] ?? optionalDependencies[name];
    if (existing && existing !== exact) {
      warnings.push(`${owner}: ${name} wants ${exact}; the tarball ships ${existing}`);
      return;
    }
    if (!existing) {
      target[name] = exact;
    }
  };

  const root = runtimeSpecs(params.rootPackageJson);
  for (const [name, spec] of Object.entries(root.dependencies)) {
    pin(dependencies, name, spec, ".", "package.json");
  }
  for (const [name, spec] of Object.entries(root.optionalDependencies)) {
    pin(optionalDependencies, name, spec, ".", "package.json");
  }
  for (const plugin of [...params.plugins].toSorted((a, b) => a.id.localeCompare(b.id))) {
    const specs = runtimeSpecs(plugin.packageJson);
    const owner = `plugin ${plugin.id}`;
    for (const [name, spec] of Object.entries(specs.dependencies)) {
      pin(dependencies, name, spec, plugin.importer, owner);
    }
    for (const [name, spec] of Object.entries(specs.optionalDependencies)) {
      if (!(name in dependencies)) {
        pin(optionalDependencies, name, spec, plugin.importer, owner);
      }
    }
  }
  const sortObject = (obj) =>
    Object.fromEntries(Object.entries(obj).toSorted(([a], [b]) => a.localeCompare(b)));
  return {
    dependencies: sortObject(dependencies),
    optionalDependencies: sortObject(optionalDependencies),
    errors,
    warnings,
  };
}

const INTEGRITY_RE = /^sha512-[A-Za-z0-9+/]+={0,2}$/u;

/**
 * Validate an npm-shrinkwrap.json against the package manifest it ships with.
 * Returns a list of problems; empty means the shrinkwrap is complete.
 */
export function validateShrinkwrap(packageJson, shrinkwrap) {
  const errors = [];
  if (!shrinkwrap || typeof shrinkwrap !== "object") {
    return ["npm-shrinkwrap.json is missing or not a JSON object"];
  }
  if (!(Number(shrinkwrap.lockfileVersion) >= 2)) {
    errors.push("npm-shrinkwrap.json must use lockfileVersion 2 or 3");
  }
  const packages = shrinkwrap.packages ?? {};
  for (const section of ["dependencies", "optionalDependencies"]) {
    for (const [name, rawSpec] of Object.entries(packageJson?.[section] ?? {})) {
      const spec = String(rawSpec);
      const exact = parseExactSpec(spec);
      if (!exact) {
        errors.push(`package.json ${section}.${name} is "${spec}", not an exact version`);
      }
      const entry = packages[`node_modules/${name}`];
      if (!entry) {
        if (section === "dependencies") {
          errors.push(`npm-shrinkwrap.json has no entry for ${name}`);
        }
        continue;
      }
      const want = exact?.version ?? spec;
      if (entry.version !== want) {
        errors.push(`npm-shrinkwrap.json pins ${name}@${entry.version}, package.json pins ${spec}`);
      } else if (exact?.realName && entry.name !== exact.realName) {
        errors.push(
          `npm-shrinkwrap.json ${name} is ${entry.name ?? "unnamed"}, not ${exact.realName}`,
        );
      }
    }
  }
  for (const [path, entry] of Object.entries(packages)) {
    if (path === "" || entry?.link === true) {
      continue;
    }
    if (!isExactVersion(entry?.version)) {
      errors.push(`${path}: missing or non-exact version`);
    }
    if (typeof entry?.resolved !== "string" || !entry.resolved.startsWith("https://")) {
      errors.push(`${path}: missing https registry "resolved" URL`);
    }
    if (typeof entry?.integrity !== "string" || !INTEGRITY_RE.test(entry.integrity)) {
      errors.push(`${path}: missing sha512 integrity`);
    }
  }
  return errors;
}
