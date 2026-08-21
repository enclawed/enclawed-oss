// CalDAV MCP transport.
//
// Implements the `McpTransport` contract from mcp-attested: a single
// `call(method, params)` entry point that the QClearedMcpClient
// invokes. Inside, we translate the JSON-RPC `tools/call` envelope
// into CalDAV REPORT (calendar-query) and GET against any
// RFC-4791-compliant host.
//
// Connection lifecycle: tsdav's DAVClient is lazily created on first
// use and cached for the process lifetime. Credentials are passed via
// HTTP Basic — Google CalDAV (and every other major provider that
// exposes CalDAV at all) accepts app-specific passwords this way.
//
// Two tools:
//   - list_events     CalDAV calendar-query in a time range; iCalendar
//                     parse for envelope-level fields.
//   - get_event       Walk the primary calendar for an event whose UID
//                     matches the requested eventId; parse the full
//                     VEVENT body. (PR4 keeps this O(N); a REPORT
//                     calendar-query with prop-filter on UID would
//                     make it O(1) but the high-level tsdav surface
//                     does not expose it directly.)

import ICAL from "ical.js";
// tsdav 2.x renamed `DAVClient` (the class) so the public factory now
// returns an inline shape. We type the client as the awaited return of
// createDAVClient, which is the source of truth for both runtime and tests.
import tsdav, { type DAVObject } from "tsdav";
type DAVClient = Awaited<ReturnType<typeof tsdav.createDAVClient>>;
import type { JsonRpcResult } from "../../mcp-attested/src/http-transport.js";
import type { McpTransport } from "../../mcp-attested/src/server-registry.js";

// tsdav ships as CommonJS; Node's ESM static-imports can read the
// type names but not all named value exports survive the interop.
// Pull the runtime constructor off the default export instead.
const { createDAVClient } = tsdav as unknown as {
  createDAVClient: typeof tsdav.createDAVClient;
};

function isGoogleCalDavUrl(url: string): boolean {
  return /googleusercontent\.com|google\.com\/calendar/.test(url);
}

// CalDAV calendar-query time-range values must be in iCalendar UTC
// form: YYYYMMDDTHHMMSSZ. ISO 8601 with dashes / colons / fractional
// seconds is rejected.
function icalTime(d: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** Format a Date as YYYYMMDDTHHMMSS in the given IANA timezone (no Z
 *  suffix). Used for DTSTART;TZID=... and DTEND;TZID=... so recurrence
 *  iteration happens in the user's timezone instead of UTC. */
function formatLocalIcalTime(d: Date, tz: string): string {
  // en-CA gives ISO-style date components in 2-digit form; hourCycle
  // h23 forces 00-23 so midnight is "00" not "24".
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return (
    `${get("year")}${get("month")}${get("day")}T` + `${get("hour")}${get("minute")}${get("second")}`
  );
}

/** Emit a minimal VTIMEZONE block for an IANA zone. The DAYLIGHT /
 *  STANDARD sub-blocks are derived from the zone's current and
 *  alternate offsets, sampled mid-summer and mid-winter so a single
 *  RRULE catches the canonical DST transition. This is enough for
 *  Google Calendar and most CalDAV servers; servers that require an
 *  exhaustive multi-decade VTIMEZONE definition (rare) can still look
 *  up the TZID from their own catalog using the TZID parameter alone.
 *  When the zone has no DST (UTC, Asia/Tokyo, etc.) we emit a single
 *  STANDARD block.
 */
function buildVTimezone(tz: string): ReadonlyArray<string> {
  if (tz === "UTC") {
    return [
      "BEGIN:VTIMEZONE",
      "TZID:UTC",
      "BEGIN:STANDARD",
      "DTSTART:19700101T000000",
      "TZOFFSETFROM:+0000",
      "TZOFFSETTO:+0000",
      "TZNAME:UTC",
      "END:STANDARD",
      "END:VTIMEZONE",
    ];
  }
  // Sample two reference points (mid-summer + mid-winter) for the
  // CURRENT year and read the offsets. Naming and DST detection use
  // the localized short name when the runtime exposes it.
  const year = new Date().getUTCFullYear();
  const summer = new Date(Date.UTC(year, 6, 1)); // July 1
  const winter = new Date(Date.UTC(year, 0, 15)); // January 15
  const off1 = tzOffsetMinutes(summer, tz);
  const off2 = tzOffsetMinutes(winter, tz);
  const offToIcal = (m: number) => {
    const sign = m >= 0 ? "+" : "-";
    const abs = Math.abs(m);
    const hh = String(Math.floor(abs / 60)).padStart(2, "0");
    const mm = String(abs % 60).padStart(2, "0");
    return `${sign}${hh}${mm}`;
  };
  if (off1 === off2) {
    // No DST in this zone.
    return [
      "BEGIN:VTIMEZONE",
      `TZID:${tz}`,
      "BEGIN:STANDARD",
      "DTSTART:19700101T000000",
      `TZOFFSETFROM:${offToIcal(off1)}`,
      `TZOFFSETTO:${offToIcal(off1)}`,
      `TZNAME:${tzShortName(summer, tz)}`,
      "END:STANDARD",
      "END:VTIMEZONE",
    ];
  }
  // DST zone: pick the larger (more eastward) offset as DAYLIGHT.
  const daylight = Math.max(off1, off2);
  const standard = Math.min(off1, off2);
  return [
    "BEGIN:VTIMEZONE",
    `TZID:${tz}`,
    "BEGIN:DAYLIGHT",
    "DTSTART:19700308T020000",
    `TZOFFSETFROM:${offToIcal(standard)}`,
    `TZOFFSETTO:${offToIcal(daylight)}`,
    `TZNAME:${tzShortName(summer, tz)}`,
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "DTSTART:19701101T020000",
    `TZOFFSETFROM:${offToIcal(daylight)}`,
    `TZOFFSETTO:${offToIcal(standard)}`,
    `TZNAME:${tzShortName(winter, tz)}`,
    "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
}

/** Return the UTC-offset of `tz` at time `d`, in minutes (positive
 *  east of UTC, negative west). Uses Intl to read the zone's
 *  longOffset string and parses it. */
function tzOffsetMinutes(d: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    timeZoneName: "longOffset",
  }).formatToParts(d);
  const nameStr = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+0:00";
  // "GMT-07:00" / "GMT+05:30" / "GMT".
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(nameStr);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  const hh = Number.parseInt(m[2] ?? "0", 10);
  const mm = Number.parseInt(m[3] ?? "0", 10);
  return sign * (hh * 60 + mm);
}

/** Short timezone name ("PDT", "PST", "CET") for the given moment.
 *  Falls back to the IANA name when no short form is exposed. */
function tzShortName(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "short",
  }).formatToParts(d);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? tz;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export type CalDavTransportOptions = Readonly<{
  serverUrl: string;
  username: string;
  password: string;
  /**
   * Optional calendar-id (the CalDAV calendar's `.url` or
   * Google's per-calendar identifier) to prefer over the primary.
   * Most users want their primary calendar; the secretary's
   * scheduling lookups never need a non-primary calendar.
   */
  defaultCalendarId?: string;
  // Test seam: alternate DAVClient factory so unit tests can inject a
  // mock without spawning real network requests.
  clientFactory?: (cfg: {
    serverUrl: string;
    credentials: { username: string; password: string };
  }) => Promise<DAVClient>;
}>;

export type Attendee = Readonly<{ name?: string; email: string; status?: string }>;

export type EventSummary = Readonly<{
  eventId: string;
  summary: string;
  start: string;
  end: string;
  location: string | null;
  organizer: Attendee | null;
  attendees: ReadonlyArray<Attendee>;
}>;

export type EventDetail = Readonly<{
  eventId: string;
  summary: string;
  description: string;
  start: string;
  end: string;
  location: string | null;
  organizer: Attendee | null;
  attendees: ReadonlyArray<Attendee>;
  status: string;
}>;

// create_event input/output shapes. `start` and `end` are ISO 8601
// strings; they are converted to iCalendar UTC form (YYYYMMDDTHHMMSSZ)
// in the body. `attendees` is a list of email addresses; the bridge
// emits one ATTENDEE line per address with PARTSTAT=NEEDS-ACTION so
// the recipient gets a normal invite they can accept/decline in their
// own calendar UI.
export type CreateEventInput = Readonly<{
  summary: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  attendees?: ReadonlyArray<string>;
  /**
   * RFC 5545 RRULE value (the part after "RRULE:") for a recurring
   * event. Examples: "FREQ=WEEKLY;BYDAY=TU", "FREQ=DAILY;COUNT=10",
   * "FREQ=MONTHLY;BYMONTHDAY=15;UNTIL=20271231T000000Z". When set,
   * the bridge emits a single RRULE line in the VEVENT body and the
   * server expands the recurrence; `start` and `end` describe the
   * first occurrence. When omitted, the event is a one-off.
   */
  recurrence?: string;
  /**
   * IANA timezone identifier for the event's local time (e.g.
   * "America/Los_Angeles", "Europe/Paris"). When set, the VEVENT
   * is emitted with DTSTART;TZID=<tz>:<local-time> + DTEND;TZID=...
   * and an accompanying VTIMEZONE block. This is REQUIRED for
   * recurring events with BYDAY/BYMONTHDAY rules to fire on the
   * correct weekday in the user's timezone — emitting DTSTART in
   * UTC + RRULE BYDAY=TU causes Google to compute subsequent
   * occurrences against UTC days, so an event at 17:30 PDT
   * (00:30 UTC the next day) recurs on PDT Mondays after the first
   * Tuesday. When omitted, DTSTART/DTEND are emitted in UTC; safe
   * for one-off events, unsafe for recurring ones.
   */
  timezone?: string;
}>;
export type CreateEventOutput = Readonly<{
  eventId: string;
  url: string;
}>;
// update_event: replaces the event identified by eventId. Optional
// fields default to the value already on the server (the caller must
// pass them explicitly — there is no patch semantic; PUT is whole-
// document). When all fields are passed, this is equivalent to a
// full re-write. We pass the eventId as the UID inside the iCal body
// so the event preserves identity in Google's calendar UI.
export type UpdateEventInput = CreateEventInput & Readonly<{ eventId: string }>;
export type UpdateEventOutput = Readonly<{
  eventId: string;
  url: string;
}>;
export type DeleteEventInput = Readonly<{ eventId: string }>;
export type DeleteEventOutput = Readonly<{ eventId: string; deleted: true }>;

export class CalDavTransport implements McpTransport {
  private readonly serverUrl: string;
  private readonly username: string;
  private readonly password: string;
  private readonly defaultCalendarId?: string;
  private readonly clientFactory: NonNullable<CalDavTransportOptions["clientFactory"]>;
  private clientPromise: Promise<DAVClient> | null = null;

  constructor(opts: CalDavTransportOptions) {
    if (!opts.serverUrl) {
      throw new TypeError("CalDavTransport: serverUrl required");
    }
    if (!opts.username) {
      throw new TypeError("CalDavTransport: username required");
    }
    if (!opts.password) {
      throw new TypeError("CalDavTransport: password required");
    }
    this.serverUrl = opts.serverUrl;
    this.username = opts.username;
    this.password = opts.password;
    this.defaultCalendarId = opts.defaultCalendarId;
    this.clientFactory =
      opts.clientFactory ??
      ((cfg) =>
        createDAVClient({
          serverUrl: cfg.serverUrl,
          credentials: cfg.credentials,
          authMethod: "Basic",
          defaultAccountType: "caldav",
        }));
  }

  async call(method: string, params: Record<string, unknown>): Promise<JsonRpcResult> {
    if (method !== "tools/call") {
      return { ok: false, reason: `CalDAV bridge: unsupported MCP method ${method}` };
    }
    const name = typeof params.name === "string" ? params.name : "";
    const args =
      params.arguments && typeof params.arguments === "object"
        ? (params.arguments as Record<string, unknown>)
        : {};
    try {
      switch (name) {
        case "list_events":
          return { ok: true, result: await this.listEvents(args) };
        case "get_event":
          return { ok: true, result: await this.getEvent(args) };
        case "create_event":
          return { ok: true, result: await this.createEvent(args) };
        case "update_event":
          return { ok: true, result: await this.updateEvent(args) };
        case "delete_event":
          return { ok: true, result: await this.deleteEvent(args) };
        default:
          return { ok: false, reason: `CalDAV bridge: unknown tool: ${name}` };
      }
    } catch (err) {
      // Drop the cached client on any error so the next call
      // re-discovers the principal/calendars.
      this.clientPromise = null;
      return { ok: false, reason: `caldav ${name}: ${(err as Error).message}` };
    }
  }

  private getClient(): Promise<DAVClient> {
    if (!this.clientPromise) {
      this.clientPromise = this.clientFactory({
        serverUrl: this.serverUrl,
        credentials: { username: this.username, password: this.password },
      });
    }
    return this.clientPromise;
  }

  private async resolvePrimaryCalendar(client: DAVClient): Promise<{
    url: string;
    displayName?: string;
  }> {
    // Explicit override — caller knows the calendar URL directly.
    if (this.defaultCalendarId?.startsWith("http")) {
      return { url: this.defaultCalendarId };
    }

    // Google CalDAV doesn't expose the standard current-user-principal
    // response that tsdav's discovery flow expects, so
    // client.fetchCalendars() throws "cannot find principalUrl"
    // before any calendar is returned. Bypass discovery on Google by
    // constructing the per-user events URL directly — the format is
    // documented and stable. Other CalDAV providers (Fastmail,
    // iCloud, self-hosted Radicale/Baikal) speak the discovery
    // protocol correctly and use the fetchCalendars() path below.
    if (/googleusercontent\.com|google\.com\/calendar/.test(this.serverUrl)) {
      return {
        url: `https://apidata.googleusercontent.com/caldav/v2/${encodeURIComponent(this.username)}/events/`,
      };
    }

    const calendars = await client.fetchCalendars();
    if (!calendars || calendars.length === 0) {
      throw new Error("no calendars available on this account");
    }
    if (this.defaultCalendarId) {
      const match = calendars.find(
        (c) => c.url === this.defaultCalendarId || c.displayName === this.defaultCalendarId,
      );
      if (match) {
        return { url: match.url, displayName: stringOrUndef(match.displayName) };
      }
    }
    // Prefer the calendar whose URL contains the user's email — that
    // is Google's convention for the primary calendar. Otherwise the
    // first calendar in the listing is usually primary.
    const lowerUser = this.username.toLowerCase();
    const primary = calendars.find((c) =>
      typeof c.url === "string" ? c.url.toLowerCase().includes(lowerUser) : false,
    );
    const chosen = primary ?? calendars[0];
    return { url: chosen.url, displayName: stringOrUndef(chosen.displayName) };
  }

  // Fetch calendar objects against the resolved calendar URL. On
  // Google we bypass tsdav entirely and speak raw RFC-4791 CalDAV
  // REPORT over fetch — three earlier attempts to make tsdav work
  // against Google all failed (cannot find principalUrl during
  // discovery; 401 with the standalone fetchCalendarObjects even
  // when the same credentials worked against IMAP and CardDAV).
  // On other providers (Fastmail / iCloud / self-hosted) we keep
  // the high-level client.fetchCalendarObjects path.
  private async fetchObjectsForPrimary(timeRange?: {
    start: Date;
    end: Date;
  }): Promise<DAVObject[]> {
    if (isGoogleCalDavUrl(this.serverUrl)) {
      return this.googleCalendarReport(timeRange);
    }
    const client = await this.getClient();
    const cal = await this.resolvePrimaryCalendar(client);
    // tsdav 2.x tightened fetchCalendarObjects:
    // - `calendar` must be the full DAVCalendar shape, not just a `{ url }` literal.
    // - `timeRange` switched from Date to ISO-string. Format here so the call site
    //   stays Date-based for callers.
    return client.fetchCalendarObjects({
      calendar: cal as unknown as Parameters<typeof client.fetchCalendarObjects>[0]["calendar"],
      ...(timeRange
        ? {
            timeRange: {
              start: timeRange.start.toISOString(),
              end: timeRange.end.toISOString(),
            },
          }
        : {}),
    });
  }

  // Raw RFC-4791 calendar-query REPORT against Google's events
  // collection. Sends Authorization: Basic explicitly and parses the
  // multistatus response by extracting every <X:calendar-data>
  // element regardless of namespace prefix. iCal time-range values
  // must be in iCalendar UTC form (YYYYMMDDTHHMMSSZ), NOT ISO 8601
  // with dashes — Google rejects with "invalid timeRange format".
  private async googleCalendarReport(timeRange?: { start: Date; end: Date }): Promise<DAVObject[]> {
    // The "modern" apidata.googleusercontent.com/caldav/v2/ endpoint
    // requires OAuth 2.0 and rejects HTTP Basic + app password with
    // a generic 401. The legacy www.google.com/calendar/dav/ endpoint
    // is still alive specifically for HTTP-Basic + app-password
    // clients — DAVx5, Thunderbird Lightning, and Apple Calendar's
    // legacy compatibility mode all route through it. We use the
    // legacy URL here because we authenticate with the same
    // app-specific password that already worked for IMAP, SMTP,
    // and CardDAV elsewhere in the bridge stack.
    const calUrl = `https://www.google.com/calendar/dav/${this.username}/events`;
    const auth = Buffer.from(`${this.username}:${this.password}`, "utf8").toString("base64");
    const timeFilter = timeRange
      ? `<C:time-range start="${icalTime(timeRange.start)}" end="${icalTime(timeRange.end)}"/>`
      : "";
    const reportBody =
      `<?xml version="1.0" encoding="utf-8"?>` +
      `<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">` +
      `<D:prop><D:getetag/><C:calendar-data/></D:prop>` +
      `<C:filter><C:comp-filter name="VCALENDAR">` +
      `<C:comp-filter name="VEVENT">${timeFilter}</C:comp-filter>` +
      `</C:comp-filter></C:filter>` +
      `</C:calendar-query>`;
    const res = await fetch(calUrl, {
      method: "REPORT",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/xml; charset=utf-8",
        Depth: "1",
        Accept: "application/xml, text/xml",
      },
      body: reportBody,
    });
    if (!res.ok) {
      const snippet = (await res.text()).slice(0, 200);
      throw new Error(`Google CalDAV REPORT ${calUrl}: HTTP ${res.status} ${snippet}`);
    }
    const text = await res.text();
    const objects: DAVObject[] = [];
    const re = /<[A-Za-z][\w-]*:calendar-data[^>]*>([\s\S]*?)<\/[A-Za-z][\w-]*:calendar-data>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const data = decodeXmlEntities(m[1].trim());
      if (data.includes("BEGIN:VCALENDAR")) {
        objects.push({ url: "", etag: "", data } as unknown as DAVObject);
      }
    }
    return objects;
  }

  private async listEvents(args: Record<string, unknown>): Promise<{
    events: ReadonlyArray<EventSummary>;
  }> {
    const start = parseIso(args.start, "start", defaultStart());
    const end = parseIso(args.end, "end", defaultEnd(start));
    const maxResults =
      typeof args.maxResults === "number" && args.maxResults > 0
        ? Math.min(Math.floor(args.maxResults), 100)
        : 25;

    const objects = await this.fetchObjectsForPrimary({ start, end });

    const events: EventSummary[] = [];
    for (const obj of objects) {
      const parsed = safeParse(obj);
      for (const vevent of parsed) {
        events.push(toSummary(vevent));
        if (events.length >= maxResults) {
          break;
        }
      }
      if (events.length >= maxResults) {
        break;
      }
    }
    // Stable ordering: ascending start time.
    events.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
    return { events: Object.freeze(events) };
  }

  private async getEvent(args: Record<string, unknown>): Promise<EventDetail> {
    const eventId = typeof args.eventId === "string" ? args.eventId.trim() : "";
    if (!eventId) {
      throw new Error("eventId is required");
    }

    // Without a UID-filtered REPORT (not exposed by tsdav's high-level
    // API), walk the calendar. Bounded scan: the secretary's lookups
    // are for events the user has already named in a thread context,
    // so the calendar is rarely large.
    const objects = await this.fetchObjectsForPrimary();
    for (const obj of objects) {
      const parsed = safeParse(obj);
      for (const vevent of parsed) {
        const event = new ICAL.Event(vevent);
        if (event.uid === eventId) {
          return toDetail(vevent);
        }
      }
    }
    throw new Error(`event ${eventId} not found in primary calendar`);
  }

  // --- write side ---------------------------------------------------
  //
  // For Google we PUT/DELETE the .ics resource directly against the
  // legacy www.google.com/calendar/dav/ endpoint that already works
  // for our REPORT calls (HTTP Basic + app-password). For non-Google
  // providers we delegate to tsdav's createCalendarObject /
  // updateCalendarObject / deleteCalendarObject so users of Fastmail /
  // iCloud / self-hosted CalDAV keep the high-level path.

  private async createEvent(args: Record<string, unknown>): Promise<CreateEventOutput> {
    const input = parseCreateEventInput(args);
    const uid = crypto.randomUUID();
    const ics = buildVCalendar({ ...input, uid, organizer: this.username });
    if (isGoogleCalDavUrl(this.serverUrl)) {
      const url = `https://www.google.com/calendar/dav/${this.username}/events/${uid}.ics`;
      process.stderr.write(
        `[caldav info] create_event PUT ${url}\n` +
          `[caldav info] body=${ics.replace(/\r?\n/g, " | ").slice(0, 600)}\n`,
      );
      await this.googleEventPut(url, ics, { ifNoneMatch: true });
      // Verify: a successful HTTP 2xx on PUT does not guarantee that
      // Google actually persisted the event (a malformed iCal body
      // can be accepted server-side but never appear in the user's
      // calendar view). Read it back. If the GET fails or returns a
      // body without our UID, throw — the runtime then surfaces an
      // irreversible.error and the reply LLM sees ok=false instead
      // of confidently claiming the booking landed.
      await this.googleEventVerify(url, uid);
      return Object.freeze({ eventId: uid, url });
    }
    const client = await this.getClient();
    const cal = await this.resolvePrimaryCalendar(client);
    await client.createCalendarObject({
      calendar: { url: cal.url },
      filename: `${uid}.ics`,
      iCalString: ics,
    });
    return Object.freeze({ eventId: uid, url: `${cal.url.replace(/\/$/, "")}/${uid}.ics` });
  }

  private async updateEvent(args: Record<string, unknown>): Promise<UpdateEventOutput> {
    const eventId = typeof args.eventId === "string" ? args.eventId.trim() : "";
    if (!eventId) {
      throw new Error("eventId is required");
    }
    const input = parseCreateEventInput(args);
    const ics = buildVCalendar({ ...input, uid: eventId, organizer: this.username });
    if (isGoogleCalDavUrl(this.serverUrl)) {
      const url = `https://www.google.com/calendar/dav/${this.username}/events/${eventId}.ics`;
      // No If-Match: caller asserted the eventId — we accept whatever
      // version is on the server and replace it. Google returns 201 on
      // create and 204 on overwrite; both are success.
      await this.googleEventPut(url, ics, { ifNoneMatch: false });
      return Object.freeze({ eventId, url });
    }
    const client = await this.getClient();
    const cal = await this.resolvePrimaryCalendar(client);
    const url = `${cal.url.replace(/\/$/, "")}/${eventId}.ics`;
    await client.updateCalendarObject({
      calendarObject: { url, etag: "", data: ics },
    });
    return Object.freeze({ eventId, url });
  }

  private async deleteEvent(args: Record<string, unknown>): Promise<DeleteEventOutput> {
    const eventId = typeof args.eventId === "string" ? args.eventId.trim() : "";
    if (!eventId) {
      throw new Error("eventId is required");
    }
    if (isGoogleCalDavUrl(this.serverUrl)) {
      const url = `https://www.google.com/calendar/dav/${this.username}/events/${eventId}.ics`;
      const auth = Buffer.from(`${this.username}:${this.password}`, "utf8").toString("base64");
      const res = await fetch(url, {
        method: "DELETE",
        headers: { Authorization: `Basic ${auth}` },
      });
      // 404 on delete is fine — the caller's invariant ("event is gone")
      // already holds. Anything else is a real failure.
      if (!res.ok && res.status !== 404) {
        const snippet = (await res.text()).slice(0, 200);
        throw new Error(`Google CalDAV DELETE ${url}: HTTP ${res.status} ${snippet}`);
      }
      return Object.freeze({ eventId, deleted: true as const });
    }
    const client = await this.getClient();
    const cal = await this.resolvePrimaryCalendar(client);
    const url = `${cal.url.replace(/\/$/, "")}/${eventId}.ics`;
    await client.deleteCalendarObject({
      calendarObject: { url, etag: "", data: "" },
    });
    return Object.freeze({ eventId, deleted: true as const });
  }

  private async googleEventPut(
    url: string,
    ics: string,
    opts: { ifNoneMatch: boolean },
  ): Promise<void> {
    const auth = Buffer.from(`${this.username}:${this.password}`, "utf8").toString("base64");
    const headers: Record<string, string> = {
      Authorization: `Basic ${auth}`,
      "Content-Type": "text/calendar; charset=utf-8",
    };
    if (opts.ifNoneMatch) {
      // Refuse to clobber an existing event with the same UID on create.
      headers["If-None-Match"] = "*";
    }
    const res = await fetch(url, { method: "PUT", headers, body: ics });
    if (!res.ok) {
      const snippet = (await res.text()).slice(0, 200);
      throw new Error(`Google CalDAV PUT ${url}: HTTP ${res.status} ${snippet}`);
    }
  }

  // GET the just-PUT event and confirm Google really stored it. The
  // returned body should be an iCalendar resource containing UID:<uid>.
  // If GET fails OR returns something without our UID, throw so the
  // runtime treats the create as failed. This is the load-bearing
  // anti-hallucination check: the reply LLM is told to claim a
  // booking ONLY when the tool result says ok=true, and this verify
  // step is what makes ok=true actually mean "Google has it."
  private async googleEventVerify(url: string, uid: string): Promise<void> {
    const auth = Buffer.from(`${this.username}:${this.password}`, "utf8").toString("base64");
    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "text/calendar, application/calendar+xml",
        },
      });
    } catch (err) {
      throw new Error(`Google CalDAV verify GET ${url} threw: ${(err as Error).message}`, {
        cause: err,
      });
    }
    if (!res.ok) {
      const snippet = (await res.text()).slice(0, 200);
      throw new Error(
        `Google CalDAV verify GET ${url}: HTTP ${res.status} — the PUT was accepted ` +
          `but the event did not persist server-side. Response: ${snippet}`,
      );
    }
    const body = await res.text();
    if (!body.includes(`UID:${uid}`)) {
      throw new Error(
        `Google CalDAV verify GET ${url}: 200 but body has no UID:${uid} ` +
          `(${body.length} bytes). Google accepted the PUT but did not persist the event ` +
          `in a readable form. Body preview: ${body.slice(0, 200)}`,
      );
    }
    process.stderr.write(`[caldav info] create_event verified uid=${uid} via GET ${url}\n`);
  }
}

// Escape a TEXT-typed iCal property value (RFC 5545 §3.3.11):
// backslash, semicolon, comma, and newlines must be escaped.
function icalEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function parseCreateEventInput(args: Record<string, unknown>): CreateEventInput {
  const summary = typeof args.summary === "string" ? args.summary.trim() : "";
  const start = typeof args.start === "string" ? args.start.trim() : "";
  const end = typeof args.end === "string" ? args.end.trim() : "";
  if (!summary) {
    throw new Error("summary is required");
  }
  if (!start || Number.isNaN(Date.parse(start))) {
    throw new Error("start must be an ISO 8601 datetime");
  }
  if (!end || Number.isNaN(Date.parse(end))) {
    throw new Error("end must be an ISO 8601 datetime");
  }
  if (Date.parse(end) <= Date.parse(start)) {
    throw new Error("end must be after start");
  }
  const description = typeof args.description === "string" ? args.description : undefined;
  const location = typeof args.location === "string" ? args.location : undefined;
  const attendees = Array.isArray(args.attendees)
    ? (args.attendees as unknown[])
        .filter((x): x is string => typeof x === "string" && x.includes("@"))
        .map((x) => x.trim())
    : undefined;
  const recurrence = normalizeRrule(args.recurrence);
  const timezone = normalizeTimezone(args.timezone);
  return Object.freeze({
    summary,
    start,
    end,
    ...(description !== undefined ? { description } : {}),
    ...(location !== undefined ? { location } : {}),
    ...(attendees !== undefined ? { attendees: Object.freeze(attendees) } : {}),
    ...(recurrence !== undefined ? { recurrence } : {}),
    ...(timezone !== undefined ? { timezone } : {}),
  });
}

/** Validate an IANA timezone identifier. Accepts only well-formed
 *  Olson zone names that Node's Intl.DateTimeFormat can resolve;
 *  returns undefined for anything else so the bridge falls back to
 *  UTC encoding. */
export function normalizeTimezone(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const tz = raw.trim();
  if (!tz) return undefined;
  // Coarse shape check before the (relatively expensive) Intl
  // resolution call: Olson names look like Region/City or Etc/<X>.
  if (!/^[A-Za-z]+(?:\/[A-Za-z_-]+)+$/.test(tz) && tz !== "UTC") {
    return undefined;
  }
  try {
    // Will throw RangeError on unknown TZIDs.
    new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return undefined;
  }
}

/**
 * Validate and normalize an RRULE value. Accepts either a raw RRULE
 * value ("FREQ=WEEKLY;BYDAY=TU") or a full line ("RRULE:FREQ=...")
 * and returns the raw value. Returns undefined if the input is
 * missing, empty, or syntactically invalid; the bridge then treats
 * the event as a one-off rather than rejecting the whole request.
 *
 * Per RFC 5545: an RRULE is a semicolon-separated list of KEY=VALUE
 * pairs. FREQ is mandatory and must be SECONDLY / MINUTELY / HOURLY
 * / DAILY / WEEKLY / MONTHLY / YEARLY. This validator is intentionally
 * permissive on the value side (the server is the source of truth on
 * date math); it only enforces shape and the FREQ vocabulary so an
 * obviously-broken model output does not propagate to CalDAV.
 */
export function normalizeRrule(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw
    .trim()
    .replace(/^RRULE:/i, "")
    .trim();
  if (!trimmed) return undefined;
  const parts = trimmed
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);
  let hasFreq = false;
  const FREQ_VOCAB = new Set([
    "SECONDLY",
    "MINUTELY",
    "HOURLY",
    "DAILY",
    "WEEKLY",
    "MONTHLY",
    "YEARLY",
  ]);
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq <= 0) return undefined;
    const key = p.slice(0, eq).toUpperCase();
    const val = p.slice(eq + 1);
    if (!key || !val) return undefined;
    if (key === "FREQ") {
      hasFreq = true;
      if (!FREQ_VOCAB.has(val.toUpperCase())) return undefined;
    }
  }
  if (!hasFreq) return undefined;
  // Re-emit canonicalized (uppercase keys, original-case values for
  // BYDAY codes, comma lists preserved).
  return parts
    .map((p) => {
      const eq = p.indexOf("=");
      return p.slice(0, eq).toUpperCase() + "=" + p.slice(eq + 1);
    })
    .join(";");
}

export function buildVCalendar(
  input: CreateEventInput & { uid: string; organizer: string },
): string {
  // Google Calendar's web UI is stricter than RFC 5545 about which
  // fields it renders. An event without CREATED, LAST-MODIFIED,
  // SEQUENCE, STATUS, and TRANSP is accepted by the CalDAV PUT but
  // may silently not appear in the "Day / Week / Month" views, even
  // though it IS present via CalDAV REPORT. Adding them is harmless
  // and makes the event visible in the UI.
  const now = icalTime(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//enclawed//secretary//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  // When a timezone is supplied, emit a VTIMEZONE block so the server
  // can resolve the TZID without falling back to its own catalog.
  // Required by RFC 5545 strict readers; Google Calendar accepts
  // without it but emitting one is the interoperable choice.
  if (input.timezone) {
    lines.push(...buildVTimezone(input.timezone));
  }
  lines.push(
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${now}`,
    `CREATED:${now}`,
    `LAST-MODIFIED:${now}`,
    `SEQUENCE:0`,
    `STATUS:CONFIRMED`,
    `TRANSP:OPAQUE`,
  );
  if (input.timezone) {
    // DTSTART;TZID=... and DTEND;TZID=... carry the local-time form
    // (no Z suffix). The server iterates BYDAY/BYMONTHDAY rules in
    // that timezone, so an event at 17:30 PDT recurs on PDT
    // Tuesdays, not on UTC Tuesdays (= PDT Mondays).
    const startLocal = formatLocalIcalTime(new Date(input.start), input.timezone);
    const endLocal = formatLocalIcalTime(new Date(input.end), input.timezone);
    lines.push(`DTSTART;TZID=${input.timezone}:${startLocal}`);
    lines.push(`DTEND;TZID=${input.timezone}:${endLocal}`);
  } else {
    lines.push(`DTSTART:${icalTime(new Date(input.start))}`);
    lines.push(`DTEND:${icalTime(new Date(input.end))}`);
  }
  lines.push(`SUMMARY:${icalEscape(input.summary)}`);
  if (input.description) {
    lines.push(`DESCRIPTION:${icalEscape(input.description)}`);
  }
  if (input.location) {
    lines.push(`LOCATION:${icalEscape(input.location)}`);
  }
  if (input.recurrence) {
    // RRULE: line is emitted verbatim — the bridge has already
    // validated the value side via normalizeRrule(). The server
    // expands the recurrence at REPORT time.
    lines.push(`RRULE:${input.recurrence}`);
  }
  lines.push(`ORGANIZER;CN=${input.organizer}:mailto:${input.organizer}`);
  for (const email of input.attendees ?? []) {
    lines.push(
      `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=${email}:mailto:${email}`,
    );
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  // RFC 5545: lines MUST be CRLF-terminated.
  return lines.join("\r\n") + "\r\n";
}

function stringOrUndef(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function defaultStart(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function defaultEnd(start: Date): Date {
  // Default time window: 14 days forward. The secretary's
  // "sometime next week" grounding query never needs to go beyond
  // that; if a caller wants more, they pass `end` explicitly.
  const end = new Date(start.getTime());
  end.setDate(end.getDate() + 14);
  return end;
}

function parseIso(value: unknown, field: string, fallback: Date): Date {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value !== "string") {
    throw new Error(`${field} must be an ISO-8601 string`);
  }
  const t = Date.parse(value);
  if (Number.isNaN(t)) {
    throw new Error(`${field} is not a valid ISO-8601 timestamp: ${value}`);
  }
  return new Date(t);
}

function safeParse(obj: DAVObject): ICAL.Component[] {
  if (!obj || typeof obj.data !== "string" || obj.data.length === 0) {
    return [];
  }
  try {
    const jcal = ICAL.parse(obj.data);
    const root = new ICAL.Component(jcal);
    return root.getAllSubcomponents("vevent");
  } catch {
    // Skip events that fail to parse rather than failing the entire
    // listing — some servers ship malformed VTODOs alongside VEVENTs.
    return [];
  }
}

function attendeesFrom(vevent: ICAL.Component): {
  organizer: Attendee | null;
  attendees: Attendee[];
} {
  const result = { organizer: null as Attendee | null, attendees: [] as Attendee[] };
  const organizerProp = vevent.getFirstProperty("organizer");
  if (organizerProp) {
    result.organizer = propToAttendee(organizerProp);
  }
  for (const att of vevent.getAllProperties("attendee")) {
    const a = propToAttendee(att);
    if (a) {
      result.attendees.push(a);
    }
  }
  return result;
}

function propToAttendee(prop: ICAL.Property): Attendee | null {
  const raw = prop.getFirstValue();
  if (typeof raw !== "string" || !raw.startsWith("mailto:")) {
    return null;
  }
  const email = raw.slice("mailto:".length).toLowerCase();
  const name = prop.getParameter("cn");
  const status = prop.getParameter("partstat");
  return {
    email,
    ...(typeof name === "string" ? { name } : {}),
    ...(typeof status === "string" ? { status } : {}),
  };
}

function toSummary(vevent: ICAL.Component): EventSummary {
  const event = new ICAL.Event(vevent);
  const { organizer, attendees } = attendeesFrom(vevent);
  return Object.freeze({
    eventId: event.uid ?? "",
    summary: event.summary ?? "(no title)",
    start: event.startDate?.toJSDate().toISOString() ?? "",
    end: event.endDate?.toJSDate().toISOString() ?? "",
    location:
      typeof event.location === "string" && event.location.length > 0 ? event.location : null,
    organizer,
    attendees: Object.freeze(attendees),
  });
}

function toDetail(vevent: ICAL.Component): EventDetail {
  const event = new ICAL.Event(vevent);
  const { organizer, attendees } = attendeesFrom(vevent);
  const statusProp = vevent.getFirstPropertyValue("status");
  return Object.freeze({
    eventId: event.uid ?? "",
    summary: event.summary ?? "(no title)",
    description: typeof event.description === "string" ? event.description : "",
    start: event.startDate?.toJSDate().toISOString() ?? "",
    end: event.endDate?.toJSDate().toISOString() ?? "",
    location:
      typeof event.location === "string" && event.location.length > 0 ? event.location : null,
    organizer,
    attendees: Object.freeze(attendees),
    status: typeof statusProp === "string" ? statusProp : "CONFIRMED",
  });
}
