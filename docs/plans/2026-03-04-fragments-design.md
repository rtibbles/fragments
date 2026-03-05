# Fragments — Design Document

A Tauri v2 desktop app for composing found poetry from PDF corpora and Kobo highlights.

## Architecture

Three-layer Tauri app:

```
┌──────────────────────────────────────────┐
│         Web Frontend (React + TipTap)    │
├──────────────────────────────────────────┤
│         Tauri IPC Commands               │
├──────────────────────────────────────────┤
│         Rust Backend                     │
│  SQLite (storage) + Tantivy (search)     │
│  PDF parsing + Kobo import + CrossRef    │
└──────────────────────────────────────────┘
```

- **SQLite** is the source of truth for all data: documents, highlights, projects, citations.
- **Tantivy** indexes document text and highlights for fast full-text search. Rebuildable from SQLite at any time.
- **Frontend** communicates with the Rust backend via Tauri IPC commands.

## Data Model

### Document

Rich metadata for academic citation (APA, MLA, Chicago):

- title, subtitle
- authors (list with first/last name, order)
- editors (list, for edited volumes)
- publication_date
- publisher
- journal_name, volume, issue, page_range (for articles)
- edition
- DOI, ISBN
- URL, retrieval_date
- document_type (book, journal_article, chapter, thesis, report, etc.)
- container_title (for chapters in edited books)
- file_path
- import_date

### Chunk

A unit of text from a document (typically a page):

- document_id
- text content
- page number
- position within document

### Highlight

A Kobo highlight or user-marked passage:

- document_id
- chunk_id
- highlighted text
- annotation (if any)
- Kobo location data (chapter, percentage)
- date created

### Project

A poem being written:

- title
- rich text content (TipTap JSON)
- created/modified dates

### Citation

Links an inserted fragment back to its source:

- project_id
- chunk_id or highlight_id
- exact text inserted
- position in project
- source metadata snapshot (book title, page number)
- modified flag (if the poet edited the fragment text)

### Tantivy Index

Mirrors Chunks and Highlights with fields: text, source title, page number, `is_highlight` boolean for boosting.

## Import

### Kobo Import

1. Connect Kobo device (or point to mount path once)
2. App reads the device — finds all PDFs and their highlights from `KoboReader.sqlite`
3. Everything imports in one shot
4. DOI lookup and metadata enrichment runs in the background
5. User can review/correct metadata later from the library panel

### Standalone PDF Import

- Drag and drop or file picker
- Same background metadata enrichment

### Automated Metadata Resolution

1. Extract DOI from PDF → CrossRef lookup → fully populated
2. No DOI found → search CrossRef by extracted title/author → present top 3-5 matches → user picks
3. No matches → user can search CrossRef manually from the UI with their own query
4. Manual entry as last resort (almost never needed)

## UI Layout

```
┌──────────────────────────────────────────────────────┐
│  Toolbar: project title, save, export, cite toggle   │
├────────────┬─────────────────────┬───────────────────┤
│            │                     │                   │
│  Library   │      Editor         │   Search Panel    │
│  Panel     │                     │                   │
│            │  Single continuous  │  Search box       │
│ Documents  │  document with      │  Filter: All /    │
│ Highlights │  section dividers   │    Highlights     │
│ Projects   │  and outline nav    │  Results with     │
│            │                     │  snippets +       │
│            │  Rich text editing  │  source info      │
│            │  + inline auto-     │                   │
│            │  complete           │  Click or drag    │
│            │                     │  to insert        │
└────────────┴─────────────────────┴───────────────────┘
```

- **Library panel** (left): browse documents, view highlights per book, manage projects. Collapsible.
- **Editor** (center): single continuous document with optional named section dividers and outline/jump-to navigation. Rich text formatting.
- **Search panel** (right): search the corpus with highlight boosting and document filtering.

## Editor Features

### Rich Text

Full word-processor formatting: bold, italic, font size, alignment, spacing. Section dividers with optional names. Section outline/jump-to navigation for long poems.

### Fragment Nodes

Inserted fragments are custom TipTap nodes that:

- Appear **semi-transparent with an outlined border and jagged/torn edges** (CSS clip-path or SVG mask) — like torn scraps of paper laid into the poem
- Carry hidden provenance data (source document, page, original context)
- Can be edited after insertion — provenance stays attached, citation marked as modified
- Can be "dissolved" to plain text, severing the source link

### Inline Autocomplete

- Triggers after a pause in typing (debounced)
- Searches Tantivy for phrases matching recent typed words
- Top match appears as ghost text in fragment styling
- **Hover over ghost text** → dropdown of alternative matches with text snippets and sources
- Tab accepts top match, keep typing to dismiss
- Toggleable on/off via toolbar button or keyboard shortcut

## Search

### Side Panel Search

- Single search box with toggle filter: "All text" / "Highlights only"
- Results ranked by Tantivy relevance, highlights boosted
- Each result shows: text snippet (query terms highlighted), source title, page number
- Click to insert at cursor, or drag into editor
- Paginated/infinite-scroll for large corpora
- Optional filter to search within specific documents selected from the library panel

## Citations

- **Chicago style** (notes-bibliography system)
- **Hidden by default** in the editor
- **Toggleable** to display when the poet wants to review them
- **Auto-generated** from fragment provenance data
- **Included on export** as endnotes/bibliography

## Export

Rich text only, with Chicago-style bibliography appended.

## Technology Stack

### Backend (Rust)

- **Tauri v2** — desktop framework
- **rusqlite** — SQLite with FTS5
- **tantivy** — search engine
- **pdf-extract** — PDF text extraction
- **reqwest** — HTTP client for CrossRef API

### Frontend (Web)

- **React** — UI framework (best TipTap integration)
- **TipTap** (ProseMirror) — rich text editor with custom fragment nodes
- **CSS clip-path / SVG masks** — jagged fragment edge styling

### Data Storage

- SQLite database in app data directory
- Tantivy index alongside it (rebuildable from SQLite)
- PDFs stay on disk where they are, not copied into the app
