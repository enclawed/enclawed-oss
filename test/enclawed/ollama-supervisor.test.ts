// The bundled inference engine: isolation, detection, and progress.
//
// The engine ships inside the application package, so this module owns its
// lifetime. What the tests pin is that running it never disturbs a machine
// that already has one — a real risk, because the engine's default port and
// model directory are shared by every install on the box.
//
// Everything here is deterministic: a stubbed fetch and a fake spawn. The
// end-to-end check against a real binary lives in the live suite.

import { describe, expect, it } from "vitest";
import {
  OllamaSupervisor,
  coexistenceAdvisory,
  detectExistingInstance,
  findFreePort,
} from "../../enclawed-apps/executive-assistant/src/tools/ollama-supervisor.ts";

/** RequestInfo is Request | string; only the string and URL forms stringify. */
function href(url: string | URL | Request): string {
  return typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("isolation from a machine's existing engine", () => {
  it("runs on a private port and a private model directory", () => {
    const env = OllamaSupervisor.environment(54321, "C:/Users/x/AppData/Local/Enclawed/models");
    // The default is 11434 and the default model store is shared. Both must
    // be overridden or the app fights with, and pollutes, the user's install.
    expect(env.OLLAMA_HOST).toBe("127.0.0.1:54321");
    expect(env.OLLAMA_HOST).not.toContain("11434");
    expect(env.OLLAMA_MODELS).toBe("C:/Users/x/AppData/Local/Enclawed/models");
  });

  it("binds loopback, never a routable interface", () => {
    expect(OllamaSupervisor.environment(1234, "/m").OLLAMA_HOST).toMatch(/^127\.0\.0\.1:/);
  });

  it("asks the OS for a port that is actually free", async () => {
    const a = await findFreePort();
    const b = await findFreePort();
    expect(a).toBeGreaterThan(1024);
    expect(b).toBeGreaterThan(1024);
  });
});

describe("detecting an engine the user already runs", () => {
  it("reports its version and models", async () => {
    const fetchImpl = (async (url: string | URL | Request) => {
      const u = href(url);
      if (u.endsWith("/api/version")) {
        return jsonResponse({ version: "0.24.0" });
      }
      return jsonResponse({ models: [{ name: "llama3.1:8b" }, { name: "all-minilm:latest" }] });
    }) as unknown as typeof fetch;
    const found = await detectExistingInstance({ fetchImpl });
    expect(found?.version).toBe("0.24.0");
    expect(found?.models).toContain("llama3.1:8b");
  });

  it("returns null when nothing is listening, which is the common case", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    await expect(detectExistingInstance({ fetchImpl })).resolves.toBeNull();
  });

  it("still reports the instance when it answers version but not tags", async () => {
    const fetchImpl = (async (url: string | URL | Request) => {
      if (href(url).endsWith("/api/version")) {
        return jsonResponse({ version: "0.24.0" });
      }
      throw new Error("tags unavailable");
    }) as unknown as typeof fetch;
    const found = await detectExistingInstance({ fetchImpl });
    expect(found?.version).toBe("0.24.0");
    expect(found?.models).toEqual([]);
  });
});

describe("what the user is told afterwards", () => {
  const existing = {
    apiBase: "http://127.0.0.1:11434",
    version: "0.24.0",
    models: Object.freeze(["llama3.1:8b"]),
  } as const;

  it("says a second download is coming when they already have the model", () => {
    const advice = coexistenceAdvisory(existing, "llama3.1:8b");
    expect(advice.alreadyHasModel).toBe(true);
    expect(advice.message).toMatch(/second time/i);
    expect(advice.message).toMatch(/Settings/);
  });

  it("reassures rather than alarms when the model is not shared", () => {
    const advice = coexistenceAdvisory(existing, "qwen2.5:32b-instruct");
    expect(advice.alreadyHasModel).toBe(false);
    expect(advice.message).toMatch(/do not interfere|untouched/i);
  });

  it("resolves a bare model name to its default tag before comparing", () => {
    // "all-minilm" and "all-minilm:latest" are the same model; a naive
    // comparison would tell the user to download what they already have.
    const withLatest = {
      ...existing,
      models: Object.freeze(["all-minilm:latest"]),
    };
    expect(coexistenceAdvisory(withLatest, "all-minilm").alreadyHasModel).toBe(true);
  });

  it("speaks plainly, with no jargon a consumer would not know", () => {
    const msg = coexistenceAdvisory(existing, "llama3.1:8b").message;
    expect(msg).not.toMatch(/localhost:\d+|端|API|daemon|SIGTERM/);
  });
});

describe("model download progress", () => {
  function streamOf(lines: string[]): Response {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();
        for (const l of lines) {
          controller.enqueue(enc.encode(`${l}\n`));
        }
        controller.close();
      },
    });
    return new Response(body, { status: 200 });
  }

  function supervisorWith(res: Response): OllamaSupervisor {
    const sup = new OllamaSupervisor({
      binaryPath: "/nonexistent/ollama",
      modelsDir: "/tmp/models",
      fetchImpl: (async () => res) as unknown as typeof fetch,
    });
    // Pretend it started; pullModel only needs an apiBase.
    (sup as unknown as { port: number }).port = 12345;
    return sup;
  }

  it("reports byte counts, so setup can show real progress not a spinner", async () => {
    const sup = supervisorWith(
      streamOf([
        '{"status":"pulling manifest"}',
        '{"status":"pulling abc","total":45949216}',
        '{"status":"pulling abc","total":45949216,"completed":22974608}',
        '{"status":"success"}',
      ]),
    );
    const seen: Array<number | null> = [];
    await sup.pullModel("all-minilm", (p) => seen.push(p.fraction));
    expect(seen).toEqual([null, null, 0.5, null]);
  });

  it("surfaces a download failure instead of reporting success", async () => {
    const sup = supervisorWith(streamOf(['{"error":"model not found"}']));
    await expect(sup.pullModel("nope")).rejects.toThrow(/model not found/);
  });

  it("survives a malformed line mid-stream rather than failing the download", async () => {
    // A multi-gigabyte download must not die on one bad frame; the next line
    // carries the same running totals.
    const sup = supervisorWith(
      streamOf([
        '{"status":"pulling","total":100,"completed":10}',
        "{not json",
        '{"status":"success"}',
      ]),
    );
    const seen: string[] = [];
    await sup.pullModel("m", (p) => seen.push(p.status));
    expect(seen).toEqual(["pulling", "success"]);
  });
});
