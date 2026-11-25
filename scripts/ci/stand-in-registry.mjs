// A stand-in npm registry for release checks. It accepts `npm publish` and
// stores exactly what npm sent (the version metadata and the tarball), so an
// install from it resolves the published package the way the real registry
// will: from the metadata npm uploaded, not from the package.json inside the
// tarball. (enclawed 2.0.1 differed between the two, and only installs that
// read the registry metadata, such as `npm install -g`, failed.) Every other
// request is passed through to the upstream registry, except for the names
// it owns (`own`): those exist here only as published here, so the upstream
// registry's versions of the package under test never mix in.
//
//   const reg = await startStandInRegistry({ own: ["enclawed"] });   // reg.url, reg.versionMetadata(name, v), reg.close()
//   node scripts/ci/stand-in-registry.mjs --own enclawed              // as a process: prints its URL, serves until killed

import http from "node:http";

const DEFAULT_UPSTREAM = "https://registry.npmjs.org/";
// Request headers worth forwarding upstream; everything else (host, auth,
// connection) belongs to the hop to this server.
// content-encoding: npm gzips the audit request body.
const FORWARD = ["accept", "content-encoding", "content-type", "npm-command", "user-agent"];

export async function startStandInRegistry({ upstream = DEFAULT_UPSTREAM, own = [] } = {}) {
  const base = upstream.endsWith("/") ? upstream : `${upstream}/`;
  const owned = new Set(own);
  /** name -> { packument, tarballs: Map<file, Buffer> } */
  const local = new Map();

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (d) => chunks.push(d));
    req.on("end", () => {
      handle(req, Buffer.concat(chunks), res).catch((err) => {
        res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: String(err?.message ?? err) }));
      });
    });
  });

  async function handle(req, body, res) {
    const url = new URL(req.url, "http://stand-in");
    const pathName = decodeURIComponent(url.pathname.slice(1));
    if (req.method === "PUT" && !pathName.startsWith("-/")) {
      publish(pathName, JSON.parse(body.toString("utf8")));
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.method === "GET") {
      const entry = local.get(pathName);
      if (entry) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(entry.packument));
        return;
      }
      const sep = pathName.indexOf("/-/");
      const owner = sep > 0 ? local.get(pathName.slice(0, sep)) : undefined;
      const file = owner?.tarballs.get(pathName.slice(sep + 3));
      if (file) {
        res.writeHead(200, {
          "content-type": "application/octet-stream",
          "content-length": file.length,
        });
        res.end(file);
        return;
      }
      if (owned.has(sep > 0 ? pathName.slice(0, sep) : pathName)) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "not found" }));
        return;
      }
    }
    await passThrough(req, url, body, res);
  }

  function publish(name, doc) {
    const entry = local.get(name) ?? {
      packument: {
        _id: name,
        name,
        "dist-tags": {},
        versions: {},
        time: { created: new Date().toISOString() },
      },
      tarballs: new Map(),
    };
    const now = new Date().toISOString();
    for (const [version, meta] of Object.entries(doc.versions ?? {})) {
      // Stored exactly as npm sent it; only the tarball URL is pointed here.
      const file = `${name.split("/").pop()}-${version}.tgz`;
      entry.packument.versions[version] = {
        ...meta,
        dist: { ...meta.dist, tarball: `${baseUrl()}${name}/-/${file}` },
      };
      entry.packument.time[version] = now;
    }
    Object.assign(entry.packument["dist-tags"], doc["dist-tags"] ?? {});
    entry.packument.time.modified = now;
    for (const [file, att] of Object.entries(doc._attachments ?? {})) {
      entry.tarballs.set(file.split("/").pop(), Buffer.from(att.data, "base64"));
    }
    local.set(name, entry);
  }

  async function passThrough(req, url, body, res) {
    const headers = {};
    for (const h of FORWARD) {
      if (req.headers[h]) {
        headers[h] = req.headers[h];
      }
    }
    const up = await fetch(new URL(url.pathname.slice(1) + url.search, base), {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
    });
    const data = Buffer.from(await up.arrayBuffer());
    const out = { "content-length": data.length };
    const type = up.headers.get("content-type");
    if (type) {
      out["content-type"] = type;
    }
    res.writeHead(up.status, out);
    res.end(data);
  }

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = () => `http://127.0.0.1:${String(server.address().port)}/`;
  return {
    url: baseUrl(),
    /** The metadata stored for one published version, as npm uploaded it. */
    versionMetadata: (name, version) => local.get(name)?.packument.versions[version],
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

// `node scripts/ci/stand-in-registry.mjs [--upstream <url>] [--own <name>]...` serves until
// killed and prints its URL as the first line of stdout.
if (import.meta.url === `file://${process.argv[1]}`) {
  const opt = (flag) => {
    const i = process.argv.indexOf(flag);
    return i > 0 ? process.argv[i + 1] : undefined;
  };
  const reg = await startStandInRegistry({
    ...(opt("--upstream") ? { upstream: opt("--upstream") } : {}),
    own: process.argv.flatMap((a, i) => (process.argv[i - 1] === "--own" ? [a] : [])),
  });
  process.stdout.write(`${reg.url}\n`);
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => void reg.close().then(() => process.exit(0)));
  }
}
