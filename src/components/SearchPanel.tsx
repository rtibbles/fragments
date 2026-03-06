import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SearchResult } from "./SearchResult";
import type { SearchResultData } from "../types/search";
import "./SearchPanel.css";

interface SearchPanelProps {
  onInsertFragment?: (attrs: {
    sourceId: number;
    sourceTitle: string;
    pageNumber: number;
    originalText: string;
    displayText: string;
    edited: boolean;
    rowId: number;
  }) => void;
}

export function SearchPanel({ onInsertFragment }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [highlightsOnly, setHighlightsOnly] = useState(false);
  const [results, setResults] = useState<SearchResultData[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const doSearch = useCallback(
    async (q: string, hlOnly: boolean) => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const res = await invoke<SearchResultData[]>("search_corpus", {
          query: q,
          highlightsOnly: hlOnly,
          limit: 50,
        });
        setResults(res);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query, highlightsOnly), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, highlightsOnly, doSearch]);

  const handleInsert = (result: SearchResultData) => {
    onInsertFragment?.({
      sourceId: result.source_id,
      sourceTitle: result.source_title,
      pageNumber: result.page_number,
      originalText: result.extract,
      displayText: result.extract,
      edited: false,
      rowId: result.row_id,
    });
  };

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
            <input
              type="checkbox"
              checked={highlightsOnly}
              onChange={(e) => setHighlightsOnly(e.target.checked)}
              data-testid="search-highlights-checkbox"
            />
            Highlights only
          </label>
        </div>
      </div>
      <div className="search-panel__results" data-testid="search-results">
        {loading && <p className="search-panel__status">Searching...</p>}
        {!loading && results.length === 0 && query.trim() && (
          <p className="search-panel__empty">No results found</p>
        )}
        {!loading && results.length === 0 && !query.trim() && (
          <p className="search-panel__empty">
            Search your corpus to find fragments
          </p>
        )}
        {results.map((result) => (
          <SearchResult
            key={`${result.row_id}-${result.is_highlight}`}
            text={result.extract}
            sourceTitle={result.source_title}
            sourceId={result.source_id}
            pageNumber={result.page_number}
            isHighlight={result.is_highlight}
            rowId={result.row_id}
            score={result.score}
            onInsert={() => handleInsert(result)}
          />
        ))}
      </div>
    </div>
  );
}
