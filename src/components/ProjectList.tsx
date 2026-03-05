import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface ProjectData {
  id: number;
  title: string;
  updated_at: string;
}

interface ProjectListProps {
  projects: ProjectData[];
  currentProjectId: number | null;
  onLoad: (project: ProjectData) => void;
  onRefresh: () => void;
}

export function ProjectList({
  projects,
  currentProjectId,
  onLoad,
  onRefresh,
}: ProjectListProps) {
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    try {
      await invoke("save_project", {
        id: null,
        title: newTitle.trim(),
        contentJson: JSON.stringify({ type: "doc", content: [] }),
      });
      setNewTitle("");
      setCreating(false);
      onRefresh();
    } catch (err) {
      console.error("Failed to create project:", err);
    }
  };

  return (
    <div>
      <div className="library-panel__actions">
        <button
          className="library-panel__btn"
          onClick={() => setCreating(!creating)}
        >
          + New
        </button>
      </div>
      {creating && (
        <div className="library-project__create">
          <input
            className="library-project__input"
            placeholder="Project title..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") setCreating(false);
            }}
            autoFocus
          />
          <button className="library-panel__btn" onClick={handleCreate}>
            Create
          </button>
        </div>
      )}
      {projects.length === 0 && !creating && (
        <p className="library-panel__empty">No projects yet</p>
      )}
      {projects.map((project) => (
        <div
          key={project.id}
          className={`library-project ${project.id === currentProjectId ? "library-project--active" : ""}`}
          onClick={() => onLoad(project)}
        >
          <div className="library-project__title">{project.title}</div>
          <div className="library-project__date">
            {new Date(project.updated_at).toLocaleDateString()}
          </div>
        </div>
      ))}
    </div>
  );
}
