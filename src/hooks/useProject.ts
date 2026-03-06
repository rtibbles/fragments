import type React from "react";
import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Editor } from "@tiptap/react";

export type SaveStatus = "saved" | "saving" | "unsaved";

export interface ProjectState {
  id: number | null;
  title: string;
  saveStatus: SaveStatus;
}

export function useProject(editorRef: React.RefObject<Editor | null>) {
  const [project, setProject] = useState<ProjectState>({
    id: null,
    title: "Untitled Poem",
    saveStatus: "saved",
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

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
    const editor = editorRef.current;
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
  }, [editorRef, save, markUnsaved]);

  const loadProject = useCallback(
    (id: number, title: string, contentJson: string) => {
      setProject({
        id,
        title,
        saveStatus: "saved",
      });
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
    [editorRef]
  );

  const createProject = useCallback(
    async (title: string) => {
      const editor = editorRef.current;
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
    [editorRef]
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
