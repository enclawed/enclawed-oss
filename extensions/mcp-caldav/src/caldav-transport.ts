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
import tsdav, { type DAVClient, type DAVObject } from "tsdav";
import type { JsonRpcResult } from "../../mcp-attested/src/http-transport.js";
import type { McpTransport } from "../../mcp-attested/src/server-registry.js";

// tsdav ships as CommonJS; Node's ESM static-imports can read the
// type names but not all named value exports survive the interop.
// Pull the runtime constructor off the default export instead.
const { createDAVClient } = tsdav;

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

  private async listEvents(args: Record<string, unknown>): Promise<{
    events: ReadonlyArray<EventSummary>;
  }> {
    const start = parseIso(args.start, "start", defaultStart());
    const end = parseIso(args.end, "end", defaultEnd(start));
    const maxResults =
      typeof args.maxResults === "number" && args.maxResults > 0
        ? Math.min(Math.floor(args.maxResults), 100)
        : 25;

    const client = await this.getClient();
    const cal = await this.resolvePrimaryCalendar(client);
    const objects = await client.fetchCalendarObjects({
      calendar: { url: cal.url },
      timeRange: { start, end },
    });

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

    const client = await this.getClient();
    const cal = await this.resolvePrimaryCalendar(client);
    // Without a UID-filtered REPORT (not exposed by tsdav's high-level
    // API), walk the calendar. Bounded scan: the secretary's lookups
    // are for events the user has already named in a thread context,
    // so the calendar is rarely large.
    const objects = await client.fetchCalendarObjects({
      calendar: { url: cal.url },
    });
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
