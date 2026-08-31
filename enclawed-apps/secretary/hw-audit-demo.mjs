import { execSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
// Demonstrates enclawed core anchoring agent accreditation in the enclaweder hardware, exactly as
// the secretary experiences it: bootstrapEnclawed() binds the device; every accredited SkillGate
// action records the hardware root in the audit; and if the enclaweder is removed, actions HALT.
//   node enclawed-apps/secretary/hw-audit-demo.mjs
import { bootstrapEnclawed, SkillGate, CAPABILITY, makeCall } from "enclawed/framework";

// The enclaweder's WSL busid varies between machines/sessions; discover it instead of hardcoding.
const BUSID =
  (() => {
    try {
      return execSync("usbipd.exe list", { encoding: "utf8" })
        .split("\n")
        .find((l) => /1209:e100/i.test(l))
        ?.trim()
        .split(/\s+/)[0];
    } catch {
      return undefined;
    }
  })() || "1-9";

const AUD = "/tmp/hw-audit-demo.jsonl";
const STATE = "/tmp/hw-audit-demo.state";
await rm(AUD, { force: true });
await rm(STATE, { force: true });
process.env.ENCLAWEDER_ROOT = "required";
process.env.ENCLAWEDER_STATE = STATE;

const bar = (s) => console.log("\n" + "-".repeat(70) + "\n  " + s + "\n" + "-".repeat(70));

bar("1. bootstrapEnclawed() — enclawed CORE probes + binds the enclaweder");
const runtime = await bootstrapEnclawed({ flavor: "open", auditPath: AUD, preloadModules: false });

bar("2. an accredited agent action runs while the hardware root is CLEAN");
const gate = new SkillGate({
  audit: runtime.audit,
  broker: { id: "demo", decide: async () => ({ decision: "approve" }) },
});
gate.loadSkill({
  v: 1,
  id: "secretary-skill",
  label: { level: 0, compartments: [], releasability: [] },
  caps: ["fs.read"],
  signer: "x",
  version: 1,
  verification: "unverified",
});
const op = () =>
  gate.dispatch({
    skillId: "secretary-skill",
    call: makeCall({ cap: CAPABILITY.FS_READ, target: "/inbox/message-42" }),
    execute: async () => ({ ok: true }),
  });
const out1 = await op();
console.log("  dispatch ->", out1.kind);

bar("3. the AUDIT records the action was accredited via the enclaweder hardware");
const recs = (await readFile(AUD, "utf8"))
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l));
const boot = recs.find((r) => r.type === "enclawed.boot");
const exec = recs.find((r) => r.type === "reversible.executed");
console.log("  enclawed.boot        hardwareRoot:", JSON.stringify(boot?.payload?.hardwareRoot));
console.log("  reversible.executed  hardwareRoot:", JSON.stringify(exec?.payload?.hardwareRoot));

bar("4. the enclaweder is REMOVED — the next agent action must HALT (fail-secure)");
execSync(`usbipd.exe detach --busid ${BUSID}`, { stdio: "ignore" });
console.log("  ...enclaweder detached; waiting for the liveness heartbeat to notice...");
await new Promise((r) => setTimeout(r, 4000));
try {
  await op();
  console.log("  dispatch -> RAN  (BUG: should have halted)");
} catch (e) {
  console.log("  dispatch -> HALTED:", e.message);
}

execSync(`usbipd.exe attach --wsl --busid ${BUSID}`, { stdio: "ignore" });
await rm(AUD, { force: true });
await rm(STATE, { force: true });
console.log("\n(enclaweder re-attached; demo state cleaned up)");
process.exit(0);
