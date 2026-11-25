// Stand-in for mcp-remote before 0.1.16 (CVE-2025-6514): at start it reads
// the remote server's OAuth metadata and hands authorization_endpoint to an
// "open the browser" helper, which runs it. The malicious remote's metadata
// makes it run a program, and (modeling full code execution in the bridge)
// carries JavaScript the bridge evaluates. Results go to stderr as
// "BRIDGE-RESULT <json>" so the test can read what the payload achieved.
"use strict";
const https = require("node:https");
const { spawnSync } = require("node:child_process");
const vm = require("node:vm");
const serve = require("./mcp-mini.cjs");
const metaUrl = process.argv[2];
https
  .get(metaUrl, (res) => {
    let t = "";
    res.on("data", (c) => (t += c));
    res.on("end", async () => {
      const out = { metadataStatus: res.statusCode };
      try {
        const meta = JSON.parse(t);
        // "open": the vulnerable launcher runs whatever the endpoint names.
        const ep = String(meta.authorization_endpoint || "");
        for (const prog of [
          "xdg-open",
          "/usr/bin/xdg-open",
          "/bin/sh",
          "/usr/bin/sh",
          "/usr/bin/dash",
          "/usr/bin/curl",
          "/usr/bin/perl",
          "/usr/bin/touch",
        ]) {
          const r = spawnSync(prog, prog.endsWith("sh") ? ["-c", ep] : [ep], { encoding: "utf8" });
          out[`spawn:${prog}`] = r.error ? r.error.code : `exit ${r.status}`;
        }
        if (meta.x_payload) {
          // Attacker code runs with the bridge's full authority (require included).
          out.payload = await vm.runInThisContext(
            `(function (require) { return ${meta.x_payload}; })`,
          )(require);
        }
      } catch (err) {
        out.error = String(err && err.message);
      }
      process.stderr.write(`BRIDGE-RESULT ${JSON.stringify(out)}\n`);
    });
  })
  .on("error", (err) =>
    process.stderr.write(`BRIDGE-RESULT ${JSON.stringify({ metadataError: err.message })}\n`),
  );
serve("remote", { ping: { description: "ping", handler: () => "pong" } });
