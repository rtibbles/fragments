import { Mark, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import "./FragmentMark.css";

export const FRAGMENT_MARK_NAME = "fragment";
export const FRAGMENT_MIME_TYPE = "application/x-fragment";

export interface FragmentAttrs {
  docId: string;
  sourceTitle: string;
  pageNumber: number;
  originalText: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fragment: {
      /** Insert `text` at the current selection, wrapped in a fragment mark. */
      insertFragment: (attrs: FragmentAttrs & { text: string }) => ReturnType;
      /** Strip the fragment mark from the current selection (text stays). */
      dissolveFragment: () => ReturnType;
    };
  }
}

const footnoteKey = new PluginKey("fragmentFootnotes");

/**
 * Walk the doc in order, number each docId by first appearance, and emit a
 * widget decoration with the number as a superscript at the end of each
 * contiguous run of the fragment mark.
 */
function computeDecorations(doc: PMNode): DecorationSet {
  const numberByDocId = new Map<string, number>();
  const decorations: Decoration[] = [];

  let currentDocId: string | null = null;
  let currentEnd = 0;

  const flush = () => {
    if (currentDocId == null) return;
    const docId = currentDocId; // capture by value before mutation
    const end = currentEnd;
    const n = numberByDocId.get(docId)!;
    decorations.push(
      Decoration.widget(
        end,
        () => {
          const sup = document.createElement("sup");
          sup.className = "fragment-footnote";
          sup.setAttribute("data-fragment-num", String(n));
          sup.setAttribute("data-doc-id", docId);
          sup.textContent = String(n);
          sup.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            document.dispatchEvent(
              new CustomEvent("fragment-footnote-click", {
                detail: { docId },
              }),
            );
          });
          return sup;
        },
        { side: 1, key: `fn-${docId}-${end}` },
      ),
    );
    currentDocId = null;
  };

  doc.descendants((node, pos) => {
    if (!node.isText) {
      flush();
      return;
    }
    const mark = node.marks.find((m) => m.type.name === FRAGMENT_MARK_NAME);
    if (!mark) {
      flush();
      return;
    }
    const docId = mark.attrs.docId as string;
    if (!numberByDocId.has(docId)) {
      numberByDocId.set(docId, numberByDocId.size + 1);
    }
    if (currentDocId === docId) {
      currentEnd = pos + node.nodeSize;
    } else {
      flush();
      currentDocId = docId;
      currentEnd = pos + node.nodeSize;
    }
  });
  flush();

  return DecorationSet.create(doc, decorations);
}

/**
 * Read the current docId → footnote-number mapping from the editor state.
 * Used by the CitationsPanel to show matching numbers.
 */
export function getFootnoteNumbers(doc: PMNode): Map<string, number> {
  const numberByDocId = new Map<string, number>();
  doc.descendants((node) => {
    if (!node.isText) return;
    const mark = node.marks.find((m) => m.type.name === FRAGMENT_MARK_NAME);
    if (!mark) return;
    const docId = mark.attrs.docId as string;
    if (!numberByDocId.has(docId)) {
      numberByDocId.set(docId, numberByDocId.size + 1);
    }
  });
  return numberByDocId;
}

export const FragmentMark = Mark.create({
  name: FRAGMENT_MARK_NAME,
  inclusive: false,
  excludes: "",

  addAttributes() {
    return {
      docId: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-doc-id") ?? "",
        renderHTML: (attrs) => ({ "data-doc-id": attrs.docId }),
      },
      sourceTitle: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-source-title") ?? "",
        renderHTML: (attrs) => ({ "data-source-title": attrs.sourceTitle }),
      },
      pageNumber: {
        default: 0,
        parseHTML: (el) => Number(el.getAttribute("data-page") ?? 0),
        renderHTML: (attrs) => ({ "data-page": String(attrs.pageNumber) }),
      },
      originalText: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-original-text") ?? "",
        renderHTML: (attrs) => ({ "data-original-text": attrs.originalText }),
      },
    };
  },

  parseHTML() {
    return [{ tag: `span[data-type="${FRAGMENT_MARK_NAME}"]` }];
  },

  renderHTML({ HTMLAttributes, mark }) {
    const title = `${mark.attrs.sourceTitle}, p. ${mark.attrs.pageNumber}`;
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-type": FRAGMENT_MARK_NAME,
        class: "fragment-mark",
        title,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      insertFragment:
        (attrs) =>
        ({ chain }) => {
          const { text, ...markAttrs } = attrs;
          return chain()
            .insertContent({
              type: "text",
              text,
              marks: [{ type: this.name, attrs: markAttrs }],
            })
            .run();
        },
      dissolveFragment:
        () =>
        ({ chain }) => chain().unsetMark(this.name, { extendEmptyMarkRange: true }).run(),
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: footnoteKey,
        state: {
          init: (_config, state) => computeDecorations(state.doc),
          apply: (tr, old) => (tr.docChanged ? computeDecorations(tr.doc) : old),
        },
        props: {
          decorations(state) {
            return footnoteKey.getState(state) as DecorationSet;
          },
        },
      }),
    ];
  },
});
