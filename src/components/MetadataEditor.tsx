import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { DocumentData } from "./DocumentList";

interface CrossRefResult {
  title: string;
  subtitle: string | null;
  authors: { first_name: string; last_name: string }[];
  publisher: string | null;
  publication_date: string | null;
  doi: string | null;
  isbn: string | null;
  journal_name: string | null;
  volume: string | null;
  issue: string | null;
  page_range: string | null;
  document_type: string;
}

interface MetadataEditorProps {
  document: DocumentData;
  onClose: () => void;
  onSaved: () => void;
}

export function MetadataEditor({
  document: doc,
  onClose,
  onSaved,
}: MetadataEditorProps) {
  const [title, setTitle] = useState(doc.title);
  const [subtitle, setSubtitle] = useState(doc.subtitle || "");
  const [docType, setDocType] = useState(doc.document_type);
  const [doi, setDoi] = useState(doc.doi || "");
  const [authors, setAuthors] = useState(
    doc.authors.map((a) => ({ firstName: a.first_name, lastName: a.last_name }))
  );
  const [publisher, setPublisher] = useState("");
  const [pubDate, setPubDate] = useState("");
  const [journal, setJournal] = useState("");
  const [volume, setVolume] = useState("");
  const [issue, setIssue] = useState("");
  const [pageRange, setPageRange] = useState("");
  const [isbn, setIsbn] = useState("");

  const [crossrefQuery, setCrossrefQuery] = useState("");
  const [crossrefResults, setCrossrefResults] = useState<CrossRefResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleCrossrefSearch = async () => {
    if (!crossrefQuery.trim()) return;
    setSearching(true);
    try {
      const results = await invoke<CrossRefResult[]>("search_crossref", {
        query: crossrefQuery,
        limit: 5,
      });
      setCrossrefResults(results);
    } catch {
      setCrossrefResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleDoiLookup = async () => {
    if (!doi.trim()) return;
    setSearching(true);
    try {
      const result = await invoke<CrossRefResult>("lookup_doi", {
        doi: doi.trim(),
      });
      applyMetadata(result);
    } catch (err) {
      console.error("DOI lookup failed:", err);
    } finally {
      setSearching(false);
    }
  };

  const handleRetryCrossref = async () => {
    setSearching(true);
    try {
      if (doi.trim()) {
        const result = await invoke<CrossRefResult>("lookup_doi", {
          doi: doi.trim(),
        });
        if (result) {
          applyMetadata(result);
        }
      } else {
        const results = await invoke<CrossRefResult[]>("search_crossref", {
          query: title,
        });
        if (results.length > 0) {
          setCrossrefResults(results);
        }
      }
    } catch (err) {
      console.error("CrossRef retry failed:", err);
    } finally {
      setSearching(false);
    }
  };

  const applyMetadata = (meta: CrossRefResult) => {
    setTitle(meta.title || title);
    setSubtitle(meta.subtitle || "");
    setDocType(meta.document_type || docType);
    setDoi(meta.doi || doi);
    setIsbn(meta.isbn || "");
    setPublisher(meta.publisher || "");
    setPubDate(meta.publication_date || "");
    setJournal(meta.journal_name || "");
    setVolume(meta.volume || "");
    setIssue(meta.issue || "");
    setPageRange(meta.page_range || "");
    if (meta.authors.length > 0) {
      setAuthors(
        meta.authors.map((a) => ({
          firstName: a.first_name,
          lastName: a.last_name,
        }))
      );
    }
    setCrossrefResults([]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await invoke("update_document_metadata", {
        id: doc.id,
        title,
        subtitle: subtitle || null,
        documentType: docType,
        doi: doi || null,
        isbn: isbn || null,
        publisher: publisher || null,
        publicationDate: pubDate || null,
        journalName: journal || null,
        volume: volume || null,
        issue: issue || null,
        pageRange: pageRange || null,
        url: null,
        edition: null,
        containerTitle: null,
        authors: authors.map((a, i) => ({
          first_name: a.firstName,
          last_name: a.lastName,
          role: "author",
          position: i,
        })),
      });
      onSaved();
      onClose();
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  const addAuthor = () =>
    setAuthors([...authors, { firstName: "", lastName: "" }]);

  const removeAuthor = (i: number) =>
    setAuthors(authors.filter((_, idx) => idx !== i));

  const updateAuthor = (i: number, field: "firstName" | "lastName", val: string) => {
    const updated = [...authors];
    updated[i] = { ...updated[i], [field]: val };
    setAuthors(updated);
  };

  return (
    <div className="metadata-overlay" onClick={onClose}>
      <div className="metadata-editor" onClick={(e) => e.stopPropagation()}>
        <div className="metadata-editor__header">
          <h3>Edit Metadata</h3>
          <button className="metadata-editor__close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="metadata-editor__body">
          {/* CrossRef Search */}
          <div className="metadata-editor__crossref">
            <div className="metadata-editor__search-row">
              <input
                className="metadata-editor__input"
                placeholder="Search CrossRef..."
                value={crossrefQuery}
                onChange={(e) => setCrossrefQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCrossrefSearch()}
              />
              <button
                className="library-panel__btn"
                onClick={handleCrossrefSearch}
                disabled={searching}
              >
                Search
              </button>
            </div>
            {crossrefResults.map((r, i) => (
              <div
                key={i}
                className="metadata-editor__crossref-result"
                onClick={() => applyMetadata(r)}
              >
                <div className="metadata-editor__crossref-title">
                  {r.title}
                </div>
                <div className="metadata-editor__crossref-meta">
                  {r.authors
                    .slice(0, 3)
                    .map((a) => `${a.last_name}`)
                    .join(", ")}
                  {r.publication_date && ` (${r.publication_date.slice(0, 4)})`}
                  {r.doi && ` · ${r.doi}`}
                </div>
              </div>
            ))}
          </div>

          {/* Fields */}
          <label className="metadata-editor__label">
            Title
            <input
              className="metadata-editor__input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="metadata-editor__label">
            Subtitle
            <input
              className="metadata-editor__input"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
            />
          </label>
          <label className="metadata-editor__label">
            Type
            <select
              className="metadata-editor__input"
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
            >
              <option value="book">Book</option>
              <option value="journal_article">Journal Article</option>
              <option value="chapter">Chapter</option>
              <option value="thesis">Thesis</option>
              <option value="report">Report</option>
            </select>
          </label>
          <div className="metadata-editor__row">
            <label className="metadata-editor__label metadata-editor__label--flex">
              DOI
              <div className="metadata-editor__doi-row">
                <input
                  className="metadata-editor__input"
                  value={doi}
                  onChange={(e) => setDoi(e.target.value)}
                />
                <button
                  className="library-panel__btn"
                  onClick={handleDoiLookup}
                  disabled={searching || !doi.trim()}
                >
                  Lookup
                </button>
              </div>
            </label>
          </div>
          <label className="metadata-editor__label">
            ISBN
            <input
              className="metadata-editor__input"
              value={isbn}
              onChange={(e) => setIsbn(e.target.value)}
            />
          </label>
          <label className="metadata-editor__label">
            Publisher
            <input
              className="metadata-editor__input"
              value={publisher}
              onChange={(e) => setPublisher(e.target.value)}
            />
          </label>
          <label className="metadata-editor__label">
            Publication Date
            <input
              className="metadata-editor__input"
              value={pubDate}
              onChange={(e) => setPubDate(e.target.value)}
              placeholder="YYYY-MM-DD"
            />
          </label>
          <label className="metadata-editor__label">
            Journal
            <input
              className="metadata-editor__input"
              value={journal}
              onChange={(e) => setJournal(e.target.value)}
            />
          </label>
          <div className="metadata-editor__multi">
            <label className="metadata-editor__label">
              Volume
              <input
                className="metadata-editor__input"
                value={volume}
                onChange={(e) => setVolume(e.target.value)}
              />
            </label>
            <label className="metadata-editor__label">
              Issue
              <input
                className="metadata-editor__input"
                value={issue}
                onChange={(e) => setIssue(e.target.value)}
              />
            </label>
            <label className="metadata-editor__label">
              Pages
              <input
                className="metadata-editor__input"
                value={pageRange}
                onChange={(e) => setPageRange(e.target.value)}
              />
            </label>
          </div>

          {/* Authors */}
          <div className="metadata-editor__authors">
            <div className="metadata-editor__authors-header">
              <span>Authors</span>
              <button className="library-panel__btn" onClick={addAuthor}>
                + Add
              </button>
            </div>
            {authors.map((a, i) => (
              <div key={i} className="metadata-editor__author-row">
                <input
                  className="metadata-editor__input"
                  placeholder="First name"
                  value={a.firstName}
                  onChange={(e) => updateAuthor(i, "firstName", e.target.value)}
                />
                <input
                  className="metadata-editor__input"
                  placeholder="Last name"
                  value={a.lastName}
                  onChange={(e) => updateAuthor(i, "lastName", e.target.value)}
                />
                <button
                  className="metadata-editor__remove-btn"
                  onClick={() => removeAuthor(i)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="metadata-editor__footer">
          <button
            className="library-panel__btn"
            onClick={handleRetryCrossref}
            disabled={searching}
          >
            {searching ? "Looking up..." : "Retry CrossRef"}
          </button>
          <button className="library-panel__btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="library-panel__btn library-panel__btn--primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
