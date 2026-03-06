import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { formatChicagoBibliography } from "../utils/chicago";
import {
  type DocumentWithMeta,
  docToMeta,
  formatCitationHtml,
  sortByAuthorLastName,
} from "../utils/documents";
import "./CitationsPanel.css";

interface CitationsPanelProps {
  visible: boolean;
  onClose: () => void;
  /** IDs of documents referenced by fragments in the editor */
  referencedDocIds: number[];
}

export function CitationsPanel({
  visible,
  onClose,
  referencedDocIds,
}: CitationsPanelProps) {
  const [documents, setDocuments] = useState<DocumentWithMeta[]>([]);

  const loadDocuments = useCallback(async () => {
    try {
      const docs = await invoke<DocumentWithMeta[]>("list_documents");
      setDocuments(docs);
    } catch {
      setDocuments([]);
    }
  }, []);

  useEffect(() => {
    if (visible) loadDocuments();
  }, [visible, loadDocuments]);

  if (!visible) return null;

  // Filter to only referenced documents, sorted by author last name
  const referencedDocs = documents
    .filter((d) => referencedDocIds.includes(d.id))
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
                dangerouslySetInnerHTML={{
                  __html: formatCitationHtml(citation),
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
