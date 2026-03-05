import { useState } from "react";
import type { SaveStatus } from "../hooks/useProject";
import "./Toolbar.css";

interface ToolbarProps {
  projectName?: string;
  saveStatus?: SaveStatus;
  showCitations?: boolean;
  onToggleCitations?: () => void;
  onExport?: () => void;
  onTitleChange?: (title: string) => void;
  onSave?: () => void;
}

const statusLabels: Record<SaveStatus, string> = {
  saved: "Saved",
  saving: "Saving...",
  unsaved: "Unsaved",
};

export function Toolbar({
  projectName = "Untitled Poem",
  saveStatus = "saved",
  showCitations,
  onToggleCitations,
  onExport,
  onTitleChange,
  onSave,
}: ToolbarProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(projectName);

  const handleStartEdit = () => {
    setEditValue(projectName);
    setEditing(true);
  };

  const handleFinishEdit = () => {
    setEditing(false);
    if (editValue.trim() && editValue !== projectName) {
      onTitleChange?.(editValue.trim());
    }
  };

  return (
    <div className="toolbar">
      <div className="toolbar__left">
        <span className="toolbar__title">Fragments</span>
      </div>
      <div className="toolbar__center">
        {editing ? (
          <input
            className="toolbar__title-input"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleFinishEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleFinishEdit();
              if (e.key === "Escape") setEditing(false);
            }}
            autoFocus
          />
        ) : (
          <span
            className="toolbar__project-name"
            onDoubleClick={handleStartEdit}
            title="Double-click to rename"
          >
            {projectName}
          </span>
        )}
        <span className={`toolbar__save-status toolbar__save-status--${saveStatus}`}>
          {statusLabels[saveStatus]}
        </span>
      </div>
      <div className="toolbar__right">
        {saveStatus === "unsaved" && (
          <button className="toolbar__btn" onClick={onSave}>
            Save
          </button>
        )}
        <button
          className={`toolbar__btn ${showCitations ? "toolbar__btn--active" : ""}`}
          onClick={onToggleCitations}
        >
          Citations
        </button>
        <button className="toolbar__btn" onClick={onExport}>
          Export
        </button>
      </div>
    </div>
  );
}
