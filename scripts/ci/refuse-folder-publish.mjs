#!/usr/bin/env node
// prepublishOnly: npm runs this only for `npm publish` from the package folder
// (publishing a tarball file runs no package script). From the folder, npm
// uploads the dependency list it read before `prepack` rewrote package.json, so
// the registry metadata would lack the bundled plugins' dependencies and
// `npm install -g` would fail (enclawed 2.0.1). Publish with the release script,
// which publishes the tested tarball.
console.error(
  [
    "",
    "Do not publish enclawed from the folder: the registry would get the dependency list from before prepack.",
    "Publish with:  node scripts/release-npm.mjs",
    "(it packs once, runs every release check on that tarball, publishes that file and verifies the registry)",
    "",
  ].join("\n"),
);
process.exit(1);
