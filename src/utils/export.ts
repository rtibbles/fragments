import type { Editor } from "@tiptap/react";
import { invoke } from "@tauri-apps/api/core";
import {
  formatChicagoBibliography,
  type CitationMetadata,
} from "./chicago";

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

function formatCitationHtml(citation: string): string {
  return citation
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/"([^"]+)"/g, "&ldquo;$1&rdquo;");
}

export async function exportRichText(
  editor: Editor,
  projectTitle: string
): Promise<void> {
  // Get referenced document IDs
  const docIds = new Set<number>();
  editor.state.doc.descendants((node) => {
    if (node.type.name === "fragment" && node.attrs.sourceId) {
      docIds.add(node.attrs.sourceId);
    }
  });

  // Fetch document metadata for bibliography
  let documents: DocumentWithMeta[] = [];
  if (docIds.size > 0) {
    try {
      const allDocs = await invoke<DocumentWithMeta[]>("list_documents");
      documents = allDocs
        .filter((d) => docIds.has(d.id))
        .sort((a, b) => {
          const aName = a.authors[0]?.last_name || a.title;
          const bName = b.authors[0]?.last_name || b.title;
          return aName.localeCompare(bName);
        });
    } catch {
      // Continue without bibliography
    }
  }

  // Get editor HTML — fragments will be rendered as their inline HTML
  const editorHtml = editor.getHTML();

  // Build bibliography section
  let bibliographyHtml = "";
  if (documents.length > 0) {
    const entries = documents
      .map((doc) => {
        const citation = formatChicagoBibliography(docToMeta(doc));
        return `<p style="padding-left:2em;text-indent:-2em;margin-bottom:0.5em;">${formatCitationHtml(citation)}</p>`;
      })
      .join("\n");

    bibliographyHtml = `
<hr style="margin:2em 0;border:none;border-top:1px solid #ccc;">
<h2>Bibliography</h2>
${entries}`;
  }

  // Build full HTML document
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(projectTitle)}</title>
<style>
  body {
    font-family: "Times New Roman", Times, serif;
    max-width: 700px;
    margin: 2em auto;
    padding: 0 1em;
    font-size: 16px;
    line-height: 1.8;
    color: #222;
  }
  h1 { font-size: 2em; text-align: center; margin-bottom: 1em; }
  h2 { font-size: 1.4em; margin-top: 1.5em; }
  h3 { font-size: 1.2em; }
  hr { border: none; border-top: 2px dashed #ccc; margin: 2em 0; }
  span[data-type="fragment"] {
    background: rgba(139, 115, 85, 0.08);
    border-bottom: 1px solid rgba(139, 115, 85, 0.3);
    padding: 0 2px;
  }
</style>
</head>
<body>
<h1>${escapeHtml(projectTitle)}</h1>
${editorHtml}
${bibliographyHtml}
</body>
</html>`;

  // Save via file dialog
  const { save } = await import("@tauri-apps/plugin-dialog");
  const path = await save({
    filters: [{ name: "HTML", extensions: ["html"] }],
    defaultPath: `${projectTitle}.html`,
  });

  if (path) {
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    await writeTextFile(path, html);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
