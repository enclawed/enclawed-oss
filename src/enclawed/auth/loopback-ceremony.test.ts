import http from "node:http";
import net from "node:net";
import os from "node:os";
import { describe, expect, it } from "vitest";
import {
  WSL_FORWARDING_HELP,
  browserCommand,
  detectBrowserHost,
  detectWslInterop,
  openBrowser,
  probeWslLocalhost,
} from "./browser-open.js";
import {
  CeremonyError,
  type LoopbackCeremonyRequest,
  type LoopbackServer,
  ceremonyPage,
  decideRequest,
  isLoopbackOrigin,
  parseCeremonyPost,
  startLoopbackCeremony,
} from "./loopback-ceremony.js";
import { PasskeyUnavailableError, loopbackPasskeyCeremony } from "./passkey.js";

const GET_REQ: LoopbackCeremonyRequest = {
  kind: "get",
  challenge: new Uint8Array(32).fill(7),
  allowCredentialIds: [new Uint8Array([1, 2, 3])],
  title: "Confirm: session-start",
};

type Reply = { status: number; headers: http.IncomingHttpHeaders; body: string };

function request(
  port: number,
  p: {
    method?: string;
    path: string;
    headers?: Record<string, string>;
    body?: string;
    host?: string;
  },
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: p.host ?? "127.0.0.1",
        port,
        method: p.method ?? "GET",
        path: p.path,
        headers: { host: `localhost:${port}`, ...p.headers },
        agent: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString(),
          }),
        );
      },
    );
    req.on("error", reject);
    if (p.body !== undefined) {
      req.write(p.body);
    }
    req.end();
  });
}

const pathOf = (s: LoopbackServer) => new URL(s.url).pathname;

function getAnswer(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    kind: "get",
    id: "AQID",
    clientDataJSON: Buffer.from('{"type":"webauthn.get"}').toString("base64url"),
    authenticatorData: "AAAA",
    signature: "BBBB",
    ...extra,
  });
}

async function rejection(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    return err instanceof CeremonyError ? err.code : String(err);
  }
  return "resolved";
}

describe("loopback ceremony server", () => {
  it("listens on 127.0.0.1 only, as http://localhost:<port>/<32 random bytes>", async () => {
    const s = await startLoopbackCeremony(GET_REQ, { timeoutMs: 10_000 });
    try {
      expect(s.origin).toBe(`http://localhost:${s.port}`);
      expect(s.url).toMatch(/^http:\/\/localhost:\d+\/[A-Za-z0-9_-]{43}$/);
      expect(isLoopbackOrigin(s.origin)).toBe(true);
      // A connection to the same port on a non-loopback address of this host is refused.
      const external = Object.values(os.networkInterfaces())
        .flat()
        .find((i) => i && i.family === "IPv4" && !i.internal)?.address;
      if (external) {
        const code = await new Promise<string>((resolve) => {
          const sock = net.connect({ host: external, port: s.port });
          sock.on("connect", () => {
            sock.destroy();
            resolve("connected");
          });
          sock.on("error", (e: NodeJS.ErrnoException) => resolve(e.code ?? "error"));
        });
        expect(code).not.toBe("connected");
      }
    } finally {
      s.close();
    }
  });

  it("serves the page once, with a nonce CSP, no caching and no framing; a second load gets nothing", async () => {
    const s = await startLoopbackCeremony(
      { ...GET_REQ, title: '<script>alert("x")</script>' },
      { timeoutMs: 10_000 },
    );
    try {
      const first = await request(s.port, { path: pathOf(s) });
      expect(first.status).toBe(200);
      expect(first.headers["content-security-policy"]).toMatch(/script-src 'nonce-[^']+'/);
      expect(first.headers["content-security-policy"]).toMatch(/frame-ancestors 'none'/);
      expect(first.headers["cache-control"]).toBe("no-store");
      expect(first.headers["x-frame-options"]).toBe("DENY");
      expect(first.body).toContain(Buffer.from(GET_REQ.challenge).toString("base64url"));
      expect(first.body).not.toContain('<script>alert("x")</script>');
      expect((await request(s.port, { path: pathOf(s) })).status).toBe(404);
    } finally {
      s.close();
    }
  });

  it("refuses a foreign Host, a wrong path and a cross-site load without spending the page", async () => {
    const s = await startLoopbackCeremony(GET_REQ, { timeoutMs: 10_000 });
    try {
      for (const host of [`127.0.0.1:${s.port}`, "evil.example", `localhost:${s.port + 1}`]) {
        expect((await request(s.port, { path: pathOf(s), headers: { host } })).status).toBe(403);
      }
      expect((await request(s.port, { path: "/" })).status).toBe(404);
      expect((await request(s.port, { path: `${pathOf(s)}x` })).status).toBe(404);
      expect(
        (await request(s.port, { path: pathOf(s), headers: { "sec-fetch-site": "cross-site" } }))
          .status,
      ).toBe(403);
      expect((await request(s.port, { path: pathOf(s) })).status).toBe(200);
    } finally {
      s.close();
    }
  });

  it("accepts one POST carrying exactly this page's Origin, returns the answer with that origin, then closes", async () => {
    const s = await startLoopbackCeremony(GET_REQ, { timeoutMs: 10_000 });
    const post = (headers: Record<string, string>) =>
      request(s.port, {
        method: "POST",
        path: pathOf(s),
        headers: { "content-type": "application/json", ...headers },
        body: getAnswer(),
      });
    expect((await post({ origin: s.origin })).status).toBe(403); // before the page
    await request(s.port, { path: pathOf(s) });
    expect((await post({ origin: "http://localhost:1" })).status).toBe(403);
    expect((await post({ origin: "null" })).status).toBe(403);
    expect((await post({})).status).toBe(403);
    expect((await post({ origin: s.origin, "content-type": "text/plain" })).status).toBe(403);
    expect((await post({ origin: s.origin, "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await post({ origin: s.origin })).status).toBe(200);
    const r = await s.result;
    expect(r.origin).toBe(s.origin);
    expect(Array.from(r.credentialId)).toEqual([1, 2, 3]);
    expect(r.kind).toBe("get");
    // Closed: nothing answers on the port any more.
    await expect(request(s.port, { path: pathOf(s) })).rejects.toThrow();
  });

  it("an error from the browser, an answer to another ceremony or an oversized answer fails the ceremony", async () => {
    for (const [body, want] of [
      [JSON.stringify({ kind: "error", name: "NotAllowedError" }), "cancelled"],
      [getAnswer({ kind: "create", attestationObject: "AA" }), "bad-result"],
      [getAnswer({ signature: "not base64url!" }), "bad-result"],
      ["x".repeat(70 * 1024), "bad-result"],
    ] as const) {
      const s = await startLoopbackCeremony(GET_REQ, { timeoutMs: 10_000 });
      await request(s.port, { path: pathOf(s) });
      await request(s.port, {
        method: "POST",
        path: pathOf(s),
        headers: { "content-type": "application/json", origin: s.origin },
        body,
      }).catch(() => undefined);
      expect(await rejection(s.result)).toBe(want);
    }
  });

  it("times out and closes", async () => {
    const s = await startLoopbackCeremony(GET_REQ, { timeoutMs: 50 });
    expect(await rejection(s.result)).toBe("timeout");
    await expect(request(s.port, { path: pathOf(s) })).rejects.toThrow();
  });

  it("drops a request from a non-loopback peer, whatever it carries", () => {
    const state = {
      path: "/t",
      host: "localhost:5",
      origin: "http://localhost:5",
      served: true,
      posted: false,
    };
    const facts = {
      method: "POST",
      url: "/t",
      host: "localhost:5",
      origin: "http://localhost:5",
      secFetchSite: "same-origin",
      contentType: "application/json",
    };
    expect(decideRequest({ ...facts, remoteAddress: "127.0.0.1" }, state).action).toBe(
      "accept-post",
    );
    expect(decideRequest({ ...facts, remoteAddress: "::1" }, state).action).toBe("accept-post");
    for (const remoteAddress of [
      "10.0.0.5",
      "172.17.0.1",
      "::ffff:10.0.0.5",
      "fe80::1",
      undefined,
    ]) {
      expect(decideRequest({ ...facts, remoteAddress }, state)).toEqual({ action: "drop" });
    }
    expect(
      decideRequest({ ...facts, remoteAddress: "127.0.0.1" }, { ...state, posted: true }),
    ).toEqual({
      action: "deny",
      status: 403,
    });
  });

  it("only exact loopback origins count", () => {
    for (const o of ["http://localhost:8080", "http://localhost:1", "http://localhost:65535"]) {
      expect(isLoopbackOrigin(o)).toBe(true);
    }
    for (const o of [
      "https://localhost:8080",
      "http://localhost",
      "http://localhost:0",
      "http://localhost:65536",
      "http://localhost:080",
      "http://127.0.0.1:8080",
      "http://localhost:8080/",
      "http://localhost.evil:8080",
    ]) {
      expect(isLoopbackOrigin(o)).toBe(false);
    }
  });

  it("the page asks for a platform authenticator with user verification and direct attestation", () => {
    const page = ceremonyPage(
      {
        kind: "create",
        challenge: new Uint8Array(32),
        userId: new Uint8Array(32),
        userName: "u",
        excludeCredentialIds: [],
        title: "t",
      },
      "n",
      1000,
    );
    expect(page).toContain('authenticatorAttachment: "platform"');
    expect(page).toContain('userVerification: "required"');
    expect(page).toContain('attestation: "direct"');
    expect(page).toContain('rp: { id: "localhost"');
    expect(() => parseCeremonyPost("{}", "create", "http://localhost:1")).toThrow(CeremonyError);
  });
});

describe("opening the browser", () => {
  const url = "http://localhost:4321/abc_DEF-1";
  it("detects WSL, Linux, macOS and Windows", () => {
    expect(
      detectBrowserHost({
        platform: "linux",
        env: { WSL_DISTRO_NAME: "Ubuntu" },
        readFile: () => null,
      }),
    ).toBe("wsl");
    expect(
      detectBrowserHost({
        platform: "linux",
        env: {},
        readFile: () => "6.6.87.2-microsoft-standard-WSL2",
      }),
    ).toBe("wsl");
    expect(detectBrowserHost({ platform: "linux", env: {}, readFile: () => "6.8.0-generic" })).toBe(
      "linux",
    );
    expect(detectBrowserHost({ platform: "darwin" })).toBe("darwin");
    expect(detectBrowserHost({ platform: "win32" })).toBe("win32");
  });

  it("uses xdg-open, open, start, wslview or the Windows shell", () => {
    const all = () => true;
    expect(browserCommand("linux", url, all)).toEqual({ cmd: "xdg-open", args: [url] });
    expect(browserCommand("linux", url, () => false)).toBeNull();
    expect(browserCommand("darwin", url, all)).toEqual({ cmd: "open", args: [url] });
    expect(browserCommand("wsl", url, all)).toEqual({ cmd: "wslview", args: [url] });
    expect(browserCommand("wsl", url, (c) => c === "cmd.exe")).toEqual({
      cmd: "cmd.exe",
      args: ["/d", "/c", "start", '""', url],
      cwd: "/mnt/c",
    });
    expect(browserCommand("win32", url, all)?.cmd).toBe("cmd.exe");
  });

  it("never hands a URL with shell characters to an opener", () => {
    for (const bad of [
      `${url}&calc`,
      "http://evil.example/x",
      `${url}"`,
      "http://localhost:1/a b",
      "javascript:alert(1)",
    ]) {
      for (const host of ["linux", "darwin", "wsl", "win32"] as const) {
        expect(browserCommand(host, bad, () => true)).toBeNull();
      }
    }
  });

  it("opens through the chosen command, or reports that it could not", () => {
    const spawned: string[][] = [];
    const via = openBrowser(url, {
      platform: "linux",
      env: {},
      readFile: () => "generic",
      onPath: () => true,
      spawnDetached: (cmd, args) => {
        spawned.push([cmd, ...args]);
        return true;
      },
    });
    expect(via).toBe("xdg-open");
    expect(spawned).toEqual([["xdg-open", url]]);
    expect(
      openBrowser(url, {
        platform: "linux",
        env: {},
        readFile: () => "generic",
        onPath: () => false,
      }),
    ).toBeNull();
  });

  it("probes WSL localhost forwarding from the Windows side", () => {
    const seen: string[] = [];
    const run = (out: string | null) => (cmd: string, args: string[]) => {
      seen.push(`${cmd} ${args.join(" ")}`);
      return out;
    };
    const on = () => "on" as const;
    expect(probeWslLocalhost(4321, { interop: on, run: run("reachable\r\n") })).toBe("reachable");
    expect(probeWslLocalhost(4321, { interop: on, run: run("unreachable\r\n") })).toBe(
      "unreachable",
    );
    expect(probeWslLocalhost(4321, { interop: on, run: run(null) })).toBe("unknown");
    expect(probeWslLocalhost(4321, { interop: on, run: run("something else") })).toBe("unknown");
    expect(probeWslLocalhost(0, { interop: on, run: run("reachable") })).toBe("unknown");
    expect(seen[0]).toMatch(/^powershell\.exe .*Connect\('localhost', 4321\)/);
    // Interop off: no Windows program can start, so nothing is run and nothing is concluded.
    seen.length = 0;
    expect(probeWslLocalhost(4321, { interop: () => "off", run: run("unreachable") })).toBe(
      "unknown",
    );
    expect(seen).toEqual([]);
  });

  it("reads WSL's Windows interop from binfmt_misc", () => {
    const fsOf =
      (files: Record<string, string>) =>
      (p: string): string | null =>
        files[p] ?? null;
    const B = "/proc/sys/fs/binfmt_misc";
    const entry = "enabled\ninterpreter /init\nflags: PF\noffset 0\nmagic 4d5a\n";
    expect(
      detectWslInterop(fsOf({ [`${B}/status`]: "enabled\n", [`${B}/WSLInterop`]: entry })),
    ).toBe("on");
    expect(
      detectWslInterop(fsOf({ [`${B}/status`]: "enabled\n", [`${B}/WSLInterop-late`]: entry })),
    ).toBe("on");
    // The entry was unregistered (for example by a binfmt reset): only other formats remain.
    expect(
      detectWslInterop(fsOf({ [`${B}/status`]: "enabled\n", [`${B}/python3.12`]: "enabled\n" })),
    ).toBe("off");
    expect(
      detectWslInterop(
        fsOf({
          [`${B}/status`]: "enabled\n",
          [`${B}/WSLInterop`]: entry.replace("enabled", "disabled"),
        }),
      ),
    ).toBe("off");
    expect(
      detectWslInterop(fsOf({ [`${B}/status`]: "disabled\n", [`${B}/WSLInterop`]: entry })),
    ).toBe("off");
    // binfmt_misc not mounted or not readable: no evidence either way.
    expect(detectWslInterop(fsOf({}))).toBe("unknown");
  });

  it("under WSL without interop claims no opener (the URL is printed instead)", () => {
    const spawned: string[] = [];
    const wsl = {
      platform: "linux" as const,
      env: { WSL_DISTRO_NAME: "Ubuntu" },
      readFile: () => null,
      onPath: () => true,
      spawnDetached: (cmd: string) => {
        spawned.push(cmd);
        return true;
      },
    };
    expect(openBrowser(url, { ...wsl, interop: () => "off" })).toBeNull();
    expect(spawned).toEqual([]);
    expect(openBrowser(url, { ...wsl, interop: () => "on" })).toBe("wslview");
    expect(openBrowser(url, { ...wsl, interop: () => "unknown" })).toBe("wslview");
  });

  it("warns about WSL forwarding only when the check ran and the page is unreachable", async () => {
    const wsl = (interop: "on" | "off", out: string | null) => ({
      platform: "linux" as const,
      env: { WSL_DISTRO_NAME: "Ubuntu" },
      readFile: () => null,
      onPath: () => true,
      spawnDetached: () => true,
      interop: () => interop,
      run: () => out,
    });
    const ceremony = async (deps: ReturnType<typeof wsl>) => {
      const said: string[] = [];
      const run = loopbackPasskeyCeremony({ timeoutMs: 200, deps })(GET_REQ, (l) => said.push(l));
      const outcome = await run.then(
        () => "answered",
        (err: unknown) => err,
      );
      return { said, outcome };
    };
    // A check that could not run (interop off, PowerShell failing or saying nothing clear): silent.
    for (const deps of [wsl("off", null), wsl("on", null), wsl("on", "garbled")]) {
      const { said, outcome } = await ceremony(deps);
      expect(said.join("\n")).not.toMatch(/forwarding|reachable|interop/i);
      expect(said.some((l) => /http:\/\/localhost:\d+\//.test(l))).toBe(true);
      expect(outcome).toBeInstanceOf(CeremonyError);
    }
    // A check that ran and found the page reachable: silent too.
    expect((await ceremony(wsl("on", "reachable\r\n"))).said.join("\n")).not.toMatch(/forwarding/i);
    // A check that ran and found it unreachable: refused with the forwarding help, page never opened.
    const { said, outcome } = await ceremony(wsl("on", "unreachable\r\n"));
    expect(outcome).toBeInstanceOf(PasskeyUnavailableError);
    expect((outcome as Error).message).toBe(WSL_FORWARDING_HELP);
    expect(said).toEqual([]);
  });
});
