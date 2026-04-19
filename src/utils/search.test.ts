import { describe, it, expect } from "vitest";
import { snapToPunctuation } from "./search";

describe("snapToPunctuation", () => {
  it("snaps start back to a sentence stop", () => {
    const full = "First sentence. Second sentence has the target word. Third sentence.";
    const extract = "target word";
    const result = snapToPunctuation(full, extract);
    expect(result.startsWith("Second sentence")).toBe(true);
    expect(result.endsWith(".")).toBe(true);
  });

  it("snaps end forward to a sentence stop", () => {
    const full = "Intro. The target appears here and then continues for a while. More text.";
    const extract = "target";
    const result = snapToPunctuation(full, extract);
    expect(result.endsWith(".")).toBe(true);
  });

  it("prefers curly opening quote at the start", () => {
    const full = "Intro text \u201CA quoted target inside opens here\u201D afterwards.";
    const extract = "target";
    const result = snapToPunctuation(full, extract);
    expect(result.startsWith("\u201C")).toBe(true);
    expect(result.endsWith("\u201D")).toBe(true);
  });

  it("returns the extract unchanged when not found in full text", () => {
    const result = snapToPunctuation("unrelated text", "missing");
    expect(result).toBe("missing");
  });

  it("caps result at MAX_CHARS", () => {
    const long = "x".repeat(400) + " target " + "y".repeat(400);
    const result = snapToPunctuation(long, "target");
    expect(result.length).toBeLessThanOrEqual(250);
  });

  it("trims whitespace on return", () => {
    const full = "   target   ";
    expect(snapToPunctuation(full, "target").trim()).toBe(snapToPunctuation(full, "target"));
  });
});

import { carveSnippet } from "./search";

describe("carveSnippet", () => {
  it("centers a window around the first match position", () => {
    const text = "The quick brown fox jumps over the lazy dog and then some.";
    const snippet = carveSnippet(text, ["fox"]);
    expect(snippet.includes("fox")).toBe(true);
  });

  it("returns snapped result (ends at punctuation when close)", () => {
    const text = "Preamble. This sentence has the needle inside it. Epilogue.";
    const snippet = carveSnippet(text, ["needle"]);
    expect(snippet.endsWith(".")).toBe(true);
  });

  it("falls back to first 150 chars when no matches provided", () => {
    const text = "a".repeat(300);
    const snippet = carveSnippet(text, []);
    expect(snippet.length).toBeLessThanOrEqual(250);
    expect(snippet.length).toBeGreaterThan(0);
  });
});
