import { useState } from "react";
import "./Toolbar.css";

interface ToolbarProps {
  projectName?: string;
  showCitations?: boolean;
  onToggleCitations?: () => void;
  onExport?: () => void;
  onTitleChange?: (title: string) => void;
  storageWarning?: string | null;
}

export function Toolbar({
  projectName = "Untitled",
  showCitations,
  onToggleCitations,
  onExport,
  onTitleChange,
  storageWarning,
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
    <div className="toolbar" data-testid="toolbar">
      <div className="toolbar__left">
        <span className="toolbar__title">Fragments</span>
      </div>
      <div className="toolbar__center">
        {editing ? (
          <input
            className="toolbar__title-input"
            data-testid="toolbar-title-input"
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
            data-testid="toolbar-project-name"
            onDoubleClick={handleStartEdit}
            title="Double-click to rename"
          >
            {projectName}
          </span>
        )}
        {storageWarning && (
          <span className="toolbar__warning" data-testid="toolbar-warning" role="status">
            {storageWarning}
          </span>
        )}
      </div>
      <div className="toolbar__right">
        <button
          className={`toolbar__btn ${showCitations ? "toolbar__btn--active" : ""}`}
          onClick={onToggleCitations}
          data-testid="toolbar-citations-btn"
        >
          Citations
        </button>
        <button className="toolbar__btn" onClick={onExport} data-testid="toolbar-export-btn">
          Export
        </button>
      </div>
    </div>
  );
}
