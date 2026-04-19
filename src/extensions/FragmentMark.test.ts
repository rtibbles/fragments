import { describe, it, expect } from "vitest";
import { computeEllipsisOffsets } from "./FragmentMark";

/**
 * Apply the ellipsis offsets the same way the clipboard code does, so we
 * can assert on the rendered string rather than the exact offsets (LCS has
 * multiple valid alignments for equivalent deletions).
 */
function applyEllipses(original: string, current: string): string {
  const offsets = computeEllipsisOffsets(original, current);
  if (offsets.length === 0) return current;
  const parts: string[] = [];
  let last = 0;
  for (const off of offsets) {
    parts.push(current.slice(last, off).replace(/\s+$/, ""));
    last = off;
  }
  parts.push(current.slice(last).replace(/^\s+/, ""));
  return parts
    .map((p, idx) => (idx > 0 ? p.replace(/^\s+/, "") : p))
    .join(" \u2026 ");
}

describe("computeEllipsisOffsets", () => {
  it("returns empty when text is unchanged", () => {
    expect(computeEllipsisOffsets("hello world", "hello world")).toEqual([]);
  });

  it("returns empty when text grew (user typed new content)", () => {
    expect(computeEllipsisOffsets("hello", "hello there")).toEqual([]);
  });

  it("returns empty when deletion reached the start", () => {
    expect(computeEllipsisOffsets("The quick fox", "quick fox")).toEqual([]);
  });

  it("returns empty when deletion reached the end", () => {
    expect(computeEllipsisOffsets("The quick fox", "The quick")).toEqual([]);
  });

  it("returns empty when user both deleted and added characters", () => {
    expect(computeEllipsisOffsets("hello world", "hello moon")).toEqual([]);
  });

  it("returns exactly one offset for a single interior deletion", () => {
    expect(
      computeEllipsisOffsets("The quick brown fox jumps", "The quick jumps"),
    ).toHaveLength(1);
  });

  it("renders a single interior deletion correctly", () => {
    expect(
      applyEllipses("The quick brown fox jumps", "The quick jumps"),
    ).toBe("The quick \u2026 jumps");
  });

  it("returns exactly two offsets for two separate mid-deletions", () => {
    expect(
      computeEllipsisOffsets(
        "A quick brown fox jumps over the lazy dog",
        "A fox the lazy dog",
      ),
    ).toHaveLength(2);
  });

  it("renders two separate mid-deletions correctly", () => {
    expect(
      applyEllipses(
        "A quick brown fox jumps over the lazy dog",
        "A fox the lazy dog",
      ),
    ).toBe("A \u2026 fox \u2026 the lazy dog");
  });

  it("handles the real-world scenario: deleting 'sparency a' from 'Transparency a'", () => {
    // original starts with "\"Transparency a...", user deletes 'sparency a' (10 chars)
    const original = '"Transparency and Opacity" (Transparence et opacité).';
    const current = '"Trannd Opacity" (Transparence et opacité).';
    // Should be a single deletion, single ellipsis.
    expect(computeEllipsisOffsets(original, current)).toHaveLength(1);
  });

  it("places ellipsis before a boundary letter that was deleted, not after (The…because bug)", () => {
    // Original: "The because"
    // User deletes 'e' (of "The"), then ' ', then 'b' → current: "Thecause"
    // The remaining 'e' in current came from "bEcause", not "thE", so the
    // ellipsis should sit between "Th" and "ecause", NOT between "The" and
    // "cause".
    expect(applyEllipses("The because", "Thecause")).toBe("Th \u2026 ecause");
  });

  it("still emits an ellipsis for a middle deletion when repeated letters make the gap ambiguous", () => {
    // Original "aaab", user deletes two 'a's from the middle → "ab".
    // Pure suffix-first would lose the ellipsis (treating it as a leading
    // deletion). The algorithm should still emit one.
    expect(computeEllipsisOffsets("aaab", "ab").length).toBeGreaterThan(0);
  });

  it("does not emit ellipses in a different fragment just because another had one", () => {
    // Two independent fragments are evaluated separately — the previous
    // bug was state leakage between adjacent calls. Belt-and-suspenders
    // check: unchanged fragment gets no offsets.
    const original1 = "The first fragment text here";
    const current1 = "The fragment text here"; // deleted "first "
    const original2 = "A totally unrelated second fragment";
    const current2 = "A totally unrelated second fragment"; // unchanged

    expect(computeEllipsisOffsets(original1, current1).length).toBeGreaterThan(0);
    expect(computeEllipsisOffsets(original2, current2)).toEqual([]);
    // Call order shouldn't matter.
    expect(computeEllipsisOffsets(original2, current2)).toEqual([]);
    expect(computeEllipsisOffsets(original1, current1).length).toBeGreaterThan(0);
  });
});
