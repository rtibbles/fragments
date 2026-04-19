import type { Editor } from "@tiptap/react";
import { formatChicagoBibliography } from "./chicago";
import {
  docToMeta,
  formatCitationHtml,
  getReferencedDocIds,
} from "./documents";
import type { CorpusDocument } from "../types/corpus";

/**
 * Copy the editor's contents + bibliography to the clipboard in a shape
 * that pastes cleanly into Google Docs.
 *
 * - Inline styles (Docs ignores class-based CSS from the source page).
 * - Superscript footnote numbers injected after each contiguous fragment
 *   run, matching the in-app rendering. Numbers follow first-appearance
 *   order per docId.
 * - Bibliography appended below, numbered to match the superscripts.
 * - Written to the clipboard as both text/html (for Docs) and text/plain
 *   (fallback for plain-text targets).
 */
export async function copyToClipboard(
  editor: Editor,
  documents: CorpusDocument[],
): Promise<void> {
  const orderedDocIds = getReferencedDocIds(editor);
  const numberByDocId = new Map<string, number>();
  orderedDocIds.forEach((id, idx) => numberByDocId.set(id, idx + 1));

  const editorHtml = injectFootnotes(editor.getHTML(), numberByDocId);

  const byId = new Map(documents.map((d) => [d.id, d]));
  const bibliographyHtml = orderedDocIds
    .map((id, idx) => {
      const doc = byId.get(id);
      if (!doc) return "";
      const citation = formatChicagoBibliography(docToMeta(doc));
      return `<p style="padding-left:2em;text-indent:-2em;margin-bottom:0.5em;"><strong>${idx + 1}.</strong> ${formatCitationHtml(citation)}</p>`;
    })
    .filter(Boolean)
    .join("\n");

  const html = `<div style="font-family:'Times New Roman',Times,serif;font-size:12pt;line-height:1.6;color:#000;">
${editorHtml}
${bibliographyHtml}
</div>`;

  const plainText = buildPlainText(editor, numberByDocId, documents);

  await writeClipboard(html, plainText);
}

async function writeClipboard(html: string, plainText: string): Promise<void> {
  const clipboard = navigator.clipboard;
  if (clipboard && typeof ClipboardItem !== "undefined") {
    try {
      await clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plainText], { type: "text/plain" }),
        }),
      ]);
      return;
    } catch {
      // Fall through to the text-only path below.
    }
  }
  if (clipboard?.writeText) {
    await clipboard.writeText(plainText);
    return;
  }
  throw new Error("Clipboard API not available");
}

/**
 * Walk editor.getHTML()'s DOM representation, append a <sup>N</sup> after
 * each contiguous run of fragment-mark spans so the pasted output matches
 * what the in-editor ProseMirror decoration shows.
 */
function injectFootnotes(html: string, numberByDocId: Map<string, number>): string {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;

  // Emit one <sup>N</sup> after each fragment span. ProseMirror normally
  // merges contiguous text with identical marks into a single span, so
  // separate spans really do represent separate citation instances.
  for (const mark of tpl.content.querySelectorAll<HTMLElement>(
    'span[data-type="fragment"]',
  )) {
    const docId = mark.getAttribute("data-doc-id") ?? "";
    const n = numberByDocId.get(docId);
    if (n == null) continue;
    const sup = document.createElement("sup");
    sup.textContent = String(n);
    sup.setAttribute("style", "font-size:0.7em;");
    mark.after(sup);
    // Strip the in-app highlight styling; in a pasted doc the sup is the
    // citation marker and the colored background is just noise.
    mark.removeAttribute("class");
    mark.removeAttribute("title");
  }

  return tpl.innerHTML;
}

function buildPlainText(
  editor: Editor,
  numberByDocId: Map<string, number>,
  documents: CorpusDocument[],
): string {
  // Plain-text form: walk the doc, emit text, append [N] after each fragment
  // run. Paragraphs separated by blank lines.
  const byId = new Map(documents.map((d) => [d.id, d]));
  const lines: string[] = [];

  editor.state.doc.descendants((node) => {
    if (node.type.name === "paragraph" || node.type.name === "heading") {
      let buf = "";
      let openDocId: string | null = null;
      node.descendants((child) => {
        if (!child.isText) return;
        const mark = child.marks.find((m) => m.type.name === "fragment");
        const childDocId = (mark?.attrs.docId as string | undefined) ?? null;
        if (openDocId && openDocId !== childDocId) {
          const n = numberByDocId.get(openDocId);
          if (n != null) buf += `[${n}]`;
          openDocId = null;
        }
        buf += child.text ?? "";
        openDocId = childDocId;
      });
      if (openDocId) {
        const n = numberByDocId.get(openDocId);
        if (n != null) buf += `[${n}]`;
      }
      if (buf) lines.push(buf);
      lines.push("");
      return false; // don't recurse further into this block
    }
  });

  for (const [id, n] of numberByDocId.entries()) {
    const doc = byId.get(id);
    if (!doc) continue;
    const citation = formatChicagoBibliography(docToMeta(doc));
    // Strip the markdown emphasis markers for plaintext
    const clean = citation.replace(/\*([^*]+)\*/g, "$1");
    lines.push(`${n}. ${clean}`);
  }

  return lines.join("\n").trim() + "\n";
}
