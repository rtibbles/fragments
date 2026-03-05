import { useState } from "react";
import { Toolbar } from "./components/Toolbar";
import { LibraryPanel } from "./components/LibraryPanel";
import { EditorPanel } from "./components/EditorPanel";
import { SearchPanel } from "./components/SearchPanel";
import "./App.css";

function App() {
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);

  return (
    <div className="app">
      <Toolbar />
      <div className="app__workspace">
        <LibraryPanel
          collapsed={libraryCollapsed}
          onToggle={() => setLibraryCollapsed(!libraryCollapsed)}
        />
        <EditorPanel />
        <SearchPanel />
      </div>
    </div>
  );
}

export default App;
