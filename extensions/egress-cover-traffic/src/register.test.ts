import { describe, expect, it } from "vitest";
import entry from "../index.js";

describe("egress-cover-traffic registration", () => {
  it("feeds successful real channel sends into the cover scheduler", () => {
    const handlers: Record<string, (event: { success: boolean }) => void> = {};
    let service: { noteRealEgress: () => void } | undefined;
    entry.register({
      pluginConfig: {},
      registerService: (s: { noteRealEgress: () => void }) => {
        service = s;
      },
      on: (name: string, handler: (event: { success: boolean }) => void) => {
        handlers[name] = handler;
      },
    } as never);
    expect(service).toBeDefined();
    let noted = 0;
    service!.noteRealEgress = () => {
      noted++;
    };
    handlers.message_sent!({ success: true });
    handlers.message_sent!({ success: false });
    expect(noted).toBe(1);
  });
});
