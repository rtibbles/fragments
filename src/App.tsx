import { useState, useCallback, useRef, useMemo } from "react";
import type { Editor } from "@tiptap/react";
import { Toolbar } from "./components/Toolbar";
import { LibraryPanel } from "./components/LibraryPanel";
import { EditorPanel } from "./components/EditorPanel";
import { SearchPanel } from "./components/SearchPanel";
import { CitationsPanel } from "./components/CitationsPanel";
import "./App.css";

function getReferencedDocIds(editor: Editor | null): number[] {
  if (!editor) return [];
  const ids = new Set<number>();
  editor.state.doc.descendants((node) => {
    if (node.type.name === "fragment" && node.attrs.sourceId) {
      ids.add(node.attrs.sourceId);
    }
  });
  return Array.from(ids);
}

function App() {
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);
  const [showCitations, setShowCitations] = useState(false);
  const [editorVersion, setEditorVersion] = useState(0);
  const editorRef = useRef<Editor | null>(null);

  const handleEditorReady = useCallback((editor: Editor) => {
    editorRef.current = editor;
    // Track content changes to update citation references
    editor.on("update", () => {
      setEditorVersion((v) => v + 1);
    });
  }, []);

  const handleLoadProject = useCallback(
    (_id: number, contentJson: string) => {
      const editor = editorRef.current;
      if (editor) {
        try {
          const content = JSON.parse(contentJson);
          editor.commands.setContent(content);
        } catch {
          editor.commands.setContent("");
        }
      }
    },
    []
  );

  const handleInsertFragment = useCallback(
    (attrs: {
      sourceId: number;
      sourceTitle: string;
      pageNumber: number;
      originalText: string;
      displayText: string;
      edited: boolean;
      rowId: number;
    }) => {
      const editor = editorRef.current;
      if (editor) {
        editor.chain().focus().insertFragment(attrs).run();
      }
    },
    []
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const referencedDocIds = useMemo(
    () => getReferencedDocIds(editorRef.current),
    [editorVersion]
  );

  return (
    <div className="app">
      <Toolbar
        showCitations={showCitations}
        onToggleCitations={() => setShowCitations(!showCitations)}
      />
      <div className="app__workspace">
        <LibraryPanel
          collapsed={libraryCollapsed}
          onToggle={() => setLibraryCollapsed(!libraryCollapsed)}
          onLoadProject={handleLoadProject}
        />
        <div className="app__editor-area">
          <EditorPanel onEditorReady={handleEditorReady} />
          <CitationsPanel
            visible={showCitations}
            onClose={() => setShowCitations(false)}
            referencedDocIds={referencedDocIds}
          />
        </div>
        <SearchPanel onInsertFragment={handleInsertFragment} />
      </div>
    </div>
  );
}

export default App;
