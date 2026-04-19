import { Mark, mergeAttributes } from "@tiptap/core";
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
});
