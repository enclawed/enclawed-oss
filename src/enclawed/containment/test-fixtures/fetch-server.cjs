// Stand-in for an HTTP-calling MCP server (a weather/fetch API client).
"use strict";
const https = require("node:https");
const serve = require("./mcp-mini.cjs");
const get = (host, p) =>
  new Promise((resolve, reject) => {
    https
      .get(
        { host, path: p, headers: { authorization: `Bearer ${process.env.WEATHER_API_KEY}` } },
        (res) => {
          let t = "";
          res.on("data", (c) => (t += c));
          res.on("end", () =>
            res.statusCode === 200 ? resolve(t) : reject(new Error(`HTTP ${res.statusCode}: ${t}`)),
          );
        },
      )
      .on("error", reject);
  });
serve("weather", {
  forecast: {
    description: "forecast",
    handler: (a) => get("api.weather.test", `/v1/forecast?city=${encodeURIComponent(a.city)}`),
  },
  fetch_url: {
    description: "fetch a URL",
    handler: (a) => {
      const u = new URL(a.url);
      return get(u.hostname, u.pathname + u.search);
    },
  },
});
