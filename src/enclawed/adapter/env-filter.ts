// enclawed adapter kit: an environment print filtered to lines that hold
// no credential, decided on the session's actual environment.
//
// `env | grep -i node` prints only the environment lines the filter keeps.
// With the environment the agent's commands run with (EngineOptions
// `environment`: the host process's environment as the adapter sees it,
// which is what the host hands its shell), the kit can compute those lines
// exactly. The print needs no person when every line the filter could keep
// is not a credential: its variable's name is not credential-shaped
// (env-trust credentialLike) and no part of it is a known credential format,
// a provider token or a token-shaped value. A filter after the grep that
// cuts every value off (`sed 's/=.*/=<set>/'`, `cut -d= -f1`) leaves only the
// names (and the continuation lines of multi-line values, which are checked).
// Anything else (another print, a pattern that is not a plain word, no
// environment given) is not decided here: the ordinary rule asks.

import { credentialFindings } from "./credentials.js";
import { credentialLike } from "./env-trust.js";
import { providerTokenFindings } from "./secret-content.js";
import type { SimpleCommand } from "./shell-compound.js";

const GREP_FLAGS = /^-[iwFE]+$/;
const WORD = /^[A-Za-z0-9_]+$/;
// A token-shaped piece: 8+ characters of a token alphabet with letters and digits.
const TOKEN_PIECE = /^[A-Za-z0-9+_]{8,}$/;

// An absolute path (one element of a :-separated list such as PATH): a location, not a secret.
const ABS_PATH = /^\/[^\s]*$/;

function tokenShaped(text: string): boolean {
  return (
    text
      .split(/[\s:;,="'@]+/)
      .filter((p) => !ABS_PATH.test(p))
      // A key made of short words (PROJKEY=-tmp-x-proj): each word on its own.
      .flatMap((p) => p.split(/[/.-]/))
      .some((p) => TOKEN_PIECE.test(p) && /[A-Za-z]/.test(p) && /\d/.test(p))
  );
}

function secretIn(text: string): boolean {
  return (
    credentialFindings(text).length > 0 ||
    providerTokenFindings(text).length > 0 ||
    tokenShaped(text)
  );
}

/** `sed 's/=.*\/X/'` (any delimiter, X with no backreference) or `cut -d= -f1`: values cut off. */
function cutsValues(c: SimpleCommand | undefined): boolean {
  if (!c) {
    return false;
  }
  const a = c.argv;
  if (a[0] === "cut") {
    return a.length === 3 && a.includes("-d=") && a.includes("-f1");
  }
  if (a[0] !== "sed" || a.length !== 2) {
    return false;
  }
  const m = a[1].match(/^s(.)=\.\*\1([^\\&]*)\1g?$/);
  return m !== null && !m[2].includes(m[1]);
}

/**
 * Is every environment print of this line (`env` or `printenv` with no
 * argument) piped straight into `grep [-i|-w|-F|-E] WORD`, and does no line
 * of `environment` that the grep keeps hold a credential? False when no
 * environment is known or any print is not of that shape.
 */
export function envPrintsNoCredential(
  commands: readonly SimpleCommand[],
  environment: Readonly<Record<string, string>> | null | undefined,
): boolean {
  if (!environment) {
    return false;
  }
  let prints = 0;
  for (let i = 0; i < commands.length; i++) {
    const c = commands[i];
    const isPrint =
      (c.argv[0] === "env" || c.argv[0] === "printenv") &&
      c.argv.length === 1 &&
      c.assigns.length === 0;
    if (!isPrint) {
      continue;
    }
    prints++;
    const g = commands[i + 1];
    if (c.next !== "|" || !g || g.argv[0] !== "grep" || (g.writes?.length ?? 0) > 0) {
      return false;
    }
    const flags = g.argv.slice(1, -1);
    const pattern = g.argv[g.argv.length - 1];
    if (g.argv.length < 2 || !flags.every((f) => GREP_FLAGS.test(f)) || !WORD.test(pattern)) {
      return false;
    }
    const fold = flags.some((f) => f.includes("i"));
    const needle = fold ? pattern.toLowerCase() : pattern;
    const namesOnly = g.next === "|" && cutsValues(commands[i + 2]);
    for (const [name, value] of Object.entries(environment)) {
      const lines = `${name}=${value}`.split("\n");
      for (let k = 0; k < lines.length; k++) {
        const line = lines[k];
        if (!(fold ? line.toLowerCase() : line).includes(needle)) {
          continue;
        }
        // Names only: the first line shows the name; a continuation line shows whole.
        const shown = namesOnly && k === 0 ? name : line;
        if ((k === 0 && credentialLike(name) && !namesOnly) || secretIn(shown)) {
          return false;
        }
      }
    }
  }
  return prints > 0;
}
