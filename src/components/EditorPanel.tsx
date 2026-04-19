import { useEffect } from "react";
import { useEditor, useEditorState, EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { FragmentMark, FRAGMENT_MIME_TYPE } from "../extensions/FragmentMark";
import type { FragmentAttrs } from "../extensions/FragmentMark";
import { SectionNav } from "./SectionNav";
import "./EditorPanel.css";

interface EditorPanelProps {
  onEditorReady?: (editor: Editor) => void;
}

export function EditorPanel({ onEditorReady }: EditorPanelProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Underline,
      FragmentMark,
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "editor-panel__tiptap",
      },
      handleDrop: (view, event) => {
        const data = event.dataTransfer?.getData(FRAGMENT_MIME_TYPE);
        if (!data) return false;
        event.preventDefault();
        const parsed = JSON.parse(data) as FragmentAttrs & { text: string };
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (pos) {
          const mark = view.state.schema.marks.fragment.create({
            docId: parsed.docId,
            sourceTitle: parsed.sourceTitle,
            pageNumber: parsed.pageNumber,
            originalText: parsed.originalText,
          });
          const textNode = view.state.schema.text(parsed.text, [mark]);
          const tr = view.state.tr.insert(pos.pos, textNode);
          view.dispatch(tr);
        }
        return true;
      },
      handleDOMEvents: {
        dragover: (_view, event) => {
          if (event.dataTransfer?.types.includes(FRAGMENT_MIME_TYPE)) {
            event.preventDefault();
          }
          return false;
        },
      },
    },
  });

  const activeStates = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return null;
      return {
        bold: e.isActive("bold"),
        italic: e.isActive("italic"),
        underline: e.isActive("underline"),
        h1: e.isActive("heading", { level: 1 }),
        h2: e.isActive("heading", { level: 2 }),
        alignLeft: e.isActive({ textAlign: "left" }),
        alignCenter: e.isActive({ textAlign: "center" }),
        alignRight: e.isActive({ textAlign: "right" }),
      };
    },
  });

  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor);
    }
  }, [editor, onEditorReady]);

  if (!editor || !activeStates) return null;

  return (
    <div className="editor-panel" data-testid="editor-panel">
      <div className="editor-panel__toolbar" data-testid="editor-toolbar">
        <button
          className={`editor-btn ${activeStates.bold ? "editor-btn--active" : ""}`}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold"
          data-testid="editor-btn-bold"
        >
          B
        </button>
        <button
          className={`editor-btn ${activeStates.italic ? "editor-btn--active" : ""}`}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic"
          data-testid="editor-btn-italic"
        >
          I
        </button>
        <button
          className={`editor-btn ${activeStates.underline ? "editor-btn--active" : ""}`}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Underline"
          data-testid="editor-btn-underline"
        >
          U
        </button>
        <span className="editor-btn__sep" />
        <button
          className={`editor-btn ${activeStates.h1 ? "editor-btn--active" : ""}`}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          title="Heading 1"
          data-testid="editor-btn-h1"
        >
          H1
        </button>
        <button
          className={`editor-btn ${activeStates.h2 ? "editor-btn--active" : ""}`}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Heading 2"
          data-testid="editor-btn-h2"
        >
          H2
        </button>
        <span className="editor-btn__sep" />
        <button
          className="editor-btn"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Section divider"
          data-testid="editor-btn-hr"
        >
          ---
        </button>
        <span className="editor-btn__sep" />
        <button
          className={`editor-btn ${activeStates.alignLeft ? "editor-btn--active" : ""}`}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          title="Align left"
        >
          L
        </button>
        <button
          className={`editor-btn ${activeStates.alignCenter ? "editor-btn--active" : ""}`}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          title="Align center"
        >
          C
        </button>
        <button
          className={`editor-btn ${activeStates.alignRight ? "editor-btn--active" : ""}`}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          title="Align right"
        >
          R
        </button>
      </div>
      <div className="editor-panel__body">
        <SectionNav editor={editor} />
        <div
          className="editor-panel__content"
          data-testid="editor-content"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              editor.commands.focus("end");
            }
          }}
        >
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
