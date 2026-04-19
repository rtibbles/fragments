import { useEffect, useState } from "react";
import "./Toolbar.css";

interface ToolbarProps {
  projectName?: string;
  showCitations?: boolean;
  onToggleCitations?: () => void;
  onCopy?: () => Promise<void> | void;
  onTitleChange?: (title: string) => void;
  storageWarning?: string | null;
}

export function Toolbar({
  projectName = "Untitled",
  showCitations,
  onToggleCitations,
  onCopy,
  onTitleChange,
  storageWarning,
}: ToolbarProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(projectName);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (copyState === "idle") return;
    const t = setTimeout(() => setCopyState("idle"), 1500);
    return () => clearTimeout(t);
  }, [copyState]);

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

  const handleCopy = async () => {
    if (!onCopy) return;
    try {
      await onCopy();
      setCopyState("copied");
    } catch {
      setCopyState("failed");
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
        <button
          className="toolbar__btn"
          onClick={handleCopy}
          data-testid="toolbar-copy-btn"
        >
          {copyState === "copied"
            ? "Copied!"
            : copyState === "failed"
              ? "Copy failed"
              : "Copy"}
        </button>
      </div>
    </div>
  );
}
