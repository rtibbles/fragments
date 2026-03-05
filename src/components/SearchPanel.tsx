import "./SearchPanel.css";

export function SearchPanel() {
  return (
    <div className="search-panel">
      <div className="search-panel__header">
        <input
          className="search-panel__input"
          type="text"
          placeholder="Search fragments..."
        />
      </div>
      <div className="search-panel__results">
        <p className="search-panel__empty">
          Search your corpus to find fragments
        </p>
      </div>
    </div>
  );
}
