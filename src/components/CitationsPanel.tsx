import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  formatChicagoBibliography,
  type CitationMetadata,
} from "../utils/chicago";
import "./CitationsPanel.css";

interface DocumentWithMeta {
  id: number;
  title: string;
  subtitle: string | null;
  document_type: string;
  doi: string | null;
  isbn: string | null;
  publisher: string | null;
  publication_date: string | null;
  journal_name: string | null;
  volume: string | null;
  issue: string | null;
  page_range: string | null;
  edition: string | null;
  url: string | null;
  container_title: string | null;
  authors: { first_name: string; last_name: string; role: string }[];
}

function docToMeta(doc: DocumentWithMeta): CitationMetadata {
  return {
    title: doc.title,
    subtitle: doc.subtitle,
    authors: doc.authors.map((a) => ({
      firstName: a.first_name,
      lastName: a.last_name,
    })),
    publisher: doc.publisher,
    publicationDate: doc.publication_date,
    doi: doc.doi,
    isbn: doc.isbn,
    journalName: doc.journal_name,
    volume: doc.volume,
    issue: doc.issue,
    pageRange: doc.page_range,
    edition: doc.edition,
    url: doc.url,
    containerTitle: doc.container_title,
    documentType: doc.document_type,
  };
}

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
    .sort((a, b) => {
      const aName = a.authors[0]?.last_name || a.title;
      const bName = b.authors[0]?.last_name || b.title;
      return aName.localeCompare(bName);
    });

  return (
    <div className="citations-panel">
      <div className="citations-panel__header">
        <h3>Bibliography</h3>
        <button className="citations-panel__close" onClick={onClose}>
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
                  __html: citation
                    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
                    .replace(/\"([^"]+)\"/g, "&ldquo;$1&rdquo;"),
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
