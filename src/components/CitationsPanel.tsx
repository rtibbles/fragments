import { formatChicagoBibliography } from "../utils/chicago";
import {
  docToMeta,
  formatCitationHtml,
  sortByAuthorLastName,
} from "../utils/documents";
import { useCorpusContext } from "../context/CorpusContext";
import "./CitationsPanel.css";

interface CitationsPanelProps {
  visible: boolean;
  onClose: () => void;
  referencedDocIds: string[];
}

export function CitationsPanel({
  visible,
  onClose,
  referencedDocIds,
}: CitationsPanelProps) {
  const { documents } = useCorpusContext();

  if (!visible) return null;

  const refSet = new Set(referencedDocIds);
  const referencedDocs = documents
    .filter((d) => refSet.has(d.id))
    .sort(sortByAuthorLastName);

  return (
    <div className="citations-panel" data-testid="citations-panel">
      <div className="citations-panel__header">
        <h3>Bibliography</h3>
        <button className="citations-panel__close" onClick={onClose} data-testid="citations-close">
          ×
        </button>
      </div>
      <div className="citations-panel__body">
        {referencedDocs.length === 0 && (
          <p className="citations-panel__empty">
            Insert fragments to generate citations
          </p>
        )}
        {referencedDocs.map((doc) => {
          const citation = formatChicagoBibliography(docToMeta(doc));
          return (
            <div key={doc.id} className="citations-panel__entry">
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
