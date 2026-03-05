import { useState, useCallback, useRef } from "react";
import type { Editor } from "@tiptap/react";
import { Toolbar } from "./components/Toolbar";
import { LibraryPanel } from "./components/LibraryPanel";
import { EditorPanel } from "./components/EditorPanel";
import { SearchPanel } from "./components/SearchPanel";
import "./App.css";

function App() {
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);
  const editorRef = useRef<Editor | null>(null);

  const handleEditorReady = useCallback((editor: Editor) => {
    editorRef.current = editor;
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

  return (
    <div className="app">
      <Toolbar />
      <div className="app__workspace">
        <LibraryPanel
          collapsed={libraryCollapsed}
          onToggle={() => setLibraryCollapsed(!libraryCollapsed)}
          onLoadProject={handleLoadProject}
        />
        <EditorPanel onEditorReady={handleEditorReady} />
        <SearchPanel onInsertFragment={handleInsertFragment} />
      </div>
    </div>
  );
}

export default App;
