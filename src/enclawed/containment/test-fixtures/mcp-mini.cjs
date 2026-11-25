// Minimal MCP stdio server (newline-delimited JSON-RPC) for the containment
// tests' local stand-ins. No dependencies: the fixture directory is the
// server's whole package tree inside the containment.
"use strict";
const readline = require("node:readline");

module.exports = function serve(name, tools) {
  const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
  const rl = readline.createInterface({ input: process.stdin });
  rl.on("line", async (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.id === undefined) {
      return; // notification
    }
    if (msg.method === "initialize") {
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name, version: "1.0.0" },
        },
      });
    } else if (msg.method === "tools/list") {
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          tools: Object.entries(tools).map(([n, t]) => ({
            name: n,
            description: t.description,
            inputSchema: { type: "object" },
          })),
        },
      });
    } else if (msg.method === "tools/call") {
      const tool = tools[msg.params.name];
      try {
        const text = await tool.handler(msg.params.arguments || {});
        send({
          jsonrpc: "2.0",
          id: msg.id,
          result: { content: [{ type: "text", text: String(text) }] },
        });
      } catch (err) {
        send({
          jsonrpc: "2.0",
          id: msg.id,
          result: {
            isError: true,
            content: [{ type: "text", text: `${err.code || "Error"}: ${err.message}` }],
          },
        });
      }
    } else {
      send({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "method not found" } });
    }
  });
};
