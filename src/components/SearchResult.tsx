import { FRAGMENT_MIME_TYPE } from "../extensions/FragmentNode";
import "./SearchPanel.css";

interface SearchResultProps {
  text: string;
  sourceTitle: string;
  docId: string;
  pageNumber: number;
  score: number;
  onInsert: () => void;
}

export function SearchResult({
  text,
  sourceTitle,
  docId,
  pageNumber,
  onInsert,
}: SearchResultProps) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(
      FRAGMENT_MIME_TYPE,
      JSON.stringify({
        docId,
        sourceTitle,
        pageNumber,
        originalText: text,
        displayText: text,
        edited: false,
      }),
    );
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div
      className="search-result"
      draggable
      onDragStart={handleDragStart}
      onClick={onInsert}
    >
      <div className="search-result__text">{text}</div>
      <div className="search-result__meta">
        <span className="search-result__source">{sourceTitle}</span>
        {pageNumber > 0 && (
          <span className="search-result__page">p. {pageNumber}</span>
        )}
      </div>
    </div>
  );
}
