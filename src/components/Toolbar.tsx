import "./Toolbar.css";

export function Toolbar() {
  return (
    <div className="toolbar">
      <div className="toolbar__left">
        <span className="toolbar__title">Fragments</span>
      </div>
      <div className="toolbar__center">
        <span className="toolbar__project-name">Untitled Poem</span>
      </div>
      <div className="toolbar__right">
        <button className="toolbar__btn">Export</button>
      </div>
    </div>
  );
}
