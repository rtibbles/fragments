# Fragments

Fragments is a desktop writing tool for poets and researchers built with Tauri, React, and TypeScript. It provides a rich text editor with corpus search, fragment insertion, inline autocomplete, Chicago-style citations, and project management — all backed by a local SQLite database.

## Prerequisites

- [Rust](https://rustup.rs/) (stable toolchain)
- [Node.js](https://nodejs.org/) (v18+)
- System dependencies for Tauri on Linux:
  ```
  sudo dnf install webkit2gtk4.1-devel gtk3-devel libappindicator-gtk3-devel librsvg2-devel pango-devel
  ```
  See the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for other platforms.

## Getting Started

```bash
npm install
npm run tauri dev
```

## Building

```bash
npm run tauri build
```

This produces platform-specific packages in `src-tauri/target/release/bundle/` (e.g. `.deb`, `.AppImage`, `.rpm` on Linux, `.dmg` on macOS, `.msi` on Windows). The raw binary is at `src-tauri/target/release/fragments`.

To run the built app directly:

```bash
./src-tauri/target/release/fragments
```

## Testing

**Backend (Rust unit tests):**

```bash
cd src-tauri && cargo test
```

**E2E (WebdriverIO + tauri-driver):**

Requires `tauri-driver` (`cargo install tauri-driver --locked`) and `WebKitWebDriver` (system package).

```bash
npm run test:build   # Build debug binary
npm run test:e2e     # Run E2E tests
```

## Project Structure

```
src/                  React frontend
  components/         UI components (Toolbar, EditorPanel, SearchPanel, etc.)
  extensions/         TipTap editor extensions (FragmentNode, autocomplete)
  hooks/              React hooks (useProject, etc.)
  utils/              Utilities (Chicago citation formatter, export)
src-tauri/            Rust backend
  src/                Tauri commands, SQLite database, search engine
e2e/                  WebdriverIO E2E test specs
```
