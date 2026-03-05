import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Editor } from "@tiptap/react";

export type SaveStatus = "saved" | "saving" | "unsaved";

export interface ProjectState {
  id: number | null;
  title: string;
  saveStatus: SaveStatus;
}

export function useProject(editor: Editor | null) {
  const [project, setProject] = useState<ProjectState>({
    id: null,
    title: "Untitled Poem",
    saveStatus: "saved",
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const editorRef = useRef(editor);
  editorRef.current = editor;

  const save = useCallback(async () => {
    const ed = editorRef.current;
    if (!ed) return;

    const contentJson = JSON.stringify(ed.getJSON());

    setProject((prev) => ({ ...prev, saveStatus: "saving" }));
    try {
      const id = await invoke<number>("save_project", {
        id: project.id,
        title: project.title,
        contentJson,
      });
      setProject((prev) => ({ ...prev, id, saveStatus: "saved" }));
    } catch (err) {
      console.error("Save failed:", err);
      setProject((prev) => ({ ...prev, saveStatus: "unsaved" }));
    }
  }, [project.id, project.title]);

  const markUnsaved = useCallback(() => {
    setProject((prev) => {
      if (prev.saveStatus === "saved") {
        return { ...prev, saveStatus: "unsaved" };
      }
      return prev;
    });
  }, []);

  // Debounced auto-save on content changes
  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      markUnsaved();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        save();
      }, 5000);
    };
    editor.on("update", handler);
    return () => {
      editor.off("update", handler);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [editor, save, markUnsaved]);

  const loadProject = useCallback(
    async (id: number) => {
      try {
        const contentJson = await invoke<string>("load_project", { id });
        // Get project title from the list
        const projects = await invoke<{ id: number; title: string }[]>(
          "list_projects"
        );
        const proj = projects.find((p) => p.id === id);
        setProject({
          id,
          title: proj?.title || "Untitled Poem",
          saveStatus: "saved",
        });
        if (editor) {
          try {
            const content = JSON.parse(contentJson);
            editor.commands.setContent(content);
          } catch {
            editor.commands.setContent("");
          }
        }
      } catch (err) {
        console.error("Load failed:", err);
      }
    },
    [editor]
  );

  const createProject = useCallback(
    async (title: string) => {
      const contentJson = editor
        ? JSON.stringify(editor.getJSON())
        : JSON.stringify({ type: "doc", content: [] });
      try {
        const id = await invoke<number>("save_project", {
          id: null,
          title,
          contentJson,
        });
        setProject({ id, title, saveStatus: "saved" });
      } catch (err) {
        console.error("Create failed:", err);
      }
    },
    [editor]
  );

  const setTitle = useCallback((title: string) => {
    setProject((prev) => ({ ...prev, title, saveStatus: "unsaved" }));
  }, []);

  return {
    project,
    save,
    loadProject,
    createProject,
    setTitle,
  };
}
