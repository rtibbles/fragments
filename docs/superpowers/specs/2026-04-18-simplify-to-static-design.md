# Simplify Fragments to a Static GitHub Pages Site

## Problem

Fragments is currently a full Tauri desktop app: Rust backend (SQLite + Tantivy FTS + lopdf + CrossRef + Kobo DB import) driving a React/TipTap frontend. It was built to let any user import arbitrary PDFs and e-reader highlights into a local corpus and compose cited writing against it.

The real use case is much narrower: a single user, a fixed reference corpus (~50 documents, already curated in the sibling `mfa_thesis` repo with complete metadata), composing one piece of writing. Everything the Rust backend does — user-supplied imports, metadata enrichment, search over a mutable corpus — is more than the actual workflow requires.

We want to collapse Fragments to a single-page static site served from GitHub Pages. The corpus is frozen at build time and committed to the repo. The user's writing lives in `localStorage`. No backend, no desktop packaging, no Rust.

A follow-up UX-improvement pass is planned once the refactor lands; it is explicitly out of scope for this spec.

## Out of scope

- UX improvements (will get their own spec after this refactor ships).
- OCR of image-only PDFs. If a PDF yields near-empty extracted text, the build script logs a warning and skips it; the user OCRs it separately in `mfa_thesis` using existing tooling (`ocr_and_summarize.py`) and points the CSV at the OCR'd version.
- Multi-project support, project list UI, editable project titles beyond a single title field, document list / library panel, metadata editor.
- PDF highlights / annotations in any form. The curated corpus contains no user highlights.
- CrossRef lookups, Kobo DB reading, PDF metadata sniffing, auto-update checks.
- E2E tests. `wdio` + `tauri-driver` disappear with the Rust backend; no replacement is introduced here.

## Design

### Data source: `mfa_thesis/references_todo.csv`

The `mfa_thesis` repo already contains a curated `references_todo.csv` with complete metadata (author, title, subtitle, year, publisher, type, editor/translator, journal, DOI, ISBN, category, sections cited, why cited, file_location). `file_location` is a path relative to `mfa_thesis/` pointing at either a file (`.pdf`, `.md`, `.epub`) or a directory containing multiple files belonging to the same reference (e.g., a book split into intro/chapters/bibliography PDFs).

The build script treats rows with `status == "have"` as the active corpus; other rows are ignored.

### Build pipeline: `scripts/build_corpus.py`

A Python script that runs **locally only** (not in CI) and produces `public/corpus.json`. The output is committed.

**Invocation:**
```
uv run scripts/build_corpus.py --corpus-root ~/mfa_thesis --out public/corpus.json
```

**Dependencies** are declared inline via PEP 723 (`# /// script` block) so `uv run` bootstraps its own env — no `requirements.txt`. Required packages: `pymupdf`, `ebooklib`, `beautifulsoup4`.

**Shebang:**
```
#!/usr/bin/env -S uv run --script
```

**Steps:**

1. Read `<corpus-root>/references_todo.csv`.
2. Filter to rows where `status == "have"`.
3. For each row, resolve `file_location` (relative to `<corpus-root>`):
   - If a file, extract from that file.
   - If a directory, recursively extract every supported file in sorted order and concatenate their chunks into the same reference, continuing page numbering across files.
4. Per-file extraction:
   - **PDF** (`pymupdf`): one chunk per page. Skip pages whose extracted text has fewer than 10 non-whitespace characters. If the whole PDF yields <1% non-empty pages, log a warning and skip the document.
   - **Markdown:** strip YAML frontmatter if present, treat the rest as one chunk with `page: 1`.
   - **EPUB** (`ebooklib` + `beautifulsoup4`): one chunk per chapter (`ITEM_DOCUMENT`), HTML-stripped. `page` is the chapter's 1-based index.
5. Assign each document a stable `id` computed as a short hash (first 12 hex chars of SHA-256) of the CSV-relative `file_location`. Stable across re-runs so search-result deep links (future) and localStorage citations remain valid.
6. Emit `public/corpus.json` (pretty-printed, UTF-8).

**Output shape:**

```json
{
  "generated_at": "2026-04-18T12:34:56Z",
  "documents": [
    {
      "id": "a1b2c3d4e5f6",
      "author": "Édouard Glissant",
      "title": "Poetics of Relation",
      "subtitle": null,
      "year": 1997,
      "publisher": "University of Michigan Press",
      "type": "book",
      "editor_translator": "Translated by Betsy Wing",
      "journal_or_source": null,
      "doi": null,
      "isbn": null,
      "url": null,
      "category": "opacity_refusal",
      "sections_cited": [1, 3],
      "why_cited": "Core chapter 'For Opacity'. Foundational for right-to-opacity argument.",
      "chunks": [
        { "page": 1, "text": "…" },
        { "page": 2, "text": "…" }
      ]
    }
  ]
}
```

Fields mirror CSV columns except where noted:
- `sections_cited` is parsed from the CSV's semicolon-delimited string (e.g., `"1;3"`) into an int array.
- `year` is coerced to an integer when parseable, otherwise null.
- `type`, `category` are passed through verbatim.

### Frontend architecture

#### Load sequence

1. `main.tsx` mounts `<App/>`.
2. `useCorpus` (new hook) `fetch`es `corpus.json` on mount.
3. On success, it constructs a single `MiniSearch` instance indexing every chunk across every document and exposes `{ documents, byId, miniSearch }` via `CorpusContext`.
4. `<App/>` renders a loading state until the corpus resolves; renders a full-screen error with a Retry button on fetch/parse failure. No partial mode.
5. `useProject` (rewritten) reads from `localStorage` key `fragments:project` and hydrates the editor. Writes are debounced (500 ms) on TipTap `update` events.

#### MiniSearch config

- Documents indexed: one per chunk, with composite id `"<docId>:<page>"`.
- Fields indexed: `text`.
- Fields stored: `docId`, `page`, `text`.
- `searchOptions`: `{ combineWith: "AND", prefix: true, fuzzy: 0.2 }`.
- Result snippet: take the first match position from `result.match`, carve a ~150-char window around it, run it through a ported `snap_to_punctuation` (see `utils/search.ts`) to round to sentence/quote boundaries. This preserves the behavior from `src-tauri/src/search.rs`.
- Category filter: post-search, filter hits whose `docId`'s document has a matching `category`. No per-filter re-indexing.

#### Project state (localStorage)

Single key `fragments:project`:

```ts
type ProjectState = {
  title: string;
  contentJson: string; // TipTap JSON
  citations: Citation[];
};

type Citation = {
  docId: string;
  page: number;
  insertedText: string;
  sourceSnapshot: string;
  modified: boolean;
};
```

No `id`, no created_at / updated_at, no project list. If the key is missing on load, the editor starts empty with a placeholder title.

localStorage failures (quota exceeded, private mode) surface as an inline toolbar warning; the editor stays usable but doesn't persist. No crash.

#### Component map (post-refactor)

```
src/
  App.tsx                     no library panel, no update banner, no project list
  main.tsx                    unchanged
  context/
    CorpusContext.tsx         NEW — provides { documents, miniSearch, byId }
  hooks/
    useCorpus.ts              NEW — fetches corpus.json, builds MiniSearch
    useProject.ts             REWRITTEN — localStorage-backed, single project
  components/
    Toolbar.tsx               slimmed — no save-status, no update banner
    EditorPanel.tsx           unchanged
    SearchPanel.tsx           uses CorpusContext; adds category filter dropdown
    SearchResult.tsx          unchanged
    CitationsPanel.tsx        reads from project state + CorpusContext
    SectionNav.tsx            unchanged
  extensions/
    FragmentNode.ts           UPDATED — sourceId: number → docId: string;
                               rowId dropped (chunks identified by docId+page)
    FragmentNodeView.tsx      UPDATED — consumes new attr shape
  utils/
    chicago.ts                unchanged (CitationMetadata shape stays the same)
    search.ts                 NEW — ported snap_to_punctuation + snippet carving
    export.ts                 unchanged
    documents.ts              REWRITTEN — DocumentWithMeta now mirrors corpus
                               JSON shape (string id, CSV field names); docToMeta
                               maps journal_or_source → CitationMetadata.journalName;
                               getReferencedDocIds returns string[]
  types/                      updated to match corpus.json shape
```

#### Removed components

- `LibraryPanel` and `LibraryPanel.css`
- `DocumentList.tsx`
- `ProjectList.tsx`
- `MetadataEditor.tsx`
- The update-banner block in `App.tsx`

### Vite / deployment

- `vite.config.ts`: set `base: "/fragments/"` so asset URLs resolve under `https://<user>.github.io/fragments/`.
- `corpus.json` lives at `public/corpus.json` so Vite copies it into `dist/` untouched. Frontend fetches it at `${import.meta.env.BASE_URL}corpus.json`.
- GitHub Actions workflow `.github/workflows/pages.yml`:
  - Triggers: push to `main`, manual `workflow_dispatch`.
  - Steps: checkout → setup-node → `npm ci` → `npm run build` → `actions/upload-pages-artifact@v3` (path `dist/`) → `actions/deploy-pages@v4`.
  - No Rust, no Python in CI.
- Repository settings (manual, one-time): enable GitHub Pages with source "GitHub Actions".

### Repo cleanup in this refactor

Delete:
- `src-tauri/` (entire directory)
- `e2e/`
- `wdio.conf.ts`
- `tsconfig.e2e.json`

Edit:
- `package.json`: drop `@tauri-apps/*`, `@wdio/*`, `webdriverio`; drop `tauri`, `test:build`, `test:e2e` scripts. Add `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `minisearch` (runtime), and a `test` script. Add a `build:corpus` script that wraps the uv-run invocation for convenience.
- `README.md`: rewrite — remove Tauri/Rust prerequisites and build/test sections; add a "Building the corpus" section pointing at `scripts/build_corpus.py` and documenting the expected `mfa_thesis` layout; add a short "Deployment" note about GitHub Pages.

Add:
- `scripts/build_corpus.py` (with uv shebang and PEP 723 inline deps)
- `scripts/test_build_corpus.py` (pytest fixtures, uv shebang)
- `src/context/CorpusContext.tsx`
- `src/hooks/useCorpus.ts`
- `src/utils/search.ts`
- `vitest.config.ts` (or extend `vite.config.ts`)
- `.github/workflows/pages.yml`

### Error handling

- `corpus.json` fetch fails (network / 404 / invalid JSON): full-screen error component with a Retry button that re-triggers the hook. Nothing else in the app mounts until the corpus resolves.
- MiniSearch build fails (shouldn't happen with valid JSON, but guarded): same full-screen error.
- localStorage read fails: start with empty project, show toolbar warning.
- localStorage write fails (e.g., `QuotaExceededError`): show toolbar warning, keep editor usable, no retry.
- No network retries, no progressive UI, no optimistic updates.

### Testing

**Python build script (`pytest`):**
- Fixture: a tiny sample `references_todo.csv` + one small PDF, one markdown, one EPUB in a temp References tree.
- Assertions: correct row count, per-file-type chunk extraction, stable id from file_location, CSV field pass-through, `sections_cited` parsing, pages-below-threshold skipping, directory-with-multiple-files aggregation, status filter excludes non-`have` rows.

**Frontend unit tests (Vitest):**
- `useCorpus`: success path, fetch-error path, empty-documents path.
- `useProject`: loads from localStorage, writes back (debounced), handles quota errors gracefully, first-run empty state.
- `snap_to_punctuation`: port the existing Rust test cases verbatim.
- Category filter: results correctly filtered by category with a non-matching filter yielding empty.
- `SearchPanel` integration (RTL): search input triggers MiniSearch, results render, category dropdown filters live.

**No E2E, no visual regression, no Playwright.**

## Success criteria

- `npm run build` produces a fully self-contained `dist/` (HTML + JS + CSS + `corpus.json`) with no runtime backend dependency.
- GitHub Pages deployment serves the app at `https://<user>.github.io/fragments/` and it loads end-to-end: corpus fetches, search returns results with snippets, category filter works, a fragment can be inserted into the editor, the project persists across a page refresh via localStorage.
- `src-tauri/`, `e2e/`, and all Tauri/wdio dependencies are gone from the repo.
- `scripts/build_corpus.py` run against `~/mfa_thesis` produces a `public/corpus.json` that the app consumes correctly.
- All Vitest and pytest tests pass.
