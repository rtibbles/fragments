# Kobo Import Metadata Enrichment Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich Kobo PDF imports with metadata from PDF info dicts, CrossRef, and embedded PDF annotations as highlights.

**Architecture:** Add `lopdf` for reading PDF metadata and annotations. Restructure `import_kobo` to collect all per-book data (pages, metadata, annotations, CrossRef) before acquiring DB/search locks, then batch-insert. Add a "Retry CrossRef" button to the existing MetadataEditor.

**Tech Stack:** Rust (lopdf 0.38, reqwest, rusqlite), TypeScript/React (Tauri invoke)

**Spec:** `docs/superpowers/specs/2026-03-15-kobo-import-metadata-enrichment-design.md`

---

## Chunk 1: PDF metadata and annotation extraction

### Task 1: Add lopdf dependency

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add lopdf to dependencies**

In `src-tauri/Cargo.toml`, add to `[dependencies]`:

```toml
lopdf = "0.38"
```

- [ ] **Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles without errors (lopdf 0.38 is already in lock file as transitive dep)

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml
git commit -m "feat: add lopdf as direct dependency for PDF metadata extraction"
```

### Task 2: Extract PDF metadata (title, author)

**Files:**
- Modify: `src-tauri/src/pdf.rs`

- [ ] **Step 1: Write failing test for extract_metadata**

Add to `src-tauri/src/pdf.rs` in the `tests` module:

```rust
#[test]
fn test_extract_metadata_returns_struct() {
    // Use any existing PDF - metadata may or may not be present
    // This tests the function exists and doesn't panic
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("empty.pdf");
    // Create a minimal valid PDF with lopdf
    use lopdf::{Document, Object, Dictionary, Stream};
    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();
    let page_id = doc.new_object_id();
    let content_id = doc.add_object(Stream::new(Dictionary::new(), Vec::new()));
    let page = Dictionary::from_iter(vec![
        ("Type", Object::Name(b"Page".to_vec())),
        ("Parent", Object::Reference(pages_id)),
        ("Contents", Object::Reference(content_id)),
    ]);
    doc.objects.insert(page_id, Object::Dictionary(page));
    let pages = Dictionary::from_iter(vec![
        ("Type", Object::Name(b"Pages".to_vec())),
        ("Kids", Object::Array(vec![Object::Reference(page_id)])),
        ("Count", Object::Integer(1)),
    ]);
    doc.objects.insert(pages_id, Object::Dictionary(pages));
    let catalog_id = doc.add_object(Dictionary::from_iter(vec![
        ("Type", Object::Name(b"Catalog".to_vec())),
        ("Pages", Object::Reference(pages_id)),
    ]));
    doc.trailer.set("Root", Object::Reference(catalog_id));
    // Add Info dict with Title and Author
    let info = Dictionary::from_iter(vec![
        ("Title", Object::string_literal("Test Title")),
        ("Author", Object::string_literal("Test Author")),
    ]);
    let info_id = doc.add_object(info);
    doc.trailer.set("Info", Object::Reference(info_id));
    doc.save(&path).unwrap();

    let meta = extract_metadata(&path).unwrap();
    assert_eq!(meta.title, Some("Test Title".to_string()));
    assert_eq!(meta.author, Some("Test Author".to_string()));
}

#[test]
fn test_extract_metadata_missing_info() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("no_info.pdf");
    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();
    let page_id = doc.new_object_id();
    let content_id = doc.add_object(Stream::new(Dictionary::new(), Vec::new()));
    let page = Dictionary::from_iter(vec![
        ("Type", Object::Name(b"Page".to_vec())),
        ("Parent", Object::Reference(pages_id)),
        ("Contents", Object::Reference(content_id)),
    ]);
    doc.objects.insert(page_id, Object::Dictionary(page));
    let pages = Dictionary::from_iter(vec![
        ("Type", Object::Name(b"Pages".to_vec())),
        ("Kids", Object::Array(vec![Object::Reference(page_id)])),
        ("Count", Object::Integer(1)),
    ]);
    doc.objects.insert(pages_id, Object::Dictionary(pages));
    let catalog_id = doc.add_object(Dictionary::from_iter(vec![
        ("Type", Object::Name(b"Catalog".to_vec())),
        ("Pages", Object::Reference(pages_id)),
    ]));
    doc.trailer.set("Root", Object::Reference(catalog_id));
    doc.save(&path).unwrap();

    let meta = extract_metadata(&path).unwrap();
    assert_eq!(meta.title, None);
    assert_eq!(meta.author, None);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test test_extract_metadata -- --nocapture`
Expected: FAIL — `extract_metadata` not defined

- [ ] **Step 3: Implement extract_metadata**

Add to `src-tauri/src/pdf.rs`, before the tests module:

```rust
#[derive(Debug)]
pub struct PdfMetadata {
    pub title: Option<String>,
    pub author: Option<String>,
}

pub fn extract_metadata(path: &Path) -> Result<PdfMetadata, String> {
    let doc = lopdf::Document::load(path)
        .map_err(|e| format!("Failed to load PDF for metadata: {}", e))?;

    let info = doc.trailer.get(b"Info")
        .ok()
        .and_then(|obj| {
            match obj {
                lopdf::Object::Reference(id) => doc.get_object(*id).ok(),
                lopdf::Object::Dictionary(_) => Some(obj),
                _ => None,
            }
        })
        .and_then(|obj| obj.as_dict().ok());

    let title = info
        .and_then(|d| d.get(b"Title").ok())
        .and_then(|obj| match obj {
            lopdf::Object::String(bytes, _) => {
                Some(String::from_utf8_lossy(bytes).trim().to_string())
            }
            _ => None,
        })
        .filter(|s| !s.is_empty());

    let author = info
        .and_then(|d| d.get(b"Author").ok())
        .and_then(|obj| match obj {
            lopdf::Object::String(bytes, _) => {
                Some(String::from_utf8_lossy(bytes).trim().to_string())
            }
            _ => None,
        })
        .filter(|s| !s.is_empty());

    Ok(PdfMetadata { title, author })
}
```

Add `use lopdf;` at the top of `pdf.rs` if not already present.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test test_extract_metadata -- --nocapture`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/pdf.rs
git commit -m "feat: add PDF metadata extraction (title, author) via lopdf"
```

### Task 3: Extract PDF annotations (highlights)

**Files:**
- Modify: `src-tauri/src/pdf.rs`

- [ ] **Step 1: Write failing test for extract_annotations**

Add to `src-tauri/src/pdf.rs` tests module:

```rust
#[test]
fn test_extract_annotations_highlight() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("annotated.pdf");

    use lopdf::{Document, Object, Dictionary, Stream};
    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();
    let page_id = doc.new_object_id();
    let content_id = doc.add_object(Stream::new(Dictionary::new(), Vec::new()));

    // Create a highlight annotation
    let annot = Dictionary::from_iter(vec![
        ("Type", Object::Name(b"Annot".to_vec())),
        ("Subtype", Object::Name(b"Highlight".to_vec())),
        ("Contents", Object::string_literal("Important passage")),
        ("T", Object::string_literal("testuser")),
        ("CreationDate", Object::string_literal("D:20220929165826+02'00'")),
    ]);
    let annot_id = doc.add_object(annot);

    let page = Dictionary::from_iter(vec![
        ("Type", Object::Name(b"Page".to_vec())),
        ("Parent", Object::Reference(pages_id)),
        ("Contents", Object::Reference(content_id)),
        ("Annots", Object::Array(vec![Object::Reference(annot_id)])),
    ]);
    doc.objects.insert(page_id, Object::Dictionary(page));
    let pages = Dictionary::from_iter(vec![
        ("Type", Object::Name(b"Pages".to_vec())),
        ("Kids", Object::Array(vec![Object::Reference(page_id)])),
        ("Count", Object::Integer(1)),
    ]);
    doc.objects.insert(pages_id, Object::Dictionary(pages));
    let catalog_id = doc.add_object(Dictionary::from_iter(vec![
        ("Type", Object::Name(b"Catalog".to_vec())),
        ("Pages", Object::Reference(pages_id)),
    ]));
    doc.trailer.set("Root", Object::Reference(catalog_id));
    doc.save(&path).unwrap();

    let annots = extract_annotations(&path).unwrap();
    assert_eq!(annots.len(), 1);
    assert_eq!(annots[0].text, "Important passage");
    assert_eq!(annots[0].page_number, 1);
    assert_eq!(annots[0].annotation_type, "highlight");
    assert_eq!(annots[0].author, Some("testuser".to_string()));
    assert!(annots[0].date_created.is_some());
}

#[test]
fn test_extract_annotations_skips_empty_contents() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("ink.pdf");

    use lopdf::{Document, Object, Dictionary, Stream};
    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();
    let page_id = doc.new_object_id();
    let content_id = doc.add_object(Stream::new(Dictionary::new(), Vec::new()));

    // Ink annotation with no Contents (freehand drawing)
    let annot = Dictionary::from_iter(vec![
        ("Type", Object::Name(b"Annot".to_vec())),
        ("Subtype", Object::Name(b"Ink".to_vec())),
    ]);
    let annot_id = doc.add_object(annot);

    let page = Dictionary::from_iter(vec![
        ("Type", Object::Name(b"Page".to_vec())),
        ("Parent", Object::Reference(pages_id)),
        ("Contents", Object::Reference(content_id)),
        ("Annots", Object::Array(vec![Object::Reference(annot_id)])),
    ]);
    doc.objects.insert(page_id, Object::Dictionary(page));
    let pages = Dictionary::from_iter(vec![
        ("Type", Object::Name(b"Pages".to_vec())),
        ("Kids", Object::Array(vec![Object::Reference(page_id)])),
        ("Count", Object::Integer(1)),
    ]);
    doc.objects.insert(pages_id, Object::Dictionary(pages));
    let catalog_id = doc.add_object(Dictionary::from_iter(vec![
        ("Type", Object::Name(b"Catalog".to_vec())),
        ("Pages", Object::Reference(pages_id)),
    ]));
    doc.trailer.set("Root", Object::Reference(catalog_id));
    doc.save(&path).unwrap();

    let annots = extract_annotations(&path).unwrap();
    assert_eq!(annots.len(), 0);
}

#[test]
fn test_extract_annotations_skips_links() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("links.pdf");

    use lopdf::{Document, Object, Dictionary, Stream};
    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();
    let page_id = doc.new_object_id();
    let content_id = doc.add_object(Stream::new(Dictionary::new(), Vec::new()));

    let annot = Dictionary::from_iter(vec![
        ("Type", Object::Name(b"Annot".to_vec())),
        ("Subtype", Object::Name(b"Link".to_vec())),
        ("Contents", Object::string_literal("http://example.com")),
    ]);
    let annot_id = doc.add_object(annot);

    let page = Dictionary::from_iter(vec![
        ("Type", Object::Name(b"Page".to_vec())),
        ("Parent", Object::Reference(pages_id)),
        ("Contents", Object::Reference(content_id)),
        ("Annots", Object::Array(vec![Object::Reference(annot_id)])),
    ]);
    doc.objects.insert(page_id, Object::Dictionary(page));
    let pages = Dictionary::from_iter(vec![
        ("Type", Object::Name(b"Pages".to_vec())),
        ("Kids", Object::Array(vec![Object::Reference(page_id)])),
        ("Count", Object::Integer(1)),
    ]);
    doc.objects.insert(pages_id, Object::Dictionary(pages));
    let catalog_id = doc.add_object(Dictionary::from_iter(vec![
        ("Type", Object::Name(b"Catalog".to_vec())),
        ("Pages", Object::Reference(pages_id)),
    ]));
    doc.trailer.set("Root", Object::Reference(catalog_id));
    doc.save(&path).unwrap();

    let annots = extract_annotations(&path).unwrap();
    assert_eq!(annots.len(), 0);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test test_extract_annotations -- --nocapture`
Expected: FAIL — `extract_annotations` not defined

- [ ] **Step 3: Implement extract_annotations and parse_pdf_date**

Add to `src-tauri/src/pdf.rs`:

```rust
#[derive(Debug)]
pub struct PdfAnnotation {
    pub page_number: u64,
    pub text: String,
    pub annotation_type: String,
    pub date_created: Option<String>,
    pub author: Option<String>,
}

/// Parse PDF date format D:YYYYMMDDHHmmSS+HH'mm' to ISO 8601.
fn parse_pdf_date(s: &str) -> Option<String> {
    let s = s.strip_prefix("D:").unwrap_or(s);
    if s.len() < 4 {
        return None;
    }
    let year = &s[0..4];
    let month = s.get(4..6).unwrap_or("01");
    let day = s.get(6..8).unwrap_or("01");
    let hour = s.get(8..10).unwrap_or("00");
    let min = s.get(10..12).unwrap_or("00");
    let sec = s.get(12..14).unwrap_or("00");
    Some(format!("{}-{}-{}T{}:{}:{}", year, month, day, hour, min, sec))
}

fn get_string_from_obj(obj: &lopdf::Object) -> Option<String> {
    match obj {
        lopdf::Object::String(bytes, _) => {
            let s = String::from_utf8_lossy(bytes).trim().to_string();
            if s.is_empty() { None } else { Some(s) }
        }
        _ => None,
    }
}

pub fn extract_annotations(path: &Path) -> Result<Vec<PdfAnnotation>, String> {
    let doc = lopdf::Document::load(path)
        .map_err(|e| format!("Failed to load PDF for annotations: {}", e))?;

    let mut annotations = Vec::new();
    let page_count = doc.get_pages().len();

    // doc.get_pages() returns BTreeMap<u32, ObjectId> — page numbers are 1-indexed
    for (page_num, page_id) in doc.get_pages() {
        let page = match doc.get_object(page_id).and_then(|o| o.as_dict()) {
            Ok(d) => d,
            _ => continue,
        };

        let annots_array = match page.get(b"Annots") {
            Ok(obj) => {
                // May be a direct array or an indirect reference to an array
                match obj {
                    lopdf::Object::Array(arr) => arr.clone(),
                    lopdf::Object::Reference(id) => {
                        match doc.get_object(*id) {
                            Ok(lopdf::Object::Array(arr)) => arr.clone(),
                            _ => continue,
                        }
                    }
                    _ => continue,
                }
            }
            Err(_) => continue,
        };

        for annot_ref in &annots_array {
            let annot_obj = match annot_ref {
                lopdf::Object::Reference(id) => {
                    match doc.get_object(*id) {
                        Ok(obj) => obj,
                        _ => continue,
                    }
                }
                obj => obj,
            };

            let annot = match annot_obj.as_dict() {
                Ok(d) => d,
                _ => continue,
            };

            // Check subtype
            let subtype = match annot.get(b"Subtype") {
                Ok(lopdf::Object::Name(name)) => String::from_utf8_lossy(name).to_string(),
                _ => continue,
            };

            let annotation_type = match subtype.as_str() {
                "Highlight" => "highlight",
                "Ink" => "ink",
                _ => continue,
            };

            // Get Contents — skip if absent or empty
            let text = match annot.get(b"Contents").ok().and_then(get_string_from_obj) {
                Some(t) => t,
                None => continue,
            };

            let date_created = annot.get(b"CreationDate").ok()
                .and_then(get_string_from_obj)
                .and_then(|s| parse_pdf_date(&s));

            let author = annot.get(b"T").ok()
                .and_then(get_string_from_obj);

            annotations.push(PdfAnnotation {
                page_number: page_num as u64,
                text,
                annotation_type: annotation_type.to_string(),
                date_created,
                author,
            });
        }
    }

    Ok(annotations)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test test_extract_annotations -- --nocapture`
Expected: PASS

- [ ] **Step 5: Also add a test for parse_pdf_date**

```rust
#[test]
fn test_parse_pdf_date() {
    assert_eq!(
        parse_pdf_date("D:20220929165826+02'00'"),
        Some("2022-09-29T16:58:26".to_string())
    );
    assert_eq!(
        parse_pdf_date("D:20220930"),
        Some("2022-09-30T00:00:00".to_string())
    );
    assert_eq!(parse_pdf_date(""), None);
    assert_eq!(parse_pdf_date("D:"), None);
}
```

- [ ] **Step 6: Run all pdf tests**

Run: `cd src-tauri && cargo test pdf:: -- --nocapture`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/pdf.rs
git commit -m "feat: add PDF annotation extraction and date parsing via lopdf"
```

## Chunk 2: Kobo title and attribution improvements

### Task 4: Improve Kobo title extraction with ContentType 9

**Files:**
- Modify: `src-tauri/src/kobo.rs`

- [ ] **Step 1: Write failing test**

Add to `src-tauri/src/kobo.rs` tests module:

```rust
#[test]
fn test_list_pdf_books_with_title_from_content_type_9() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("kobo.db");
    let conn = rusqlite::Connection::open(&db_path).unwrap();

    // Create minimal Kobo content table
    conn.execute_batch("
        CREATE TABLE content (
            ContentID TEXT PRIMARY KEY,
            ContentType INTEGER,
            BookTitle TEXT,
            Attribution TEXT,
            BookID TEXT
        );

        -- ContentType 6 entry with blank title (sideloaded PDF)
        INSERT INTO content (ContentID, ContentType, BookTitle, Attribution, BookID)
        VALUES ('file:///mnt/onboard/Books/test.pdf', 6, NULL, NULL, NULL);

        -- ContentType 9 page entries with title populated
        INSERT INTO content (ContentID, ContentType, BookTitle, Attribution, BookID)
        VALUES ('file:///mnt/onboard/Books/test.pdf?page=1&position=0', 9,
                'Actual Book Title', NULL,
                'file:///mnt/onboard/Books/test.pdf');
    ").unwrap();

    let books = list_pdf_books(&db_path).unwrap();
    assert_eq!(books.len(), 1);
    assert_eq!(books[0].title, Some("Actual Book Title".to_string()));
}

#[test]
fn test_list_pdf_books_falls_back_to_content_type_6_title() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("kobo.db");
    let conn = rusqlite::Connection::open(&db_path).unwrap();

    conn.execute_batch("
        CREATE TABLE content (
            ContentID TEXT PRIMARY KEY,
            ContentType INTEGER,
            BookTitle TEXT,
            Attribution TEXT,
            BookID TEXT
        );

        INSERT INTO content (ContentID, ContentType, BookTitle, Attribution, BookID)
        VALUES ('file:///mnt/onboard/Books/test.pdf', 6, 'CT6 Title', 'Some Author', NULL);
    ").unwrap();

    let books = list_pdf_books(&db_path).unwrap();
    assert_eq!(books.len(), 1);
    assert_eq!(books[0].title, Some("CT6 Title".to_string()));
    assert_eq!(books[0].attribution, Some("Some Author".to_string()));
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test test_list_pdf_books -- --nocapture`
Expected: FAIL — tests fail because `list_pdf_books` takes `&Path` (the DB path) but the Kobo DB doesn't have the `BookID` column in the test schema, and the function doesn't query ContentType 9.

- [ ] **Step 3: Update list_pdf_books to query ContentType 9 for title**

Replace the `list_pdf_books` function in `src-tauri/src/kobo.rs`:

```rust
pub fn list_pdf_books(kobo_db_path: &Path) -> Result<Vec<KoboBook>, String> {
    let conn = Connection::open_with_flags(
        kobo_db_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    ).map_err(|e| format!("Failed to open Kobo database: {}", e))?;

    let mut stmt = conn.prepare("
        SELECT c6.ContentID, c6.BookTitle, c6.Attribution,
               c9.BookTitle AS PageBookTitle
        FROM content c6
        LEFT JOIN content c9
            ON c9.ContentType = 9
           AND c9.BookID = c6.ContentID
           AND c9.BookTitle IS NOT NULL
           AND c9.BookTitle != ''
        WHERE c6.ContentType = 6
          AND c6.ContentID LIKE '%.pdf'
        GROUP BY c6.ContentID
        ORDER BY COALESCE(c9.BookTitle, c6.BookTitle)
    ").map_err(|e| format!("Query failed: {}", e))?;

    let books = stmt.query_map([], |row| {
        let volume_id: String = row.get(0)?;
        let ct6_title: Option<String> = row.get(1)?;
        let attribution: Option<String> = row.get(2)?;
        let ct9_title: Option<String> = row.get(3)?;
        let file_path = volume_id_to_relative_path(&volume_id)
            .unwrap_or_else(|| volume_id.clone());
        // Prefer ContentType 9 title over ContentType 6
        let title = ct9_title
            .filter(|s| !s.is_empty())
            .or(ct6_title.filter(|s| !s.is_empty()));
        Ok(KoboBook {
            volume_id,
            title,
            attribution,
            file_path,
        })
    }).map_err(|e| format!("Query map failed: {}", e))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("Row read failed: {}", e))?;

    Ok(books)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test test_list_pdf_books -- --nocapture`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/kobo.rs
git commit -m "feat: query ContentType 9 for PDF book titles on Kobo"
```

### Task 5: Add parse_attribution

**Files:**
- Modify: `src-tauri/src/kobo.rs`

- [ ] **Step 1: Write failing tests**

Add to `src-tauri/src/kobo.rs` tests module:

```rust
#[test]
fn test_parse_attribution_first_last() {
    let (first, last) = parse_attribution("Jane Smith");
    assert_eq!(first, "Jane");
    assert_eq!(last, "Smith");
}

#[test]
fn test_parse_attribution_last_comma_first() {
    let (first, last) = parse_attribution("Smith, Jane");
    assert_eq!(first, "Jane");
    assert_eq!(last, "Smith");
}

#[test]
fn test_parse_attribution_single_name() {
    let (first, last) = parse_attribution("Aristotle");
    assert_eq!(first, "");
    assert_eq!(last, "Aristotle");
}

#[test]
fn test_parse_attribution_multiple_authors() {
    // For multiple authors separated by "and", take the first
    let (first, last) = parse_attribution("Ella Haselswerdt, Sara H. Lindheim, and Kirk Ormand");
    assert_eq!(first, "Ella");
    assert_eq!(last, "Haselswerdt");
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test test_parse_attribution -- --nocapture`
Expected: FAIL — `parse_attribution` not defined

- [ ] **Step 3: Implement parse_attribution**

Add to `src-tauri/src/kobo.rs`:

```rust
/// Parse an attribution string into (first_name, last_name).
/// Handles "First Last", "Last, First", and single names.
/// For multiple authors (comma or "and" separated), takes the first.
pub fn parse_attribution(s: &str) -> (String, String) {
    let s = s.trim();
    if s.is_empty() {
        return (String::new(), String::new());
    }

    // Split on " and " first, take the first author segment
    let first_segment = s.split(" and ").next().unwrap_or(s).trim();

    // If the segment still contains commas, it could be:
    //   "Last, First" (single author) or "First Last, Second Author, ..." (multiple)
    // Heuristic: if the part after the first comma looks like a first name (no space),
    // treat as "Last, First". Otherwise treat as comma-separated list and take first entry.
    if let Some((before, after)) = first_segment.split_once(", ") {
        let after = after.trim();
        // "Last, First" if after-comma part has no comma (single name)
        if !after.contains(',') && !after.contains(' ') || before.split_whitespace().count() == 1 {
            return (after.to_string(), before.trim().to_string());
        }
        // Multiple comma-separated authors — take the first
        let first_author = before.trim();
        match first_author.rsplit_once(' ') {
            Some((first, last)) => return (first.trim().to_string(), last.trim().to_string()),
            None => return (String::new(), first_author.to_string()),
        }
    }

    // "First Last" format — split on last space
    match first_segment.rsplit_once(' ') {
        Some((first, last)) => (first.trim().to_string(), last.trim().to_string()),
        None => (String::new(), first_segment.to_string()),
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test test_parse_attribution -- --nocapture`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/kobo.rs
git commit -m "feat: add attribution string parser for Kobo author metadata"
```

## Chunk 3: Enriched import_kobo command

### Task 6: Restructure import_kobo with metadata enrichment

**Files:**
- Modify: `src-tauri/src/commands.rs`

This is the largest change. The function is restructured into two phases: (1) async data collection without locks, (2) DB/index insertion under locks.

- [ ] **Step 1: Define a BookImportData struct**

Add at the top of `src-tauri/src/commands.rs` (after existing imports/structs):

```rust
struct BookImportData {
    full_path: String,
    volume_id: String,
    title: String,
    authors: Vec<AuthorInfo>,
    doi: Option<String>,
    pages: Vec<pdf::ExtractedPage>,
    annotations: Vec<pdf::PdfAnnotation>,
    // CrossRef enrichment fields
    subtitle: Option<String>,
    publisher: Option<String>,
    publication_date: Option<String>,
    document_type: String,
    container_title: Option<String>,
    volume: Option<String>,
    issue: Option<String>,
    page_range: Option<String>,
    isbn: Option<String>,
    url: Option<String>,
}
```

- [ ] **Step 2: Rewrite import_kobo**

Replace the `import_kobo` function in `src-tauri/src/commands.rs`:

```rust
#[tauri::command]
pub async fn import_kobo(
    db_path: String,
    mount_path: String,
    state: State<'_, AppState>,
) -> Result<Vec<i64>, String> {
    let kobo_db = std::path::Path::new(&db_path);
    let highlights = kobo::read_highlights(kobo_db)?;
    let books = kobo::list_pdf_books(kobo_db)?;
    let now = chrono::Local::now().format("%Y-%m-%d").to_string();

    // Phase 1: Collect data for each book (no locks held, async CrossRef OK)
    let mut prepared_books: Vec<BookImportData> = Vec::new();

    for book in &books {
        let full_path = format!("{}/{}", mount_path, book.file_path);
        let pdf_path = std::path::Path::new(&full_path);

        if !pdf_path.exists() {
            continue;
        }

        // Check if already imported (need brief lock)
        {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let exists: bool = db.query_row(
                "SELECT COUNT(*) > 0 FROM documents WHERE file_path = ?1",
                params![full_path],
                |row| row.get(0),
            ).unwrap_or(false);
            if exists {
                continue;
            }
        }

        // Extract pages and DOI
        let pages = match pdf::extract_pages(pdf_path) {
            Ok(p) => p,
            Err(_) => continue,
        };
        let doi = pdf::extract_doi(&pages);

        // Extract PDF metadata
        let pdf_meta = pdf::extract_metadata(pdf_path).unwrap_or(pdf::PdfMetadata {
            title: None,
            author: None,
        });

        // Extract PDF annotations
        let annotations = pdf::extract_annotations(pdf_path).unwrap_or_default();

        // Resolve title: Kobo BookTitle -> PDF /Title -> filename
        let title = book.title.clone()
            .filter(|s| !s.is_empty())
            .or(pdf_meta.title)
            .unwrap_or_else(|| {
                std::path::Path::new(&book.file_path)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Untitled")
                    .to_string()
            });

        // Resolve author: Kobo Attribution -> PDF /Author -> none
        let local_authors: Vec<AuthorInfo> = book.attribution.as_deref()
            .filter(|s| !s.is_empty())
            .map(|s| {
                let (first, last) = kobo::parse_attribution(s);
                vec![AuthorInfo {
                    first_name: first,
                    last_name: last,
                    role: "author".to_string(),
                    position: 0,
                }]
            })
            .or_else(|| {
                pdf_meta.author.as_deref().map(|s| {
                    let (first, last) = kobo::parse_attribution(s);
                    vec![AuthorInfo {
                        first_name: first,
                        last_name: last,
                        role: "author".to_string(),
                        position: 0,
                    }]
                })
            })
            .unwrap_or_default();

        // Attempt CrossRef enrichment (best-effort)
        let crossref_meta = if let Some(ref d) = doi {
            crossref::lookup_doi(d).await.ok().flatten()
        } else {
            crossref::search_works(&title, 1).await
                .ok()
                .and_then(|mut v| if v.is_empty() { None } else { Some(v.remove(0)) })
        };

        // Build final import data, preferring CrossRef when available
        let import = if let Some(cr) = crossref_meta {
            let cr_authors: Vec<AuthorInfo> = cr.authors.iter().enumerate().map(|(i, a)| {
                AuthorInfo {
                    first_name: a.given.clone().unwrap_or_default(),
                    last_name: a.family.clone(),
                    role: "author".to_string(),
                    position: i as i32,
                }
            }).collect();

            BookImportData {
                full_path,
                volume_id: book.volume_id.clone(),
                title: cr.title,
                authors: if cr_authors.is_empty() { local_authors } else { cr_authors },
                doi: Some(cr.doi),
                pages,
                annotations,
                subtitle: cr.subtitle,
                publisher: cr.publisher,
                publication_date: cr.publication_date,
                document_type: cr.document_type,
                container_title: cr.container_title,
                volume: cr.volume,
                issue: cr.issue,
                page_range: cr.page_range,
                isbn: cr.isbn,
                url: cr.url,
            }
        } else {
            BookImportData {
                full_path,
                volume_id: book.volume_id.clone(),
                title,
                authors: local_authors,
                doi,
                pages,
                annotations,
                subtitle: None,
                publisher: None,
                publication_date: None,
                document_type: "book".to_string(),
                container_title: None,
                volume: None,
                issue: None,
                page_range: None,
                isbn: None,
                url: None,
            }
        };

        prepared_books.push(import);
    }

    // Phase 2: Insert everything under locks
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let search = state.search.lock().map_err(|e| e.to_string())?;
    let mut writer = search.writer()?;
    let mut imported_ids = Vec::new();

    for book in &prepared_books {
        // Double-check not imported (race condition guard)
        let exists: bool = db.query_row(
            "SELECT COUNT(*) > 0 FROM documents WHERE file_path = ?1",
            params![book.full_path],
            |row| row.get(0),
        ).unwrap_or(false);
        if exists {
            continue;
        }

        db.execute(
            "INSERT INTO documents (title, subtitle, document_type, file_path, import_date, doi, publisher, publication_date, container_title, volume, issue, page_range, isbn, url)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                book.title, book.subtitle, book.document_type, book.full_path,
                now, book.doi, book.publisher, book.publication_date,
                book.container_title, book.volume, book.issue, book.page_range,
                book.isbn, book.url
            ],
        ).map_err(|e| e.to_string())?;
        let doc_id = db.last_insert_rowid();
        imported_ids.push(doc_id);

        // Insert authors
        for author in &book.authors {
            db.execute(
                "INSERT INTO authors (document_id, first_name, last_name, role, position)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![doc_id, author.first_name, author.last_name, author.role, author.position],
            ).map_err(|e| e.to_string())?;
        }

        // Insert chunks and index
        for page in &book.pages {
            db.execute(
                "INSERT INTO chunks (document_id, content, page_number, position)
                 VALUES (?1, ?2, ?3, ?4)",
                params![doc_id, page.text, page.page_number as i64, page.page_number as i64],
            ).map_err(|e| e.to_string())?;

            let chunk_id = db.last_insert_rowid();
            search.add_chunk(
                &mut writer,
                &page.text, &book.title, doc_id as u64,
                page.page_number, false, chunk_id as u64,
            )?;
        }

        // Insert PDF annotations as highlights
        let has_pdf_annotations = !book.annotations.is_empty();
        for annot in &book.annotations {
            let chunk_id: Option<i64> = db.query_row(
                "SELECT id FROM chunks WHERE document_id = ?1 AND page_number = ?2",
                params![doc_id, annot.page_number as i64],
                |row| row.get(0),
            ).ok();

            db.execute(
                "INSERT INTO highlights (document_id, chunk_id, text, annotation, date_created)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![doc_id, chunk_id, annot.text, None::<String>, annot.date_created],
            ).map_err(|e| e.to_string())?;

            let highlight_id = db.last_insert_rowid();
            search.add_chunk(
                &mut writer,
                &annot.text, &book.title, doc_id as u64,
                annot.page_number, true, highlight_id as u64,
            )?;
        }

        // Insert Kobo DB highlights (secondary source — skip for PDFs with annotations)
        if !has_pdf_annotations {
            let book_highlights: Vec<_> = highlights.iter()
                .filter(|h| h.volume_id == book.volume_id)
                .collect();

            for h in book_highlights {
                let page_num = kobo::parse_page_number(&h.start_container_path);
                let chunk_id: Option<i64> = page_num.and_then(|pn| {
                    db.query_row(
                        "SELECT id FROM chunks WHERE document_id = ?1 AND page_number = ?2",
                        params![doc_id, pn as i64],
                        |row| row.get(0),
                    ).ok()
                });

                db.execute(
                    "INSERT INTO highlights (document_id, chunk_id, text, annotation, kobo_chapter_progress, kobo_volume_id, date_created)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    params![doc_id, chunk_id, h.text, h.annotation, h.chapter_progress, h.volume_id, h.date_created],
                ).map_err(|e| e.to_string())?;

                let highlight_id = db.last_insert_rowid();
                search.add_chunk(
                    &mut writer,
                    &h.text, &book.title, doc_id as u64,
                    page_num.unwrap_or(0), true, highlight_id as u64,
                )?;
            }
        }
    }

    writer.commit().map_err(|e| e.to_string())?;
    search.reload()?;

    Ok(imported_ids)
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles without errors

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "feat: restructure import_kobo with metadata enrichment and PDF annotations"
```

## Chunk 4: Enriched import_pdf and retry CrossRef

### Task 7: Enrich import_pdf with same metadata chain

**Files:**
- Modify: `src-tauri/src/commands.rs`

- [ ] **Step 1: Rewrite import_pdf**

Replace the `import_pdf` function:

```rust
#[tauri::command]
pub async fn import_pdf(path: String, state: State<'_, AppState>) -> Result<i64, String> {
    let pdf_path = std::path::Path::new(&path);
    let pages = pdf::extract_pages(pdf_path)?;
    let doi = pdf::extract_doi(&pages);
    let now = chrono::Local::now().format("%Y-%m-%d").to_string();

    // Extract PDF metadata
    let pdf_meta = pdf::extract_metadata(pdf_path).unwrap_or(pdf::PdfMetadata {
        title: None,
        author: None,
    });

    // Extract PDF annotations
    let annotations = pdf::extract_annotations(pdf_path).unwrap_or_default();

    // Resolve title: PDF /Title -> filename
    let local_title = pdf_meta.title.clone()
        .unwrap_or_else(|| {
            std::path::Path::new(&path)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Untitled")
                .to_string()
        });

    // Resolve author from PDF metadata
    let local_authors: Vec<AuthorInfo> = pdf_meta.author.as_deref()
        .filter(|s| !s.is_empty())
        .map(|s| {
            let (first, last) = kobo::parse_attribution(s);
            vec![AuthorInfo {
                first_name: first,
                last_name: last,
                role: "author".to_string(),
                position: 0,
            }]
        })
        .unwrap_or_default();

    // CrossRef enrichment (best-effort)
    let crossref_meta = if let Some(ref d) = doi {
        crossref::lookup_doi(d).await.ok().flatten()
    } else {
        crossref::search_works(&local_title, 1).await
            .ok()
            .and_then(|mut v| if v.is_empty() { None } else { Some(v.remove(0)) })
    };

    // Use CrossRef data if available
    let (title, authors, final_doi, subtitle, publisher, pub_date, doc_type, container_title, volume, issue, page_range, isbn, url) =
        if let Some(cr) = crossref_meta {
            let cr_authors: Vec<AuthorInfo> = cr.authors.iter().enumerate().map(|(i, a)| {
                AuthorInfo {
                    first_name: a.given.clone().unwrap_or_default(),
                    last_name: a.family.clone(),
                    role: "author".to_string(),
                    position: i as i32,
                }
            }).collect();
            (
                cr.title, if cr_authors.is_empty() { local_authors } else { cr_authors },
                Some(cr.doi), cr.subtitle, cr.publisher, cr.publication_date,
                cr.document_type, cr.container_title, cr.volume, cr.issue,
                cr.page_range, cr.isbn, cr.url,
            )
        } else {
            (local_title, local_authors, doi, None, None, None, "book".to_string(), None, None, None, None, None, None)
        };

    let db = state.db.lock().map_err(|e| e.to_string())?;

    let doc_id = {
        db.execute(
            "INSERT INTO documents (title, subtitle, document_type, file_path, import_date, doi, publisher, publication_date, container_title, volume, issue, page_range, isbn, url)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![title, subtitle, doc_type, path, now, final_doi, publisher, pub_date, container_title, volume, issue, page_range, isbn, url],
        ).map_err(|e| e.to_string())?;
        db.last_insert_rowid()
    };

    // Insert authors
    for author in &authors {
        db.execute(
            "INSERT INTO authors (document_id, first_name, last_name, role, position)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![doc_id, author.first_name, author.last_name, author.role, author.position],
        ).map_err(|e| e.to_string())?;
    }

    // Insert chunks and index
    let search = state.search.lock().map_err(|e| e.to_string())?;
    let mut writer = search.writer()?;
    for page in &pages {
        db.execute(
            "INSERT INTO chunks (document_id, content, page_number, position)
             VALUES (?1, ?2, ?3, ?4)",
            params![doc_id, page.text, page.page_number as i64, page.page_number as i64],
        ).map_err(|e| e.to_string())?;

        let chunk_id = db.last_insert_rowid();
        search.add_chunk(
            &mut writer,
            &page.text, &title, doc_id as u64,
            page.page_number, false, chunk_id as u64,
        )?;
    }

    // Insert PDF annotations as highlights
    for annot in &annotations {
        let chunk_id: Option<i64> = db.query_row(
            "SELECT id FROM chunks WHERE document_id = ?1 AND page_number = ?2",
            params![doc_id, annot.page_number as i64],
            |row| row.get(0),
        ).ok();

        db.execute(
            "INSERT INTO highlights (document_id, chunk_id, text, annotation, date_created)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![doc_id, chunk_id, annot.text, annot.author, annot.date_created],
        ).map_err(|e| e.to_string())?;

        let highlight_id = db.last_insert_rowid();
        search.add_chunk(
            &mut writer,
            &annot.text, &title, doc_id as u64,
            annot.page_number, true, highlight_id as u64,
        )?;
    }

    writer.commit().map_err(|e| e.to_string())?;
    search.reload()?;

    Ok(doc_id)
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles without errors

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "feat: enrich import_pdf with metadata extraction and CrossRef lookup"
```

### Task 8: Add retry CrossRef button to MetadataEditor

**Files:**
- Modify: `src/components/MetadataEditor.tsx`

- [ ] **Step 1: Add retry CrossRef handler**

Add after the `handleDoiLookup` function (around line 80):

```typescript
const handleRetryCrossref = async () => {
  setSearching(true);
  try {
    if (doi.trim()) {
      // If we have a DOI, look it up directly
      const result = await invoke<CrossRefResult>("lookup_doi", {
        doi: doi.trim(),
      });
      if (result) {
        applyMetadata(result);
      }
    } else {
      // Search by title
      const results = await invoke<CrossRefResult[]>("search_crossref", {
        query: title,
      });
      if (results.length > 0) {
        setCrossrefResults(results);
      }
    }
  } catch (err) {
    console.error("CrossRef retry failed:", err);
  } finally {
    setSearching(false);
  }
};
```

- [ ] **Step 2: Add the button to the UI**

In the metadata editor footer (around line 345), add the retry button before the Cancel button:

```tsx
<div className="metadata-editor__footer">
  <button
    className="library-panel__btn"
    onClick={handleRetryCrossref}
    disabled={searching}
  >
    {searching ? "Looking up..." : "Retry CrossRef"}
  </button>
  <button className="library-panel__btn" onClick={onClose}>
    Cancel
  </button>
  <button
    className="library-panel__btn library-panel__btn--primary"
    onClick={handleSave}
    disabled={saving}
  >
    {saving ? "Saving..." : "Save"}
  </button>
</div>
```

- [ ] **Step 3: Verify frontend compiles**

Run: `cd /var/home/richard/github/fragments && npm run build`
Expected: compiles without errors

- [ ] **Step 4: Commit**

```bash
git add src/components/MetadataEditor.tsx
git commit -m "feat: add Retry CrossRef button to metadata editor"
```

## Chunk 5: Integration testing and cleanup

### Task 9: Run all tests and verify build

**Files:**
- No new files

- [ ] **Step 1: Run all Rust tests**

Run: `cd src-tauri && cargo test`
Expected: all tests pass

- [ ] **Step 2: Run full build**

Run: `cd /var/home/richard/github/fragments && npm run tauri build`
Expected: builds successfully

- [ ] **Step 3: Manual smoke test**

With Kobo connected:
1. Open app
2. Click "+ Kobo" and select `/run/media/richard/KOBOeReader`
3. Verify documents appear with titles (not "Untitled")
4. Verify at least CriticalPoeticsFeministRefusals_Bueti has 3 highlights
5. Open metadata editor for a document and click "Retry CrossRef"
6. Test "+ PDF" import with a local PDF

- [ ] **Step 4: Delete previously imported test data**

If the 6 "Untitled" documents from previous test imports are still in the DB, they should be cleaned up before re-importing. The app data is at `~/.local/share/com.richard.fragments/fragments.db`. Either delete the DB file to start fresh, or add a delete document command later.

- [ ] **Step 5: Final commit if any adjustments were needed**

```bash
git add -A
git commit -m "fix: adjustments from integration testing"
```
