import { describe, it, expect, beforeEach } from "vitest";
import { copyToClipboard } from "./clipboard";
import type { CorpusDocument } from "../types/corpus";
import type { Editor } from "@tiptap/react";

function makeDoc(overrides: Partial<CorpusDocument>): CorpusDocument {
  return {
    id: "deadbeef0001", title: "Untitled", subtitle: null,
    authors: [{ firstName: "Jane", lastName: "Smith" }],
    year: 2020, publisher: "Pub", type: "book",
    editor_translator: null, journal_or_source: null,
    doi: null, isbn: null, url: null, category: null,
    sections_cited: [], why_cited: null, chunks: [],
    ...overrides,
  };
}

/**
 * Fake editor that just returns canned HTML + a doc walker that emits one
 * synthetic node per "block" (paragraph or heading) with text children
 * containing the fragment marks we need.
 */
function fakeEditor(html: string, blocks: Array<{
  type: "paragraph" | "heading";
  runs: Array<{ text: string; fragment?: { docId: string } }>;
}>): Editor {
  const makeText = (run: { text: string; fragment?: { docId: string } }) => ({
    isText: true,
    text: run.text,
    marks: run.fragment
      ? [{ type: { name: "fragment" }, attrs: { docId: run.fragment.docId } }]
      : [],
  });
  return {
    getHTML: () => html,
    state: {
      doc: {
        descendants(cb: (node: unknown) => boolean | void) {
          for (const block of blocks) {
            const result = cb({
              type: { name: block.type },
              isText: false,
              marks: [],
              descendants(inner: (child: unknown) => boolean | void) {
                for (const run of block.runs) inner(makeText(run));
              },
            });
            if (result === false) continue; // caller opted out of recursion
            for (const run of block.runs) cb(makeText(run));
          }
        },
      },
    },
  } as unknown as Editor;
}

describe("copyToClipboard", () => {
  let writtenHtml: string | null;
  let writtenPlain: string | null;

  beforeEach(() => {
    writtenHtml = null;
    writtenPlain = null;
    // jsdom doesn't ship ClipboardItem; stub it so our code takes the
    // rich-format path.
    class FakeClipboardItem {
      constructor(private data: Record<string, Blob>) {}
      async getType(type: string): Promise<Blob> { return this.data[type]; }
      get types(): string[] { return Object.keys(this.data); }
    }
    (globalThis as unknown as { ClipboardItem: typeof FakeClipboardItem }).ClipboardItem = FakeClipboardItem;
    const fakeClipboard = {
      async write(items: Array<{ getType: (t: string) => Promise<Blob> }>) {
        const item = items[0];
        const htmlBlob = await item.getType("text/html");
        const plainBlob = await item.getType("text/plain");
        writtenHtml = await htmlBlob.text();
        writtenPlain = await plainBlob.text();
      },
      async writeText(t: string) {
        writtenPlain = t;
      },
    };
    Object.defineProperty(navigator, "clipboard", { value: fakeClipboard, configurable: true });
  });

  it("injects superscript numbers after each fragment run in the HTML", async () => {
    const editor = fakeEditor(
      '<p><span data-doc-id="a" data-type="fragment">hello</span> world <span data-doc-id="b" data-type="fragment">again</span></p>',
      [
        {
          type: "paragraph",
          runs: [
            { text: "hello", fragment: { docId: "a" } },
            { text: " world ", },
            { text: "again", fragment: { docId: "b" } },
          ],
        },
      ],
    );
    const docs = [
      makeDoc({ id: "a", title: "Doc A" }),
      makeDoc({ id: "b", title: "Doc B" }),
    ];
    await copyToClipboard(editor, docs);
    expect(writtenHtml).toContain("<sup");
    // The fragment for docId 'a' got number 1, 'b' got 2.
    expect(writtenHtml).toMatch(/fragment"[^>]*>hello<\/span><sup[^>]*>1<\/sup>/);
    expect(writtenHtml).toMatch(/fragment"[^>]*>again<\/span><sup[^>]*>2<\/sup>/);
  });

  it("numbers bibliography entries by first-appearance order", async () => {
    const editor = fakeEditor(
      '<p><span data-doc-id="b" data-type="fragment">first</span> <span data-doc-id="a" data-type="fragment">second</span></p>',
      [
        {
          type: "paragraph",
          runs: [
            { text: "first", fragment: { docId: "b" } },
            { text: " ", },
            { text: "second", fragment: { docId: "a" } },
          ],
        },
      ],
    );
    const docs = [
      makeDoc({ id: "a", title: "Doc A", authors: [{ firstName: "A", lastName: "Alpha" }] }),
      makeDoc({ id: "b", title: "Doc B", authors: [{ firstName: "B", lastName: "Beta" }] }),
    ];
    await copyToClipboard(editor, docs);
    // Doc B appears first -> entry 1; Doc A -> entry 2.
    expect(writtenHtml).toMatch(/<strong>1\.<\/strong>[\s\S]*Beta/);
    expect(writtenHtml).toMatch(/<strong>2\.<\/strong>[\s\S]*Alpha/);
  });

  it("same docId cited twice shares one footnote number", async () => {
    const editor = fakeEditor(
      '<p><span data-doc-id="a" data-type="fragment">one</span> between <span data-doc-id="a" data-type="fragment">two</span></p>',
      [
        {
          type: "paragraph",
          runs: [
            { text: "one", fragment: { docId: "a" } },
            { text: " between " },
            { text: "two", fragment: { docId: "a" } },
          ],
        },
      ],
    );
    const docs = [makeDoc({ id: "a", title: "Doc A" })];
    await copyToClipboard(editor, docs);
    // Each span gets its own <sup>, but both show the same number.
    const matches = writtenHtml!.match(/<sup[^>]*>1<\/sup>/g) ?? [];
    expect(matches.length).toBe(2);
    expect(writtenHtml).not.toMatch(/<sup[^>]*>2<\/sup>/);
    // The bibliography has exactly one entry for docId "a".
    const bibMatches = writtenHtml!.match(/<strong>\d+\.<\/strong>/g) ?? [];
    expect(bibMatches.length).toBe(1);
  });

  it("injects a unicode ellipsis when a fragment had its middle deleted", async () => {
    const editor = fakeEditor(
      // current text "The quick fox"; original had "brown" in the middle
      '<p><span data-doc-id="a" data-original-text="The quick brown fox" data-type="fragment">The quick fox</span></p>',
      [
        {
          type: "paragraph",
          runs: [{ text: "The quick fox", fragment: { docId: "a" } }],
        },
      ],
    );
    const docs = [makeDoc({ id: "a", title: "Doc A" })];
    await copyToClipboard(editor, docs);
    expect(writtenHtml).toContain("The quick \u2026 fox");
  });

  it("does NOT inject an ellipsis when deletion reaches the fragment edge", async () => {
    const editor = fakeEditor(
      // user trimmed the leading "The ": edge deletion, no ellipsis
      '<p><span data-doc-id="a" data-original-text="The quick fox" data-type="fragment">quick fox</span></p>',
      [
        {
          type: "paragraph",
          runs: [{ text: "quick fox", fragment: { docId: "a" } }],
        },
      ],
    );
    const docs = [makeDoc({ id: "a", title: "Doc A" })];
    await copyToClipboard(editor, docs);
    expect(writtenHtml).not.toContain("\u2026");
  });

  it("plain-text form has [N] markers and a numbered bibliography", async () => {
    const editor = fakeEditor(
      '<p><span data-doc-id="a" data-type="fragment">needle</span> elsewhere</p>',
      [
        {
          type: "paragraph",
          runs: [
            { text: "needle", fragment: { docId: "a" } },
            { text: " elsewhere" },
          ],
        },
      ],
    );
    const docs = [makeDoc({ id: "a", title: "Title" })];
    await copyToClipboard(editor, docs);
    expect(writtenPlain).toContain("needle[1] elsewhere");
    expect(writtenPlain).toMatch(/^1\. /m);
  });
});
