// The registry request shapes (./request-shape.ts), pure: which requests a
// shaped destination lets through. Every exploit-shaped request to a
// declared registry (the Artifactory intrusion class) is refused with its
// rule's code; what npm, pnpm, yarn, bun, pip, uv and poetry send to install
// passes. No network.

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { packageInstallDeclaration, registryDestinations } from "./mcp.js";
import { planContainment } from "./plan.js";
import {
  checkRequestShape,
  parseArtifactPin,
  resolveRequestShape,
  type RequestShapeDeclaration,
  type ResolvedShape,
} from "./request-shape.js";

const TGZ = Buffer.from("left-pad tarball bytes");
const SRI = `sha512-${createHash("sha512").update(TGZ).digest("base64")}`;

function shape(d: RequestShapeDeclaration): ResolvedShape {
  const r = resolveRequestShape(d);
  if (!r.ok || !r.shape) {
    throw new Error(r.ok ? "no shape" : r.message);
  }
  return r.shape;
}

const NPM_HEADERS: Array<[string, string]> = [
  ["Host", "registry.npmjs.org"],
  ["user-agent", "npm/10.8.2 node/v22.11.0 linux x64 workspaces/false"],
  ["npm-command", "install"],
  ["npm-session", "0123456789abcdef"],
  ["npm-auth-type", "web"],
  ["pacote-version", "18.0.6"],
  ["pacote-req-type", "packument"],
  ["pacote-pkg-id", "registry:left-pad"],
  ["accept", "application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*"],
  ["accept-encoding", "gzip,deflate"],
  ["connection", "keep-alive"],
];
const PIP_HEADERS: Array<[string, string]> = [
  ["Host", "pypi.org"],
  [
    "User-Agent",
    'pip/24.0 {"ci":null,"cpu":"x86_64","distro":{"name":"Ubuntu","version":"24.04"},"implementation":{"name":"CPython","version":"3.12.3"}}',
  ],
  ["Accept-Encoding", "gzip, deflate, br"],
  [
    "Accept",
    "application/vnd.pypi.simple.v1+json, application/vnd.pypi.simple.v1+html; q=0.1, text/html; q=0.01",
  ],
  ["Connection", "keep-alive"],
  ["Cache-Control", "max-age=0"],
];

const req = (
  s: ResolvedShape,
  method: string,
  target: string,
  headerPairs: Array<[string, string]> = NPM_HEADERS,
  bodyLength = 0,
  kind: "request" | "message" = "request",
) => checkRequestShape(s, { method, target, headerPairs, bodyLength, kind });

const codeOf = (v: ReturnType<typeof req>) => (v.ok ? "ok" : v.code);

describe("registry request shapes: what an installer sends passes", () => {
  const npm = shape({ profile: "npm-registry", pins: { "/left-pad/-/left-pad-1.3.0.tgz": SRI } });
  it("npm package documents (plain, scoped encoded and literal, with a version or tag), tarballs, HEAD", () => {
    for (const t of [
      "/left-pad",
      "/JSONStream",
      "/@types%2fnode",
      "/@types%2Fnode",
      "/@types/node",
      "/left-pad/1.3.0",
      "/left-pad/latest",
      "/@types/node/-/node-22.9.0.tgz",
      "/left-pad/-/left-pad-1.3.0.tgz",
      "/lodash.merge/-/lodash.merge-4.6.2.tgz",
    ]) {
      expect(codeOf(req(npm, "GET", t)), t).toBe("ok");
    }
    expect(codeOf(req(npm, "HEAD", "/left-pad"))).toBe("ok");
  });

  it("a pinned tarball carries its pin, and the request drops range, conditional and encoding headers", () => {
    const v = req(npm, "GET", "/left-pad/-/left-pad-1.3.0.tgz", [
      ...NPM_HEADERS,
      ["if-none-match", '"abc"'],
      ["range", "bytes=0-"],
    ]);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.artifact).toBe("/left-pad/-/left-pad-1.3.0.tgz");
      expect(v.pin?.[0].algo).toBe("sha512");
      expect([...v.drop].toSorted()).toEqual([
        "accept-encoding",
        "if-modified-since",
        "if-none-match",
        "range",
      ]);
    }
    const unpinned = req(npm, "GET", "/@types/node/-/node-22.9.0.tgz");
    expect(unpinned.ok && unpinned.pin === null && unpinned.drop.size === 0).toBe(true);
  });

  it("PyPI simple and JSON APIs, files and PEP 658 metadata", () => {
    const pypi = shape("pypi");
    for (const t of [
      "/simple/",
      "/simple/requests/",
      "/simple/requests",
      "/simple/zope.interface/",
      "/pypi/requests/json",
      "/pypi/requests/2.32.3/json",
      "/packages/f9/9b/335f9764261e915ed497fcdeb11df5dfd6f7bf257d4a6a2a686d80da4d54/requests-2.32.3-py3-none-any.whl",
      "/packages/f9/9b/335f9764261e915ed497fcdeb11df5dfd6f7bf257d4a6a2a686d80da4d54/requests-2.32.3-py3-none-any.whl.metadata",
      "/packages/source/r/requests/requests-2.32.3.tar.gz",
    ]) {
      expect(codeOf(req(pypi, "GET", t, PIP_HEADERS)), t).toBe("ok");
    }
  });

  it("a registry served under a prefix (Artifactory-style) takes the same grammar below it", () => {
    const art = shape({ profile: "npm-registry", pathPrefix: "/artifactory/api/npm/npm-remote" });
    expect(codeOf(req(art, "GET", "/artifactory/api/npm/npm-remote/left-pad"))).toBe("ok");
    expect(
      codeOf(req(art, "GET", "/artifactory/api/npm/npm-remote/@types/node/-/node-22.9.0.tgz")),
    ).toBe("ok");
    const pyArt = shape({ profile: "pypi", pathPrefix: "/artifactory/api/pypi/pypi-remote" });
    expect(
      codeOf(req(pyArt, "GET", "/artifactory/api/pypi/pypi-remote/simple/requests/", PIP_HEADERS)),
    ).toBe("ok");
    expect(
      codeOf(
        req(
          pyArt,
          "GET",
          "/artifactory/api/pypi/pypi-remote/packages/packages/f9/9b/335f9764261e915ed497fcdeb11df5dfd6f7bf257d4a6a2a686d80da4d54/requests-2.32.3-py3-none-any.whl",
          PIP_HEADERS,
        ),
      ),
    ).toBe("ok");
  });
});

describe("registry request shapes: exploit-shaped requests to the declared registry are refused", () => {
  const npm = shape({ profile: "npm-registry" });
  const art = shape({ profile: "npm-registry", pathPrefix: "/artifactory/api/npm/npm-remote" });

  it("methods other than GET and HEAD (publish, unpublish, login, audit POST)", () => {
    for (const m of ["POST", "PUT", "DELETE", "PATCH", "OPTIONS", "TRACE", "CONNECT", "get"]) {
      expect(codeOf(req(npm, m, "/left-pad")), m).toBe("request-shape-method");
    }
  });

  it("path traversal and every encoded variant", () => {
    for (const t of [
      "/../../etc/passwd",
      "/left-pad/../../admin",
      "/left-pad/./x",
      "/left-pad//-/x.tgz",
      "/%2e%2e/%2e%2e/api/system",
      "/left-pad/%2e%2e%2fadmin",
      "/left-pad/..%2f..%2fadmin",
      "/left-pad%2f..%2f..%2fadmin",
      "/@types%2f..%2fadmin",
      "/@types%2fnode%2f..",
      "/left-pad%00.tgz",
      "/left-pad/%c0%ae%c0%ae/admin",
      "/left-pad/..;/..;/artifactory/api/system/ping",
      "/left-pad;jsessionid=x",
      "/left-pad\\..\\admin",
      "/left-pad/-/../../x.tgz",
      "/left pad",
      "http://registry.npmjs.org/left-pad",
      "*",
      "",
    ]) {
      expect(codeOf(req(npm, "GET", t)), t).toBe("request-shape-path");
    }
  });

  it("odd endpoints: /-/ endpoints, the proxy's own API, anything outside the declared prefix", () => {
    for (const t of [
      "/-/whoami",
      "/-/v1/login",
      "/-/npm/v1/security/advisories/bulk",
      "/-/user/org.couchdb.user:x",
      "/left-pad/-rev/1-abc",
      "/left-pad/1.3.0/extra/segment",
      "/left-pad/-/left-pad-1.3.0.zip",
    ]) {
      expect(codeOf(req(npm, "GET", t)), t).toBe("request-shape-path");
    }
    for (const t of [
      "/artifactory/api/system/ping",
      "/artifactory/api/repositories",
      "/artifactory/api/security/token",
      "/artifactory/ui/api/v1/ui/auth/login",
      "/artifactory/api/npm/npm-remote",
      "/artifactory/api/npm/npm-remote-evil/left-pad",
      "/artifactory/api/npm/npm-remote/../../system/ping",
      "/artifactory/api/npm/npm-remote/-/api/system",
      "/api/v1/system",
      "/left-pad",
    ]) {
      expect(codeOf(req(art, "GET", t)), t).toBe("request-shape-path");
    }
    expect(codeOf(req(npm, "GET", "/-/v1/search?text=x"))).toBe("request-shape-query");
    expect(codeOf(req(npm, "GET", "/left-pad?write=true"))).toBe("request-shape-query");
    expect(codeOf(req(npm, "GET", "/left-pad#x"))).toBe("request-shape-path");
  });

  it("bodies, and stream messages (WebSocket, gRPC)", () => {
    expect(codeOf(req(npm, "GET", "/left-pad", NPM_HEADERS, 5))).toBe("request-shape-body");
    expect(codeOf(req(npm, "GET", "/left-pad", NPM_HEADERS, 0, "message"))).toBe(
      "request-shape-stream",
    );
  });

  it("smuggling-shaped and override headers, duplicates, bad values", () => {
    const withH = (h: Array<[string, string]>) => [...NPM_HEADERS, ...h];
    for (const h of [
      [["Transfer-Encoding", "chunked"]],
      [["Content-Length", "12"]],
      [["X-Forwarded-For", "127.0.0.1"]],
      [["X-Forwarded-Host", "localhost"]],
      [["X-HTTP-Method-Override", "PUT"]],
      [["X-Original-URL", "/artifactory/api/system"]],
      [["X-Rewrite-URL", "/admin"]],
      [["Upgrade", "websocket"]],
      [["Expect", "100-continue"]],
      [["Proxy-Authorization", "Basic x"]],
      [["Forwarded", "for=127.0.0.1"]],
      [["Content-Type", "application/json"]],
      [["Host", "registry.npmjs.org"]],
      [["connection", "Upgrade, HTTP2-Settings"]],
      [["range", "bytes=0-1,5-9"]],
      [["accept", "text/html\u0000"]],
      [["user-agent", "x".repeat(3000)]],
      [["npm-command", "\u0007"]],
    ] as Array<Array<[string, string]>>) {
      expect(codeOf(req(npm, "GET", "/left-pad", withH(h))), JSON.stringify(h)).toBe(
        "request-shape-header",
      );
    }
    const many = Array.from({ length: 41 }, (_, i): [string, string] => [
      `npm-x${"a".repeat(i % 26)}`,
      "1",
    ]);
    expect(codeOf(req(npm, "GET", "/left-pad", many))).toBe("request-shape-header");
  });

  it("oversized paths and segments", () => {
    expect(codeOf(req(npm, "GET", `/${"a".repeat(1100)}`))).toBe("request-shape-path");
    expect(codeOf(req(npm, "GET", `/${"a".repeat(300)}`))).toBe("request-shape-path");
  });

  it("PyPI: upload, queries, encodings and paths outside the protocol", () => {
    const pypi = shape("pypi");
    expect(codeOf(req(pypi, "POST", "/legacy/", PIP_HEADERS))).toBe("request-shape-method");
    for (const t of [
      "/legacy/",
      "/manage/account/",
      "/simple/requests/extra/",
      "/simple/../admin/",
      "/packages/../../etc/passwd",
      "/packages/a%2fb/x.whl",
      "/pypi/requests/json/extra",
      "/packages/f9/x.exe",
    ]) {
      expect(codeOf(req(pypi, "GET", t, PIP_HEADERS)), t).toBe("request-shape-path");
    }
    expect(codeOf(req(pypi, "GET", "/simple/requests/?format=json", PIP_HEADERS))).toBe(
      "request-shape-query",
    );
  });

  it("requirePins refuses an artifact that has no pin", () => {
    const strict = shape({
      profile: "npm-registry",
      requirePins: true,
      pins: { "/left-pad/-/left-pad-1.3.0.tgz": SRI },
    });
    expect(codeOf(req(strict, "GET", "/left-pad/-/left-pad-1.3.0.tgz"))).toBe("ok");
    expect(codeOf(req(strict, "GET", "/lodash/-/lodash-4.17.21.tgz"))).toBe("artifact-not-pinned");
    expect(codeOf(req(strict, "GET", "/lodash"))).toBe("ok");
  });
});

describe("registry request shapes: declarations", () => {
  it("pins: SRI and PyPI hashes parse; sha1, md5, wrong lengths and junk do not", () => {
    expect(parseArtifactPin(SRI)?.[0].algo).toBe("sha512");
    expect(parseArtifactPin(`sha256:${"a".repeat(64)}`)?.[0].algo).toBe("sha256");
    expect(parseArtifactPin(`${SRI} sha256-${Buffer.alloc(32).toString("base64")}`)?.length).toBe(
      2,
    );
    expect(parseArtifactPin("sha1-AAAAAAAAAAAAAAAAAAAAAAAAAAA=")).toBeNull();
    expect(parseArtifactPin(`md5:${"a".repeat(32)}`)).toBeNull();
    expect(parseArtifactPin(`sha256:${"a".repeat(63)}`)).toBeNull();
    expect(parseArtifactPin("")).toBeNull();
  });

  it("invalid shapes are refused: unknown profile or field, bad prefix, a pin on a non-artifact path", () => {
    for (const d of [
      { profile: "maven" },
      { profile: "npm-registry", extra: 1 },
      { profile: "npm-registry", pathPrefix: "artifactory" },
      { profile: "npm-registry", pathPrefix: "/a/../b" },
      { profile: "npm-registry", pathPrefix: "/a%2fb" },
      { profile: "npm-registry", pins: { "/left-pad": SRI } },
      { profile: "npm-registry", pins: { "/left-pad/-/left-pad-1.3.0.tgz": "sha1-x" } },
      { profile: "npm-registry", requirePins: "yes" },
    ]) {
      expect(resolveRequestShape(d).ok, JSON.stringify(d)).toBe(false);
    }
    expect(resolveRequestShape(undefined)).toEqual({ ok: true, shape: null });
  });

  it("installs reach their registry with the registry shape by default; a mirror URL's path is the prefix", () => {
    const npm = registryDestinations("npm");
    expect(npm).toEqual([
      {
        host: "registry.npmjs.org",
        port: 443,
        mode: "inspect",
        background: true,
        shape: { profile: "npm-registry", pathPrefix: "" },
      },
    ]);
    const pip = registryDestinations("pip");
    expect(Array.isArray(pip) && pip.map((d) => [d.host, d.shape])).toEqual([
      ["pypi.org", { profile: "pypi", pathPrefix: "" }],
      ["files.pythonhosted.org", { profile: "pypi", pathPrefix: "" }],
    ]);
    const mirror = registryDestinations("npm", {
      registries: ["https://artifacts.example:8443/artifactory/api/npm/npm-remote/"],
      pins: { "/left-pad/-/left-pad-1.3.0.tgz": SRI },
    });
    expect(mirror).toEqual([
      {
        host: "artifacts.example",
        port: 8443,
        mode: "inspect",
        background: true,
        shape: {
          profile: "npm-registry",
          pathPrefix: "/artifactory/api/npm/npm-remote",
          pins: { "/left-pad/-/left-pad-1.3.0.tgz": SRI },
        },
      },
    ]);
    expect(registryDestinations("npm", { registries: ["https://u:p@x.example/"] })).toHaveProperty(
      "error",
    );
    expect(registryDestinations("cargo")).toHaveProperty("error");
    // A runner's Python indexes (pythonIndexUrls): the /simple part is the protocol, not the prefix.
    const uvx = registryDestinations("uvx", {
      registries: [
        "https://pypi.org/simple/",
        "https://art.example/artifactory/api/pypi/pypi-remote/simple/",
      ],
    });
    expect(Array.isArray(uvx) && uvx.map((d) => [d.host, d.shape])).toEqual([
      ["pypi.org", { profile: "pypi", pathPrefix: "" }],
      ["art.example", { profile: "pypi", pathPrefix: "/artifactory/api/pypi/pypi-remote" }],
      ["files.pythonhosted.org", { profile: "pypi", pathPrefix: "" }],
    ]);
    const npx = registryDestinations("npx");
    expect(Array.isArray(npx) && npx[0].shape).toEqual({ profile: "npm-registry", pathPrefix: "" });
    const decl = packageInstallDeclaration({
      label: "npm install",
      tool: "npm",
      projectDir: "/tmp/p",
      command: "npm",
      args: ["install"],
    });
    expect("error" in decl ? null : decl.destinations?.map((d) => d.shape)).toEqual([
      { profile: "npm-registry", pathPrefix: "" },
    ]);
  });

  it("the plan refuses a shape on an opaque destination and a malformed shape", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shape-plan-"));
    const base = {
      kind: "project-script" as const,
      label: "t",
      command: "/bin/sh",
      args: [],
      cwd: dir,
      roots: [{ path: dir, access: "rw" as const }],
      programs: ["/bin/sh"],
    };
    const ctx = { home: "/nonexistent-home", uid: 1000, gid: 1000 };
    const opaque = planContainment(
      {
        ...base,
        destinations: [{ host: "r.example", port: 443, mode: "opaque", shape: "npm-registry" }],
      },
      ctx,
    );
    expect(opaque.ok ? "ok" : opaque.code).toBe("containment-declaration-invalid");
    const bad = planContainment(
      {
        ...base,
        destinations: [
          {
            host: "r.example",
            port: 443,
            mode: "inspect",
            shape: { profile: "npm-registry", pathPrefix: "/a/../b" },
          },
        ],
      },
      ctx,
    );
    expect(bad.ok ? "ok" : bad.code).toBe("containment-declaration-invalid");
    const good = planContainment(
      {
        ...base,
        destinations: [{ host: "r.example", port: 443, mode: "inspect", shape: "npm-registry" }],
      },
      ctx,
    );
    expect(good.ok && good.plan.destinations[0].shape?.profile).toBe("npm-registry");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
