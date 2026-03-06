import type { Editor } from "@tiptap/react";
import { invoke } from "@tauri-apps/api/core";
import { formatChicagoBibliography } from "./chicago";
import {
  type DocumentWithMeta,
  docToMeta,
  formatCitationHtml,
  sortByAuthorLastName,
  getReferencedDocIds,
} from "./documents";

export async function exportRichText(
  editor: Editor,
  projectTitle: string
): Promise<void> {
  // Get referenced document IDs
  const docIds = new Set(getReferencedDocIds(editor));

  // Fetch document metadata for bibliography
  let documents: DocumentWithMeta[] = [];
  if (docIds.size > 0) {
    try {
      const allDocs = await invoke<DocumentWithMeta[]>("list_documents");
      documents = allDocs
        .filter((d) => docIds.has(d.id))
        .sort(sortByAuthorLastName);
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
