// Dedicated weather tool. Routes through wttr.in's plain-text format,
// which is free, no API key, no signup, and returns the actual
// temperature / conditions / wind / humidity numbers as a compact
// formatted string. The model has been observed to hedge ("typical
// summer temperatures", "specific details were limited") when it
// has to extract weather from web_search snippets and read_url page
// bodies (weather.com / accuweather.com are JS SPAs that come back
// near-empty through r.jina.ai) — a dedicated, JSON-shaped backend
// removes the failure mode entirely.
//
// wttr.in `?format=4` returns one short line like:
//   "Pleasanton: 🌤  +72°F"
// `?format=j1` returns full JSON with hourly + multi-day forecast.
// We use the verbose plain-text format for the LLM (`?format=%l:+%C+%t+%h+%w+%p+%P`)
// which surfaces every field the model usually needs to compose a
// short factual reply.

import { CAPABILITY, makeCall, type GateOutcome, type SkillGate } from "enclawed/framework";

const SECRETARY_SKILL_ID = "enclawed-app-secretary";
const WTTR_ENDPOINT_PREFIX = "https://wttr.in/";
const REQUEST_TIMEOUT_MS = 10_000;

export const WEATHER_EGRESS_HOST = "wttr.in";

export type WeatherResult = Readonly<{
  /** The location the API actually resolved to (may differ from input). */
  location: string;
  /** Compact factual summary the LLM can paste verbatim into the reply. */
  summary: string;
  /** Multi-day forecast as a small text table. */
  forecast: string;
}>;

export class WeatherToolError extends Error {
  constructor(public readonly outcome: GateOutcome) {
    super(`weather dispatch ${outcome.kind}`);
    this.name = "WeatherToolError";
  }
}

export class WeatherTool {
  private readonly gate: SkillGate;
  private readonly log: (level: "info" | "warn" | "error", msg: string) => void;

  constructor(opts: {
    gate: SkillGate;
    log?: (level: "info" | "warn" | "error", msg: string) => void;
  }) {
    this.gate = opts.gate;
    this.log =
      opts.log ??
      ((level, msg) => {
        const stream = level === "info" ? process.stdout : process.stderr;
        stream.write(`[weather ${level}] ${msg}\n`);
      });
  }

  async lookup(location: string): Promise<WeatherResult> {
    const loc = location.trim();
    if (!loc) {
      throw new Error("weather: location is required");
    }
    if (loc.length > 200) {
      throw new Error("weather: location exceeds 200 chars");
    }
    const target = `weather:${encodeURIComponent(loc)}`;
    const call = makeCall({
      cap: CAPABILITY.FS_READ,
      target,
      args: { location: loc },
    });

    let captured: WeatherResult = { location: loc, summary: "", forecast: "" };
    const outcome = await this.gate.dispatch({
      skillId: SECRETARY_SKILL_ID,
      call,
      execute: async () => {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
        try {
          // Compact "now" summary: location, conditions, temp, humidity,
          // wind, precipitation, pressure. wttr.in interpolates %l for
          // resolved location, %C for conditions text, %t for temperature
          // with the +unit suffix, %h humidity, %w wind, %p precipitation,
          // %P pressure.
          const summaryUrl =
            WTTR_ENDPOINT_PREFIX +
            encodeURIComponent(loc) +
            "?format=%l:+%C,+%t,+humidity+%h,+wind+%w,+precip+%p,+pressure+%P";
          const summaryResp = await fetch(summaryUrl, {
            method: "GET",
            headers: {
              Accept: "text/plain",
              "User-Agent": "enclawed-secretary/1.0 (+https://www.enclawed.com)",
            },
            signal: ctrl.signal,
          });
          if (!summaryResp.ok) {
            return { ok: false as const, reason: `wttr HTTP ${summaryResp.status}` };
          }
          const summary = (await summaryResp.text()).trim();
          if (!summary || /unknown location/i.test(summary)) {
            return {
              ok: false as const,
              reason: `wttr: could not resolve "${loc}"`,
            };
          }

          // Multi-day forecast: wttr.in's default ASCII output trimmed
          // to plain text. `?format=3` gives one line per day with
          // condition+min/max temp; we use `?T&n` to get a narrow,
          // text-only forecast table (no ASCII art, no color).
          const forecastUrl = WTTR_ENDPOINT_PREFIX + encodeURIComponent(loc) + "?T&n&Q";
          const forecastResp = await fetch(forecastUrl, {
            method: "GET",
            headers: {
              Accept: "text/plain",
              "User-Agent": "enclawed-secretary/1.0 (+https://www.enclawed.com)",
            },
            signal: ctrl.signal,
          });
          const forecast = forecastResp.ok ? (await forecastResp.text()).trim().slice(0, 4000) : "";

          captured = { location: loc, summary, forecast };
          return { ok: true as const };
        } catch (err) {
          return {
            ok: false as const,
            reason: `weather: ${(err as Error).message ?? "fetch failed"}`,
          };
        } finally {
          clearTimeout(timeout);
        }
      },
    });
    if (outcome.kind !== "executed") {
      throw new WeatherToolError(outcome);
    }
    this.log("info", `weather: location=${loc.slice(0, 40)} → ${captured.summary.slice(0, 100)}`);
    return captured;
  }
}
