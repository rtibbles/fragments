import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { FragmentNodeView } from "./FragmentNodeView";

export interface FragmentAttrs {
  sourceId: number;
  sourceTitle: string;
  pageNumber: number;
  originalText: string;
  displayText: string;
  edited: boolean;
  rowId: number;
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
  name: "fragment",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      sourceId: { default: 0 },
      sourceTitle: { default: "" },
      pageNumber: { default: 0 },
      originalText: { default: "" },
      displayText: { default: "" },
      edited: { default: false },
      rowId: { default: 0 },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="fragment"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-type": "fragment" }),
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
        ({ chain }) => {
          return chain()
            .insertContent({
              type: this.name,
              attrs,
            })
            .run();
        },
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
              state.schema.text(text)
            );
            dispatch(tr);
          }
          return true;
        },
    };
  },
});
