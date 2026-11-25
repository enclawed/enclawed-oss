import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildGatewayInstallEntrypointCandidates as resolveGatewayInstallEntrypointCandidates,
  resolveGatewayInstallEntrypoint,
} from "../../daemon/gateway-entrypoint.js";

describe("resolveGatewayInstallEntrypointCandidates", () => {
  it("prefers index.js before legacy entry.js", () => {
    expect(resolveGatewayInstallEntrypointCandidates("/tmp/enclawed-root")).toEqual([
      path.join("/tmp/enclawed-root", "dist", "index.js"),
      path.join("/tmp/enclawed-root", "dist", "index.mjs"),
      path.join("/tmp/enclawed-root", "dist", "entry.js"),
      path.join("/tmp/enclawed-root", "dist", "entry.mjs"),
    ]);
  });
});

describe("resolveGatewayInstallEntrypoint", () => {
  it("prefers dist/index.js over dist/entry.js when both exist", async () => {
    const root = "/tmp/enclawed-root";
    const indexPath = path.join(root, "dist", "index.js");
    const entryPath = path.join(root, "dist", "entry.js");

    await expect(
      resolveGatewayInstallEntrypoint(
        root,
        async (candidate) => candidate === indexPath || candidate === entryPath,
      ),
    ).resolves.toBe(indexPath);
  });

  it("falls back to dist/entry.js when index.js is missing", async () => {
    const root = "/tmp/enclawed-root";
    const entryPath = path.join(root, "dist", "entry.js");

    await expect(
      resolveGatewayInstallEntrypoint(root, async (candidate) => candidate === entryPath),
    ).resolves.toBe(entryPath);
  });
});
