import { formatChicagoBibliography } from "../utils/chicago";
import { docToMeta, formatCitationHtml } from "../utils/documents";
import { useCorpusContext } from "../context/CorpusContext";
import "./CitationsPanel.css";

interface CitationsPanelProps {
  visible: boolean;
  onClose: () => void;
  /** docIds in order of first appearance in the document. */
  referencedDocIds: string[];
}

export function CitationsPanel({
  visible,
  onClose,
  referencedDocIds,
}: CitationsPanelProps) {
  const { byId } = useCorpusContext();

  if (!visible) return null;

  const entries = referencedDocIds
    .map((id, idx) => {
      const doc = byId(id);
      return doc ? { doc, number: idx + 1 } : null;
    })
    .filter((x): x is { doc: NonNullable<ReturnType<typeof byId>>; number: number } => x !== null);

  return (
    <div className="citations-panel" data-testid="citations-panel">
      <div className="citations-panel__header">
        <h3>Bibliography</h3>
        <button className="citations-panel__close" onClick={onClose} data-testid="citations-close">
          ×
        </button>
      </div>
      <div className="citations-panel__body">
        {entries.length === 0 && (
          <p className="citations-panel__empty">
            Insert fragments to generate citations
          </p>
        )}
        {entries.map(({ doc, number }) => {
          const citation = formatChicagoBibliography(docToMeta(doc));
          return (
            <div
              key={doc.id}
              id={`citation-${doc.id}`}
              className="citations-panel__entry"
            >
              <span className="citations-panel__number">{number}.</span>
              <span
                className="citations-panel__text"
                dangerouslySetInnerHTML={{ __html: formatCitationHtml(citation) }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
