# Fragments Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Tauri v2 desktop app for composing found poetry from PDF corpora and Kobo highlights.

**Architecture:** Tauri v2 with React + TipTap frontend, Rust backend with SQLite (source of truth) + Tantivy (search index). Three-panel UI: library, editor, search. Custom TipTap fragment nodes with torn-paper styling. Chicago-style citations auto-generated from provenance.

**Tech Stack:** Tauri v2, React, TypeScript, TipTap v3, rusqlite 0.38 (bundled), tantivy 0.25, pdf-extract 0.10, reqwest (via tauri-plugin-http), CrossRef API, CSS clip-path for jagged edges.

**Design doc:** `docs/plans/2026-03-04-fragments-design.md`

---

## Task 1: Scaffold Tauri v2 + React Project

**Files:**
- Create: project root via `create-tauri-app`
- Modify: `src-tauri/Cargo.toml` (add dependencies)
- Modify: `src-tauri/capabilities/default.json` (add permissions)
- Modify: `package.json` (add frontend dependencies)

**Step 1: Create the Tauri v2 project**

Run:
```bash
cd /var/home/richard/github/fragments
npm create tauri-app@latest . -- --template react-ts
```

Expected: Scaffolded project with `src/`, `src-tauri/`, `package.json`, `vite.config.ts`.

**Step 2: Add Rust dependencies**

Edit `src-tauri/Cargo.toml` to add under `[dependencies]`:

```toml
rusqlite = { version = "0.38", features = ["bundled"] }
tantivy = "0.25"
pdf-extract = "0.10"
tauri-plugin-fs = "2"
tauri-plugin-http = "2"
thiserror = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
```

**Step 3: Add frontend dependencies**

Run:
```bash
npm install @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/suggestion @tiptap/extensions @floating-ui/dom
```

**Step 4: Configure Tauri permissions**

Edit `src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default permissions for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "fs:default",
    {
      "identifier": "fs:allow-read-text-file",
      "allow": [{ "path": "$APPDATA/*" }, { "path": "$HOME/**" }]
    },
    {
      "identifier": "fs:allow-write-text-file",
      "allow": [{ "path": "$APPDATA/*" }]
    },
    {
      "identifier": "fs:allow-read-dir",
      "allow": [{ "path": "$APPDATA/*" }, { "path": "$HOME/**" }]
    },
    {
      "identifier": "fs:allow-mkdir",
      "allow": [{ "path": "$APPDATA/*" }]
    },
    {
      "identifier": "http:default"
    }
  ]
}
```

**Step 5: Register Tauri plugins**

Edit `src-tauri/src/lib.rs` to register plugins:

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Step 6: Verify the app builds and launches**

Run:
```bash
npm run tauri dev
```

Expected: Empty Tauri window opens with the React template content.

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: scaffold Tauri v2 + React project with dependencies"
```

---

## Task 2: SQLite Database Schema and Migrations

**Files:**
- Create: `src-tauri/src/db.rs`
- Modify: `src-tauri/src/lib.rs` (register db module, manage state)

**Step 1: Write the test for database initialization**

Create `src-tauri/src/db.rs`:

```rust
use rusqlite::{Connection, params};
use std::path::Path;

pub fn open_database(path: &Path) -> Result<Connection, rusqlite::Error> {
    let conn = Connection::open(path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
    run_migrations(&conn)?;
    Ok(conn)
}

fn run_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS documents (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            title           TEXT NOT NULL,
            subtitle        TEXT,
            publication_date TEXT,
            publisher       TEXT,
            journal_name    TEXT,
            volume          TEXT,
            issue           TEXT,
            page_range      TEXT,
            edition         TEXT,
            doi             TEXT,
            isbn            TEXT,
            url             TEXT,
            retrieval_date  TEXT,
            document_type   TEXT NOT NULL DEFAULT 'book',
            container_title TEXT,
            file_path       TEXT NOT NULL,
            import_date     TEXT NOT NULL,
            UNIQUE(file_path)
        );

        CREATE TABLE IF NOT EXISTS authors (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            first_name  TEXT NOT NULL,
            last_name   TEXT NOT NULL,
            role        TEXT NOT NULL DEFAULT 'author',
            position    INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS chunks (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            content     TEXT NOT NULL,
            page_number INTEGER NOT NULL,
            position    INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS highlights (
            id                   INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id          INTEGER REFERENCES documents(id) ON DELETE SET NULL,
            chunk_id             INTEGER REFERENCES chunks(id) ON DELETE SET NULL,
            text                 TEXT NOT NULL,
            annotation           TEXT,
            kobo_chapter_progress REAL,
            kobo_volume_id       TEXT,
            date_created         TEXT
        );

        CREATE TABLE IF NOT EXISTS projects (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            title         TEXT NOT NULL,
            content_json  TEXT NOT NULL DEFAULT '{}',
            created_at    TEXT NOT NULL,
            updated_at    TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS citations (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            chunk_id      INTEGER REFERENCES chunks(id) ON DELETE SET NULL,
            highlight_id  INTEGER REFERENCES highlights(id) ON DELETE SET NULL,
            inserted_text TEXT NOT NULL,
            source_snapshot TEXT NOT NULL,
            modified      INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id);
        CREATE INDEX IF NOT EXISTS idx_highlights_document ON highlights(document_id);
        CREATE INDEX IF NOT EXISTS idx_authors_document ON authors(document_id);
        CREATE INDEX IF NOT EXISTS idx_citations_project ON citations(project_id);
    ")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_open_database_creates_tables() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let conn = open_database(&db_path).unwrap();

        // Verify all tables exist
        let tables: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();

        assert!(tables.contains(&"documents".to_string()));
        assert!(tables.contains(&"authors".to_string()));
        assert!(tables.contains(&"chunks".to_string()));
        assert!(tables.contains(&"highlights".to_string()));
        assert!(tables.contains(&"projects".to_string()));
        assert!(tables.contains(&"citations".to_string()));
    }

    #[test]
    fn test_insert_document_with_authors() {
        let dir = tempfile::tempdir().unwrap();
        let conn = open_database(&dir.path().join("test.db")).unwrap();

        conn.execute(
            "INSERT INTO documents (title, document_type, file_path, import_date)
             VALUES (?1, ?2, ?3, ?4)",
            params!["Test Book", "book", "/path/to/book.pdf", "2026-03-04"],
        ).unwrap();

        let doc_id = conn.last_insert_rowid();

        conn.execute(
            "INSERT INTO authors (document_id, first_name, last_name, role, position)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![doc_id, "Jane", "Smith", "author", 0],
        ).unwrap();

        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM authors WHERE document_id = ?1",
            params![doc_id],
            |row| row.get(0),
        ).unwrap();

        assert_eq!(count, 1);
    }
}
```

**Step 2: Add tempfile dev-dependency**

Add to `src-tauri/Cargo.toml` under `[dev-dependencies]`:

```toml
[dev-dependencies]
tempfile = "3"
```

**Step 3: Run tests to verify they pass**

Run:
```bash
cd src-tauri && cargo test db::tests
```

Expected: 2 tests pass.

**Step 4: Wire database into Tauri app state**

Modify `src-tauri/src/lib.rs`:

```rust
mod db;

use std::sync::Mutex;
use rusqlite::Connection;

pub struct AppState {
    pub db: Mutex<Connection>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            let app_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_dir)?;
            let db_path = app_dir.join("fragments.db");
            let conn = db::open_database(&db_path)
                .expect("Failed to open database");
            app.manage(AppState { db: Mutex::new(conn) });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Step 5: Verify app still launches**

Run:
```bash
npm run tauri dev
```

Expected: App launches, database file created in app data directory.

**Step 6: Commit**

```bash
git add src-tauri/src/db.rs src-tauri/src/lib.rs src-tauri/Cargo.toml
git commit -m "feat: add SQLite database schema with migrations and tests"
```

---

## Task 3: PDF Text Extraction

**Files:**
- Create: `src-tauri/src/pdf.rs`
- Modify: `src-tauri/src/lib.rs` (register module)

**Step 1: Write the test for PDF text extraction**

Create `src-tauri/src/pdf.rs`:

```rust
use std::path::Path;

pub struct ExtractedPage {
    pub page_number: u64,
    pub text: String,
}

pub fn extract_pages(path: &Path) -> Result<Vec<ExtractedPage>, String> {
    let pages = pdf_extract::extract_text_by_pages(path)
        .map_err(|e| format!("PDF extraction failed: {}", e))?;

    Ok(pages
        .into_iter()
        .enumerate()
        .filter_map(|(idx, text)| {
            let trimmed = text.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(ExtractedPage {
                    page_number: (idx + 1) as u64,
                    text: trimmed,
                })
            }
        })
        .collect())
}

/// Try to extract a DOI from the first few pages of a PDF.
/// Looks for patterns like "doi:10.xxxx/yyyy" or "https://doi.org/10.xxxx/yyyy".
pub fn extract_doi(pages: &[ExtractedPage]) -> Option<String> {
    let doi_regex = regex::Regex::new(
        r"(?i)(?:doi[:\s]*|https?://(?:dx\.)?doi\.org/)?(10\.\d{4,}/[^\s,;}\]]+)"
    ).ok()?;

    // Search first 3 pages for a DOI
    for page in pages.iter().take(3) {
        if let Some(captures) = doi_regex.captures(&page.text) {
            if let Some(doi) = captures.get(1) {
                return Some(doi.as_str().trim_end_matches('.').to_string());
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_doi_from_text() {
        let pages = vec![
            ExtractedPage { page_number: 1, text: "Title\nSome text doi:10.1234/test.2024 more text".into() },
        ];
        assert_eq!(extract_doi(&pages), Some("10.1234/test.2024".into()));
    }

    #[test]
    fn test_extract_doi_url_format() {
        let pages = vec![
            ExtractedPage { page_number: 1, text: "https://doi.org/10.5678/example more".into() },
        ];
        assert_eq!(extract_doi(&pages), Some("10.5678/example".into()));
    }

    #[test]
    fn test_extract_doi_not_found() {
        let pages = vec![
            ExtractedPage { page_number: 1, text: "No DOI here.".into() },
        ];
        assert_eq!(extract_doi(&pages), None);
    }
}
```

**Step 2: Add regex dependency**

Add to `src-tauri/Cargo.toml` under `[dependencies]`:

```toml
regex = "1"
```

**Step 3: Run tests**

Run:
```bash
cd src-tauri && cargo test pdf::tests
```

Expected: 3 tests pass.

**Step 4: Register module**

Add `mod pdf;` to `src-tauri/src/lib.rs`.

**Step 5: Commit**

```bash
git add src-tauri/src/pdf.rs src-tauri/src/lib.rs src-tauri/Cargo.toml
git commit -m "feat: add PDF text extraction with DOI detection"
```

---

## Task 4: Tantivy Search Index

**Files:**
- Create: `src-tauri/src/search.rs`
- Modify: `src-tauri/src/lib.rs` (register module, add to state)

**Step 1: Write search index with tests**

Create `src-tauri/src/search.rs`:

```rust
use std::path::Path;
use tantivy::{
    doc, Index, IndexReader, IndexWriter, ReloadPolicy, TantivyDocument, Term,
    collector::TopDocs,
    query::{BooleanQuery, BoostQuery, Occur, QueryParser, TermQuery},
    schema::{
        Field, IndexRecordOption, NumericOptions, Schema, STORED, STRING, TEXT,
    },
};

pub struct SearchIndex {
    index: Index,
    reader: IndexReader,
    schema: Schema,
    // Field handles
    pub content: Field,
    pub source_title: Field,
    pub source_id: Field,
    pub page_number: Field,
    pub is_highlight: Field,
    pub row_id: Field,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SearchResult {
    pub text: String,
    pub source_title: String,
    pub source_id: u64,
    pub page_number: u64,
    pub is_highlight: bool,
    pub row_id: u64,
    pub score: f32,
}

impl SearchIndex {
    pub fn open_or_create(dir: &Path) -> Result<Self, String> {
        let mut builder = Schema::builder();

        let content = builder.add_text_field("content", TEXT | STORED);
        let source_title = builder.add_text_field("source_title", STRING | STORED);
        let source_id = builder.add_u64_field("source_id",
            NumericOptions::default().set_indexed().set_stored().set_fast());
        let page_number = builder.add_u64_field("page_number",
            NumericOptions::default().set_indexed().set_stored().set_fast());
        let is_highlight = builder.add_bool_field("is_highlight",
            NumericOptions::default().set_indexed().set_stored().set_fast());
        let row_id = builder.add_u64_field("row_id",
            NumericOptions::default().set_indexed().set_stored().set_fast());

        let schema = builder.build();

        let index = if dir.join("meta.json").exists() {
            Index::open_in_dir(dir).map_err(|e| e.to_string())?
        } else {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
            Index::create_in_dir(dir, schema.clone()).map_err(|e| e.to_string())?
        };

        let reader = index.reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()
            .map_err(|e: tantivy::TantivyError| e.to_string())?;

        Ok(Self { index, reader, schema, content, source_title, source_id, page_number, is_highlight, row_id })
    }

    pub fn writer(&self) -> Result<IndexWriter, String> {
        self.index.writer(50_000_000).map_err(|e| e.to_string())
    }

    pub fn add_chunk(
        &self, writer: &IndexWriter,
        text: &str, title: &str, doc_id: u64, page: u64, highlight: bool, id: u64,
    ) -> Result<(), String> {
        writer.add_document(doc!(
            self.content      => text,
            self.source_title => title,
            self.source_id    => doc_id,
            self.page_number  => page,
            self.is_highlight  => highlight,
            self.row_id       => id,
        )).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn search(
        &self, query_str: &str, highlights_only: bool, limit: usize, highlight_boost: f32,
    ) -> Result<Vec<SearchResult>, String> {
        let searcher = self.reader.searcher();
        let mut parser = QueryParser::for_index(&self.index, vec![self.content]);
        parser.set_conjunction_by_default();

        let base_query = parser.parse_query(query_str).map_err(|e| e.to_string())?;

        let final_query: Box<dyn tantivy::query::Query> = if highlights_only {
            let highlight_term = Term::from_field_bool(self.is_highlight, true);
            let filter = TermQuery::new(highlight_term, IndexRecordOption::Basic);
            Box::new(BooleanQuery::new(vec![
                (Occur::Must, Box::new(base_query)),
                (Occur::Must, Box::new(filter)),
            ]))
        } else {
            let highlight_term = Term::from_field_bool(self.is_highlight, true);
            let boost = BoostQuery::new(
                Box::new(TermQuery::new(highlight_term, IndexRecordOption::Basic)),
                highlight_boost,
            );
            Box::new(BooleanQuery::new(vec![
                (Occur::Must, Box::new(base_query)),
                (Occur::Should, Box::new(boost)),
            ]))
        };

        let hits = searcher.search(&final_query, &TopDocs::with_limit(limit))
            .map_err(|e| e.to_string())?;

        let mut results = Vec::new();
        for (score, addr) in hits {
            let doc: TantivyDocument = searcher.doc(addr).map_err(|e| e.to_string())?;
            results.push(SearchResult {
                text: doc.get_first(self.content)
                    .and_then(|v| v.as_str()).unwrap_or("").to_string(),
                source_title: doc.get_first(self.source_title)
                    .and_then(|v| v.as_str()).unwrap_or("").to_string(),
                source_id: doc.get_first(self.source_id)
                    .and_then(|v| v.as_u64()).unwrap_or(0),
                page_number: doc.get_first(self.page_number)
                    .and_then(|v| v.as_u64()).unwrap_or(0),
                is_highlight: doc.get_first(self.is_highlight)
                    .and_then(|v| v.as_bool()).unwrap_or(false),
                row_id: doc.get_first(self.row_id)
                    .and_then(|v| v.as_u64()).unwrap_or(0),
                score,
            });
        }
        Ok(results)
    }

    pub fn clear_and_rebuild(&self) -> Result<IndexWriter, String> {
        let mut writer = self.writer()?;
        writer.delete_all_documents().map_err(|e| e.to_string())?;
        writer.commit().map_err(|e| e.to_string())?;
        Ok(self.writer()?)
    }

    pub fn reload(&self) -> Result<(), String> {
        self.reader.reload().map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_test_index() -> (SearchIndex, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        let idx = SearchIndex::open_or_create(dir.path()).unwrap();
        let writer = idx.writer().unwrap();

        idx.add_chunk(&writer, "The mitochondria is the powerhouse of the cell", "Biology 101", 1, 42, false, 1).unwrap();
        idx.add_chunk(&writer, "ATP synthesis drives active transport across membranes", "Biology 101", 1, 43, true, 2).unwrap();
        idx.add_chunk(&writer, "Photosynthesis converts light energy into chemical energy", "Plant Science", 2, 10, false, 3).unwrap();

        writer.commit().unwrap();
        idx.reload().unwrap();
        (idx, dir)
    }

    #[test]
    fn test_basic_search() {
        let (idx, _dir) = setup_test_index();
        let results = idx.search("mitochondria", false, 10, 2.0).unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].text.contains("mitochondria"));
    }

    #[test]
    fn test_highlights_only_filter() {
        let (idx, _dir) = setup_test_index();
        // "transport" only appears in the highlight
        let results = idx.search("transport", true, 10, 2.0).unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].is_highlight);
    }

    #[test]
    fn test_highlight_boost() {
        let (idx, _dir) = setup_test_index();
        // Search for "energy" — appears in non-highlight. "active" in highlight.
        // Both should return but highlight should score differently with boost.
        let results = idx.search("energy", false, 10, 2.0).unwrap();
        assert!(!results.is_empty());
    }

    #[test]
    fn test_rebuild_index() {
        let (idx, _dir) = setup_test_index();
        let writer = idx.clear_and_rebuild().unwrap();
        idx.add_chunk(&writer, "New content after rebuild", "New Book", 3, 1, false, 10).unwrap();
        writer.commit().unwrap();
        idx.reload().unwrap();

        let results = idx.search("mitochondria", false, 10, 2.0).unwrap();
        assert_eq!(results.len(), 0);

        let results = idx.search("rebuild", false, 10, 2.0).unwrap();
        assert_eq!(results.len(), 1);
    }
}
```

**Step 2: Run tests**

Run:
```bash
cd src-tauri && cargo test search::tests
```

Expected: 4 tests pass.

**Step 3: Add to app state**

Modify `src-tauri/src/lib.rs` — add `mod search;` and add `SearchIndex` to `AppState`:

```rust
mod db;
mod pdf;
mod search;

use std::sync::Mutex;

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
    pub search: Mutex<search::SearchIndex>,
}
```

Update the `setup` closure to also initialize the search index in the app data directory alongside the database.

**Step 4: Commit**

```bash
git add src-tauri/src/search.rs src-tauri/src/lib.rs
git commit -m "feat: add Tantivy search index with highlight boosting"
```

---

## Task 5: Kobo Import

**Files:**
- Create: `src-tauri/src/kobo.rs`
- Modify: `src-tauri/src/lib.rs` (register module)

**Step 1: Write Kobo reader with tests**

Create `src-tauri/src/kobo.rs`:

```rust
use rusqlite::{Connection, OpenFlags};
use std::path::Path;

#[derive(Debug, Clone, serde::Serialize)]
pub struct KoboHighlight {
    pub bookmark_id: String,
    pub volume_id: String,
    pub text: String,
    pub annotation: Option<String>,
    pub start_container_path: String,
    pub chapter_progress: f64,
    pub date_created: Option<String>,
    pub book_title: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct KoboBook {
    pub volume_id: String,
    pub title: Option<String>,
    pub attribution: Option<String>,
    pub file_path: String,
}

/// Parse a page number from Kobo's StartContainerPath field for PDFs.
pub fn parse_page_number(start_container_path: &str) -> Option<u64> {
    let s = start_container_path.trim();
    if let Ok(n) = s.parse::<u64>() {
        return Some(n);
    }
    if let Some(rest) = s.strip_prefix("Page ") {
        if let Ok(n) = rest.trim().parse::<u64>() {
            return Some(n);
        }
    }
    None
}

/// Extract the on-device file path from a Kobo VolumeID.
/// VolumeID looks like "file:///mnt/onboard/Books/mybook.pdf"
pub fn volume_id_to_relative_path(volume_id: &str) -> Option<String> {
    volume_id.strip_prefix("file:///mnt/onboard/")
        .map(|s| s.to_string())
}

/// Detect if a volume is a PDF based on its VolumeID.
pub fn is_pdf_volume(volume_id: &str) -> bool {
    volume_id.to_lowercase().ends_with(".pdf")
}

/// Read all PDF highlights from a Kobo device's database.
pub fn read_highlights(kobo_db_path: &Path) -> Result<Vec<KoboHighlight>, String> {
    let conn = Connection::open_with_flags(
        kobo_db_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    ).map_err(|e| format!("Failed to open Kobo database: {}", e))?;

    let mut stmt = conn.prepare("
        SELECT
            b.BookmarkID,
            b.VolumeID,
            b.Text,
            b.Annotation,
            b.StartContainerPath,
            CAST(COALESCE(b.ChapterProgress, '0') AS REAL),
            b.DateCreated,
            c.BookTitle
        FROM Bookmark b
        LEFT JOIN content c
            ON c.ContentID = b.VolumeID
           AND c.ContentType = 6
        WHERE b.Text IS NOT NULL
          AND b.Text != ''
        ORDER BY b.VolumeID, CAST(COALESCE(b.ChapterProgress, '0') AS REAL)
    ").map_err(|e| format!("Query failed: {}", e))?;

    let highlights = stmt.query_map([], |row| {
        Ok(KoboHighlight {
            bookmark_id: row.get(0)?,
            volume_id: row.get(1)?,
            text: row.get(2)?,
            annotation: row.get(3)?,
            start_container_path: row.get::<_, String>(4).unwrap_or_default(),
            chapter_progress: row.get(5).unwrap_or(0.0),
            date_created: row.get(6)?,
            book_title: row.get(7)?,
        })
    }).map_err(|e| format!("Query map failed: {}", e))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("Row read failed: {}", e))?;

    Ok(highlights)
}

/// List all PDF books on the Kobo device.
pub fn list_pdf_books(kobo_db_path: &Path) -> Result<Vec<KoboBook>, String> {
    let conn = Connection::open_with_flags(
        kobo_db_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    ).map_err(|e| format!("Failed to open Kobo database: {}", e))?;

    let mut stmt = conn.prepare("
        SELECT ContentID, BookTitle, Attribution
        FROM content
        WHERE ContentType = 6
          AND ContentID LIKE '%.pdf'
        ORDER BY BookTitle
    ").map_err(|e| format!("Query failed: {}", e))?;

    let books = stmt.query_map([], |row| {
        let volume_id: String = row.get(0)?;
        let file_path = volume_id_to_relative_path(&volume_id)
            .unwrap_or_else(|| volume_id.clone());
        Ok(KoboBook {
            volume_id,
            title: row.get(1)?,
            attribution: row.get(2)?,
            file_path,
        })
    }).map_err(|e| format!("Query map failed: {}", e))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("Row read failed: {}", e))?;

    Ok(books)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_page_number_integer() {
        assert_eq!(parse_page_number("42"), Some(42));
    }

    #[test]
    fn test_parse_page_number_prefix() {
        assert_eq!(parse_page_number("Page 7"), Some(7));
    }

    #[test]
    fn test_parse_page_number_invalid() {
        assert_eq!(parse_page_number("OEBPS/chapter.xhtml"), None);
    }

    #[test]
    fn test_volume_id_to_path() {
        assert_eq!(
            volume_id_to_relative_path("file:///mnt/onboard/Books/test.pdf"),
            Some("Books/test.pdf".to_string())
        );
    }

    #[test]
    fn test_is_pdf_volume() {
        assert!(is_pdf_volume("file:///mnt/onboard/Books/test.pdf"));
        assert!(is_pdf_volume("file:///mnt/onboard/Books/test.PDF"));
        assert!(!is_pdf_volume("file:///mnt/onboard/Books/test.epub"));
    }
}
```

**Step 2: Run tests**

Run:
```bash
cd src-tauri && cargo test kobo::tests
```

Expected: 5 tests pass.

**Step 3: Register module**

Add `mod kobo;` to `src-tauri/src/lib.rs`.

**Step 4: Commit**

```bash
git add src-tauri/src/kobo.rs src-tauri/src/lib.rs
git commit -m "feat: add Kobo device reader for PDF highlights"
```

---

## Task 6: CrossRef Metadata Lookup

**Files:**
- Create: `src-tauri/src/crossref.rs`
- Modify: `src-tauri/src/lib.rs` (register module)

**Step 1: Write CrossRef client**

Create `src-tauri/src/crossref.rs`:

```rust
use serde::{Deserialize, Serialize};

const CROSSREF_API: &str = "https://api.crossref.org/works";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrossRefMetadata {
    pub title: String,
    pub subtitle: Option<String>,
    pub authors: Vec<CrossRefAuthor>,
    pub publisher: Option<String>,
    pub publication_date: Option<String>,
    pub doi: String,
    pub document_type: String,
    pub container_title: Option<String>,
    pub volume: Option<String>,
    pub issue: Option<String>,
    pub page_range: Option<String>,
    pub isbn: Option<String>,
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrossRefAuthor {
    pub given: Option<String>,
    pub family: String,
}

#[derive(Deserialize)]
struct CrossRefResponse {
    message: CrossRefMessage,
}

#[derive(Deserialize)]
struct CrossRefSearchResponse {
    message: CrossRefSearchMessage,
}

#[derive(Deserialize)]
struct CrossRefSearchMessage {
    items: Vec<CrossRefWork>,
}

#[derive(Deserialize)]
struct CrossRefMessage {
    #[serde(flatten)]
    work: CrossRefWork,
}

#[derive(Deserialize)]
struct CrossRefWork {
    #[serde(rename = "DOI")]
    doi: Option<String>,
    title: Option<Vec<String>>,
    subtitle: Option<Vec<String>>,
    author: Option<Vec<CrossRefAuthorRaw>>,
    publisher: Option<String>,
    #[serde(rename = "type")]
    work_type: Option<String>,
    #[serde(rename = "container-title")]
    container_title: Option<Vec<String>>,
    volume: Option<String>,
    issue: Option<String>,
    page: Option<String>,
    #[serde(rename = "ISBN")]
    isbn: Option<Vec<String>>,
    #[serde(rename = "URL")]
    url: Option<String>,
    #[serde(rename = "published-print")]
    published_print: Option<DateParts>,
    #[serde(rename = "published-online")]
    published_online: Option<DateParts>,
    issued: Option<DateParts>,
}

#[derive(Deserialize)]
struct CrossRefAuthorRaw {
    given: Option<String>,
    family: Option<String>,
}

#[derive(Deserialize)]
struct DateParts {
    #[serde(rename = "date-parts")]
    date_parts: Option<Vec<Vec<u32>>>,
}

fn parse_date(dp: &Option<DateParts>) -> Option<String> {
    dp.as_ref()
        .and_then(|d| d.date_parts.as_ref())
        .and_then(|parts| parts.first())
        .map(|parts| {
            parts.iter()
                .map(|n| n.to_string())
                .collect::<Vec<_>>()
                .join("-")
        })
}

fn work_to_metadata(work: CrossRefWork) -> Option<CrossRefMetadata> {
    let title = work.title?.into_iter().next()?;
    let doi = work.doi?;

    let date = parse_date(&work.published_print)
        .or_else(|| parse_date(&work.published_online))
        .or_else(|| parse_date(&work.issued));

    Some(CrossRefMetadata {
        title,
        subtitle: work.subtitle.and_then(|s| s.into_iter().next()),
        authors: work.author.unwrap_or_default().into_iter()
            .filter_map(|a| {
                Some(CrossRefAuthor {
                    given: a.given,
                    family: a.family?,
                })
            })
            .collect(),
        publisher: work.publisher,
        publication_date: date,
        doi,
        document_type: work.work_type.unwrap_or_else(|| "unknown".into()),
        container_title: work.container_title.and_then(|c| c.into_iter().next()),
        volume: work.volume,
        issue: work.issue,
        page_range: work.page,
        isbn: work.isbn.and_then(|i| i.into_iter().next()),
        url: work.url,
    })
}

/// Look up metadata for a specific DOI.
pub async fn lookup_doi(doi: &str) -> Result<Option<CrossRefMetadata>, String> {
    let url = format!("{}/{}", CROSSREF_API, doi);
    let client = tauri_plugin_http::reqwest::Client::new();
    let resp = client.get(&url)
        .header("User-Agent", "Fragments/0.1 (mailto:fragments@example.com)")
        .send()
        .await
        .map_err(|e| format!("CrossRef request failed: {}", e))?;

    if resp.status() == 404 {
        return Ok(None);
    }

    let data: CrossRefResponse = resp.json()
        .await
        .map_err(|e| format!("CrossRef parse failed: {}", e))?;

    Ok(work_to_metadata(data.message.work))
}

/// Search CrossRef for works matching a query string.
/// Returns up to `limit` results.
pub async fn search_works(query: &str, limit: usize) -> Result<Vec<CrossRefMetadata>, String> {
    let client = tauri_plugin_http::reqwest::Client::new();
    let resp = client.get(CROSSREF_API)
        .query(&[("query", query), ("rows", &limit.to_string())])
        .header("User-Agent", "Fragments/0.1 (mailto:fragments@example.com)")
        .send()
        .await
        .map_err(|e| format!("CrossRef search failed: {}", e))?;

    let data: CrossRefSearchResponse = resp.json()
        .await
        .map_err(|e| format!("CrossRef parse failed: {}", e))?;

    Ok(data.message.items.into_iter()
        .filter_map(work_to_metadata)
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_date_full() {
        let dp = Some(DateParts { date_parts: Some(vec![vec![2024, 3, 15]]) });
        assert_eq!(parse_date(&dp), Some("2024-3-15".to_string()));
    }

    #[test]
    fn test_parse_date_year_only() {
        let dp = Some(DateParts { date_parts: Some(vec![vec![2024]]) });
        assert_eq!(parse_date(&dp), Some("2024".to_string()));
    }

    #[test]
    fn test_parse_date_none() {
        assert_eq!(parse_date(&None), None);
    }
}
```

**Step 2: Run tests**

Run:
```bash
cd src-tauri && cargo test crossref::tests
```

Expected: 3 tests pass.

**Step 3: Register module**

Add `mod crossref;` to `src-tauri/src/lib.rs`.

**Step 4: Commit**

```bash
git add src-tauri/src/crossref.rs src-tauri/src/lib.rs
git commit -m "feat: add CrossRef API client for DOI lookup and search"
```

---

## Task 7: Tauri IPC Commands

**Files:**
- Create: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs` (register commands)

**Step 1: Write IPC command handlers**

Create `src-tauri/src/commands.rs` with commands for:

- `import_pdf(path: String)` — extract PDF text, store in SQLite, index in Tantivy, attempt DOI lookup
- `import_kobo(db_path: String)` — read all PDFs + highlights from Kobo, import everything
- `search_corpus(query: String, highlights_only: bool, limit: usize)` — search Tantivy
- `lookup_doi(doi: String)` — CrossRef DOI lookup
- `search_crossref(query: String)` — CrossRef search
- `update_document_metadata(doc_id: i64, metadata: DocumentMetadata)` — update document metadata in SQLite
- `list_documents()` — list all imported documents
- `get_document_highlights(doc_id: i64)` — get highlights for a document
- `save_project(id: Option<i64>, title: String, content_json: String)` — create/update project
- `list_projects()` — list all projects
- `load_project(id: i64)` — load a project's content
- `save_citation(project_id: i64, citation: CitationData)` — record a citation
- `get_project_citations(project_id: i64)` — get all citations for a project
- `rebuild_search_index()` — rebuild Tantivy from SQLite

Each command accesses `AppState` via `State<AppState>` and returns `Result<T, String>`.

**Step 2: Register commands in `lib.rs`**

Add all commands to a single `tauri::generate_handler![]` call in the builder.

**Step 3: Verify app builds**

Run:
```bash
npm run tauri dev
```

Expected: App launches without errors.

**Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: add Tauri IPC commands for import, search, and project management"
```

---

## Task 8: Frontend Layout Shell

**Files:**
- Modify: `src/App.tsx` (three-panel layout)
- Create: `src/App.css` (layout styles)
- Create: `src/components/LibraryPanel.tsx`
- Create: `src/components/EditorPanel.tsx`
- Create: `src/components/SearchPanel.tsx`
- Create: `src/components/Toolbar.tsx`

**Step 1: Build the three-panel layout**

Replace the default React template in `src/App.tsx` with the three-panel layout:

```tsx
import { useState } from 'react'
import { Toolbar } from './components/Toolbar'
import { LibraryPanel } from './components/LibraryPanel'
import { EditorPanel } from './components/EditorPanel'
import { SearchPanel } from './components/SearchPanel'
import './App.css'

function App() {
  const [libraryCollapsed, setLibraryCollapsed] = useState(false)

  return (
    <div className="app">
      <Toolbar />
      <div className="app__workspace">
        <LibraryPanel collapsed={libraryCollapsed} onToggle={() => setLibraryCollapsed(!libraryCollapsed)} />
        <EditorPanel />
        <SearchPanel />
      </div>
    </div>
  )
}

export default App
```

Each component should be a placeholder initially — just a `<div>` with a className and title text.

**Step 2: Add CSS for the layout**

```css
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.app__workspace {
  display: flex;
  flex: 1;
  overflow: hidden;
}
```

With library panel at ~250px, editor flex: 1, search panel at ~300px.

**Step 3: Verify the layout renders**

Run:
```bash
npm run tauri dev
```

Expected: Three-panel layout visible in the app window.

**Step 4: Commit**

```bash
git add src/
git commit -m "feat: add three-panel layout shell with toolbar"
```

---

## Task 9: TipTap Rich Text Editor

**Files:**
- Modify: `src/components/EditorPanel.tsx` (integrate TipTap)
- Create: `src/components/EditorPanel.css`
- Create: `src/components/SectionNav.tsx` (outline/jump-to navigation)

**Step 1: Set up TipTap editor**

Replace EditorPanel placeholder with a working TipTap editor using StarterKit. Include a formatting toolbar (bold, italic, heading, alignment). Add the `HorizontalRule` extension for section dividers.

**Step 2: Add section navigation**

Create `SectionNav.tsx` — reads the editor's document structure, finds all headings and horizontal rules, renders a clickable outline that scrolls to each section.

**Step 3: Verify editor works**

Run `npm run tauri dev`. Type text, apply formatting, insert section dividers, verify section nav updates.

**Step 4: Commit**

```bash
git add src/components/EditorPanel.tsx src/components/EditorPanel.css src/components/SectionNav.tsx
git commit -m "feat: add TipTap rich text editor with section navigation"
```

---

## Task 10: Fragment Node Extension

**Files:**
- Create: `src/extensions/FragmentNode.ts` (TipTap node extension)
- Create: `src/extensions/FragmentNodeView.tsx` (React node view)
- Create: `src/extensions/FragmentNode.css` (torn-paper styling)
- Modify: `src/components/EditorPanel.tsx` (register extension)

**Step 1: Create the Fragment node extension**

Define a TipTap `Node.create()` with:
- `group: 'inline'`, `inline: true`, `atom: true`
- Attributes: `sourceId`, `pageNumber`, `originalText`, `displayText`, `edited`, `sourceTitle`
- Commands: `insertFragment(attrs)`, `dissolveFragment()`
- Node view: `ReactNodeViewRenderer(FragmentNodeView)`

**Step 2: Create the React node view component**

`FragmentNodeView.tsx` renders the fragment with:
- Semi-transparent background, outlined border, jagged/torn edges via CSS clip-path
- Hover shows edit/dissolve controls
- Edit mode: inline input to modify text (sets `edited: true`)
- Dissolve: replaces node with plain text

**Step 3: Create the torn-paper CSS**

`FragmentNode.css` with:
- `clip-path: polygon(...)` for jagged top and bottom edges
- Semi-transparent background color with border
- Hover state for controls
- Selected state styling

**Step 4: Register in editor**

Add `FragmentNode` to the TipTap extensions array in `EditorPanel.tsx`.

**Step 5: Test manually**

Add a temporary button to insert a test fragment. Verify:
- Fragment appears with torn-paper styling
- Edit and dissolve work
- Fragment is inline with surrounding text

**Step 6: Commit**

```bash
git add src/extensions/
git commit -m "feat: add Fragment node with torn-paper styling"
```

---

## Task 11: Search Panel

**Files:**
- Modify: `src/components/SearchPanel.tsx`
- Create: `src/components/SearchPanel.css`
- Create: `src/components/SearchResult.tsx`

**Step 1: Build the search panel UI**

`SearchPanel.tsx`:
- Search input with debounced queries (300ms)
- Toggle filter: "All" / "Highlights only"
- Results list showing: text snippet, source title, page number, highlight badge
- Click result → calls editor's `insertFragment` command
- Drag result → sets drag data for drop into editor

**Step 2: Wire to Tauri backend**

Call `invoke('search_corpus', { query, highlightsOnly, limit: 50 })` on search input change.

**Step 3: Add drag-and-drop from search results**

Each `SearchResult` component sets `onDragStart` with `application/x-fragment` data. The editor's `handleDrop` in `editorProps` reads this data and inserts a Fragment node at the drop position.

**Step 4: Verify search works**

Import a test PDF, search for terms, click/drag results into editor.

**Step 5: Commit**

```bash
git add src/components/SearchPanel.tsx src/components/SearchPanel.css src/components/SearchResult.tsx
git commit -m "feat: add search panel with click and drag-to-insert"
```

---

## Task 12: Inline Autocomplete

**Files:**
- Create: `src/extensions/FragmentAutocomplete.ts` (TipTap plugin using ProseMirror plugin API)
- Create: `src/extensions/AutocompleteDropdown.tsx`
- Create: `src/extensions/AutocompleteDropdown.css`

**Step 1: Build the autocomplete plugin**

This is a custom ProseMirror plugin (not `@tiptap/suggestion` — that requires a trigger character). Instead, build a plugin that:
- On each transaction, debounces a search query based on the last 3-5 words before the cursor
- Shows ghost text (a decoration) for the top match
- On hover over ghost text, renders a dropdown with alternative matches via `ReactRenderer` + `@floating-ui/dom`
- Tab accepts the top match (inserts a Fragment node)
- Any other typing dismisses the suggestion

**Step 2: Create the dropdown component**

`AutocompleteDropdown.tsx`:
- Lists alternative matches with text snippet, source title, page number
- Arrow keys navigate, Enter selects
- Each item previews the fragment styling

**Step 3: Register in editor**

Add the autocomplete plugin to the TipTap extensions array. Add a toolbar toggle button for on/off.

**Step 4: Test manually**

Type words that match corpus content, verify ghost text appears and dropdown works.

**Step 5: Commit**

```bash
git add src/extensions/FragmentAutocomplete.ts src/extensions/AutocompleteDropdown.tsx src/extensions/AutocompleteDropdown.css
git commit -m "feat: add inline autocomplete with ghost text and dropdown"
```

---

## Task 13: Library Panel

**Files:**
- Modify: `src/components/LibraryPanel.tsx`
- Create: `src/components/LibraryPanel.css`
- Create: `src/components/DocumentList.tsx`
- Create: `src/components/ProjectList.tsx`
- Create: `src/components/MetadataEditor.tsx`

**Step 1: Build the library panel**

Three sections (tabs or accordion):
- **Documents**: list of imported PDFs with title, author, type. Click to expand and see highlights.
- **Highlights**: flat list of all highlights across all documents, filterable.
- **Projects**: list of saved poems. Click to load into editor. Button to create new.

**Step 2: Build the metadata editor**

`MetadataEditor.tsx`:
- Modal/drawer that opens when clicking a document's metadata
- Shows all fields from the Document schema
- CrossRef search box: user types a query, sees top 5 results from `search_crossref`, clicks one to auto-fill all fields
- Save button calls `update_document_metadata`

**Step 3: Wire import buttons**

- "Import PDF" button → file picker → calls `import_pdf`
- "Import from Kobo" button → folder picker (Kobo mount point) → calls `import_kobo`
- Show progress/status during import

**Step 4: Commit**

```bash
git add src/components/LibraryPanel.tsx src/components/LibraryPanel.css src/components/DocumentList.tsx src/components/ProjectList.tsx src/components/MetadataEditor.tsx
git commit -m "feat: add library panel with document management and metadata editor"
```

---

## Task 14: Citations (Chicago Style)

**Files:**
- Create: `src/utils/chicago.ts` (Chicago citation formatter)
- Create: `src/components/CitationsPanel.tsx`
- Modify: `src/components/Toolbar.tsx` (add citations toggle)

**Step 1: Write Chicago citation formatter**

`chicago.ts`:
- Function `formatChicagoBibliography(metadata)` → formatted string
- Handles document types: book, journal_article, chapter, thesis, report
- Format: Author Last, First. *Title*. Place: Publisher, Year.
- For articles: Author. "Title." *Journal* Volume, no. Issue (Year): Pages. DOI.

**Step 2: Write tests for citation formatting**

Create `src/utils/chicago.test.ts` with test cases for each document type.

Run: `npm test`

Expected: Tests pass.

**Step 3: Build citations panel**

`CitationsPanel.tsx`:
- Hidden by default, toggled via toolbar button
- Shows a formatted bibliography of all sources used in the current poem
- Each entry is generated from the citation records and their linked document metadata
- Ordered alphabetically by author last name (Chicago style)

**Step 4: Wire citation creation**

When a Fragment node is inserted, automatically call `save_citation` with the fragment's provenance data.

**Step 5: Commit**

```bash
git add src/utils/chicago.ts src/utils/chicago.test.ts src/components/CitationsPanel.tsx src/components/Toolbar.tsx
git commit -m "feat: add Chicago-style citation generation and display"
```

---

## Task 15: Rich Text Export

**Files:**
- Create: `src/utils/export.ts`
- Modify: `src/components/Toolbar.tsx` (add export button)

**Step 1: Build the export function**

`export.ts`:
- Function `exportRichText(editor, citations)`:
  - Gets the editor's HTML content
  - Converts Fragment nodes to plain styled spans (no controls)
  - Appends a Chicago-style bibliography section at the end
  - Saves as `.html` or `.rtf` via Tauri's file save dialog

**Step 2: Add export button to toolbar**

Toolbar "Export" button → file save dialog → writes the exported file.

**Step 3: Test export**

Create a poem with fragments, export it, verify the output file contains the poem text and bibliography.

**Step 4: Commit**

```bash
git add src/utils/export.ts src/components/Toolbar.tsx
git commit -m "feat: add rich text export with Chicago bibliography"
```

---

## Task 16: Project Persistence

**Files:**
- Create: `src/hooks/useProject.ts`
- Modify: `src/components/EditorPanel.tsx` (auto-save)
- Modify: `src/components/Toolbar.tsx` (project title, save indicator)

**Step 1: Build the project hook**

`useProject.ts`:
- `useProject()` hook manages current project state
- Auto-saves editor content to SQLite on a debounced interval (e.g., every 5 seconds after changes)
- `saveProject()`, `loadProject()`, `createProject()` functions
- Tracks save status ("Saved" / "Saving..." / "Unsaved")

**Step 2: Wire into editor**

EditorPanel listens to `onUpdate` from TipTap, triggers debounced save. Toolbar shows project title (editable) and save status.

**Step 3: Wire into library panel**

Clicking a project in the library panel loads it into the editor.

**Step 4: Commit**

```bash
git add src/hooks/useProject.ts src/components/EditorPanel.tsx src/components/Toolbar.tsx
git commit -m "feat: add project auto-save and persistence"
```

---

## Task 17: Integration Testing and Polish

**Step 1: End-to-end workflow test**

Manually test the full workflow:
1. Import a PDF → verify it appears in library with extracted metadata
2. Search for terms → verify results appear in search panel
3. Click/drag fragments into editor → verify torn-paper styling and provenance
4. Edit a fragment → verify "edited" flag
5. Dissolve a fragment → verify it becomes plain text
6. Toggle citations → verify Chicago-formatted bibliography
7. Export → verify output file
8. Close and reopen → verify project persists

**Step 2: Fix any issues found**

**Step 3: Final commit**

```bash
git add -A
git commit -m "fix: integration testing fixes and polish"
```
