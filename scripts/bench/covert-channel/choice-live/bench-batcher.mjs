// Bench-only construction of the ablation arm "order" (canonical order with
// idempotent-repeat collapse OFF) for the live choice-channel experiment.
//
// The product cannot be configured into this arm: the egress-action-batcher
// plugin resolves its config fail-closed (resolveActionBatcherOptions refuses
// collapseIdempotentRepeats=false, canonicalOrder=false and cacheTtlMs=0), and
// there is no flag or environment variable for it. The experiment still needs
// the arm to measure what each layer removes, so the driver preloads THIS file
// (node --import, query ?arm=order&pin=<checkout>) into the gateway and agent
// processes of that one arm, with the plugin itself disabled. It builds the
// batcher by calling the checkout's createActionBatcher directly, with the
// shipped defaults except collapse, and registers it in the shared batcher slot
// that the egress mediator reads. Nothing in the shipped tree loads this file;
// it lives only under scripts/bench/.
//
// It refuses to run outside iso.sh's sandbox (the sandbox HOME differs from
// the real one, and /sys/class/hidraw is the namespace's empty tmpfs).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const params = new URL(import.meta.url).searchParams;
const arm = params.get("arm");
const pin = params.get("pin");
const realHome = process.env.TRIPWIRE_REAL_HOME;
if (!realHome || path.resolve(os.homedir()) === path.resolve(realHome)) {
  throw new Error("bench-batcher.mjs runs only inside iso.sh's sandbox");
}
if (fs.readdirSync("/sys/class/hidraw").length > 0) {
  throw new Error("bench-batcher.mjs: /sys/class/hidraw is not empty; not inside iso.sh");
}
if (arm !== "order" || !pin) {
  throw new Error(`bench-batcher.mjs: unsupported arm ${String(arm)}`);
}

const core = await import(
  pathToFileURL(path.join(pin, "dist", "extensions", "egress-action-batcher", "api.js")).href
);
const options = { ...core.DEFAULT_ACTION_BATCHER_OPTIONS, collapseIdempotentRepeats: false };
core.registerActionBatcher(core.createActionBatcher(options));
process.stderr.write(
  `[bench-batcher] arm=order: canonicalOrder=${options.canonicalOrder} ` +
    `collapseIdempotentRepeats=${options.collapseIdempotentRepeats} windowMs=${options.windowMs} ` +
    `padding=${options.padding.enabled}\n`,
);
