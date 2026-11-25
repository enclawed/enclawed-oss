import { describe, expect, it } from "vitest";
import {
  canonicalizeSynonyms,
  expandContractions,
  passiveToActive,
  scramble,
} from "./scrambler.js";

const CURLY = String.fromCodePoint(0x2019); // right single quotation mark

describe("expandContractions", () => {
  it("expands contractions to a canonical full form", () => {
    expect(expandContractions("we don't agree")).toBe("we do not agree");
    expect(expandContractions("it's ready and that's fine")).toBe("it is ready and that is fine");
  });
  it("preserves leading capitalization", () => {
    expect(expandContractions("Don't worry")).toBe("Do not worry");
  });
  it("handles a curly apostrophe", () => {
    expect(expandContractions(`we can${CURLY}t do that`)).toBe("we cannot do that");
  });
});

describe("canonicalizeSynonyms", () => {
  it("collapses every ring member to the canonical word", () => {
    expect(canonicalizeSynonyms("a huge and massive and enormous gain")).toBe(
      "a large and large and large gain",
    );
  });
  it("preserves casing", () => {
    expect(canonicalizeSynonyms("Massive")).toBe("Large");
    expect(canonicalizeSynonyms("HUGE")).toBe("LARGE");
  });
  it("leaves words outside any ring untouched", () => {
    expect(canonicalizeSynonyms("the quarterly report")).toBe("the quarterly report");
  });
});

describe("passiveToActive", () => {
  it("normalizes an agentive passive to active voice", () => {
    expect(passiveToActive("the file was deleted by the agent")).toBe("the agent deleted the file");
  });
  it("leaves a sentence with no agentive passive untouched", () => {
    expect(passiveToActive("the agent deleted the file")).toBe("the agent deleted the file");
  });
});

describe("scramble (composite)", () => {
  it("collapses synonym, contraction and voice choices and reports findings", () => {
    const result = scramble("we couldn't see the massive defect");
    expect(result.text).toBe("we could not see the large error");
    const codes = result.findings.map((f) => f.code);
    expect(codes).toContain("contraction-expand");
    expect(codes).toContain("synonym-canonicalize");
  });

  it("is idempotent — re-scrambling a scrambled payload is a no-op", () => {
    const once = scramble("a huge issue wasn't fixed by the team").text;
    const twice = scramble(once).text;
    expect(twice).toBe(once);
  });

  it("destroys a synonym-choice covert channel — every variant maps alike", () => {
    // Three messages an attacker would use to encode different bits all
    // collapse to one canonical output, so the choice carries no information.
    const a = scramble("the result was huge").text;
    const b = scramble("the result was massive").text;
    const c = scramble("the result was enormous").text;
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("is a no-op for already-canonical text", () => {
    const result = scramble("the large error was logged");
    expect(result.text).toBe("the large error was logged");
    expect(result.findings).toHaveLength(0);
  });

  it("honors disabled transforms", () => {
    const result = scramble("a massive win", { canonicalizeSynonyms: false });
    expect(result.text).toBe("a massive win");
  });
});
