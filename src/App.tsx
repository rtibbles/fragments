import { useState, useCallback, useRef, useMemo } from "react";
import type { Editor } from "@tiptap/react";
import { Toolbar } from "./components/Toolbar";
import { LibraryPanel } from "./components/LibraryPanel";
import { EditorPanel } from "./components/EditorPanel";
import { SearchPanel } from "./components/SearchPanel";
import { CitationsPanel } from "./components/CitationsPanel";
import { useProject } from "./hooks/useProject";
import { exportRichText } from "./utils/export";
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
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);

  const { project, loadProject, setTitle, save } = useProject(editorInstance);

  const handleEditorReady = useCallback((editor: Editor) => {
    editorRef.current = editor;
    setEditorInstance(editor);
    editor.on("update", () => {
      setEditorVersion((v) => v + 1);
    });
  }, []);

  const handleLoadProject = useCallback(
    (id: number, _contentJson: string) => {
      loadProject(id);
    },
    [loadProject]
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

  const handleExport = useCallback(async () => {
    const editor = editorRef.current;
    if (editor) {
      await exportRichText(editor, project.title);
    }
  }, [project.title]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const referencedDocIds = useMemo(
    () => getReferencedDocIds(editorRef.current),
    [editorVersion]
  );

  return (
    <div className="app">
      <Toolbar
        projectName={project.title}
        saveStatus={project.saveStatus}
        showCitations={showCitations}
        onToggleCitations={() => setShowCitations(!showCitations)}
        onExport={handleExport}
        onTitleChange={setTitle}
        onSave={save}
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
