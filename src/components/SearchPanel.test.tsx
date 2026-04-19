import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SearchPanel } from "./SearchPanel";
import { CorpusProvider } from "../context/CorpusContext";
import { buildMiniSearch } from "../hooks/useCorpus";
import type { CorpusDocument } from "../types/corpus";

function makeDoc(overrides: Partial<CorpusDocument>): CorpusDocument {
  return {
    id: "id", title: "T", subtitle: null,
    authors: [], year: null, publisher: null, type: "book",
    editor_translator: null, journal_or_source: null,
    doi: null, isbn: null, url: null, category: null,
    sections_cited: [], why_cited: null, chunks: [],
    ...overrides,
  };
}

function renderWithCorpus(documents: CorpusDocument[]) {
  const miniSearch = buildMiniSearch(documents);
  const byIdMap = new Map(documents.map((d) => [d.id, d]));
  return render(
    <CorpusProvider
      value={{
        status: "ready",
        documents,
        miniSearch,
        byId: (id) => byIdMap.get(id),
        retry: () => {},
      }}
    >
      <SearchPanel onInsertFragment={vi.fn()} />
    </CorpusProvider>,
  );
}

function renderLoading() {
  return render(
    <CorpusProvider value={{ status: "loading", retry: () => {} }}>
      <SearchPanel onInsertFragment={vi.fn()} />
    </CorpusProvider>,
  );
}

function renderError(onRetry = () => {}) {
  return render(
    <CorpusProvider
      value={{ status: "error", error: new Error("boom"), retry: onRetry }}
    >
      <SearchPanel onInsertFragment={vi.fn()} />
    </CorpusProvider>,
  );
}

describe("SearchPanel", () => {
  it("renders no results for an empty query", () => {
    renderWithCorpus([
      makeDoc({ id: "a", title: "A", chunks: [{ page: 1, text: "alpha" }] }),
    ]);
    expect(screen.getByText(/search your corpus/i)).toBeInTheDocument();
  });

  it("shows matching results after typing", async () => {
    renderWithCorpus([
      makeDoc({ id: "a", title: "The Opacity Book", category: "opacity_refusal",
               chunks: [{ page: 1, text: "The right to opacity for everyone." }] }),
      makeDoc({ id: "b", title: "Unrelated", category: "other",
               chunks: [{ page: 1, text: "nothing to see" }] }),
    ]);
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "opacity" } });
    await waitFor(() => {
      expect(screen.getByText(/The Opacity Book/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Unrelated/i)).not.toBeInTheDocument();
  });

  it("filters by category", async () => {
    renderWithCorpus([
      makeDoc({ id: "a", title: "Opacity A", category: "opacity_refusal",
               chunks: [{ page: 1, text: "shared keyword" }] }),
      makeDoc({ id: "b", title: "Queer B", category: "queer_abstraction",
               chunks: [{ page: 1, text: "shared keyword" }] }),
    ]);
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "shared" } });
    await waitFor(() => expect(screen.getByText(/Opacity A/i)).toBeInTheDocument());
    fireEvent.change(screen.getByTestId("search-category-select"), {
      target: { value: "queer_abstraction" },
    });
    await waitFor(() => {
      expect(screen.queryByText(/Opacity A/i)).not.toBeInTheDocument();
      expect(screen.getByText(/Queer B/i)).toBeInTheDocument();
    });
  });

  it("shows a loading indicator and disables the input while corpus is loading", () => {
    renderLoading();
    expect(screen.getByTestId("search-loading")).toBeInTheDocument();
    expect(screen.getByTestId("search-input")).toBeDisabled();
    expect(
      (screen.getByTestId("search-input") as HTMLInputElement).placeholder,
    ).toMatch(/loading/i);
  });

  it("shows a retry button on corpus fetch error and calls retry on click", () => {
    const retry = vi.fn();
    renderError(retry);
    expect(screen.getByTestId("search-error")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
