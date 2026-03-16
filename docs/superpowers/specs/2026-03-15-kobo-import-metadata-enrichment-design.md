# Kobo Import Metadata Enrichment

## Problem

When importing PDFs from a Kobo e-reader, documents appear as "Untitled" with no authors or highlights. Three root causes:

1. **Parameter mismatch** (already fixed): Frontend sent `koboPath` but backend expected `db_path` + `mount_path`.
2. **Missing metadata**: Kobo's `content` table has `BookTitle` blank for sideloaded PDFs (ContentType 6). The title exists in ContentType 9 (page-level) entries, but is never queried. `Attribution` is read but never saved. No PDF info dict metadata is extracted.
3. **Highlights stored in PDFs**: Kobo writes PDF highlights as standard PDF annotations (`/Highlight`, `/Ink` subtypes) directly into the PDF files. The code only looks at the `Bookmark` SQLite table, which stores dogears and EPUB highlights but not PDF annotations.

## Design

### Data flow per book

```
PDF file on Kobo
  +-- extract pages (existing)
  +-- extract DOI from text (existing)
  +-- extract PDF info dict -> title, author (NEW: lopdf)
  +-- extract PDF annotations -> highlights, ink notes (NEW: lopdf)
  |
  +-- Resolve title: Kobo BookTitle (ContentType 9) -> PDF /Title -> filename
  +-- Resolve author: Kobo Attribution -> PDF /Author -> none
  |
  +-- If DOI found -> CrossRef lookup by DOI (best-effort)
  +-- Else -> CrossRef search by resolved title (best-effort)
  |
  +-- If CrossRef hit -> use CrossRef metadata (title, authors, all fields)
     Else -> use locally resolved title + author
```

### Changes

#### 1. `pdf.rs` — PDF metadata and annotation extraction

Add `lopdf` as a direct dependency (already a transitive dep via `pdf-extract`).

**`extract_metadata(path) -> PdfMetadata`**
- Opens PDF with `lopdf::Document::load`
- Reads Info dict entries: `/Title`, `/Author`
- Returns `PdfMetadata { title: Option<String>, author: Option<String> }`
- Note: `lopdf` is low-level — indirect object references must be resolved manually. May fail on encrypted or certain linearized PDFs that `pdf-extract` can handle. Treat metadata extraction failure independently from page extraction success.

**`extract_annotations(path) -> Vec<PdfAnnotation>`**
- Walks each page's `/Annots` array (resolving indirect references)
- Filters to `/Highlight` and `/Ink` subtypes
- For each annotation extracts:
  - `page_number: u64` (1-indexed, from page position in document)
  - `text: String` (from `/Contents` field — may be a string or stream, handle both)
  - `annotation_type: String` ("highlight" or "ink")
  - `date_created: Option<String>` (from `/CreationDate`, parsed from PDF date format `D:YYYYMMDDHHmmSS+HH'mm'` to ISO 8601)
  - `author: Option<String>` (from `/T` field)
- Skips annotations with empty or absent `/Contents` (most `/Ink` annotations are purely graphical freehand drawings with no text — these are silently skipped, which is intentional)

#### 2. `kobo.rs` — better title extraction

**`get_book_title(kobo_db, volume_id) -> Option<String>`** or modify `list_pdf_books` query:
- Query ContentType 9 entries using `BookID` column (which matches the ContentType 6 `ContentID`/volume_id): `SELECT BookTitle FROM content WHERE ContentType = 9 AND BookID = ?1 AND BookTitle IS NOT NULL AND BookTitle != '' LIMIT 1`
- Falls back to existing ContentType 6 `BookTitle`

**`parse_attribution(s) -> (String, String)`**
- Splits author string into (first_name, last_name)
- Handles "First Last" and "Last, First" formats

#### 3. `commands.rs` `import_kobo` — enriched import

**Async/lock structure**: The current code holds `db` and `search` mutex locks for the entire import loop. CrossRef calls are async network requests that cannot be awaited while holding `std::sync::Mutex` guards. Solution: restructure the loop to collect per-book data (pages, metadata, annotations, CrossRef results) *before* acquiring locks, then acquire locks only for the DB/index insert phase.

For each PDF book:
1. Extract pages and DOI (existing)
2. Extract PDF metadata (title, author from info dict)
3. Extract PDF annotations
4. Resolve title: Kobo BookTitle (from ContentType 9) → PDF `/Title` → filename (use `file_stem()` to strip extension)
5. Resolve author: Kobo Attribution → PDF `/Author` → none
6. Attempt CrossRef enrichment (best-effort, no retry on failure):
   - If DOI found: `crossref::lookup_doi`
   - Else: `crossref::search_works` with resolved title, take first result
7. If CrossRef returns metadata: override title, authors, publisher, date, type, etc. (CrossRef is authoritative when available)

Then acquire locks and for each book:
8. Insert document with best available metadata
9. Insert authors into `authors` table
10. Insert PDF annotations as highlights, linked to chunks by page number (same pattern as existing: `SELECT id FROM chunks WHERE document_id = ?1 AND page_number = ?2`). If no chunks exist (e.g. blank PDF), highlights are inserted with `chunk_id = NULL`.
11. Insert Kobo DB `Bookmark` highlights as secondary source (for EPUBs). For PDFs, the Bookmark table typically contains only dogears (Type = "dogear") with NULL text, so the existing `WHERE Text IS NOT NULL` filter means no PDF duplicates in practice. As a safety measure, skip Bookmark highlights for a book if PDF annotations were already extracted for it.

#### 4. `commands.rs` `import_pdf` — same enrichment

Apply the same metadata extraction and CrossRef lookup to single PDF imports, which currently also only use filename as title.

#### 5. `MetadataEditor.tsx` — retry CrossRef button

- Add button in existing metadata editor
- On click: if document has DOI, call `lookup_doi`; else call `search_crossref` with current title
- On match: populate form fields (user can review and save)
- Reuses existing `lookup_doi` and `search_crossref` Tauri commands, no backend changes needed

### Not changing

- Database schema (all needed fields exist: documents has title/authors/doi/publisher/etc, highlights has text/annotation/date_created)
- Search indexing flow (highlights indexed the same way regardless of source)
- Kobo DB bookmark reading (kept as secondary source for EPUB highlights)
- Export functionality
- Project/citation functionality

### Dependencies

- `lopdf`: Direct dependency addition. Already a transitive dependency via `pdf-extract`. Provides `Document::load`, page access, annotation traversal, Info dict reading.
- `crossref` module: Already exists. Used for best-effort enrichment during import.
- `reqwest`: Already a dependency. Used by CrossRef module.

### Error handling

- PDF metadata extraction failure (`lopdf` load fails): proceed with next title source in chain. Independent from `pdf-extract` page extraction — one can fail while the other succeeds.
- PDF annotation extraction failure: proceed without highlights for that PDF
- CrossRef lookup failure (network error, timeout, no results): proceed with local metadata
- Individual book import failure: skip book, continue with remaining books
