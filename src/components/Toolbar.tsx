import "./Toolbar.css";

interface ToolbarProps {
  projectName?: string;
  showCitations?: boolean;
  onToggleCitations?: () => void;
  onExport?: () => void;
}

export function Toolbar({
  projectName = "Untitled Poem",
  showCitations,
  onToggleCitations,
  onExport,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="toolbar__left">
        <span className="toolbar__title">Fragments</span>
      </div>
      <div className="toolbar__center">
        <span className="toolbar__project-name">{projectName}</span>
      </div>
      <div className="toolbar__right">
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
