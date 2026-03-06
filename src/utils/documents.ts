import type { Editor } from "@tiptap/react";
import type { CitationMetadata } from "./chicago";
import { FRAGMENT_NODE_NAME } from "../extensions/FragmentNode";

export interface DocumentWithMeta {
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

export function docToMeta(doc: DocumentWithMeta): CitationMetadata {
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

export function formatCitationHtml(citation: string): string {
  return citation
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/"([^"]+)"/g, "&ldquo;$1&rdquo;");
}

export function sortByAuthorLastName(
  a: DocumentWithMeta,
  b: DocumentWithMeta
): number {
  const aName = a.authors[0]?.last_name || a.title;
  const bName = b.authors[0]?.last_name || b.title;
  return aName.localeCompare(bName);
}

export function getReferencedDocIds(editor: Editor | null): number[] {
  if (!editor) return [];
  const ids = new Set<number>();
  editor.state.doc.descendants((node) => {
    if (node.type.name === FRAGMENT_NODE_NAME && node.attrs.sourceId) {
      ids.add(node.attrs.sourceId);
    }
  });
  return Array.from(ids);
}
