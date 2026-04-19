import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { FragmentNodeView } from "./FragmentNodeView";

export const FRAGMENT_NODE_NAME = "fragment";
export const FRAGMENT_MIME_TYPE = "application/x-fragment";

export interface FragmentAttrs {
  docId: string;
  sourceTitle: string;
  pageNumber: number;
  originalText: string;
  displayText: string;
  edited: boolean;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fragment: {
      insertFragment: (attrs: FragmentAttrs) => ReturnType;
      dissolveFragment: () => ReturnType;
    };
  }
}

export const FragmentNode = Node.create({
  name: FRAGMENT_NODE_NAME,
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      docId: { default: "" },
      sourceTitle: { default: "" },
      pageNumber: { default: 0 },
      originalText: { default: "" },
      displayText: { default: "" },
      edited: { default: false },
    };
  },

  parseHTML() {
    return [{ tag: `span[data-type="${FRAGMENT_NODE_NAME}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-type": FRAGMENT_NODE_NAME }),
      HTMLAttributes.displayText || "",
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FragmentNodeView);
  },

  addCommands() {
    return {
      insertFragment:
        (attrs: FragmentAttrs) =>
        ({ chain }) =>
          chain().insertContent({ type: this.name, attrs }).run(),
      dissolveFragment:
        () =>
        ({ state, dispatch }) => {
          const { selection } = state;
          const node = state.doc.nodeAt(selection.from);
          if (!node || node.type.name !== this.name) return false;
          if (dispatch) {
            const text = node.attrs.displayText || node.attrs.originalText;
            const tr = state.tr.replaceWith(
              selection.from,
              selection.from + node.nodeSize,
              state.schema.text(text),
            );
            dispatch(tr);
          }
          return true;
        },
    };
  },
});
