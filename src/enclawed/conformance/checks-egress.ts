// Conformance: egress mediation and the choice-channel action batcher.

import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { buildCanonicalizerStage } from "@enclawed/egress-canonicalizer/api.js";
import {
  actionKey,
  createActionBatcher,
  createEgressRunner,
  DEFAULT_ACTION_BATCHER_OPTIONS,
  resolveActionBatcherOptions,
  wireRequestUrl,
  type ActionBatcherOptions,
  type ActionRelease,
  type EgressAction,
  type ToolRequestClient,
} from "@enclawed/egress-core";
import { buildTaintTrackerStage, createTaintStore } from "@enclawed/egress-taint-tracker/api.js";
import { packageInstallDeclaration, projectScriptDeclaration } from "../containment/mcp.js";
import { planContainment, type ResolvedDestination } from "../containment/plan.js";
import { createEgressRelay, type RelayEvent } from "../containment/relay.js";
import { resolveRequestShape } from "../containment/request-shape.js";
import { createContainerCa } from "../containment/x509.js";
import { createEgressGuard, EgressDeniedError } from "../egress-guard.js";
import { egressSuiteLicensed, expectThat, withTempDir, type ConformanceCheck } from "./types.js";

async function checkHostAllowlist(): Promise<void> {
  let connected = false;
  const guarded = createEgressGuard({
    allowedHosts: ["127.0.0.1"],
    fetchImpl: (async () => {
      connected = true;
      return new Response("");
    }) as unknown as typeof fetch,
  });
  let denied = false;
  try {
    await guarded("https://exfil.example/collect");
  } catch (err) {
    denied = err instanceof EgressDeniedError;
  }
  expectThat(denied && !connected, "a request to a host outside the allowlist was sent");
}

const egressMediation: ConformanceCheck = {
  id: "egress-mediation",
  title: "Egress mediation",
  proves:
    "outbound content carrying a protected value is blocked, hidden characters are removed, and requests to hosts outside the allowlist are refused before any connection",
  remedy:
    "keep this installation off untrusted networks and channels until it is reinstalled; report the failure to your Enclawed contact",
  async run() {
    await checkHostAllowlist();
    if (!(await egressSuiteLicensed())) {
      return {
        skip: "the covert-channel egress suite is not licensed on this installation, so outbound content mediation refuses to run (it fails closed instead of running unchecked); the host allowlist was checked",
      };
    }
    const store = createTaintStore();
    const canary = `conformance-canary-${randomUUID()}`;
    store.tag("*", canary, "conformance");
    const run = createEgressRunner({
      stages: [buildCanonicalizerStage(), buildTaintTrackerStage({ store })],
    });
    const sink = { kind: "channel", id: "conformance" } as const;
    expectThat((await run(`here it is: ${canary}`, sink)).cancelled, "a protected value left");
    const hidden = await run("hel​lo⁣", sink);
    expectThat(
      !hidden.cancelled && hidden.content === "hello",
      "hidden characters in outbound text were not removed",
    );
    const plain = await run("status report: all good", sink);
    expectThat(
      !plain.cancelled && plain.content === "status report: all good",
      "ordinary text was changed or blocked",
    );
    return undefined;
  },
};

const get = (url: string): EgressAction => ({ type: "http", method: "GET", url });

function manualBatcher(options: ActionBatcherOptions) {
  const client: ToolRequestClient = {
    check: async () => ({ ok: true }),
    send: async (url) => {
      wireRequestUrl(url);
    },
  };
  return createActionBatcher(options, {
    now: () => 1_000,
    setTimer: () => null,
    clearTimer: () => {},
    sleep: async () => {},
    paddingClient: () => client,
    issuedTimeoutMs: 50,
  });
}

async function window(
  options: ActionBatcherOptions,
  items: Array<{ id: string; action: EgressAction }>,
): Promise<{ releases: ActionRelease[]; order: string[] }> {
  const batcher = manualBatcher(options);
  const order: string[] = [];
  try {
    const promises = items.map((item) =>
      batcher.submit({ ...item, scope: "conformance" }).then((r) => {
        if (r.outcome === "execute") {
          order.push(item.id);
        }
        return r;
      }),
    );
    batcher.flush();
    return { releases: await Promise.all(promises), order };
  } finally {
    batcher.dispose();
  }
}

const choiceChannels: ConformanceCheck = {
  id: "egress-choice-channels",
  title: "Choice-channel batcher",
  proves:
    "the order and repetition of outbound actions cannot carry hidden data: actions leave in a canonical order, idempotent repeats collapse, out-of-set requests fail closed, and weakening settings are refused",
  remedy:
    "turn off outbound tools on this installation until it is reinstalled; report the failure to your Enclawed contact",
  async run() {
    const opts = { ...DEFAULT_ACTION_BATCHER_OPTIONS };
    const urls = Array.from({ length: 6 }, (_, i) => `https://h.test/item/${i}`);
    const forward = await window(
      opts,
      urls.map((u, i) => ({ id: `a${i}`, action: get(u) })),
    );
    const reverse = await window(
      opts,
      urls.toReversed().map((u, i) => ({ id: `a${urls.length - 1 - i}`, action: get(u) })),
    );
    const canonical = urls
      .map((u, i) => ({ id: `a${i}`, key: actionKey(get(u)) }))
      .toSorted((a, b) => (a.key < b.key ? -1 : 1))
      .map((x) => x.id);
    expectThat(
      forward.order.join() === reverse.order.join() && forward.order.join() === canonical.join(),
      "the arrival order of actions showed through",
    );
    const repeats = await window(opts, [
      { id: "g1", action: get(urls[0]) },
      { id: "g2", action: get(urls[0]) },
    ]);
    expectThat(
      repeats.releases[0].outcome === "execute" && repeats.releases[1].outcome === "collapsed",
      "an idempotent repeat was sent twice",
    );
    const padded = resolveActionBatcherOptions({
      padding: { enabled: true, allowedSet: urls.slice(0, 2) },
    });
    const outside = await window(padded, [{ id: "o1", action: get("https://elsewhere.test/x") }]);
    expectThat(
      outside.releases[0].outcome === "blocked",
      "a request outside the constant set was sent without budget",
    );
    for (const bad of [{ windowMs: 5 }, { canonicalOrder: false }, { cacheTtlMs: 0 }, { x: 1 }]) {
      let refused = false;
      try {
        resolveActionBatcherOptions(bad);
      } catch {
        refused = true;
      }
      expectThat(refused, `a weakening batcher setting was accepted: ${JSON.stringify(bad)}`);
    }
  },
};

// ─── Request shapes of declared destinations ───────────────────────────

const REGISTRY = "registry.conformance.test";
const PROXY = "proxy.conformance.test";
const PROXY_PREFIX = "/artifactory/api/npm/npm-remote";
const TARBALL = "/left-pad/-/left-pad-1.3.0.tgz";

/** One raw HTTP/1.1 exchange through the relay to `name` (plain-HTTP destination). */
function exchange(
  relayPort: number,
  name: string,
  text: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve) => {
    const sock = net.connect(relayPort, "127.0.0.1");
    const chunks: Buffer[] = [];
    let acked = false;
    const done = () => {
      const all = Buffer.concat(chunks).toString("latin1");
      resolve({
        status: Number(/^HTTP\/1\.1 (\d{3})/.exec(all)?.[1] ?? 0),
        body: all.slice(all.indexOf("\r\n\r\n") + 4),
      });
    };
    sock.on("connect", () => sock.write(`${JSON.stringify({ name, port: 80 })}\n`));
    sock.on("data", (c: Buffer) => {
      if (!acked) {
        acked = true;
        c = c.subarray(1);
        sock.write(text);
      }
      chunks.push(c);
    });
    sock.on("close", done);
    sock.on("error", () => sock.destroy());
    setTimeout(() => sock.destroy(), 5000).unref();
  });
}

const egressRequestShape: ConformanceCheck = {
  id: "egress-request-shape",
  title: "Registry request shapes",
  proves:
    "a contained process whose network is a package registry (or a proxy of one) reaches it only with package metadata and artifact fetches: other methods, traversal and encoded paths, the proxy's own API, bodies and override headers are refused before the registry sees them, and a pinned artifact whose content does not match its pin is refused before the process sees it; installs use the registry shape by default",
  remedy:
    "do not run package installs or registry-only agents on this installation until it is reinstalled; report the failure to your Enclawed contact",
  async run() {
    for (const [tool, profile] of [
      ["npm", "npm-registry"],
      ["pip", "pypi"],
    ] as const) {
      const d = packageInstallDeclaration({
        label: `${tool} install`,
        tool,
        projectDir: "/nonexistent",
        command: tool,
        args: ["install"],
      });
      const shapes = "error" in d ? [] : (d.destinations ?? []).map((x) => x.shape);
      expectThat(
        shapes.length > 0 &&
          shapes.every((sh) => typeof sh === "object" && sh !== null && sh.profile === profile),
        `a ${tool} install reaches its registry without the ${profile} request shape`,
      );
    }
    const good = "the real tarball bytes";
    const sri = `sha512-${createHash("sha512").update(good).digest("base64")}`;
    const seen: string[] = [];
    const upstream = http.createServer((req, res) => {
      seen.push(`${req.headers.host} ${req.method} ${req.url}`);
      const tampered = req.url === `${PROXY_PREFIX}${TARBALL}`;
      res.end(req.url?.endsWith(".tgz") ? (tampered ? "a backdoored tarball" : good) : "{}");
    });
    await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", () => r()));
    const upPort = (upstream.address() as net.AddressInfo).port;
    const dest = (host: string, shape: unknown): ResolvedDestination => {
      const r = resolveRequestShape(shape);
      if (!r.ok) {
        throw new Error(r.message);
      }
      return {
        host,
        port: 80,
        mode: "http",
        background: true,
        profiles: [],
        constants: [],
        shape: r.shape,
      };
    };
    const events: RelayEvent[] = [];
    const relay = createEgressRelay({
      label: "conformance",
      destinations: [
        dest(REGISTRY, { profile: "npm-registry", pins: { [TARBALL]: sri } }),
        dest(PROXY, {
          profile: "npm-registry",
          pathPrefix: PROXY_PREFIX,
          pins: { [TARBALL]: sri },
        }),
      ],
      ca: createContainerCa("conformance", [REGISTRY, PROXY]),
      secrets: [],
      secretValues: new Map(),
      handles: new Map(),
      upstream: () => ({ host: "127.0.0.1", port: upPort }),
      onEvent: (e) => events.push(e),
    });
    const server = net.createServer((s) => relay.handle(s));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const port = (server.address() as net.AddressInfo).port;
    const send = (host: string, line: string, extra = "", body = "") =>
      exchange(
        port,
        host,
        `${line} HTTP/1.1\r\nHost: ${host}\r\n${extra}Connection: close\r\n\r\n${body}`,
      );
    try {
      const meta = await send(REGISTRY, "GET /left-pad");
      expectThat(meta.status === 200, `package metadata was not fetched (status ${meta.status})`);
      const tgz = await send(REGISTRY, `GET ${TARBALL}`);
      expectThat(
        tgz.status === 200 && tgz.body === good,
        `a pinned tarball with the right content was not handed over (status ${tgz.status})`,
      );
      const bad = await send(PROXY, `GET ${PROXY_PREFIX}${TARBALL}`);
      expectThat(
        bad.status === 403 && !bad.body.includes("backdoored"),
        "a tarball whose content does not match its pin reached the process",
      );
      const before = seen.length;
      for (const [host, line, extra, body] of [
        [REGISTRY, "POST /left-pad", "Content-Length: 2\r\n", "{}"],
        [REGISTRY, "PUT /left-pad", "Content-Length: 0\r\n", ""],
        [REGISTRY, "GET /left-pad/..%2f..%2fadmin", "", ""],
        [REGISTRY, "GET /left-pad/..;/admin", "", ""],
        [REGISTRY, "GET /-/whoami", "", ""],
        [REGISTRY, "GET /left-pad?x=1", "", ""],
        [REGISTRY, "GET /left-pad", "X-HTTP-Method-Override: PUT\r\n", ""],
        [REGISTRY, "GET /left-pad", "Content-Length: 4\r\n", "boom"],
        [PROXY, "GET /artifactory/api/system/ping", "", ""],
        [PROXY, `GET ${PROXY_PREFIX}/../../system/ping`, "", ""],
      ] as const) {
        const r = await send(host, line, extra, body);
        expectThat(
          r.status === 403,
          `an exploit-shaped request was not refused: ${line} (${r.status})`,
        );
      }
      expectThat(
        seen.length === before,
        `a refused request reached the registry: ${seen.slice(before).join("; ")}`,
      );
      expectThat(
        events.some((e) => e.type === "egress-refused" && e.code === "artifact-pin-mismatch"),
        "the pin mismatch was not reported",
      );
    } finally {
      relay.close();
      await new Promise<void>((r) => server.close(() => r()));
      await new Promise<void>((r) => upstream.close(() => r()));
    }
    return undefined;
  },
};

// ─── No free-form egress ────────────────────────────────────────────────

const DOCS = "docs.conformance.test";

const egressNoFreeForm: ConformanceCheck = {
  id: "egress-no-free-form",
  title: "No free-form egress to declared destinations",
  proves:
    "every destination a contained process may reach has a request profile: one declared without a profile takes the strictest generic one (GET or HEAD below the declared path, no body, no query, no credential or custom header), so data sent through a body, a query, a header or a long or deep path is refused before the destination sees it, the path choice that remains is charged against a capacity budget, and an API profile or an unread destination is accepted only in a signed admission record",
  remedy:
    "do not run contained scripts or MCP servers that reach the network on this installation until it is reinstalled; report the failure to your Enclawed contact",
  async run() {
    await withTempDir("no-free-form", async (dir) => {
      const project = path.join(dir, "project");
      fs.mkdirSync(project);
      const decl = (destinations: Parameters<typeof projectScriptDeclaration>[0]["destinations"]) =>
        planContainment(
          projectScriptDeclaration({
            label: "conformance",
            projectDir: project,
            command: "sh",
            args: [],
            destinations,
          }),
          {
            home: path.join(dir, "home"),
            uid: 1000,
            gid: 1000,
            libraries: () => [],
          },
        );
      const plain = decl([{ host: DOCS, port: 443, mode: "inspect" }]);
      expectThat(
        plain.ok && plain.plan.destinations[0].shape?.profile === "generic",
        `a destination declared without a profile did not get the generic one (${plain.ok ? plain.plan.destinations[0].shape?.profile : plain.message})`,
      );
      for (const d of [
        {
          host: DOCS,
          port: 443,
          mode: "inspect" as const,
          shape: { profile: "api" as const, routes: [{ method: "POST" as const, path: "/x" }] },
        },
        { host: DOCS, port: 5432, mode: "opaque" as const },
      ]) {
        const r = decl([d]);
        expectThat(
          !r.ok,
          `a project script was planned with ${d.mode === "opaque" ? "an opaque destination" : "an api profile"}`,
        );
      }
    });
    const seen: string[] = [];
    const upstream = http.createServer((req, res) => {
      seen.push(`${req.method} ${req.url}`);
      res.end("ok");
    });
    await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", () => r()));
    const upPort = (upstream.address() as net.AddressInfo).port;
    let clock = 0;
    const events: RelayEvent[] = [];
    const relay = createEgressRelay({
      label: "conformance",
      destinations: [
        {
          host: DOCS,
          port: 80,
          mode: "http",
          background: true,
          profiles: [],
          constants: [],
          shape: null,
        },
      ],
      ca: createContainerCa("conformance", [DOCS]),
      secrets: [],
      secretValues: new Map(),
      handles: new Map(),
      upstream: () => ({ host: "127.0.0.1", port: upPort }),
      onEvent: (e) => events.push(e),
      ledgerClock: () => clock,
    });
    const server = net.createServer((s) => relay.handle(s));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const port = (server.address() as net.AddressInfo).port;
    const send = (line: string, extra = "", body = "") =>
      exchange(
        port,
        DOCS,
        `${line} HTTP/1.1\r\nHost: ${DOCS}\r\n${extra}Connection: close\r\n\r\n${body}`,
      );
    try {
      const ok = await send("GET /guide/install.html");
      expectThat(ok.status === 200, `a plain fetch was refused (${ok.status})`);
      const before = seen.length;
      const secret = "c2VjcmV0LWZyb20tdGhlLXByb2plY3Q";
      for (const [line, extra, body] of [
        ["POST /upload", `Content-Length: ${secret.length}\r\n`, secret],
        ["GET /x", `Content-Length: ${secret.length}\r\n`, secret],
        [`GET /search?q=${secret}`, "", ""],
        ["GET /x", `X-Data: ${secret}\r\n`, ""],
        ["GET /x", `Authorization: Bearer ${secret}\r\n`, ""],
        ["GET /x", `Cookie: s=${secret}\r\n`, ""],
        [`GET /${secret}${secret}`, "", ""],
        [`GET /${"a/".repeat(8)}b`, "", ""],
        ["GET /a%2fb", "", ""],
      ] as const) {
        const r = await send(line, extra, body);
        expectThat(
          r.status === 403,
          `an exfiltration-shaped request was not refused: ${line.slice(0, 40)} (${r.status})`,
        );
      }
      expectThat(
        seen.length === before,
        `a refused request reached the destination: ${seen.slice(before).join("; ")}`,
      );
      // The path choice is charged: a long run of distinct paths exhausts the budget.
      let refusedForCapacity = false;
      for (let i = 0; i < 400 && !refusedForCapacity; i++) {
        const r = await send(`GET /${String(i).padStart(40, "x")}`);
        refusedForCapacity = r.status === 403;
      }
      expectThat(
        refusedForCapacity &&
          events.some((e) => e.type === "egress-refused" && e.code === "request-shape-capacity"),
        "a stream of distinct paths to one destination was never stopped by its capacity budget",
      );
    } finally {
      relay.close();
      await new Promise<void>((r) => server.close(() => r()));
      await new Promise<void>((r) => upstream.close(() => r()));
    }
    return undefined;
  },
};

export const CHECKS: readonly ConformanceCheck[] = [
  egressMediation,
  choiceChannels,
  egressRequestShape,
  egressNoFreeForm,
];
