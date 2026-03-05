import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Author {
  first_name: string;
  last_name: string;
  role: string;
}

export interface DocumentData {
  id: number;
  title: string;
  subtitle: string | null;
  document_type: string;
  doi: string | null;
  file_path: string;
  import_date: string;
  authors: Author[];
}

interface HighlightData {
  id: number;
  text: string;
  annotation: string | null;
  date_created: string | null;
}

interface DocumentListProps {
  documents: DocumentData[];
  onRefresh: () => void;
  onEditMetadata: (doc: DocumentData) => void;
}

export function DocumentList({
  documents,
  onRefresh,
  onEditMetadata,
}: DocumentListProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [highlights, setHighlights] = useState<HighlightData[]>([]);
  const [importing, setImporting] = useState(false);

  const handleToggleExpand = async (docId: number) => {
    if (expandedId === docId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(docId);
    try {
      const rows = await invoke<HighlightData[]>("get_document_highlights", {
        documentId: docId,
      });
      setHighlights(rows);
    } catch {
      setHighlights([]);
    }
  };

  const handleImportPdf = async () => {
    setImporting(true);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({
        filters: [{ name: "PDF", extensions: ["pdf"] }],
        multiple: false,
      });
      if (path) {
        await invoke("import_pdf", { path });
        onRefresh();
      }
    } catch (err) {
      console.error("Import failed:", err);
    } finally {
      setImporting(false);
    }
  };

  const handleImportKobo = async () => {
    setImporting(true);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({
        directory: true,
        title: "Select Kobo device mount point",
      });
      if (path) {
        await invoke("import_kobo", { koboPath: path });
        onRefresh();
      }
    } catch (err) {
      console.error("Kobo import failed:", err);
    } finally {
      setImporting(false);
    }
  };

  const authorLine = (doc: DocumentData) => {
    if (!doc.authors.length) return "";
    return doc.authors
      .map((a) => `${a.last_name}, ${a.first_name}`)
      .join("; ");
  };

  return (
    <div>
      <div className="library-panel__actions">
        <button
          className="library-panel__btn"
          onClick={handleImportPdf}
          disabled={importing}
        >
          + PDF
        </button>
        <button
          className="library-panel__btn"
          onClick={handleImportKobo}
          disabled={importing}
        >
          + Kobo
        </button>
      </div>
      {importing && (
        <p className="library-panel__status">Importing...</p>
      )}
      {documents.length === 0 && !importing && (
        <p className="library-panel__empty">No documents imported</p>
      )}
      {documents.map((doc) => (
        <div key={doc.id} className="library-doc">
          <div
            className="library-doc__header"
            onClick={() => handleToggleExpand(doc.id)}
          >
            <span className="library-doc__expand">
              {expandedId === doc.id ? "▾" : "▸"}
            </span>
            <div className="library-doc__info">
              <div className="library-doc__title">{doc.title}</div>
              {doc.authors.length > 0 && (
                <div className="library-doc__author">{authorLine(doc)}</div>
              )}
            </div>
            <button
              className="library-doc__meta-btn"
              onClick={(e) => {
                e.stopPropagation();
                onEditMetadata(doc);
              }}
              title="Edit metadata"
            >
              ⓘ
            </button>
          </div>
          {expandedId === doc.id && (
            <div className="library-doc__highlights">
              {highlights.length === 0 && (
                <p className="library-panel__empty">No highlights</p>
              )}
              {highlights.map((hl) => (
                <div key={hl.id} className="library-doc__highlight">
                  <span className="library-doc__hl-text">{hl.text}</span>
                  {hl.annotation && (
                    <span className="library-doc__hl-note">
                      {hl.annotation}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
