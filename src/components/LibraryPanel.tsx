import "./LibraryPanel.css";

interface LibraryPanelProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function LibraryPanel({ collapsed, onToggle }: LibraryPanelProps) {
  return (
    <div className={`library-panel ${collapsed ? "library-panel--collapsed" : ""}`}>
      <div className="library-panel__header">
        <button className="library-panel__toggle" onClick={onToggle}>
          {collapsed ? "\u25B6" : "\u25C0"}
        </button>
        {!collapsed && <span className="library-panel__title">Library</span>}
      </div>
      {!collapsed && (
        <div className="library-panel__content">
          <div className="library-panel__section">
            <h3>Documents</h3>
            <p className="library-panel__empty">No documents imported</p>
          </div>
          <div className="library-panel__section">
            <h3>Projects</h3>
            <p className="library-panel__empty">No projects yet</p>
          </div>
        </div>
      )}
    </div>
  );
}
