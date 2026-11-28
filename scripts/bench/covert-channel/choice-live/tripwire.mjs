// Isolation tripwire for the live choice-channel experiment (preloaded by iso.sh), so the
// experiment is self-contained.
//
// strace is not installed on this host, so instead every Node-level path the
// process touches is checked here, before the syscall: fs open/read/write/
// append/stat-free calls and Unix-socket connects. A forbidden path throws
// (the call never reaches the kernel) and is counted; the summary is printed
// at exit. Forbidden:
//   /dev/hidraw*            unless it is /dev/null (iso.sh bind-mounts it)
//   <real HOME>/.enclawed*  (latches, forensics, ~/.enclawed state)
//   <real HOME>/.claude
//   /run/user/<real uid>    (real broker sockets, real D-Bus)
//   /home/<user>/enclawed   (never touched)
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import path from "node:path";

const realHome = process.env.TRIPWIRE_REAL_HOME ?? "/nonexistent-real-home";
const realUid = process.env.TRIPWIRE_REAL_UID ?? "1000";
const counts = { checked: 0, blocked: 0, fakeHidraw: 0 };
const blocked = [];

function nullRdev() {
  try {
    return fs.statSync("/dev/null").rdev;
  } catch {
    return -1;
  }
}
const NULL_RDEV = nullRdev();
const origStat = fs.statSync;

function forbidden(p) {
  if (typeof p !== "string" && !(p instanceof URL) && !Buffer.isBuffer(p)) {
    return null; // fd numbers etc.
  }
  const s = path.resolve(p instanceof URL ? p.pathname : String(p));
  counts.checked++;
  if (/^\/dev\/hidraw\d*$/.test(s)) {
    let rdev = -2;
    try {
      rdev = origStat(s).rdev;
    } catch {
      /* absent */
    }
    if (rdev === NULL_RDEV) {
      counts.fakeHidraw++;
      return null; // /dev/null stand-in, safe
    }
    return `${s} (a real hidraw node)`;
  }
  const home = realHome.replace(/\/+$/, "");
  if (s.startsWith(`${home}/.enclawed`) || s.startsWith(`${home}/.claude`)) {
    return s;
  }
  if (s === `/run/user/${realUid}` || s.startsWith(`/run/user/${realUid}/`)) {
    return s;
  }
  if (s === `${home}/enclawed` || s.startsWith(`${home}/enclawed/`)) {
    return s;
  }
  return null;
}

function guard(name, fn, argIndex = 0) {
  return function (...args) {
    const bad = forbidden(args[argIndex]);
    if (bad) {
      counts.blocked++;
      blocked.push(`${name}(${bad})`);
      const e = new Error(`TRIPWIRE: ${name} of forbidden path ${bad}`);
      e.code = "EACCES";
      throw e;
    }
    return fn.apply(this, args);
  };
}

for (const n of [
  "openSync",
  "readFileSync",
  "writeFileSync",
  "appendFileSync",
  "createReadStream",
  "createWriteStream",
  "open",
  "readFile",
  "writeFile",
  "appendFile",
  "renameSync",
  "unlinkSync",
  "chmodSync",
]) {
  if (typeof fs[n] === "function") {
    fs[n] = guard(`fs.${n}`, fs[n]);
  }
}
for (const n of ["open", "readFile", "writeFile", "appendFile", "rename", "unlink"]) {
  if (typeof fs.promises[n] === "function") {
    const orig = fs.promises[n];
    fs.promises[n] = async function (...args) {
      return guard(`fs.promises.${n}`, orig).apply(this, args);
    };
  }
}
syncBuiltinESMExports();

const origConnect = net.connect;
net.connect = net.createConnection = function (...args) {
  const a = args[0];
  const p = typeof a === "string" ? a : a && typeof a === "object" ? a.path : undefined;
  if (p !== undefined) {
    const bad = forbidden(p);
    if (bad) {
      counts.blocked++;
      blocked.push(`net.connect(${bad})`);
      throw Object.assign(new Error(`TRIPWIRE: connect to forbidden socket ${bad}`), {
        code: "EACCES",
      });
    }
  }
  return origConnect.apply(this, args);
};
syncBuiltinESMExports();

process.on("exit", () => {
  const verdict = counts.blocked === 0 ? "ISOLATED" : "ISOLATION-VIOLATION";
  process.stdout.write(
    `[tripwire] ${verdict}: ${counts.checked} path checks, ${counts.blocked} blocked` +
      `, ${counts.fakeHidraw} opens of /dev/null-backed hidraw stand-ins` +
      (blocked.length ? ` -> ${blocked.slice(0, 5).join(", ")}` : "") +
      "\n",
  );
});
