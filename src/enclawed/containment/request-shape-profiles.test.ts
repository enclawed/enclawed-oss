// No free-form egress, pure (./request-shape-profiles.ts, ./plan.ts): every
// declared destination gets a profile (the generic one when none is
// declared), an api profile or an opaque destination only in a signed
// admission record, and the capacity that the generic profile leaves is
// counted exactly. No network.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { projectScriptDeclaration } from "./mcp.js";
import { planContainment, type ContainmentDestination } from "./plan.js";
import {
  GENERIC_MAX_REL,
  checkGeneric,
  genericCapacityBits,
  genericHeaderCapacityBits,
  genericPathCapacityBits,
  resolveApiProfile,
} from "./request-shape-profiles.js";
import { resolveRequestShape } from "./request-shape.js";
import { fakeHome, planContext } from "./test-helpers.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "shape-profiles-"));
const project = path.join(root, "project");
fs.mkdirSync(project);
const home = fakeHome(root);
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const plan = (kind: "project-script" | "mcp-server", destinations: ContainmentDestination[]) =>
  planContainment(
    {
      ...projectScriptDeclaration({
        label: "t",
        projectDir: project,
        command: "node",
        args: [],
        destinations,
      }),
      kind,
    },
    planContext(home),
  );

describe("every declared destination gets a profile", () => {
  it("a destination declared without one takes the generic profile", () => {
    const p = plan("project-script", [{ host: "docs.example", port: 443, mode: "inspect" }]);
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.plan.destinations[0].shape?.profile).toBe("generic");
      expect(p.plan.destinations[0].shape?.pathPrefix).toBe("");
    }
  });

  it("an api profile or an opaque destination is refused outside a signed admission record", () => {
    const api = {
      host: "api.example",
      port: 443,
      mode: "inspect" as const,
      shape: { profile: "api" as const, routes: [{ method: "POST" as const, path: "/x" }] },
    };
    const opaque = { host: "db.example", port: 5432, mode: "opaque" as const };
    for (const d of [api, opaque]) {
      const p = plan("project-script", [d]);
      expect(p.ok).toBe(false);
      if (!p.ok) {
        expect(p.code).toBe("containment-declaration-invalid");
        expect(p.message).toContain("signed admission record");
      }
      expect(plan("mcp-server", [d]).ok).toBe(true);
    }
  });

  it("registry profiles are kept", () => {
    const p = plan("project-script", [
      { host: "registry.npmjs.org", port: 443, mode: "inspect", shape: "npm-registry" },
    ]);
    expect(p.ok && p.plan.destinations[0].shape?.profile).toBe("npm-registry");
  });
});

describe("api profile declarations are exact", () => {
  it("refuses routes without a path grammar, unknown fields, bodies on GET, free schemas and framing headers", () => {
    for (const bad of [
      { routes: [] },
      { routes: [{ method: "GET", path: "/a/../b" }] },
      { routes: [{ method: "GET", path: "/a%2fb" }] },
      { routes: [{ method: "TRACE", path: "/a" }] },
      { routes: [{ method: "GET", path: "/a", extra: 1 }] },
      { routes: [{ method: "GET", path: "/a", body: { maxBytes: 10, schema: { type: "null" } } }] },
      {
        routes: [
          { method: "POST", path: "/a", body: { maxBytes: 10, schema: { type: "string" } } },
        ],
      },
      {
        routes: [
          { method: "POST", path: "/a", body: { maxBytes: 10, schema: { type: "object" } } },
        ],
      },
      {
        routes: [
          {
            method: "POST",
            path: "/a",
            body: { maxBytes: 10, schema: { type: "array", items: { type: "null" } } },
          },
        ],
      },
      {
        routes: [{ method: "POST", path: "/a", body: { maxBytes: 1e9, schema: { type: "null" } } }],
      },
      { routes: [{ method: "GET", path: "/a" }], headers: ["transfer-encoding"] },
      { routes: [{ method: "GET", path: "/a" }], headers: ["x-forwarded-for"] },
      { routes: [{ method: "GET", path: "/a" }], headers: ["cookie"] },
      { routes: [{ method: "GET", path: "/a", stream: "grpc" }] },
    ]) {
      expect(resolveApiProfile(bad as Record<string, unknown>).ok).toBe(false);
    }
    expect(resolveRequestShape({ profile: "generic", pins: {} }).ok).toBe(false);
    expect(
      resolveRequestShape({ profile: "api", routes: [{ method: "GET", path: "/a" }] }).ok,
    ).toBe(true);
  });
});

describe("the capacity the generic profile leaves", () => {
  it("is counted exactly: path choice below the prefix plus the forwarded header and method choice", () => {
    const c = genericCapacityBits();
    // Upper bound: every one of GENERIC_MAX_REL characters from the 66-letter alphabet or "/".
    expect(c.path).toBeLessThan(GENERIC_MAX_REL * Math.log2(67));
    expect(c.path).toBeGreaterThan(550);
    expect(c.headers).toBe(genericHeaderCapacityBits());
    expect(c.headers).toBeLessThan(13);
    expect(c.total).toBeCloseTo(genericPathCapacityBits() + genericHeaderCapacityBits(), 9);
  });

  it("each request is charged at least its own bits of path choice", () => {
    const v = checkGeneric(
      "",
      {
        method: "GET",
        target: `/${"a".repeat(40)}`,
        headerPairs: [],
        bodyLength: 0,
        kind: "request",
      },
      "t",
    );
    expect(v.ok && v.bits).toBeGreaterThan(41 * Math.log2(66));
  });
});
