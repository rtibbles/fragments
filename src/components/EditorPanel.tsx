import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { FragmentNode } from "../extensions/FragmentNode";
import type { FragmentAttrs } from "../extensions/FragmentNode";
import { FragmentAutocomplete } from "../extensions/FragmentAutocomplete";
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
      FragmentNode,
      FragmentAutocomplete,
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "editor-panel__tiptap",
      },
      handleDrop: (view, event) => {
        const data = event.dataTransfer?.getData("application/x-fragment");
        if (!data) return false;
        event.preventDefault();
        const attrs: FragmentAttrs = JSON.parse(data);
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (pos) {
          const tr = view.state.tr.insert(
            pos.pos,
            view.state.schema.nodes.fragment.create(attrs)
          );
          view.dispatch(tr);
        }
        return true;
      },
      handleDOMEvents: {
        dragover: (_view, event) => {
          if (event.dataTransfer?.types.includes("application/x-fragment")) {
            event.preventDefault();
          }
          return false;
        },
      },
    },
  });

  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor);
    }
  }, [editor, onEditorReady]);

  if (!editor) return null;

  return (
    <div className="editor-panel">
      <div className="editor-panel__toolbar">
        <button
          className={`editor-btn ${editor.isActive("bold") ? "editor-btn--active" : ""}`}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold"
        >
          B
        </button>
        <button
          className={`editor-btn ${editor.isActive("italic") ? "editor-btn--active" : ""}`}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic"
        >
          I
        </button>
        <button
          className={`editor-btn ${editor.isActive("underline") ? "editor-btn--active" : ""}`}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Underline"
        >
          U
        </button>
        <span className="editor-btn__sep" />
        <button
          className={`editor-btn ${editor.isActive("heading", { level: 1 }) ? "editor-btn--active" : ""}`}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          title="Heading 1"
        >
          H1
        </button>
        <button
          className={`editor-btn ${editor.isActive("heading", { level: 2 }) ? "editor-btn--active" : ""}`}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Heading 2"
        >
          H2
        </button>
        <span className="editor-btn__sep" />
        <button
          className="editor-btn"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Section divider"
        >
          ---
        </button>
        <span className="editor-btn__sep" />
        <button
          className={`editor-btn ${editor.isActive({ textAlign: "left" }) ? "editor-btn--active" : ""}`}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          title="Align left"
        >
          L
        </button>
        <button
          className={`editor-btn ${editor.isActive({ textAlign: "center" }) ? "editor-btn--active" : ""}`}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          title="Align center"
        >
          C
        </button>
        <button
          className={`editor-btn ${editor.isActive({ textAlign: "right" }) ? "editor-btn--active" : ""}`}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          title="Align right"
        >
          R
        </button>
        <span className="editor-btn__sep" />
        <button
          className={`editor-btn ${(editor.storage as Record<string, any>).fragmentAutocomplete?.enabled ? "editor-btn--active" : ""}`}
          onClick={() => editor.chain().focus().toggleAutocomplete().run()}
          title="Toggle autocomplete"
        >
          AC
        </button>
      </div>
      <div className="editor-panel__body">
        <SectionNav editor={editor} />
        <div className="editor-panel__content">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
