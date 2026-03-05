import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DocumentList, type DocumentData } from "./DocumentList";
import { ProjectList, type ProjectData } from "./ProjectList";
import { MetadataEditor } from "./MetadataEditor";
import "./LibraryPanel.css";

type Tab = "documents" | "projects";

interface LibraryPanelProps {
  collapsed: boolean;
  onToggle: () => void;
  onLoadProject?: (id: number, contentJson: string) => void;
}

export function LibraryPanel({
  collapsed,
  onToggle,
  onLoadProject,
}: LibraryPanelProps) {
  const [tab, setTab] = useState<Tab>("documents");
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);
  const [editingDoc, setEditingDoc] = useState<DocumentData | null>(null);

  const loadDocuments = useCallback(async () => {
    try {
      const docs = await invoke<DocumentData[]>("list_documents");
      setDocuments(docs);
    } catch {
      setDocuments([]);
    }
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const projs = await invoke<ProjectData[]>("list_projects");
      setProjects(projs);
    } catch {
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
    loadProjects();
  }, [loadDocuments, loadProjects]);

  const handleLoadProject = async (project: ProjectData) => {
    try {
      const contentJson = await invoke<string>("load_project", {
        id: project.id,
      });
      setCurrentProjectId(project.id);
      onLoadProject?.(project.id, contentJson);
    } catch (err) {
      console.error("Failed to load project:", err);
    }
  };

  return (
    <div
      className={`library-panel ${collapsed ? "library-panel--collapsed" : ""}`}
    >
      <div className="library-panel__header">
        <button className="library-panel__toggle" onClick={onToggle}>
          {collapsed ? "▶" : "◀"}
        </button>
        {!collapsed && <span className="library-panel__title">Library</span>}
      </div>
      {!collapsed && (
        <>
          <div className="library-panel__tabs">
            <button
              className={`library-panel__tab ${tab === "documents" ? "library-panel__tab--active" : ""}`}
              onClick={() => setTab("documents")}
            >
              Documents
            </button>
            <button
              className={`library-panel__tab ${tab === "projects" ? "library-panel__tab--active" : ""}`}
              onClick={() => setTab("projects")}
            >
              Projects
            </button>
          </div>
          <div className="library-panel__content">
            {tab === "documents" && (
              <DocumentList
                documents={documents}
                onRefresh={loadDocuments}
                onEditMetadata={setEditingDoc}
              />
            )}
            {tab === "projects" && (
              <ProjectList
                projects={projects}
                currentProjectId={currentProjectId}
                onLoad={handleLoadProject}
                onRefresh={loadProjects}
              />
            )}
          </div>
        </>
      )}
      {editingDoc && (
        <MetadataEditor
          document={editingDoc}
          onClose={() => setEditingDoc(null)}
          onSaved={loadDocuments}
        />
      )}
    </div>
  );
}
