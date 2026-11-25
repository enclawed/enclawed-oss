// Routing-field provenance (M3): every value that decides WHERE an outbound
// request sends data must come from the tool call that caused the request,
// or be a constant the operator declared when admitting the server.
//
// The postmark-mcp backdoor (1.0.16) added one `Bcc` to every email the
// server sent through the legitimate Postmark API. The host, the path and
// the TLS certificate are all the real ones; only the recipient set is
// wrong. A routing field ("To", "Cc", "Bcc", "ReplyTo" for an email API, the
// channel for a messaging API, the target URL for a webhook API) whose
// value appears in no argument of the in-flight call is a deterministic
// mismatch: the request is refused.
//
// Which fields are routing fields is declared per API in an egress profile.
// Profiles for common APIs ship here; others are authored at pin time and
// carried in the admission record. Pure module: no I/O.

export type RoutingValueKind = "email" | "url" | "string";

export type RoutingField = Readonly<{
  /** Where the value is: the parsed body (JSON path or form field), a header, or a query parameter. */
  source: "body" | "header" | "query";
  /**
   * Body: a JSON path with "." between keys and "[]" for "every element"
   * (e.g. "personalizations[].bcc[].email", "[].Bcc"); for a form body, the
   * field name. Header and query: the name (headers compare case-insensitively).
   */
  path: string;
  kind: RoutingValueKind;
}>;

export type EgressProfileRule = Readonly<{
  /** Upper-case method; any method when omitted. */
  method?: string;
  /** Path pattern: "/" separated, "*" matches one segment, a trailing "/**" any rest. */
  path: string;
  fields: readonly RoutingField[];
}>;

export type EgressProfile = Readonly<{
  id: string;
  /** Host patterns ("api.postmarkapp.com", "email.*.amazonaws.com": "*" is one label). */
  hosts: readonly string[];
  rules: readonly EgressProfileRule[];
}>;

const email = (path: string, source: RoutingField["source"] = "body"): RoutingField => ({
  source,
  path,
  kind: "email",
});

const POSTMARK_FIELDS = ["To", "Cc", "Bcc", "From", "ReplyTo"];

/** Profiles shipped with the framework, by id. */
export const SHIPPED_EGRESS_PROFILES: Readonly<Record<string, EgressProfile>> = {
  postmark: {
    id: "postmark",
    hosts: ["api.postmarkapp.com"],
    rules: [
      { method: "POST", path: "/email", fields: POSTMARK_FIELDS.map((f) => email(f)) },
      { method: "POST", path: "/email/withTemplate", fields: POSTMARK_FIELDS.map((f) => email(f)) },
      {
        method: "POST",
        path: "/email/batch",
        fields: POSTMARK_FIELDS.map((f) => email(`[].${f}`)),
      },
      {
        method: "POST",
        path: "/email/batchWithTemplates",
        fields: POSTMARK_FIELDS.map((f) => email(`Messages[].${f}`)),
      },
    ],
  },
  sendgrid: {
    id: "sendgrid",
    hosts: ["api.sendgrid.com"],
    rules: [
      {
        method: "POST",
        path: "/v3/mail/send",
        fields: [
          email("personalizations[].to[].email"),
          email("personalizations[].cc[].email"),
          email("personalizations[].bcc[].email"),
          email("personalizations[].from.email"),
          email("from.email"),
          email("reply_to.email"),
          email("reply_to_list[].email"),
        ],
      },
    ],
  },
  mailgun: {
    id: "mailgun",
    hosts: ["api.mailgun.net", "api.eu.mailgun.net"],
    rules: [
      {
        method: "POST",
        path: "/v3/*/messages",
        fields: ["to", "cc", "bcc", "from", "h:Reply-To"].map((f) => email(f)),
      },
    ],
  },
  "aws-ses-v2": {
    id: "aws-ses-v2",
    hosts: ["email.*.amazonaws.com"],
    rules: [
      {
        method: "POST",
        path: "/v2/email/outbound-emails",
        fields: [
          email("Destination.ToAddresses[]"),
          email("Destination.CcAddresses[]"),
          email("Destination.BccAddresses[]"),
          email("FromEmailAddress"),
          email("ReplyToAddresses[]"),
        ],
      },
    ],
  },
  slack: {
    id: "slack",
    hosts: ["slack.com"],
    rules: [
      {
        method: "POST",
        path: "/api/chat.postMessage",
        fields: [{ source: "body", path: "channel", kind: "string" }],
      },
      {
        method: "POST",
        path: "/api/chat.postEphemeral",
        fields: [
          { source: "body", path: "channel", kind: "string" },
          { source: "body", path: "user", kind: "string" },
        ],
      },
      {
        method: "POST",
        path: "/api/files.completeUploadExternal",
        fields: [
          { source: "body", path: "channel_id", kind: "string" },
          { source: "body", path: "channels", kind: "string" },
        ],
      },
    ],
  },
  twilio: {
    id: "twilio",
    hosts: ["api.twilio.com"],
    rules: [
      {
        method: "POST",
        path: "/2010-04-01/Accounts/*/Messages.json",
        fields: [
          { source: "body", path: "To", kind: "string" },
          { source: "body", path: "From", kind: "string" },
        ],
      },
    ],
  },
  "github-webhooks": {
    id: "github-webhooks",
    hosts: ["api.github.com"],
    rules: [
      {
        method: "POST",
        path: "/repos/*/*/hooks",
        fields: [{ source: "body", path: "config.url", kind: "url" }],
      },
      {
        method: "PATCH",
        path: "/repos/*/*/hooks/*",
        fields: [{ source: "body", path: "config.url", kind: "url" }],
      },
      {
        method: "PATCH",
        path: "/repos/*/*/hooks/*/config",
        fields: [{ source: "body", path: "url", kind: "url" }],
      },
      {
        method: "POST",
        path: "/orgs/*/hooks",
        fields: [{ source: "body", path: "config.url", kind: "url" }],
      },
      {
        method: "PATCH",
        path: "/orgs/*/hooks/*",
        fields: [{ source: "body", path: "config.url", kind: "url" }],
      },
    ],
  },
};

// ─── Matching ───────────────────────────────────────────────────────────

export function hostMatches(pattern: string, host: string): boolean {
  const p = pattern.toLowerCase().split(".");
  const h = host.toLowerCase().replace(/\.$/, "").split(".");
  return p.length === h.length && p.every((label, i) => label === "*" || label === h[i]);
}

export function pathMatches(pattern: string, path: string): boolean {
  const clean = path.split("?")[0].replace(/\/+$/, "") || "/";
  const p = pattern.replace(/\/+$/, "").split("/");
  const s = clean.split("/");
  for (let i = 0; i < p.length; i++) {
    if (p[i] === "**") {
      return true;
    }
    if (i >= s.length) {
      return false;
    }
    // API paths compare case-sensitively except the profile's literal case
    // may differ from what clients send for case-insensitive APIs; compare
    // case-insensitively so a casing change cannot route around the rule.
    if (p[i] !== "*" && p[i].toLowerCase() !== s[i].toLowerCase()) {
      return false;
    }
  }
  return p.length === s.length;
}

/** The rules of `profiles` that apply to this request. */
export function applicableRules(
  profiles: readonly EgressProfile[],
  host: string,
  method: string,
  path: string,
): EgressProfileRule[] {
  const out: EgressProfileRule[] = [];
  for (const profile of profiles) {
    if (!profile.hosts.some((h) => hostMatches(h, host))) {
      continue;
    }
    for (const rule of profile.rules) {
      if (
        (!rule.method || rule.method.toUpperCase() === method.toUpperCase()) &&
        pathMatches(rule.path, path)
      ) {
        out.push(rule);
      }
    }
  }
  return out;
}

// ─── Values ─────────────────────────────────────────────────────────────

const EMAIL_RE =
  /[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*/g;

/** Every address in an address-list string ("A <a@x>, b@y; c@z"), lower-cased. */
export function emailsIn(text: string): string[] {
  return [...text.matchAll(EMAIL_RE)].map((m) => m[0].toLowerCase());
}

function normalizeUrl(text: string): string | null {
  try {
    const u = new URL(text.trim());
    u.hash = "";
    return u.href;
  } catch {
    return null;
  }
}

function normalizeString(text: string): string {
  return text.trim().replace(/^[#@]/, "").toLowerCase();
}

/**
 * The values a routing field carries, normalized the way the API itself
 * reads them: an email field may hold a list of addresses with display
 * names; a URL is compared in its parsed form.
 */
export function routingValues(kind: RoutingValueKind, raw: string): string[] {
  if (kind === "email") {
    const found = emailsIn(raw);
    // A non-empty field with no address in it is still a value the caller
    // must have supplied (it is not silently ignored).
    return found.length > 0 ? found : raw.trim() ? [`raw:${raw.trim().toLowerCase()}`] : [];
  }
  if (kind === "url") {
    const u = normalizeUrl(raw);
    return u ? [u] : raw.trim() ? [`raw:${raw.trim()}`] : [];
  }
  return raw.trim() ? [normalizeString(raw)] : [];
}

/** Every value a tool call's arguments (or the declared constants) can supply, in all normalized forms. */
export function suppliedValues(sources: readonly unknown[]): Set<string> {
  const out = new Set<string>();
  const visit = (v: unknown, depth: number) => {
    if (depth > 32) {
      return;
    }
    if (typeof v === "string") {
      for (const e of emailsIn(v)) {
        out.add(e);
      }
      const trimmed = v.trim();
      if (trimmed) {
        out.add(`raw:${trimmed.toLowerCase()}`);
        out.add(`raw:${trimmed}`);
        out.add(normalizeString(trimmed));
        const u = normalizeUrl(trimmed);
        if (u) {
          out.add(u);
        }
      }
    } else if (typeof v === "number" || typeof v === "boolean") {
      out.add(normalizeString(String(v)));
    } else if (Array.isArray(v)) {
      for (const x of v) {
        visit(x, depth + 1);
      }
    } else if (v && typeof v === "object") {
      for (const x of Object.values(v as Record<string, unknown>)) {
        visit(x, depth + 1);
      }
    }
  };
  for (const s of sources) {
    visit(s, 0);
  }
  return out;
}

// ─── Body parsing ───────────────────────────────────────────────────────

export type ParsedBody =
  | { kind: "json"; value: unknown }
  | { kind: "form"; fields: Map<string, string[]> }
  | { kind: "empty" }
  | { kind: "unparseable"; reason: string };

function addField(m: Map<string, string[]>, k: string, v: string) {
  const list = m.get(k) ?? [];
  list.push(v);
  m.set(k, list);
}

function parseMultipart(body: Buffer, boundary: string): Map<string, string[]> | null {
  const fields = new Map<string, string[]>();
  const delim = Buffer.from(`--${boundary}`);
  let pos = body.indexOf(delim);
  if (pos < 0) {
    return null;
  }
  for (;;) {
    pos += delim.length;
    if (body.subarray(pos, pos + 2).toString() === "--") {
      return fields;
    }
    const headEnd = body.indexOf("\r\n\r\n", pos);
    if (headEnd < 0) {
      return null;
    }
    const head = body.subarray(pos, headEnd).toString("utf8");
    const next = body.indexOf(delim, headEnd + 4);
    if (next < 0) {
      return null;
    }
    const content = body.subarray(headEnd + 4, next - 2); // drop the CRLF before the delimiter
    const nameMatch = /content-disposition:[^\r\n]*\bname="([^"]*)"/i.exec(head);
    const isFile = /content-disposition:[^\r\n]*\bfilename=/i.test(head);
    if (nameMatch && !isFile) {
      addField(fields, nameMatch[1], content.toString("utf8"));
    }
    pos = next;
  }
}

/** Parse a request body for routing-field extraction. Never throws. */
export function parseRequestBody(contentType: string | undefined, body: Buffer): ParsedBody {
  if (body.length === 0) {
    return { kind: "empty" };
  }
  const ct = (contentType ?? "").toLowerCase();
  try {
    if (ct.includes("json") || (!ct && /^\s*[[{]/.test(body.subarray(0, 64).toString("utf8")))) {
      return { kind: "json", value: JSON.parse(body.toString("utf8")) };
    }
    if (ct.startsWith("application/x-www-form-urlencoded")) {
      const fields = new Map<string, string[]>();
      for (const [k, v] of new URLSearchParams(body.toString("utf8"))) {
        addField(fields, k, v);
      }
      return { kind: "form", fields };
    }
    if (ct.startsWith("multipart/form-data")) {
      const b = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType ?? "");
      const parsed = b ? parseMultipart(body, (b[1] ?? b[2]).trim()) : null;
      return parsed
        ? { kind: "form", fields: parsed }
        : { kind: "unparseable", reason: "malformed multipart body" };
    }
  } catch (err) {
    return { kind: "unparseable", reason: err instanceof Error ? err.message : String(err) };
  }
  return {
    kind: "unparseable",
    reason: `content type "${contentType ?? ""}" is not one the profile can read`,
  };
}

function jsonValuesAt(value: unknown, path: string): { values: string[]; nonString: boolean } {
  const steps = path
    .replace(/\[\]/g, ".[]")
    .split(".")
    .filter((s) => s.length > 0);
  let current: unknown[] = [value];
  for (const step of steps) {
    const next: unknown[] = [];
    for (const c of current) {
      if (step === "[]") {
        if (Array.isArray(c)) {
          next.push(...c);
        } else if (c !== undefined && c !== null) {
          next.push(c); // a single object where a list is allowed
        }
      } else if (c && typeof c === "object" && !Array.isArray(c)) {
        // Keys compare case-insensitively: an API that accepts "bcc" for
        // "Bcc" must not let the lower-case spelling route around the rule.
        for (const [k, v] of Object.entries(c as Record<string, unknown>)) {
          if (k.toLowerCase() === step.toLowerCase()) {
            next.push(v);
          }
        }
      }
    }
    current = next;
  }
  const values: string[] = [];
  let nonString = false;
  const collect = (v: unknown, depth: number) => {
    if (typeof v === "string") {
      values.push(v);
    } else if (typeof v === "number") {
      values.push(String(v));
    } else if (Array.isArray(v) && depth < 4) {
      v.forEach((x) => collect(x, depth + 1));
    } else if (v && typeof v === "object" && depth < 4) {
      // An object where a value was expected (e.g. {Email, Name}): every
      // string inside it counts as routing data.
      Object.values(v as Record<string, unknown>).forEach((x) => collect(x, depth + 1));
    } else if (v !== null && v !== undefined && typeof v !== "boolean") {
      nonString = true;
    }
  };
  current.forEach((v) => collect(v, 0));
  return { values, nonString };
}

export type RoutingRequest = Readonly<{
  host: string;
  method: string;
  /** Path with query, as on the request line. */
  target: string;
  headers: Readonly<Record<string, string | string[] | undefined>>;
  contentType?: string;
  body: Buffer;
}>;

export type RoutingVerdict =
  | Readonly<{ ok: true; checked: number }>
  | Readonly<{
      ok: false;
      code: "routing-field-not-from-call" | "routing-body-unparseable";
      field?: string;
      value?: string;
      message: string;
    }>;

/**
 * Check every routing field of `req` against the values the in-flight
 * call(s) supplied and the declared constants. A request no profile rule
 * covers has no routing fields to check (`checked: 0`).
 */
export function checkRoutingProvenance(
  req: RoutingRequest,
  profiles: readonly EgressProfile[],
  supplied: ReadonlySet<string>,
): RoutingVerdict {
  const path = req.target.split("?")[0];
  const rules = applicableRules(profiles, req.host, req.method, path);
  if (rules.length === 0) {
    return { ok: true, checked: 0 };
  }
  let parsed: ParsedBody | null = null;
  const query = new URLSearchParams(
    req.target.includes("?") ? req.target.slice(req.target.indexOf("?") + 1) : "",
  );
  let checked = 0;
  for (const rule of rules) {
    for (const field of rule.fields) {
      let raws: string[] = [];
      if (field.source === "header") {
        const want = field.path.toLowerCase();
        for (const [k, v] of Object.entries(req.headers)) {
          if (k.toLowerCase() === want && v !== undefined) {
            raws.push(...(Array.isArray(v) ? v : [v]));
          }
        }
      } else if (field.source === "query") {
        raws = query.getAll(field.path);
      } else {
        parsed ??= parseRequestBody(req.contentType, req.body);
        if (parsed.kind === "unparseable") {
          return {
            ok: false,
            code: "routing-body-unparseable",
            message: `the request body cannot be read to check its routing fields (${parsed.reason}); refused`,
          };
        }
        if (parsed.kind === "json") {
          const found = jsonValuesAt(parsed.value, field.path);
          if (found.nonString) {
            return {
              ok: false,
              code: "routing-body-unparseable",
              field: field.path,
              message: `routing field ${field.path} holds a value that is not text; refused`,
            };
          }
          raws = found.values;
        } else if (parsed.kind === "form") {
          for (const [k, v] of parsed.fields) {
            if (k.toLowerCase() === field.path.toLowerCase()) {
              raws.push(...v);
            }
          }
        }
      }
      for (const raw of raws) {
        for (const value of routingValues(field.kind, raw)) {
          checked++;
          if (!supplied.has(value)) {
            return {
              ok: false,
              code: "routing-field-not-from-call",
              field: field.path,
              value: value.replace(/^raw:/, ""),
              message: `routing field ${field.path} = ${value.replace(/^raw:/, "")} does not come from the tool call's arguments or the declared constants; refused`,
            };
          }
        }
      }
    }
  }
  return { ok: true, checked };
}

/** Resolve profile references (shipped ids or inline profiles); unknown ids are an error. */
export function resolveProfiles(
  refs: readonly (string | EgressProfile)[],
): { ok: true; profiles: EgressProfile[] } | { ok: false; message: string } {
  const out: EgressProfile[] = [];
  for (const ref of refs) {
    if (typeof ref === "string") {
      const p = SHIPPED_EGRESS_PROFILES[ref];
      if (!p) {
        return { ok: false, message: `unknown egress profile "${ref}"` };
      }
      out.push(p);
    } else {
      out.push(ref);
    }
  }
  return { ok: true, profiles: out };
}
