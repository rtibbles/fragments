import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { Toolbar } from "./components/Toolbar";
import { EditorPanel } from "./components/EditorPanel";
import { SearchPanel } from "./components/SearchPanel";
import { CitationsPanel } from "./components/CitationsPanel";
import { AppLoading } from "./components/AppLoading";
import { AppError } from "./components/AppError";
import { CorpusProvider, useCorpusContext } from "./context/CorpusContext";
import { useCorpus } from "./hooks/useCorpus";
import { useProject } from "./hooks/useProject";
import { exportRichText } from "./utils/export";
import { getReferencedDocIds } from "./utils/documents";
import type { FragmentAttrs } from "./extensions/FragmentMark";
import "./App.css";

function App() {
  const corpus = useCorpus();

  if (corpus.status === "loading") return <AppLoading />;
  if (corpus.status === "error") {
    return <AppError error={corpus.error} onRetry={corpus.retry} />;
  }

  return (
    <CorpusProvider value={{
      documents: corpus.documents,
      byId: corpus.byId,
      miniSearch: corpus.miniSearch,
    }}>
      <AppBody />
    </CorpusProvider>
  );
}

function AppBody() {
  const { documents } = useCorpusContext();
  const [showCitations, setShowCitations] = useState(false);
  const [editorVersion, setEditorVersion] = useState(0);
  const editorRef = useRef<Editor | null>(null);
  const { project, setTitle, setContentJson, storageError } = useProject();
  // Captured on first render; never updated. handleEditorReady re-runs if any
  // of its deps change, and re-running would call setContent again — wiping
  // the selection mid-keystroke. So keep the initial load in a ref.
  const initialContentRef = useRef(project.contentJson);

  const handleEditorReady = useCallback((editor: Editor) => {
    editorRef.current = editor;
    try {
      editor.commands.setContent(JSON.parse(initialContentRef.current));
    } catch { /* empty */ }
    editor.on("update", () => {
      setEditorVersion((v) => v + 1);
      setContentJson(JSON.stringify(editor.getJSON()));
    });
  }, [setContentJson]);

  const handleInsertFragment = useCallback(
    (attrs: FragmentAttrs & { text: string }) => {
      editorRef.current?.chain().focus().insertFragment(attrs).run();
    },
    [],
  );

  const handleExport = useCallback(() => {
    const editor = editorRef.current;
    if (editor) exportRichText(editor, project.title, documents);
  }, [project.title, documents]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const referencedDocIds = useMemo(
    () => getReferencedDocIds(editorRef.current),
    [editorVersion],
  );

  // Clicking a superscript footnote opens the citations panel, scrolls to
  // the matching entry, and flashes it.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ docId: string }>).detail;
      setShowCitations(true);
      // Wait a tick for the panel to mount before scrolling.
      requestAnimationFrame(() => {
        const target = document.getElementById(`citation-${detail.docId}`);
        if (!target) return;
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.classList.add("citations-panel__entry--flash");
        window.setTimeout(() => {
          target.classList.remove("citations-panel__entry--flash");
        }, 1200);
      });
    };
    document.addEventListener("fragment-footnote-click", handler);
    return () => document.removeEventListener("fragment-footnote-click", handler);
  }, []);

  const storageWarning = storageError
    ? "Saving disabled — storage unavailable."
    : null;

  return (
    <div className="app">
      <Toolbar
        projectName={project.title}
        showCitations={showCitations}
        onToggleCitations={() => setShowCitations(!showCitations)}
        onExport={handleExport}
        onTitleChange={setTitle}
        storageWarning={storageWarning}
      />
      <div className="app__workspace">
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
