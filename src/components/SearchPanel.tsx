import { useMemo, useState } from "react";
import { SearchResult } from "./SearchResult";
import { useCorpusContext } from "../context/CorpusContext";
import { carveSnippet } from "../utils/search";
import type { SearchHit } from "../types/corpus";
import type { FragmentAttrs } from "../extensions/FragmentNode";
import "./SearchPanel.css";

const SEARCH_LIMIT = 50;

interface SearchPanelProps {
  onInsertFragment?: (attrs: FragmentAttrs) => void;
}

export function SearchPanel({ onInsertFragment }: SearchPanelProps) {
  const { documents, miniSearch, byId } = useCorpusContext();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const d of documents) if (d.category) set.add(d.category);
    return Array.from(set).sort();
  }, [documents]);

  const hits: SearchHit[] = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return [];
    type StoredResult = {
      score: number;
      docId: string;
      page: number;
      text: string;
      match: Record<string, unknown>;
    };
    const raw = miniSearch.search(trimmed) as unknown as StoredResult[];
    const withDoc = raw
      .map((r) => ({ r, doc: byId(r.docId) }))
      .filter((x): x is { r: StoredResult; doc: NonNullable<ReturnType<typeof byId>> } =>
        x.doc !== undefined,
      );
    const filtered = category === "all"
      ? withDoc
      : withDoc.filter((x) => x.doc.category === category);
    return filtered.slice(0, SEARCH_LIMIT).map(({ r, doc }) => ({
      docId: doc.id,
      page: r.page,
      text: r.text,
      extract: carveSnippet(r.text, Object.keys(r.match ?? {})),
      score: r.score,
      sourceTitle: doc.title,
    }));
  }, [query, category, miniSearch, byId]);

  const handleInsert = (hit: SearchHit) => {
    onInsertFragment?.({
      docId: hit.docId,
      sourceTitle: hit.sourceTitle,
      pageNumber: hit.page,
      originalText: hit.extract,
      displayText: hit.extract,
      edited: false,
    });
  };

  const showingEmpty = !query.trim();
  const showingNoResults = query.trim() && hits.length === 0;

  return (
    <div className="search-panel" data-testid="search-panel">
      <div className="search-panel__header">
        <input
          className="search-panel__input"
          data-testid="search-input"
          type="text"
          placeholder="Search fragments..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="search-panel__filter">
          <label className="search-panel__filter-label">
            Category
            <select
              data-testid="search-category-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="all">All</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="search-panel__results" data-testid="search-results">
        {showingEmpty && (
          <p className="search-panel__empty">Search your corpus to find fragments</p>
        )}
        {showingNoResults && (
          <p className="search-panel__empty">No results found</p>
        )}
        {hits.map((hit) => (
          <SearchResult
            key={`${hit.docId}:${hit.page}`}
            text={hit.extract}
            sourceTitle={hit.sourceTitle}
            docId={hit.docId}
            pageNumber={hit.page}
            score={hit.score}
            onInsert={() => handleInsert(hit)}
          />
        ))}
      </div>
    </div>
  );
}
