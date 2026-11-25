// The passkey ceremony the gate runs for a device-bound platform passkey:
// the one-time loopback page (loopback-ceremony.ts), opened in the person's
// browser (browser-open.ts). Adapters never run a ceremony themselves; they
// call the gate, which decides (gate.ts).

import {
  type OpenDeps,
  WSL_FORWARDING_HELP,
  detectBrowserHost,
  openBrowser,
  probeWslLocalhost,
} from "./browser-open.js";
import {
  type LoopbackCeremonyRequest,
  type LoopbackCeremonyResult,
  startLoopbackCeremony,
} from "./loopback-ceremony.js";

/** Runs one ceremony and returns the browser's answer with the page's exact origin. */
export type PasskeyCeremony = (
  req: LoopbackCeremonyRequest,
  say: (line: string) => void,
) => Promise<LoopbackCeremonyResult>;

/** The ceremony cannot run on this computer (no browser can reach the page). */
export class PasskeyUnavailableError extends Error {
  readonly code = "passkey-unavailable";
  constructor(message: string) {
    super(message);
    this.name = "PasskeyUnavailableError";
  }
}

export function loopbackPasskeyCeremony(
  opts: { timeoutMs: number; deps?: OpenDeps } = { timeoutMs: 120_000 },
): PasskeyCeremony {
  return async (req, say) => {
    const server = await startLoopbackCeremony(req, { timeoutMs: opts.timeoutMs });
    try {
      if (detectBrowserHost(opts.deps) === "wsl") {
        const reach = probeWslLocalhost(server.port, opts.deps);
        // Only a check that ran and failed is evidence the page cannot load. A
        // check that could not run says nothing (the URL is printed below, and
        // the ceremony has its own timeout).
        if (reach === "unreachable") {
          throw new PasskeyUnavailableError(WSL_FORWARDING_HELP);
        }
      }
      const via = openBrowser(server.url, opts.deps);
      say(
        via
          ? `Your browser opens a page for the passkey. If it did not, open: ${server.url}`
          : `Open this page in your browser to use your passkey: ${server.url}`,
      );
      return await server.result;
    } catch (err) {
      server.close();
      throw err;
    }
  };
}
