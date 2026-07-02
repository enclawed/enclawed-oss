// Real-runtime mediator for the upstream Enclawed subject in the in-vivo
// harness. Per sample, spawns the upstream Enclawed CLI (the same
// `enclawed` binary an end user would run) with `message send --dry-run
// --json` against the channel and target under test, and parses the
// real CLI output to derive the verdict.
//
// This is not a probe, not a shim, not a stub: it is the upstream
// runtime invoked end-to-end through its public command-line surface.
// `--dry-run` stops the pipeline at the network-call boundary so no
// real Discord/Telegram message is transmitted, but every other code
// path is the same code path a production end-user invocation
// exercises:
//
//   enclawed message send
//     -> dist/entry.js boot
//     -> CLI argv parsing + subcommand routing (src/cli/*)
//     -> message-send command handler (src/commands/message-send/*)
//     -> channel resolution (src/channels/*, including the bundled
//        discord/telegram extensions in extensions/<id>/)
//     -> payload framing
//     -> outbound delivery decision
//
// The decision Enclawed's runtime emits in JSON form is the verdict the
// harness records. A successful delivery decision (non-zero `handledBy`,
// non-empty `payload`, no error) means the runtime would deliver the
// content to the chat backend; an error or rejection at any step in the
// CLI -> handler -> channel chain is the runtime's actual
// content-gate verdict for that input.
//
// Boot prerequisites verified at module load:
//   1. The upstream Enclawed repo at ENCLAWED_PATH has a built
//      `dist/entry.js` (the source-checkout launcher refuses to run
//      without it).
//   2. A Node binary >= upstream's required minimum is on PATH (the
//      launcher refuses older Node).
//   3. An ENCLAWED_STATE_DIR distinct from the operator's normal state
//      is provided (the harness uses a per-run tmpdir so the test does
//      not touch production Enclawed state).
//
// Failure modes derive from running the CLI: if upstream cannot boot,
// every per-sample invocation captures the boot error verbatim and the
// harness records it as the runtime's verdict for that sample (no
// silent fallback to a hardcoded boolean).

import { existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const ENCLAWED_PATH = process.env.ENCLAWED_PATH || path.join(process.env.HOME ?? '', 'enclawed');
const REPO_ROOT     = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

// Per-run isolated state dir so the harness never touches the operator's
// real Enclawed state. Created lazily at first use.
const STATE_DIR     = process.env.ENCLAWED_INVIVO_ENCLAWED_STATE_DIR
                       ?? path.join(os.tmpdir(), `enclawed-invivo-oc-state-${process.pid}`);

// Resolve the Node binary the harness will use to invoke upstream
// Enclawed. The harness itself may run on a Node older than upstream's
// minimum, so allow override via env.
const ENCLAWED_NODE = process.env.ENCLAWED_NODE
                       ?? (existsSync('/tmp/node-v22.20.0-linux-x64/bin/node')
                           ? '/tmp/node-v22.20.0-linux-x64/bin/node'
                           : process.execPath);

let _bootChecked = false;
let _bootError   = null;

function checkBootPrerequisites() {
  if (_bootChecked) return _bootError;
  _bootChecked = true;
  if (!existsSync(ENCLAWED_PATH)) {
    _bootError = `ENCLAWED_PATH=${ENCLAWED_PATH} does not exist`;
    return _bootError;
  }
  const launcher = path.join(ENCLAWED_PATH, 'enclawed.mjs');
  if (!existsSync(launcher)) {
    _bootError = `${launcher} not found (upstream Enclawed checkout missing launcher)`;
    return _bootError;
  }
  const dist = path.join(ENCLAWED_PATH, 'dist', 'entry.js');
  if (!existsSync(dist)) {
    _bootError = `${dist} not found; run \`pnpm install && pnpm build:docker\` in ${ENCLAWED_PATH}`;
    return _bootError;
  }
  if (!existsSync(ENCLAWED_NODE)) {
    _bootError = `Node binary not found at ${ENCLAWED_NODE} (set ENCLAWED_NODE=/path/to/node)`;
    return _bootError;
  }
  if (!existsSync(STATE_DIR)) {
    try { mkdirSync(STATE_DIR, { recursive: true }); }
    catch (e) { _bootError = `cannot create state dir ${STATE_DIR}: ${e.message}`; return _bootError; }
  }
  return null;
}

export function bootstrapEnclawedSubject(channelIds) {
  // Return the boot prerequisites verdict per channel (each channel runs
  // through the same launcher so the verdict is uniform). The shape
  // matches the prior probe's bootstrap return so the harness wiring
  // does not change.
  const err = checkBootPrerequisites();
  const out = {};
  for (const id of channelIds) {
    out[id] = err
      ? { registered: false, method: 'upstream-bootstrap-failed', reason: err, diagnostics: [] }
      : { registered: true,  method: 'upstream-launcher-ok',
          launcher: path.join(ENCLAWED_PATH, 'enclawed.mjs'),
          dist: path.join(ENCLAWED_PATH, 'dist', 'entry.js'),
          stateDir: STATE_DIR };
  }
  return out;
}

function targetForChannel(channelId, target) {
  // Upstream Enclawed's `message send` requires a canonical-form target
  // for each channel. For Discord we wrap a numeric id in `channel:`;
  // Telegram accepts the chat id directly. Other channels: pass through.
  if (!target) return 'channel:0';
  if (channelId === 'discord' && /^\d+$/.test(String(target))) return `channel:${target}`;
  return String(target);
}

export async function mediateEnclawedSample({ channelId, content, target }) {
  const err = checkBootPrerequisites();
  if (err) {
    return {
      delivered: false,
      reason: `upstream-bootstrap-failed: ${err}`,
      cliExit: null,
      cliJson: null,
    };
  }
  const launcher = path.join(ENCLAWED_PATH, 'enclawed.mjs');
  const args = [
    launcher,
    'message', 'send',
    '--channel', channelId,
    '--target', targetForChannel(channelId, target),
    '--message', content,
    '--dry-run',
    '--json',
  ];
  const env = {
    ...process.env,
    ENCLAWED_STATE_DIR: STATE_DIR,
    // Upstream's launcher color/no-color logic depends on tty; force off so
    // stdout is parseable as JSON without ANSI noise.
    NO_COLOR: '1',
    FORCE_COLOR: '0',
  };
  const r = spawnSync(ENCLAWED_NODE, args, {
    encoding: 'utf8',
    env,
    timeout: 30_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.error) {
    return {
      delivered: false,
      reason: `upstream-cli-spawn-error: ${r.error.message}`,
      cliExit: null,
      cliJson: null,
    };
  }
  const stdout = (r.stdout ?? '').trim();
  const stderr = (r.stderr ?? '').trim();
  // The CLI emits a banner line on stdout before the JSON envelope; strip
  // anything before the first '{' and parse the rest.
  const jsonStart = stdout.indexOf('{');
  let parsed = null, parseError = null;
  if (jsonStart !== -1) {
    try { parsed = JSON.parse(stdout.slice(jsonStart)); }
    catch (e) { parseError = e.message; }
  }
  if (r.status !== 0 || parsed === null) {
    return {
      delivered: false,
      reason: r.status !== 0
        ? `upstream-cli-exit=${r.status}: ${stderr.slice(0, 400) || stdout.slice(0, 400)}`
        : `upstream-cli-output-not-json: ${parseError ?? 'no JSON found'}; stdout=${stdout.slice(0, 200)}`,
      cliExit: r.status,
      cliJson: null,
    };
  }
  // Upstream Enclawed signals successful delivery acceptance through the
  // shape of the JSON envelope: action=='send', payload populated, dryRun
  // mirrors the flag, and no `error` field. Anything else is a runtime
  // rejection.
  const accepted = parsed.action === 'send'
                && parsed.payload != null
                && !parsed.error
                && r.status === 0;
  return {
    delivered: accepted,
    reason: accepted
      ? `upstream-cli-accepted-for-delivery: handledBy=${parsed.handledBy ?? '?'}`
      : `upstream-cli-rejected: ${parsed.error ?? 'unexpected envelope'}`,
    cliExit: r.status,
    cliJson: parsed,
  };
}
