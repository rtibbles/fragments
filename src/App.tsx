import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import type { Editor } from "@tiptap/react";
import { invoke } from "@tauri-apps/api/core";
import { Toolbar } from "./components/Toolbar";
import { LibraryPanel } from "./components/LibraryPanel";
import { EditorPanel } from "./components/EditorPanel";
import { SearchPanel } from "./components/SearchPanel";
import { CitationsPanel } from "./components/CitationsPanel";
import { useProject } from "./hooks/useProject";
import { exportRichText } from "./utils/export";
import { getReferencedDocIds } from "./utils/documents";
import "./App.css";

interface UpdateInfo {
  has_update: boolean;
  latest_version: string;
  current_version: string;
  download_url: string;
}

function App() {
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);
  const [showCitations, setShowCitations] = useState(false);
  const [editorVersion, setEditorVersion] = useState(0);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const editorRef = useRef<Editor | null>(null);

  useEffect(() => {
    invoke<UpdateInfo>("check_for_updates")
      .then((info) => {
        if (info.has_update) setUpdateInfo(info);
      })
      .catch(() => {});
  }, []);

  const { project, loadProject, setTitle, save } = useProject(editorRef);

  const handleEditorReady = useCallback((editor: Editor) => {
    editorRef.current = editor;
    editor.on("update", () => {
      setEditorVersion((v) => v + 1);
    });
  }, []);

  const handleLoadProject = useCallback(
    (id: number, title: string, contentJson: string) => {
      loadProject(id, title, contentJson);
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
      {updateInfo && (
        <div className="update-banner">
          <span>
            Version {updateInfo.latest_version} is available (you have {updateInfo.current_version}).
          </span>
          <a
            href={updateInfo.download_url}
            target="_blank"
            rel="noopener noreferrer"
            className="update-banner__link"
          >
            Download
          </a>
          <button
            className="update-banner__dismiss"
            onClick={() => setUpdateInfo(null)}
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}
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
