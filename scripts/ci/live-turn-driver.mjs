#!/usr/bin/env node
// Drives the live-turn smoke's runtime scenarios through the INSTALLED
// package (run from the consumer install directory, see live-turn-smoke.sh).
//
// The CLI commands that start a session (`enclawed agent`, `gateway run`,
// `infer model run`) need the mandatory second factor, which an unattended
// gate has no business holding. The crash this smoke exists for (0.2.x: a
// pi-coding-agent version skew that broke every turn) lives in the runtime
// those commands call, not in the gate in front of them. So this driver calls
// that runtime directly, from the installed tarball: the embedded agent turn
// through `enclawed/plugin-sdk/agent-runtime` (agentCommand, the function the
// CLI's local path calls), and the gateway through the installed dist's
// startGatewayServer. Nothing in the product is bypassed or switched off: the
// gate is a CLI step, and live-turn-smoke.sh separately asserts that the gated
// CLI refuses without a factor.
//
//   node live-turn-driver.mjs <scenario> [args...]
//     turn <model> <message>   one embedded agent turn; prints the reply text
//     gateway <port>           start the gateway runtime, wait for its health, stop it
//
// Exit codes: 0 ok, 1 the scenario failed (the message says why).

import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [scenario, ...rest] = process.argv.slice(2);
const cwd = process.cwd();
const pkgRoot = path.join(cwd, "node_modules", "enclawed");
if (!fs.existsSync(path.join(pkgRoot, "package.json"))) {
  console.error(`live-turn-driver: no installed enclawed package under ${cwd}`);
  process.exit(1);
}

async function turn(model, message) {
  // Resolved from the consumer install, exactly as a plugin or app would import it.
  const { agentCommand } = await import("enclawed/plugin-sdk/agent-runtime");
  const lines = [];
  const runtime = {
    log: (...a) => lines.push(a.join(" ")),
    error: (...a) => lines.push(a.join(" ")),
    exit: (code) => {
      throw new Error(`agent runtime exited with ${code}`);
    },
  };
  const result = await agentCommand({ message, agentId: "main", model, json: false }, runtime);
  const text = (result?.payloads ?? [])
    .map((p) => p.text ?? "")
    .join("\n")
    .trim();
  console.log(lines.join("\n"));
  console.log(`[reply] ${text}`);
  if (!result) {
    throw new Error("the agent turn returned no result");
  }
}

function freePortOk(port) {
  return new Promise((resolve) => {
    const s = net.connect(port, "127.0.0.1");
    s.once("connect", () => {
      s.destroy();
      resolve(true);
    });
    s.once("error", () => resolve(false));
  });
}

async function gateway(portArg) {
  const port = Number(portArg);
  const dist = path.join(pkgRoot, "dist");
  // The gateway server module of the installed build (its file name carries a content hash).
  const file = fs
    .readdirSync(dist)
    .filter((n) => /^server-[\w-]+\.js$/.test(n))
    .find((n) =>
      /export \{[^}]*\bstartGatewayServer\b/.test(fs.readFileSync(path.join(dist, n), "utf8")),
    );
  if (!file) {
    throw new Error("the installed build has no gateway server module");
  }
  const { startGatewayServer } = await import(pathToFileURL(path.join(dist, file)).href);
  const server = await startGatewayServer(port, { bind: "loopback" });
  let up = false;
  for (let i = 0; i < 45 && !up; i++) {
    up = await freePortOk(port);
    if (!up) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  console.log(`[gateway] listening on 127.0.0.1:${port}: ${up}`);
  await server.close({ reason: "live-turn smoke done" }).catch(() => {});
  if (!up) {
    throw new Error("the gateway did not start listening");
  }
}

/**
 * Every product entrypoint (`enclawed` CLI run-main, the package index) installs
 * the process-level unhandled-rejection handler before doing anything; driving
 * the installed runtime directly must do the same, or the harness differs from
 * the product (e.g. a rejection the product classifies as benign would crash
 * only here).
 */
async function installProductRejectionHandler() {
  const dist = path.join(pkgRoot, "dist");
  const file = fs
    .readdirSync(dist)
    .filter((n) => /^unhandled-rejections-[\w-]+\.js$/.test(n))
    .find((n) =>
      /export \{[^}]*\binstallUnhandledRejectionHandler\b/.test(
        fs.readFileSync(path.join(dist, n), "utf8"),
      ),
    );
  if (!file) {
    throw new Error("the installed build has no unhandled-rejection module");
  }
  const { installUnhandledRejectionHandler } = await import(
    pathToFileURL(path.join(dist, file)).href
  );
  installUnhandledRejectionHandler();
}

try {
  await installProductRejectionHandler();
  if (scenario === "turn") {
    await turn(rest[0], rest.slice(1).join(" "));
  } else if (scenario === "gateway") {
    await gateway(rest[0]);
  } else {
    throw new Error(`unknown scenario ${scenario}`);
  }
  process.exit(0);
} catch (err) {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
}
