import fs from "node:fs";
// TCP <-> Unix-socket relay that lets a process inside an unprivileged network
// namespace reach the host's Ollama server (127.0.0.1:11434) and nothing else.
//
//   host side:  node ollama-bridge.mjs host <socket>  (unix socket -> 127.0.0.1:11434)
//   ns side:    node ollama-bridge.mjs ns <socket>    (127.0.0.1:11434 -> unix socket)
//
// Network namespaces do not share TCP endpoints, but they share the
// filesystem, so a Unix socket is the only path between the two.
import net from "node:net";

const [mode, sock] = process.argv.slice(2);
const OLLAMA = { host: "127.0.0.1", port: 11434 };
const pipe = (a, b) => {
  a.pipe(b);
  b.pipe(a);
  a.on("error", () => b.destroy());
  b.on("error", () => a.destroy());
};
if (mode === "host") {
  try {
    fs.unlinkSync(sock);
  } catch {}
  net
    .createServer((c) => pipe(c, net.connect(OLLAMA)))
    .listen(sock, () => console.log(`bridge host ${sock}`));
} else if (mode === "ns") {
  net
    .createServer((c) => pipe(c, net.connect(sock)))
    .listen(OLLAMA.port, OLLAMA.host, () =>
      console.log(`bridge ns 127.0.0.1:${OLLAMA.port} -> ${sock}`),
    );
} else {
  console.error("usage: ollama-bridge.mjs host|ns <socket>");
  process.exit(2);
}
