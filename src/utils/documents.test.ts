import { describe, it, expect } from "vitest";
import { docToMeta, getReferencedDocIds, sortByAuthorLastName, formatCitationHtml } from "./documents";
import type { CorpusDocument } from "../types/corpus";

function makeDoc(overrides: Partial<CorpusDocument> = {}): CorpusDocument {
  return {
    id: "deadbeef0001",
    title: "T",
    subtitle: null,
    authors: [{ firstName: "Jane", lastName: "Smith" }],
    year: 2020,
    publisher: "Pub",
    type: "book",
    editor_translator: null,
    journal_or_source: null,
    doi: null,
    isbn: null,
    url: null,
    category: "x",
    sections_cited: [],
    why_cited: null,
    chunks: [],
    ...overrides,
  };
}

describe("docToMeta", () => {
  it("maps year into publicationDate as a YYYY string", () => {
    const meta = docToMeta(makeDoc({ year: 2005 }));
    expect(meta.publicationDate).toBe("2005");
  });

  it("maps journal_or_source to journalName", () => {
    const meta = docToMeta(makeDoc({ journal_or_source: "Art Journal 80(4)" }));
    expect(meta.journalName).toBe("Art Journal 80(4)");
  });

  it("passes through type as documentType", () => {
    const meta = docToMeta(makeDoc({ type: "article" }));
    expect(meta.documentType).toBe("article");
  });

  it("defaults documentType to 'book' when type is null", () => {
    const meta = docToMeta(makeDoc({ type: null }));
    expect(meta.documentType).toBe("book");
  });
});

describe("sortByAuthorLastName", () => {
  it("sorts by first author last name", () => {
    const a = makeDoc({ authors: [{ firstName: "Ada", lastName: "Zed" }] });
    const b = makeDoc({ authors: [{ firstName: "Bob", lastName: "Alpha" }] });
    expect([a, b].sort(sortByAuthorLastName)[0]).toBe(b);
  });
});

describe("formatCitationHtml", () => {
  it("converts markdown emphasis and straight quotes", () => {
    expect(formatCitationHtml('*Book*. "Chapter".')).toBe(
      "<em>Book</em>. &ldquo;Chapter&rdquo;."
    );
  });
});

describe("getReferencedDocIds", () => {
  it("returns an empty array when editor is null", () => {
    expect(getReferencedDocIds(null)).toEqual([]);
  });
});
