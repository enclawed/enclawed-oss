// enclawed adapter kit: URLs the person named in the session's task.
//
// A fetch of a URL the person themself asked for (the text the person typed
// or launched the session with: a host's prompt argument or its user-prompt
// event) carries nothing the agent chose: the URL is fixed by the person, so
// the request sends no data of the session out. Only the person's own text
// counts. A URL found in a file, a tool result or the model's output is never
// a person-named URL, whatever it says.
//
// Matching is exact after WHATWG normalization (scheme and host lowercased,
// default port dropped, path dot-segments resolved, percent-encoding as the
// URL parser leaves it) with the fragment removed (it is never sent). No
// prefix, sibling path, other query or other port matches.

/** The http(s) URLs a person's text names, WHATWG-normalized, in order, without duplicates. */
export function personUrlsOf(text: unknown): string[] {
  if (typeof text !== "string") {
    return [];
  }
  const out: string[] = [];
  for (const m of text.matchAll(/\bhttps?:\/\/[^\s<>"'`]+/gi)) {
    // Sentence punctuation and closing brackets after a URL are not part of it.
    const raw = m[0].replace(/[.,;:!?)\]}]+$/, "");
    const n = normalizePersonUrl(raw);
    if (n && !out.includes(n)) {
      out.push(n);
    }
  }
  return out;
}

/** The WHATWG form a person-named URL is compared in (fragment removed), or null. */
export function normalizePersonUrl(url: unknown): string | null {
  if (typeof url !== "string" || url.length === 0 || url.length > 4096) {
    return null;
  }
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if ((u.protocol !== "http:" && u.protocol !== "https:") || u.username || u.password) {
    return null;
  }
  u.hash = "";
  return u.href;
}

/** Whether `url` is exactly one of the person-named URLs (each already normalized). */
export function isPersonNamedUrl(
  url: unknown,
  named: readonly string[] | null | undefined,
): boolean {
  if (!named || named.length === 0) {
    return false;
  }
  const n = normalizePersonUrl(url);
  return n !== null && named.includes(n);
}

// curl options that change nothing but what is printed, whether it fails,
// following redirects and how long it waits. Anything else (data, headers,
// method, upload, output file, config file, cookies, proxies, ...) is not a
// plain GET of the named URL.
const CURL_FLAGS = new Set([
  "--silent",
  "--show-error",
  "--fail",
  "--fail-with-body",
  "--location",
  "--compressed",
  "--include",
  "--verbose",
  "--no-progress-meter",
]);
const CURL_TIMEOUTS = new Set(["--max-time", "--connect-timeout", "-m"]);
const CURL_SHORT = /^-[sSLfiv]+$/;

/**
 * A plain GET of one person-named URL by curl or wget, and where its body
 * goes: `output` null for standard output, else the file named by curl's
 * -o/--output or wget's -O/--output-document (the caller decides the file).
 * Null when it is anything else. wget without -O names its own file: refused.
 */
export function personNamedGet(
  argv: readonly string[],
  named: readonly string[] | null | undefined,
): { output: string | null } | null {
  if (!named || named.length === 0) {
    return null;
  }
  if (argv[0] === "curl") {
    let output: string | null = null;
    const rest: string[] = [];
    for (let i = 1; i < argv.length; i++) {
      const a = argv[i];
      if (a === "-o" || a === "--output") {
        if (output !== null || typeof argv[i + 1] !== "string") {
          return null;
        }
        output = argv[++i];
      } else if (a.startsWith("--output=")) {
        if (output !== null) {
          return null;
        }
        output = a.slice("--output=".length);
      } else {
        rest.push(a);
      }
    }
    if (output === "-") {
      output = null;
    }
    return isPersonNamedCurl(["curl", ...rest], named) ? { output } : null;
  }
  if (argv[0] === "wget") {
    let output: string | undefined;
    const urls: string[] = [];
    for (let i = 1; i < argv.length; i++) {
      const a = argv[i];
      if (a === "--quiet" || a === "--no-verbose" || a === "-nv" || a === "-q") {
        continue;
      }
      const cluster = a.match(/^-(q?)O(.*)$/);
      if (cluster) {
        const v = cluster[2] !== "" ? cluster[2] : argv[++i];
        if (output !== undefined || typeof v !== "string") {
          return null;
        }
        output = v;
        continue;
      }
      if (a.startsWith("--output-document=")) {
        if (output !== undefined) {
          return null;
        }
        output = a.slice("--output-document=".length);
        continue;
      }
      const t = a.match(/^(?:--timeout=|--tries=)(\d+)$/);
      if (t) {
        continue;
      }
      if ((a === "-T" || a === "-t") && /^\d+$/.test(argv[i + 1] ?? "")) {
        i++;
        continue;
      }
      if (a.startsWith("-")) {
        return null;
      }
      urls.push(a);
    }
    if (output === undefined || urls.length !== 1 || /[[\]{}]/.test(urls[0])) {
      return null;
    }
    return isPersonNamedUrl(urls[0], named) ? { output: output === "-" ? null : output } : null;
  }
  return null;
}

/**
 * Is this argv a plain GET of one person-named URL by curl: only quiet,
 * fail, follow, verbose and timeout options, exactly one URL and it named by
 * the person? (`-q` first, which skips the curl config file, is accepted.)
 */
export function isPersonNamedCurl(
  argv: readonly string[],
  named: readonly string[] | null | undefined,
): boolean {
  if (argv[0] !== "curl" || !named || named.length === 0) {
    return false;
  }
  const urls: string[] = [];
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-q" && i === 1) {
      continue;
    }
    if (CURL_FLAGS.has(a) || CURL_SHORT.test(a)) {
      continue;
    }
    const eq = a.indexOf("=");
    const name = eq > 0 ? a.slice(0, eq) : a;
    if (CURL_TIMEOUTS.has(name)) {
      const v = eq > 0 ? a.slice(eq + 1) : argv[++i];
      if (name === "-m" && eq > 0) {
        return false;
      }
      if (typeof v !== "string" || !/^\d+(?:\.\d+)?$/.test(v)) {
        return false;
      }
      continue;
    }
    if (a.startsWith("-")) {
      return false;
    }
    urls.push(a);
  }
  // curl reads [] and {} in a URL as a glob of several URLs.
  return urls.length === 1 && !/[[\]{}]/.test(urls[0]) && isPersonNamedUrl(urls[0], named);
}

/**
 * The bash idiom of a raw HTTP GET over /dev/tcp, exactly:
 *   exec N<>/dev/tcp/HOST/PORT; printf 'GET PATH HTTP/1.x\r\nHost: HOST[:PORT]\r\n[Connection: close\r\n]\r\n' >&N; cat <&N
 * (optionally `; exec N>&-` after). The printf format has no `%` and no
 * escape but \r\n, so what is sent is exactly that request line and those
 * headers: a GET with no body. True when the URL it fetches
 * (http://HOST:PORT/PATH) is a person-named one. Anything else: false.
 */
export function isPersonNamedDevTcpGet(
  command: string,
  named: readonly string[] | null | undefined,
): boolean {
  if (!named || named.length === 0) {
    return false;
  }
  const m = command
    .trim()
    .match(
      /^exec ([3-9])<>\/dev\/tcp\/([A-Za-z0-9.-]+)\/(\d{1,5})\s*;\s*printf '([^'%\\]*(?:\\r\\n[^'%\\]*)*)' >&\1\s*;\s*cat <&\1(?:\s*;\s*exec \1>&-)?$/,
    );
  if (!m) {
    return false;
  }
  const [, , host, port, format] = m;
  const lines = format.split("\\r\\n");
  // Request line, Host, optional Connection: close, then the empty line that ends the headers.
  const req = lines[0].match(/^GET (\/[^\s]*) HTTP\/1\.[01]$/);
  if (
    !req ||
    lines.length < 4 ||
    lines[lines.length - 1] !== "" ||
    lines[lines.length - 2] !== ""
  ) {
    return false;
  }
  const headers = lines.slice(1, -2);
  const hostOk = (h: string) => h === `Host: ${host}` || h === `Host: ${host}:${port}`;
  if (!hostOk(headers[0] ?? "") || !headers.slice(1).every((h) => /^Connection: close$/i.test(h))) {
    return false;
  }
  return isPersonNamedUrl(`http://${host}:${port}${req[1]}`, named);
}
