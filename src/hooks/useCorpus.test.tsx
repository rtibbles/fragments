import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useCorpus } from "./useCorpus";

const sampleCorpus = {
  generated_at: "2026-04-18T00:00:00Z",
  documents: [
    {
      id: "a1b2c3d4e5f6",
      title: "Poetics of Relation",
      subtitle: null,
      authors: [{ firstName: "Édouard", lastName: "Glissant" }],
      year: 1997,
      publisher: "University of Michigan Press",
      type: "book",
      editor_translator: "Translated by Betsy Wing",
      journal_or_source: null,
      doi: null,
      isbn: null,
      url: null,
      category: "opacity_refusal",
      sections_cited: [1, 3],
      why_cited: "Core chapter.",
      chunks: [
        { page: 1, text: "The right to opacity for everyone." },
        { page: 42, text: "Errancy is not wandering without purpose." },
      ],
    },
  ],
};

beforeEach(() => {
  vi.restoreAllMocks();
});

function mockFetchSuccess(payload: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => payload,
  }));
}

function mockFetchFailure() {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
}

describe("useCorpus", () => {
  it("starts in loading state", () => {
    mockFetchSuccess(sampleCorpus);
    const { result } = renderHook(() => useCorpus());
    expect(result.current.status).toBe("loading");
  });

  it("resolves to ready with indexed documents", async () => {
    mockFetchSuccess(sampleCorpus);
    const { result } = renderHook(() => useCorpus());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    if (result.current.status !== "ready") throw new Error("expected ready");
    expect(result.current.documents).toHaveLength(1);
    expect(result.current.byId("a1b2c3d4e5f6")?.title).toBe("Poetics of Relation");
    const hits = result.current.miniSearch.search("opacity");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("enters error state on fetch failure", async () => {
    mockFetchFailure();
    const { result } = renderHook(() => useCorpus());
    await waitFor(() => expect(result.current.status).toBe("error"));
  });

  it("retry() re-fetches after an error", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce({ ok: true, json: async () => sampleCorpus });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useCorpus());
    await waitFor(() => expect(result.current.status).toBe("error"));
    result.current.retry();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
