// Single source of truth for the timestamp prefix that goes in
// front of every service-log line. Rendered in the principal's
// configured TZ (process.env.TZ) so the operator can correlate
// log lines with wall-clock events without doing UTC math in
// their head while triaging.
//
// Shape: "2026-05-30 14:23:11 PDT" — fixed-width, hour-cycle h23,
// TZ abbreviation tail. The fixed width keeps `[secretary info]`
// vertically aligned across lines, which matters when grepping.

export function logTimestamp(): string {
  const tz = process.env.TZ ?? "UTC";
  const now = new Date();
  const ymdhms = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .format(now)
    .replace(",", "");
  const tzAbbr =
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      timeZoneName: "short",
    })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value ?? tz;
  return `${ymdhms} ${tzAbbr}`;
}
