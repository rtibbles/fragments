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
  const corpus = useCorpusContext();

  if (!visible) return null;

  const byId = corpus.status === "ready" ? corpus.byId : null;

  return (
    <div className="citations-panel" data-testid="citations-panel">
      <div className="citations-panel__header">
        <h3>Bibliography</h3>
        <button className="citations-panel__close" onClick={onClose} data-testid="citations-close">
          ×
        </button>
      </div>
      <div className="citations-panel__body">
        {!byId && referencedDocIds.length > 0 && (
          <p className="citations-panel__empty">Loading corpus…</p>
        )}
        {byId && referencedDocIds.length === 0 && (
          <p className="citations-panel__empty">
            Insert fragments to generate citations
          </p>
        )}
        {byId &&
          referencedDocIds.map((id, idx) => {
            const doc = byId(id);
            if (!doc) return null;
            const citation = formatChicagoBibliography(docToMeta(doc));
            return (
              <div
                key={doc.id}
                id={`citation-${doc.id}`}
                className="citations-panel__entry"
              >
                <span className="citations-panel__number">{idx + 1}.</span>
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
