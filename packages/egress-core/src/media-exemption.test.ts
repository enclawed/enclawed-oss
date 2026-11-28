import { afterEach, describe, expect, it } from "vitest";
import {
  hasMediaExemptionCheck,
  isMediaExempt,
  resetMediaExemption,
  setMediaExemptionCheck,
} from "./media-exemption.js";
import type { AudioPayload } from "./media.js";

const audio = (): AudioPayload => ({ sampleRate: 8000, samples: new Float32Array(8) });

afterEach(() => {
  resetMediaExemption();
});

describe("media exemption seam", () => {
  it("exempts nothing when no check is installed (fail-secure)", () => {
    expect(hasMediaExemptionCheck()).toBe(false);
    expect(isMediaExempt({ kind: "audio", payload: { ...audio(), exemption: "x" } })).toBe(false);
  });

  it("delegates to the installed check", () => {
    setMediaExemptionCheck((s) => s.kind === "audio" && s.payload.exemption === "x");
    expect(hasMediaExemptionCheck()).toBe(true);
    expect(isMediaExempt({ kind: "audio", payload: { ...audio(), exemption: "x" } })).toBe(true);
    expect(isMediaExempt({ kind: "audio", payload: audio() })).toBe(false);
  });

  it("treats a throwing check as not exempt", () => {
    setMediaExemptionCheck(() => {
      throw new Error("boom");
    });
    expect(isMediaExempt({ kind: "audio", payload: audio() })).toBe(false);
  });

  it("only accepts a literal true", () => {
    setMediaExemptionCheck(() => "yes" as unknown as boolean);
    expect(isMediaExempt({ kind: "audio", payload: audio() })).toBe(false);
  });
});
