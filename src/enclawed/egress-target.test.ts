// net.egress targets as destination profiles (./egress-target.ts), and the
// skill manifest's declared targets (./adapter/skills.ts): old host-only
// targets still parse to what they meant; a profile target's URLs must fit
// the profile's request grammar.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { declaredEgress, parseFrontmatter, skillManifest } from "./adapter/skills.js";
import {
  canonicalEgressTarget,
  egressTargetDestination,
  parseEgressTarget,
  urlWithinEgressTarget,
} from "./egress-target.js";
import { makeEgressCall, projectionKey } from "./skill-capabilities.js";

describe("egress targets", () => {
  it("legacy host-only and host:port targets parse as https with no shape (backward compatible)", () => {
    expect(parseEgressTarget("registry.npmjs.org")).toEqual({
      scheme: "https",
      host: "registry.npmjs.org",
      port: 443,
      pathPrefix: "",
      profile: null,
    });
    expect(canonicalEgressTarget("API.example.com:8443")).toBe("https://api.example.com:8443");
    expect(canonicalEgressTarget("https://api.example.com/")).toBe("https://api.example.com:443");
  });

  it("profile targets carry scheme, host, port, prefix and profile; canonical form is stable", () => {
    expect(canonicalEgressTarget("https://registry.npmjs.org#npm-registry")).toBe(
      "https://registry.npmjs.org:443#npm-registry",
    );
    expect(
      canonicalEgressTarget("https://art.example:8443/artifactory/api/pypi/pypi-remote/#pypi"),
    ).toBe("https://art.example:8443/artifactory/api/pypi/pypi-remote#pypi");
    expect(
      projectionKey(makeEgressCall("https://registry.npmjs.org#npm-registry")) ===
        projectionKey(makeEgressCall("https://registry.npmjs.org:443/#npm-registry")),
    ).toBe(true);
    expect(egressTargetDestination(parseEgressTarget("http://mirror.example:8080#pypi"))).toEqual({
      host: "mirror.example",
      port: 8080,
      mode: "http",
      background: true,
      shape: { profile: "pypi", pathPrefix: "" },
    });
  });

  it("malformed targets are refused", () => {
    for (const t of [
      "",
      "ftp://x.example",
      "https://user:pw@x.example",
      "https://x.example/?q=1",
      "https://x.example/some/path",
      "https://x.example#maven",
      "https://x.example/a/../b#npm-registry",
      "x.example:99999",
    ]) {
      expect(() => parseEgressTarget(t), t).toThrow(TypeError);
    }
  });

  it("a URL is within a profile target only when it fits the registry grammar", () => {
    const npm = parseEgressTarget("https://registry.npmjs.org#npm-registry");
    expect(urlWithinEgressTarget("https://registry.npmjs.org/left-pad", npm)).toBe(true);
    expect(urlWithinEgressTarget("https://registry.npmjs.org/@types%2fnode", npm)).toBe(true);
    for (const u of [
      "https://registry.npmjs.org/-/whoami",
      "https://registry.npmjs.org/left-pad?x=1",
      "https://registry.npmjs.org/../admin",
      "https://registry.npmjs.org:444/left-pad",
      "http://registry.npmjs.org/left-pad",
      "https://evil.example/left-pad",
      "not a url",
    ]) {
      expect(urlWithinEgressTarget(u, npm), u).toBe(false);
    }
    expect(
      urlWithinEgressTarget(
        "https://api.example.com/anything?x=1",
        parseEgressTarget("api.example.com"),
      ),
    ).toBe(true);
  });
});

describe("skill manifests declare egress targets", () => {
  const front = (s: string) => parseFrontmatter(`---\n${s}\n---\n`);

  it("declared targets are canonical and sorted; targets without net.egress are refused", () => {
    expect(
      declaredEgress(
        front("enclawed-egress: [pypi.org, https://registry.npmjs.org#npm-registry]"),
        ["net.egress"],
      ),
    ).toEqual(["https://pypi.org:443", "https://registry.npmjs.org:443#npm-registry"]);
    expect(() => declaredEgress(front("enclawed-egress: [pypi.org]"), ["fs.read"])).toThrow(
      /net\.egress/,
    );
    expect(declaredEgress(front("name: x"), ["net.egress"])).toEqual([]);
  });

  it("a manifest records egress only when declared (a manifest signed before targets existed compares equal)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-egress-"));
    try {
      fs.writeFileSync(
        path.join(dir, "SKILL.md"),
        "---\nname: s\nenclawed-capabilities: [fs.read]\n---\n",
      );
      const a = skillManifest({ name: "s", scope: "user", dir }).manifest;
      expect("egress" in a).toBe(false);
      fs.writeFileSync(
        path.join(dir, "SKILL.md"),
        "---\nname: s\nenclawed-capabilities: [net.egress]\nenclawed-egress: [https://pypi.org#pypi]\n---\n",
      );
      const b = skillManifest({ name: "s", scope: "user", dir }).manifest;
      expect(b.egress).toEqual(["https://pypi.org:443#pypi"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
