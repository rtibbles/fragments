import type { Editor } from "@tiptap/react";
import type { CitationMetadata } from "./chicago";
import type { CorpusDocument } from "../types/corpus";
import { FRAGMENT_MARK_NAME } from "../extensions/FragmentMark";

export type DocumentWithMeta = CorpusDocument;

export function docToMeta(doc: CorpusDocument): CitationMetadata {
  return {
    title: doc.title,
    subtitle: doc.subtitle,
    authors: doc.authors.map((a) => ({ firstName: a.firstName, lastName: a.lastName })),
    publisher: doc.publisher,
    publicationDate: doc.year != null ? String(doc.year) : null,
    doi: doc.doi,
    isbn: doc.isbn,
    journalName: doc.journal_or_source,
    volume: null,
    issue: null,
    pageRange: null,
    edition: null,
    url: doc.url,
    containerTitle: null,
    documentType: doc.type ?? "book",
  };
}

export function formatCitationHtml(citation: string): string {
  return citation
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/"([^"]+)"/g, "&ldquo;$1&rdquo;");
}

export function sortByAuthorLastName(a: CorpusDocument, b: CorpusDocument): number {
  const aName = a.authors[0]?.lastName || a.title;
  const bName = b.authors[0]?.lastName || b.title;
  return aName.localeCompare(bName);
}

export function getReferencedDocIds(editor: Editor | null): string[] {
  if (!editor) return [];
  const ids = new Set<string>();
  editor.state.doc.descendants((node) => {
    for (const mark of node.marks) {
      if (mark.type.name === FRAGMENT_MARK_NAME && mark.attrs.docId) {
        ids.add(mark.attrs.docId as string);
      }
    }
  });
  return Array.from(ids);
}
