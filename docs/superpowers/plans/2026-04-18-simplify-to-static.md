# Simplify Fragments to a Static GitHub Pages Site — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the Tauri/Rust backend and multi-project UI into a single-page React app that consumes a committed `corpus.json` built from `mfa_thesis/references_todo.csv`, deployed to GitHub Pages.

**Architecture:** A local-only Python script (PEP 723 / `uv run`) extracts text from PDFs, markdown, and EPUBs listed in the sibling `mfa_thesis` repo's CSV and writes `public/corpus.json`. The React frontend loads the JSON on boot, builds a `MiniSearch` index in memory, and persists the user's single working project to `localStorage`. No Rust, no SQLite, no Tantivy, no CrossRef, no desktop packaging.

**Tech Stack:** Python 3.12+ via `uv run --script` (pymupdf, ebooklib, beautifulsoup4, pytest); React 19 + TypeScript + Vite + TipTap (existing); MiniSearch 7.x for client-side search; Vitest + React Testing Library for frontend unit tests; GitHub Actions for Pages deploy.

**Spec:** `docs/superpowers/specs/2026-04-18-simplify-to-static-design.md`

---

## File Structure

### New files

**Build side (run locally, not in CI):**
- `scripts/build_corpus.py` — entry script with uv shebang + PEP 723 deps; glues the extractors together.
- `scripts/corpus_builder/__init__.py` — package marker.
- `scripts/corpus_builder/extract_pdf.py` — PyMuPDF-based page extraction.
- `scripts/corpus_builder/extract_markdown.py` — frontmatter-stripping markdown reader.
- `scripts/corpus_builder/extract_epub.py` — ebooklib + beautifulsoup4 chapter extraction.
- `scripts/corpus_builder/csv_loader.py` — CSV row parsing, `status` filter, author splitting, `sections_cited` parsing.
- `scripts/corpus_builder/ids.py` — stable SHA-256-based id.
- `scripts/corpus_builder/pipeline.py` — top-level orchestration (CSV row → Document dict with chunks).
- `scripts/tests/__init__.py` — package marker.
- `scripts/tests/test_csv_loader.py`
- `scripts/tests/test_extract_markdown.py`
- `scripts/tests/test_extract_pdf.py`
- `scripts/tests/test_extract_epub.py`
- `scripts/tests/test_ids.py`
- `scripts/tests/test_pipeline.py`
- `scripts/tests/fixtures/` — tiny sample PDF/MD/EPUB + CSV.
- `public/corpus.json` — the generated artifact (committed).

**Frontend:**
- `src/types/corpus.ts` — types mirroring `corpus.json`.
- `src/types/citation.ts` — new localStorage citation shape.
- `src/types/project.ts` — new `ProjectState`.
- `src/context/CorpusContext.tsx` — provider + hook.
- `src/hooks/useCorpus.ts` — fetches + indexes `corpus.json`.
- `src/utils/search.ts` — ported `snapToPunctuation` + snippet carving from MiniSearch matches.
- `src/components/AppError.tsx` — full-screen fatal-error fallback with Retry button.
- `src/components/AppLoading.tsx` — tiny loading splash while corpus loads.
- `src/setupTests.ts` — jest-dom matchers.
- `vitest.config.ts` — Vitest config with jsdom environment.

**Infra:**
- `.github/workflows/pages.yml` — build and deploy to GitHub Pages.

### Rewritten files

- `src/hooks/useProject.ts` — localStorage-only, single project, no backend calls, no `SaveStatus` indirection.
- `src/utils/documents.ts` — `DocumentWithMeta` shape mirrors corpus JSON (string `id`, CSV field names); `docToMeta` maps `journal_or_source → CitationMetadata.journalName`; `getReferencedDocIds` returns `string[]`.
- `src/extensions/FragmentNode.ts` — `FragmentAttrs` uses `docId: string`; `rowId` removed.
- `src/extensions/FragmentNodeView.tsx` — consumes new attr shape.
- `src/components/SearchPanel.tsx` — uses `CorpusContext` + `MiniSearch`; replaces "Highlights only" with a category dropdown.
- `src/components/SearchResult.tsx` — new `docId` drag-data; removes `isHighlight` badge.
- `src/components/CitationsPanel.tsx` — reads documents from `CorpusContext`, not an `invoke("list_documents")` call.
- `src/components/Toolbar.tsx` — removes `saveStatus`, `Save` button, update-banner coupling.
- `src/App.tsx` — removes `LibraryPanel`, update banner, editor-version bookkeeping; adds corpus-loading gate.
- `vite.config.ts` — drops Tauri dev-server config; adds `base: "/fragments/"`.
- `package.json` — drops Tauri + wdio deps; adds `minisearch`, `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`; adjusts scripts.
- `tsconfig.json` — drops the E2E project reference.
- `README.md` — rewritten for the static-site build flow.

### Deleted files

- `src/components/LibraryPanel.tsx` + `LibraryPanel.css`
- `src/components/DocumentList.tsx`
- `src/components/ProjectList.tsx`
- `src/components/MetadataEditor.tsx`
- `src/types/search.ts` (replaced by `src/types/corpus.ts`)
- `src-tauri/` (entire directory)
- `e2e/` (entire directory)
- `wdio.conf.ts`
- `tsconfig.e2e.json`

---

## Phase 1 — Python build script

### Task 1: Scaffold scripts package and pytest harness

**Files:**
- Create: `scripts/__init__.py`
- Create: `scripts/corpus_builder/__init__.py`
- Create: `scripts/tests/__init__.py`
- Create: `scripts/pyproject.toml`
- Create: `scripts/tests/conftest.py`

- [ ] **Step 1: Create empty package markers**

```bash
mkdir -p scripts/corpus_builder scripts/tests/fixtures
: > scripts/__init__.py
: > scripts/corpus_builder/__init__.py
: > scripts/tests/__init__.py
```

- [ ] **Step 2: Add a minimal `pyproject.toml` for the test runner**

Create `scripts/pyproject.toml`:

```toml
[project]
name = "fragments-corpus-builder"
version = "0.0.0"
requires-python = ">=3.12"
dependencies = [
  "pymupdf>=1.24",
  "ebooklib>=0.18",
  "beautifulsoup4>=4.12",
]

[dependency-groups]
dev = ["pytest>=8"]

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-q"
```

- [ ] **Step 3: Create a conftest with a fixture-path helper**

Create `scripts/tests/conftest.py`:

```python
from pathlib import Path
import pytest

FIXTURES = Path(__file__).parent / "fixtures"

@pytest.fixture
def fixtures_dir() -> Path:
    return FIXTURES
```

- [ ] **Step 4: Verify `uv` is usable and pytest runs (empty)**

Run: `cd scripts && uv run --project . pytest`
Expected: `no tests ran` (exit 5) — OK for scaffolding.

- [ ] **Step 5: Commit**

```bash
git add scripts/
git commit -m "chore: scaffold corpus-builder Python package"
```

---

### Task 2: Stable document-id hashing

**Files:**
- Create: `scripts/corpus_builder/ids.py`
- Create: `scripts/tests/test_ids.py`

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/test_ids.py`:

```python
from scripts.corpus_builder.ids import stable_doc_id

def test_id_is_12_lowercase_hex_chars():
    did = stable_doc_id("References/Opacity & Refusal/Glissant_Edouard_Poetics_of_Relation.pdf")
    assert len(did) == 12
    assert all(c in "0123456789abcdef" for c in did)

def test_id_is_deterministic():
    path = "References/Queer Abstraction/Dragging Away/"
    assert stable_doc_id(path) == stable_doc_id(path)

def test_different_paths_produce_different_ids():
    a = stable_doc_id("References/A.pdf")
    b = stable_doc_id("References/B.pdf")
    assert a != b
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd scripts && uv run --project . pytest tests/test_ids.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'scripts.corpus_builder.ids'`.

- [ ] **Step 3: Write the minimal implementation**

Create `scripts/corpus_builder/ids.py`:

```python
import hashlib

def stable_doc_id(file_location: str) -> str:
    """Return the first 12 hex chars of SHA-256(file_location).

    Stable across runs so localStorage citations remain valid after rebuilds.
    """
    digest = hashlib.sha256(file_location.encode("utf-8")).hexdigest()
    return digest[:12]
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd scripts && uv run --project . pytest tests/test_ids.py -v`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/corpus_builder/ids.py scripts/tests/test_ids.py
git commit -m "feat(build): stable document id hash"
```

---

### Task 3: CSV loader with status filter, author splitting, and section parsing

**Files:**
- Create: `scripts/corpus_builder/csv_loader.py`
- Create: `scripts/tests/test_csv_loader.py`
- Create: `scripts/tests/fixtures/sample.csv`

- [ ] **Step 1: Create the fixture CSV**

Create `scripts/tests/fixtures/sample.csv`:

```csv
priority,status,category,author,title,subtitle,year,publisher,type,editor_translator,journal_or_source,sections_cited,why_cited,access_notes,file_location,url,doi,isbn,acquired_date,notes
1,have,opacity_refusal,Édouard Glissant,Poetics of Relation,,1997,University of Michigan Press,book,Translated by Betsy Wing,,1;3,Core chapter 'For Opacity'.,acquired,References/Opacity & Refusal/Glissant.pdf,,,,pre-existing,
2,have,queer_abstraction,David J. Getsy; Che Gossett,A Syllabus,,2021,Taylor & Francis,article,,"Art Journal 80(4): 100-115",3,Useful citation source,acquired,References/Queer Abstraction/Syllabus.pdf,,10.1080/00043249.2021.1947710,,pre-existing,
3,want,black_studies,Fred Moten,In the Break,,2003,Univ of Minnesota Press,book,,,2,Planned,,References/Black Studies/Moten.pdf,,,,,
```

Note row 3 has `status=want` — should be filtered out.

- [ ] **Step 2: Write the failing tests**

Create `scripts/tests/test_csv_loader.py`:

```python
from pathlib import Path
from scripts.corpus_builder.csv_loader import load_rows, split_authors, parse_sections

def test_load_rows_filters_to_have_status(fixtures_dir: Path):
    rows = load_rows(fixtures_dir / "sample.csv")
    assert len(rows) == 2
    titles = [r["title"] for r in rows]
    assert "In the Break" not in titles

def test_load_rows_preserves_expected_fields(fixtures_dir: Path):
    rows = load_rows(fixtures_dir / "sample.csv")
    first = rows[0]
    assert first["title"] == "Poetics of Relation"
    assert first["year"] == 1997
    assert first["category"] == "opacity_refusal"
    assert first["sections_cited"] == [1, 3]
    assert first["authors"] == [{"firstName": "Édouard", "lastName": "Glissant"}]

def test_split_authors_handles_multiple():
    authors = split_authors("David J. Getsy; Che Gossett")
    assert authors == [
        {"firstName": "David J.", "lastName": "Getsy"},
        {"firstName": "Che", "lastName": "Gossett"},
    ]

def test_split_authors_handles_single_name():
    assert split_authors("Madonna") == [{"firstName": "", "lastName": "Madonna"}]

def test_split_authors_empty():
    assert split_authors("") == []

def test_parse_sections_semicolon_delimited():
    assert parse_sections("1;3") == [1, 3]

def test_parse_sections_empty():
    assert parse_sections("") == []

def test_parse_sections_single():
    assert parse_sections("4") == [4]

def test_year_coerces_to_int_or_none(fixtures_dir: Path):
    rows = load_rows(fixtures_dir / "sample.csv")
    assert isinstance(rows[0]["year"], int)
```

- [ ] **Step 3: Run tests, verify they fail**

Run: `cd scripts && uv run --project . pytest tests/test_csv_loader.py -v`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `csv_loader`**

Create `scripts/corpus_builder/csv_loader.py`:

```python
import csv
from pathlib import Path

STATUS_ACTIVE = "have"

OPTIONAL_STRING_FIELDS = (
    "subtitle", "publisher", "type", "editor_translator",
    "journal_or_source", "why_cited", "url", "doi", "isbn",
)

def split_authors(raw: str) -> list[dict]:
    if not raw or not raw.strip():
        return []
    parts = [p.strip() for p in raw.split(";") if p.strip()]
    authors = []
    for part in parts:
        tokens = part.split()
        if len(tokens) == 1:
            authors.append({"firstName": "", "lastName": tokens[0]})
        else:
            authors.append({
                "firstName": " ".join(tokens[:-1]),
                "lastName": tokens[-1],
            })
    return authors

def parse_sections(raw: str) -> list[int]:
    if not raw or not raw.strip():
        return []
    out = []
    for piece in raw.split(";"):
        piece = piece.strip()
        if not piece:
            continue
        try:
            out.append(int(piece))
        except ValueError:
            continue
    return out

def _coerce_year(raw: str) -> int | None:
    raw = (raw or "").strip()
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError:
        return None

def _blank_to_none(v: str) -> str | None:
    v = (v or "").strip()
    return v or None

def load_rows(csv_path: Path) -> list[dict]:
    rows: list[dict] = []
    with csv_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for raw in reader:
            if (raw.get("status") or "").strip() != STATUS_ACTIVE:
                continue
            row = {
                "title": (raw.get("title") or "").strip(),
                "authors": split_authors(raw.get("author", "")),
                "year": _coerce_year(raw.get("year", "")),
                "category": (raw.get("category") or "").strip() or None,
                "sections_cited": parse_sections(raw.get("sections_cited", "")),
                "file_location": (raw.get("file_location") or "").strip(),
            }
            for key in OPTIONAL_STRING_FIELDS:
                row[key] = _blank_to_none(raw.get(key, ""))
            rows.append(row)
    return rows
```

- [ ] **Step 5: Run tests, verify pass**

Run: `cd scripts && uv run --project . pytest tests/test_csv_loader.py -v`
Expected: 8 passed.

- [ ] **Step 6: Commit**

```bash
git add scripts/corpus_builder/csv_loader.py scripts/tests/test_csv_loader.py scripts/tests/fixtures/sample.csv
git commit -m "feat(build): CSV loader with status filter, author splitting, section parsing"
```

---

### Task 4: Markdown extractor

**Files:**
- Create: `scripts/corpus_builder/extract_markdown.py`
- Create: `scripts/tests/test_extract_markdown.py`
- Create: `scripts/tests/fixtures/sample.md`
- Create: `scripts/tests/fixtures/sample_with_frontmatter.md`

- [ ] **Step 1: Create fixtures**

Create `scripts/tests/fixtures/sample.md`:

```markdown
# Heading

Body paragraph with *emphasis* and **strong**.

Second paragraph.
```

Create `scripts/tests/fixtures/sample_with_frontmatter.md`:

```markdown
---
title: Thing
author: Someone
---

Body only.
```

- [ ] **Step 2: Write the failing tests**

Create `scripts/tests/test_extract_markdown.py`:

```python
from pathlib import Path
from scripts.corpus_builder.extract_markdown import extract_markdown

def test_plain_markdown_returns_single_chunk(fixtures_dir: Path):
    chunks = extract_markdown(fixtures_dir / "sample.md")
    assert len(chunks) == 1
    assert chunks[0]["page"] == 1
    assert "Body paragraph" in chunks[0]["text"]
    assert "# Heading" in chunks[0]["text"]

def test_frontmatter_is_stripped(fixtures_dir: Path):
    chunks = extract_markdown(fixtures_dir / "sample_with_frontmatter.md")
    assert "title: Thing" not in chunks[0]["text"]
    assert "Body only." in chunks[0]["text"]
```

- [ ] **Step 3: Run tests, verify they fail**

Run: `cd scripts && uv run --project . pytest tests/test_extract_markdown.py -v`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

Create `scripts/corpus_builder/extract_markdown.py`:

```python
import re
from pathlib import Path

_FRONTMATTER_RE = re.compile(r"\A---\r?\n.*?\r?\n---\r?\n", re.DOTALL)

def extract_markdown(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8")
    text = _FRONTMATTER_RE.sub("", text, count=1).strip()
    if not text:
        return []
    return [{"page": 1, "text": text}]
```

- [ ] **Step 5: Run tests, verify pass**

Run: `cd scripts && uv run --project . pytest tests/test_extract_markdown.py -v`
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add scripts/corpus_builder/extract_markdown.py scripts/tests/test_extract_markdown.py scripts/tests/fixtures/sample.md scripts/tests/fixtures/sample_with_frontmatter.md
git commit -m "feat(build): markdown extractor with frontmatter stripping"
```

---

### Task 5: PDF extractor (PyMuPDF)

**Files:**
- Create: `scripts/corpus_builder/extract_pdf.py`
- Create: `scripts/tests/test_extract_pdf.py`
- Create: `scripts/tests/fixtures/sample.pdf` (small, two pages, second page near-empty)

- [ ] **Step 1: Generate a tiny test PDF fixture**

Run (still uses the scripts `pyproject.toml` deps):

```bash
cd scripts && uv run --project . python - <<'PY'
import pymupdf
doc = pymupdf.open()
p1 = doc.new_page()
p1.insert_text((72, 72), "Alpha bravo charlie delta echo foxtrot.")
p2 = doc.new_page()
p2.insert_text((72, 72), "x")  # near-empty
p3 = doc.new_page()
p3.insert_text((72, 72), "Another page with plenty of extracted text here.")
doc.save("tests/fixtures/sample.pdf")
PY
```

- [ ] **Step 2: Write the failing tests**

Create `scripts/tests/test_extract_pdf.py`:

```python
from pathlib import Path
from scripts.corpus_builder.extract_pdf import extract_pdf

def test_returns_one_chunk_per_nonempty_page(fixtures_dir: Path):
    chunks = extract_pdf(fixtures_dir / "sample.pdf")
    # Page 2 is near-empty; should be skipped.
    assert [c["page"] for c in chunks] == [1, 3]

def test_chunk_text_captures_content(fixtures_dir: Path):
    chunks = extract_pdf(fixtures_dir / "sample.pdf")
    assert "Alpha bravo" in chunks[0]["text"]
    assert "Another page" in chunks[1]["text"]
```

- [ ] **Step 3: Run tests, verify they fail**

Run: `cd scripts && uv run --project . pytest tests/test_extract_pdf.py -v`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

Create `scripts/corpus_builder/extract_pdf.py`:

```python
from pathlib import Path
import pymupdf

MIN_NONWHITESPACE = 10

def extract_pdf(path: Path) -> list[dict]:
    """Extract non-empty pages, returning [{page, text}, ...].

    Pages with fewer than MIN_NONWHITESPACE non-whitespace characters
    are skipped (these are typically cover/blank/image-only pages).
    Page numbers are 1-based and preserve the original PDF page index.
    """
    chunks: list[dict] = []
    with pymupdf.open(path) as doc:
        for i, page in enumerate(doc, start=1):
            text = page.get_text("text") or ""
            nonws = sum(1 for c in text if not c.isspace())
            if nonws < MIN_NONWHITESPACE:
                continue
            chunks.append({"page": i, "text": text.strip()})
    return chunks
```

- [ ] **Step 5: Run tests, verify pass**

Run: `cd scripts && uv run --project . pytest tests/test_extract_pdf.py -v`
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add scripts/corpus_builder/extract_pdf.py scripts/tests/test_extract_pdf.py scripts/tests/fixtures/sample.pdf
git commit -m "feat(build): PDF extractor with near-empty-page skipping"
```

---

### Task 6: EPUB extractor (ebooklib + beautifulsoup4)

**Files:**
- Create: `scripts/corpus_builder/extract_epub.py`
- Create: `scripts/tests/test_extract_epub.py`
- Create: `scripts/tests/fixtures/sample.epub`

- [ ] **Step 1: Generate an EPUB fixture**

Run:

```bash
cd scripts && uv run --project . python - <<'PY'
from ebooklib import epub
book = epub.EpubBook()
book.set_identifier("id-1")
book.set_title("Sample")
book.set_language("en")
c1 = epub.EpubHtml(title="Chapter 1", file_name="c1.xhtml", lang="en")
c1.set_content("<html><body><h1>One</h1><p>Chapter one body text.</p></body></html>")
c2 = epub.EpubHtml(title="Chapter 2", file_name="c2.xhtml", lang="en")
c2.set_content("<html><body><h1>Two</h1><p>Chapter two body text.</p></body></html>")
book.add_item(c1)
book.add_item(c2)
book.toc = (c1, c2)
book.spine = ["nav", c1, c2]
book.add_item(epub.EpubNav())
book.add_item(epub.EpubNcx())
epub.write_epub("tests/fixtures/sample.epub", book)
PY
```

- [ ] **Step 2: Write the failing tests**

Create `scripts/tests/test_extract_epub.py`:

```python
from pathlib import Path
from scripts.corpus_builder.extract_epub import extract_epub

def test_returns_one_chunk_per_chapter(fixtures_dir: Path):
    chunks = extract_epub(fixtures_dir / "sample.epub")
    assert len(chunks) == 2
    assert [c["page"] for c in chunks] == [1, 2]

def test_html_is_stripped(fixtures_dir: Path):
    chunks = extract_epub(fixtures_dir / "sample.epub")
    text = chunks[0]["text"]
    assert "<p>" not in text
    assert "Chapter one body text." in text
    assert "One" in text  # h1 text preserved
```

- [ ] **Step 3: Run tests, verify they fail**

Run: `cd scripts && uv run --project . pytest tests/test_extract_epub.py -v`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

Create `scripts/corpus_builder/extract_epub.py`:

```python
from pathlib import Path
from ebooklib import epub, ITEM_DOCUMENT
from bs4 import BeautifulSoup

def extract_epub(path: Path) -> list[dict]:
    book = epub.read_epub(str(path))
    chunks: list[dict] = []
    idx = 0
    for item in book.get_items_of_type(ITEM_DOCUMENT):
        if item.file_name.endswith("nav.xhtml"):
            continue  # skip the auto-added nav
        soup = BeautifulSoup(item.get_content(), "html.parser")
        text = soup.get_text("\n").strip()
        if not text:
            continue
        idx += 1
        chunks.append({"page": idx, "text": text})
    return chunks
```

- [ ] **Step 5: Run tests, verify pass**

Run: `cd scripts && uv run --project . pytest tests/test_extract_epub.py -v`
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add scripts/corpus_builder/extract_epub.py scripts/tests/test_extract_epub.py scripts/tests/fixtures/sample.epub
git commit -m "feat(build): EPUB extractor with per-chapter chunks"
```

---

### Task 7: Pipeline orchestration (single file and directory `file_location`)

**Files:**
- Create: `scripts/corpus_builder/pipeline.py`
- Create: `scripts/tests/test_pipeline.py`
- Create: `scripts/tests/fixtures/dir_ref/intro.pdf` (one-page PDF)
- Create: `scripts/tests/fixtures/dir_ref/chapter1.md`

- [ ] **Step 1: Generate the directory fixture**

```bash
mkdir -p scripts/tests/fixtures/dir_ref
cd scripts && uv run --project . python - <<'PY'
import pymupdf
doc = pymupdf.open()
doc.new_page().insert_text((72, 72), "Intro page with enough text to survive the filter.")
doc.save("tests/fixtures/dir_ref/intro.pdf")
PY
cat > scripts/tests/fixtures/dir_ref/chapter1.md <<'MD'
Chapter one body.
MD
```

- [ ] **Step 2: Write the failing tests**

Create `scripts/tests/test_pipeline.py`:

```python
from pathlib import Path
from scripts.corpus_builder.pipeline import build_document

def _base_row(file_location: str) -> dict:
    return {
        "title": "T",
        "authors": [{"firstName": "A", "lastName": "B"}],
        "year": 2001,
        "category": "x",
        "sections_cited": [1],
        "file_location": file_location,
        "subtitle": None, "publisher": None, "type": "book",
        "editor_translator": None, "journal_or_source": None,
        "why_cited": None, "url": None, "doi": None, "isbn": None,
    }

def test_single_pdf_file_location(fixtures_dir: Path):
    row = _base_row("sample.pdf")
    doc = build_document(row, corpus_root=fixtures_dir)
    assert doc is not None
    assert doc["title"] == "T"
    assert doc["id"] and len(doc["id"]) == 12
    assert doc["chunks"][0]["page"] == 1

def test_markdown_file_location(fixtures_dir: Path):
    row = _base_row("sample.md")
    doc = build_document(row, corpus_root=fixtures_dir)
    assert doc["chunks"] == [{"page": 1, "text": doc["chunks"][0]["text"]}]
    assert "Body paragraph" in doc["chunks"][0]["text"]

def test_directory_aggregates_and_continues_page_numbers(fixtures_dir: Path):
    row = _base_row("dir_ref")
    doc = build_document(row, corpus_root=fixtures_dir)
    # intro.pdf (1 page) + chapter1.md (1 chunk) — sorted by filename:
    # chapter1.md first, then intro.pdf.
    pages = [c["page"] for c in doc["chunks"]]
    assert pages == [1, 2]

def test_missing_file_returns_none(fixtures_dir: Path):
    row = _base_row("nope.pdf")
    assert build_document(row, corpus_root=fixtures_dir) is None

def test_document_shape_matches_spec(fixtures_dir: Path):
    row = _base_row("sample.md")
    doc = build_document(row, corpus_root=fixtures_dir)
    expected_keys = {
        "id", "title", "subtitle", "authors", "year", "publisher",
        "type", "editor_translator", "journal_or_source", "doi", "isbn",
        "url", "category", "sections_cited", "why_cited", "chunks",
    }
    assert set(doc.keys()) == expected_keys
```

- [ ] **Step 3: Run tests, verify they fail**

Run: `cd scripts && uv run --project . pytest tests/test_pipeline.py -v`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

Create `scripts/corpus_builder/pipeline.py`:

```python
from pathlib import Path
from .extract_pdf import extract_pdf
from .extract_markdown import extract_markdown
from .extract_epub import extract_epub
from .ids import stable_doc_id

_EXTRACTORS = {
    ".pdf": extract_pdf,
    ".md": extract_markdown,
    ".epub": extract_epub,
}

_OUTPUT_FIELDS = (
    "title", "subtitle", "authors", "year", "publisher", "type",
    "editor_translator", "journal_or_source", "doi", "isbn", "url",
    "category", "sections_cited", "why_cited",
)

def _extract_file(path: Path) -> list[dict]:
    ext = path.suffix.lower()
    fn = _EXTRACTORS.get(ext)
    if fn is None:
        return []
    return fn(path)

def _extract_directory(root: Path) -> list[dict]:
    chunks: list[dict] = []
    next_page = 1
    for child in sorted(root.iterdir()):
        if not child.is_file():
            continue
        for c in _extract_file(child):
            chunks.append({"page": next_page, "text": c["text"]})
            next_page += 1
    return chunks

def build_document(row: dict, corpus_root: Path) -> dict | None:
    target = corpus_root / row["file_location"]
    if not target.exists():
        return None
    if target.is_dir():
        chunks = _extract_directory(target)
    else:
        chunks = _extract_file(target)
    if not chunks:
        return None
    doc = {k: row.get(k) for k in _OUTPUT_FIELDS}
    doc["id"] = stable_doc_id(row["file_location"])
    doc["chunks"] = chunks
    return doc
```

- [ ] **Step 5: Run tests, verify pass**

Run: `cd scripts && uv run --project . pytest tests/test_pipeline.py -v`
Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add scripts/corpus_builder/pipeline.py scripts/tests/test_pipeline.py scripts/tests/fixtures/dir_ref/
git commit -m "feat(build): pipeline orchestration for single files and directories"
```

---

### Task 8: Top-level `build_corpus.py` CLI (uv shebang + PEP 723)

**Files:**
- Create: `scripts/build_corpus.py`

- [ ] **Step 1: Create the executable entry script**

Create `scripts/build_corpus.py`:

```python
#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = [
#   "pymupdf>=1.24",
#   "ebooklib>=0.18",
#   "beautifulsoup4>=4.12",
# ]
# ///
"""Build public/corpus.json from mfa_thesis/references_todo.csv.

Usage:
    uv run scripts/build_corpus.py --corpus-root ~/mfa_thesis --out public/corpus.json
"""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

# Make the sibling `corpus_builder` package importable when run directly.
sys.path.insert(0, str(Path(__file__).parent))
from corpus_builder.csv_loader import load_rows  # noqa: E402
from corpus_builder.pipeline import build_document  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus-root", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--csv", default="references_todo.csv",
                    help="CSV filename relative to --corpus-root")
    args = ap.parse_args()

    csv_path = args.corpus_root / args.csv
    if not csv_path.exists():
        print(f"error: CSV not found at {csv_path}", file=sys.stderr)
        return 1

    rows = load_rows(csv_path)
    docs = []
    skipped = []
    for row in rows:
        doc = build_document(row, corpus_root=args.corpus_root)
        if doc is None:
            skipped.append(row["file_location"])
            continue
        docs.append(doc)

    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "documents": docs,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(out, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    print(f"wrote {len(docs)} documents to {args.out}")
    if skipped:
        print(f"skipped {len(skipped)} rows (missing/unreadable):", file=sys.stderr)
        for s in skipped:
            print(f"  - {s}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/build_corpus.py
```

- [ ] **Step 3: Smoke-test against the test fixtures**

Run:

```bash
cd /home/richard/github/fragments && \
  scripts/build_corpus.py \
    --corpus-root scripts/tests/fixtures \
    --csv sample.csv \
    --out /tmp/test_corpus.json
```

Expected: exits 0, prints `wrote 2 documents to /tmp/test_corpus.json` and skips both rows (the CSV references `References/Opacity & Refusal/Glissant.pdf` which doesn't exist as a file under the fixtures dir). That's fine — the smoke test is that the script runs end-to-end without error. Verify the JSON structure:

```bash
python3 -c "import json; d=json.load(open('/tmp/test_corpus.json')); print(sorted(d.keys()))"
```

Expected: `['documents', 'generated_at']`.

- [ ] **Step 4: Commit**

```bash
git add scripts/build_corpus.py
git commit -m "feat(build): top-level build_corpus.py CLI with uv shebang"
```

---

### Task 9: Run against real corpus and commit `public/corpus.json`

**Files:**
- Create: `public/corpus.json`

- [ ] **Step 1: Run the build against `~/mfa_thesis`**

Run:

```bash
cd /home/richard/github/fragments && \
  scripts/build_corpus.py \
    --corpus-root /home/richard/mfa_thesis \
    --out public/corpus.json
```

Expected: exits 0, prints `wrote N documents to public/corpus.json` where N ≤ 50. Any skipped rows are printed to stderr — review them. Do **not** retry failures in this step; if a PDF truly has no extractable text it needs OCR upstream, which is out of scope.

- [ ] **Step 2: Sanity-check the output**

```bash
python3 -c "
import json
d = json.load(open('public/corpus.json'))
print('docs:', len(d['documents']))
print('first title:', d['documents'][0]['title'])
print('id sample:', d['documents'][0]['id'])
print('chunks in first doc:', len(d['documents'][0]['chunks']))
print('size MB:', round(sum(len(c['text']) for doc in d['documents'] for c in doc['chunks']) / 1_000_000, 2))
"
```

Expected: reasonable values (non-zero docs, 12-char id, a few MB of text total).

- [ ] **Step 3: Commit**

```bash
git add public/corpus.json
git commit -m "chore: generate initial public/corpus.json from mfa_thesis"
```

---

## Phase 2 — Frontend data layer

### Task 10: Install new dependencies and drop old ones

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime dep**

```bash
cd /home/richard/github/fragments && npm install minisearch
```

- [ ] **Step 2: Install dev deps**

```bash
npm install --save-dev vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 3: Remove Tauri + wdio deps**

```bash
npm uninstall @tauri-apps/api @tauri-apps/plugin-dialog @tauri-apps/plugin-fs @tauri-apps/plugin-opener @tauri-apps/cli @wdio/cli @wdio/local-runner @wdio/mocha-framework @wdio/spec-reporter webdriverio
```

- [ ] **Step 4: Edit scripts in `package.json`**

Open `package.json` and set the `scripts` block to exactly:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc && vite build",
  "preview": "vite preview",
  "test": "vitest",
  "test:run": "vitest run",
  "build:corpus": "scripts/build_corpus.py --corpus-root ../mfa_thesis --out public/corpus.json"
}
```

- [ ] **Step 5: Verify install succeeded**

```bash
npm run test:run -- --help
```

Expected: Vitest help output (proves it's installed), though no tests exist yet.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: swap Tauri/wdio deps for Vitest + MiniSearch"
```

---

### Task 11: Configure Vitest

**Files:**
- Create: `vitest.config.ts`
- Create: `src/setupTests.ts`

- [ ] **Step 1: Write `vitest.config.ts`**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"],
    globals: true,
    css: false,
  },
});
```

- [ ] **Step 2: Write `src/setupTests.ts`**

Create `src/setupTests.ts`:

```typescript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Add a throwaway sanity test to prove config works**

Create `src/setupTests.spec.ts`:

```typescript
import { describe, it, expect } from "vitest";

describe("vitest setup", () => {
  it("runs a trivial test", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run
```

Expected: 1 passed.

- [ ] **Step 5: Delete the throwaway test and commit the config**

```bash
rm src/setupTests.spec.ts
git add vitest.config.ts src/setupTests.ts
git commit -m "chore: configure Vitest with jsdom + jest-dom matchers"
```

---

### Task 12: New corpus / citation / project types

**Files:**
- Create: `src/types/corpus.ts`
- Create: `src/types/citation.ts`
- Create: `src/types/project.ts`
- Delete: `src/types/search.ts` (at end of task)

- [ ] **Step 1: Write `src/types/corpus.ts`**

Create `src/types/corpus.ts`:

```typescript
export interface CorpusAuthor {
  firstName: string;
  lastName: string;
}

export interface CorpusChunk {
  page: number;
  text: string;
}

export interface CorpusDocument {
  id: string;
  title: string;
  subtitle: string | null;
  authors: CorpusAuthor[];
  year: number | null;
  publisher: string | null;
  type: string | null;
  editor_translator: string | null;
  journal_or_source: string | null;
  doi: string | null;
  isbn: string | null;
  url: string | null;
  category: string | null;
  sections_cited: number[];
  why_cited: string | null;
  chunks: CorpusChunk[];
}

export interface Corpus {
  generated_at: string;
  documents: CorpusDocument[];
}

export interface SearchHit {
  docId: string;
  page: number;
  text: string;
  extract: string;
  score: number;
  sourceTitle: string;
}
```

- [ ] **Step 2: Write `src/types/citation.ts`**

Create `src/types/citation.ts`:

```typescript
export interface Citation {
  docId: string;
  page: number;
  insertedText: string;
  sourceSnapshot: string;
  modified: boolean;
}
```

- [ ] **Step 3: Write `src/types/project.ts`**

Create `src/types/project.ts`:

```typescript
import type { Citation } from "./citation";

export interface ProjectState {
  title: string;
  contentJson: string;
  citations: Citation[];
}

export const EMPTY_PROJECT: ProjectState = {
  title: "Untitled",
  contentJson: JSON.stringify({ type: "doc", content: [] }),
  citations: [],
};
```

- [ ] **Step 4: Delete the old search type**

```bash
git rm src/types/search.ts
```

- [ ] **Step 5: Run the TS compiler**

```bash
npx tsc --noEmit
```

Expected: errors pointing at files that import `./types/search` (e.g., `SearchPanel.tsx`) — those are fixed in later tasks. No errors involving the new type files.

- [ ] **Step 6: Commit**

```bash
git add src/types/
git commit -m "feat(types): corpus, citation, and project shapes"
```

---

### Task 13: Port `snap_to_punctuation` from Rust to TypeScript

**Files:**
- Create: `src/utils/search.ts`
- Create: `src/utils/search.test.ts`

- [ ] **Step 1: Write the failing tests (ported verbatim from Rust cases and extended)**

Create `src/utils/search.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { snapToPunctuation } from "./search";

describe("snapToPunctuation", () => {
  it("snaps start back to a sentence stop", () => {
    const full = "First sentence. Second sentence has the target word. Third sentence.";
    const extract = "target word";
    const result = snapToPunctuation(full, extract);
    expect(result.startsWith("Second sentence")).toBe(true);
    expect(result.endsWith(".")).toBe(true);
  });

  it("snaps end forward to a sentence stop", () => {
    const full = "Intro. The target appears here and then continues for a while. More text.";
    const extract = "target";
    const result = snapToPunctuation(full, extract);
    expect(result.endsWith(".")).toBe(true);
  });

  it("prefers curly opening quote at the start", () => {
    const full = "Intro text \u201CA quoted target inside opens here\u201D afterwards.";
    const extract = "target";
    const result = snapToPunctuation(full, extract);
    expect(result.startsWith("\u201C")).toBe(true);
    expect(result.endsWith("\u201D")).toBe(true);
  });

  it("returns the extract unchanged when not found in full text", () => {
    const result = snapToPunctuation("unrelated text", "missing");
    expect(result).toBe("missing");
  });

  it("caps result at MAX_CHARS", () => {
    const long = "x".repeat(400) + " target " + "y".repeat(400);
    const result = snapToPunctuation(long, "target");
    expect(result.length).toBeLessThanOrEqual(250);
  });

  it("trims whitespace on return", () => {
    const full = "   target   ";
    expect(snapToPunctuation(full, "target").trim()).toBe(snapToPunctuation(full, "target"));
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm run test:run -- src/utils/search.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/utils/search.ts`:

```typescript
const MARGIN = 60;
const MAX_CHARS = 250;

const SENTENCE_STOPS = new Set([".", "!", "?", ";", "\n"]);
const OPEN_QUOTES = new Set(["\u201C", "\u2018"]);
const CLOSE_QUOTES = new Set(["\u201D", "\u2019"]);
const STRAIGHT_QUOTES = new Set(['"', "'"]);

function isSentenceStop(c: string): boolean { return SENTENCE_STOPS.has(c); }
function isOpenQuote(c: string): boolean { return OPEN_QUOTES.has(c); }
function isCloseQuote(c: string): boolean { return CLOSE_QUOTES.has(c); }
function isStraightQuote(c: string): boolean { return STRAIGHT_QUOTES.has(c); }

/**
 * Expand `extract` to nearby sentence/quote boundaries within `fullText`.
 * Ported from src-tauri/src/search.rs::snap_to_punctuation — keeps the same
 * ~60 char margin, 250 char max, and quote-awareness rules.
 */
export function snapToPunctuation(fullText: string, extract: string): string {
  const chars = Array.from(fullText);
  const fullStr = chars.join("");
  const idx = fullStr.indexOf(extract);
  if (idx === -1) return extract;

  // Convert byte-ish index (string) to char index by walking from start.
  // JS strings are UTF-16, but we treat them as code-point arrays here.
  let charStart = 0;
  {
    let counted = 0;
    for (const c of fullText) {
      if (counted === idx) break;
      counted += c.length;
      charStart += 1;
    }
  }
  const charEnd = charStart + Array.from(extract).length;

  // Snap start backward
  const scanStart = Math.max(0, charStart - MARGIN);
  let start = scanStart;
  for (let i = charStart - 1; i >= scanStart; i--) {
    const c = chars[i];
    if (isOpenQuote(c) || isStraightQuote(c)) { start = i; break; }
    if (isSentenceStop(c)) { start = i + 1; break; }
  }

  // Snap end forward
  const scanEnd = Math.min(chars.length, charEnd + MARGIN);
  let end = scanEnd;
  for (let i = charEnd; i < scanEnd; i++) {
    const c = chars[i];
    if (isCloseQuote(c) || isStraightQuote(c)) { end = i + 1; break; }
    if (isSentenceStop(c)) { end = i + 1; break; }
  }

  // Enforce max length
  if (end - start > MAX_CHARS) {
    end = Math.min(start + MAX_CHARS, chars.length);
    for (let i = end - 1; i >= charEnd; i--) {
      const c = chars[i];
      if (isSentenceStop(c) || isCloseQuote(c) || isStraightQuote(c)) {
        end = i + 1;
        break;
      }
    }
  }

  return chars.slice(start, end).join("").trim();
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
npm run test:run -- src/utils/search.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/utils/search.ts src/utils/search.test.ts
git commit -m "feat(search): port snap_to_punctuation from Rust to TypeScript"
```

---

### Task 14: Snippet carving from a MiniSearch result

**Files:**
- Modify: `src/utils/search.ts`
- Modify: `src/utils/search.test.ts`

- [ ] **Step 1: Append failing tests for `carveSnippet`**

Append to `src/utils/search.test.ts`:

```typescript
import { carveSnippet } from "./search";

describe("carveSnippet", () => {
  it("centers a window around the first match position", () => {
    const text = "The quick brown fox jumps over the lazy dog and then some.";
    const snippet = carveSnippet(text, ["fox"]);
    expect(snippet.includes("fox")).toBe(true);
  });

  it("returns snapped result (ends at punctuation when close)", () => {
    const text = "Preamble. This sentence has the needle inside it. Epilogue.";
    const snippet = carveSnippet(text, ["needle"]);
    expect(snippet.endsWith(".")).toBe(true);
  });

  it("falls back to first 150 chars when no matches provided", () => {
    const text = "a".repeat(300);
    const snippet = carveSnippet(text, []);
    expect(snippet.length).toBeLessThanOrEqual(250);
    expect(snippet.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm run test:run -- src/utils/search.test.ts
```

Expected: FAIL — `carveSnippet` not exported.

- [ ] **Step 3: Append the implementation**

Append to `src/utils/search.ts`:

```typescript
const SNIPPET_WINDOW = 150;

/**
 * Carve a ~150-char window around the first occurrence of any match term
 * in `text`, then snap it to sentence/quote boundaries.
 */
export function carveSnippet(text: string, matchTerms: string[]): string {
  if (matchTerms.length === 0) {
    const head = text.slice(0, SNIPPET_WINDOW);
    return snapToPunctuation(text, head);
  }

  const lower = text.toLowerCase();
  let firstIdx = -1;
  let firstLen = 0;
  for (const term of matchTerms) {
    const t = term.toLowerCase();
    const idx = lower.indexOf(t);
    if (idx !== -1 && (firstIdx === -1 || idx < firstIdx)) {
      firstIdx = idx;
      firstLen = t.length;
    }
  }

  if (firstIdx === -1) {
    const head = text.slice(0, SNIPPET_WINDOW);
    return snapToPunctuation(text, head);
  }

  const half = Math.floor(SNIPPET_WINDOW / 2);
  const start = Math.max(0, firstIdx - half);
  const end = Math.min(text.length, firstIdx + firstLen + half);
  const window = text.slice(start, end);
  return snapToPunctuation(text, window);
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
npm run test:run -- src/utils/search.test.ts
```

Expected: 9 passed (6 from Task 13 + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/utils/search.ts src/utils/search.test.ts
git commit -m "feat(search): carveSnippet windowing + snapping around matches"
```

---

### Task 15: `useCorpus` hook

**Files:**
- Create: `src/hooks/useCorpus.ts`
- Create: `src/hooks/useCorpus.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/useCorpus.test.tsx`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useCorpus } from "./useCorpus";

const sampleCorpus = {
  generated_at: "2026-04-18T00:00:00Z",
  documents: [
    {
      id: "a1b2c3d4e5f6",
      title: "Poetics of Relation",
      subtitle: null,
      authors: [{ firstName: "Édouard", lastName: "Glissant" }],
      year: 1997,
      publisher: "University of Michigan Press",
      type: "book",
      editor_translator: "Translated by Betsy Wing",
      journal_or_source: null,
      doi: null,
      isbn: null,
      url: null,
      category: "opacity_refusal",
      sections_cited: [1, 3],
      why_cited: "Core chapter.",
      chunks: [
        { page: 1, text: "The right to opacity for everyone." },
        { page: 42, text: "Errancy is not wandering without purpose." },
      ],
    },
  ],
};

beforeEach(() => {
  vi.restoreAllMocks();
});

function mockFetchSuccess(payload: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => payload,
  }));
}

function mockFetchFailure() {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
}

describe("useCorpus", () => {
  it("starts in loading state", () => {
    mockFetchSuccess(sampleCorpus);
    const { result } = renderHook(() => useCorpus());
    expect(result.current.status).toBe("loading");
  });

  it("resolves to ready with indexed documents", async () => {
    mockFetchSuccess(sampleCorpus);
    const { result } = renderHook(() => useCorpus());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    if (result.current.status !== "ready") throw new Error("expected ready");
    expect(result.current.documents).toHaveLength(1);
    expect(result.current.byId("a1b2c3d4e5f6")?.title).toBe("Poetics of Relation");
    const hits = result.current.miniSearch.search("opacity");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("enters error state on fetch failure", async () => {
    mockFetchFailure();
    const { result } = renderHook(() => useCorpus());
    await waitFor(() => expect(result.current.status).toBe("error"));
  });

  it("retry() re-fetches after an error", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce({ ok: true, json: async () => sampleCorpus });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useCorpus());
    await waitFor(() => expect(result.current.status).toBe("error"));
    result.current.retry();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm run test:run -- src/hooks/useCorpus.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/hooks/useCorpus.ts`:

```typescript
import { useCallback, useEffect, useMemo, useState } from "react";
import MiniSearch from "minisearch";
import type { Corpus, CorpusDocument } from "../types/corpus";

export type CorpusState =
  | { status: "loading" }
  | { status: "error"; error: Error }
  | {
      status: "ready";
      documents: CorpusDocument[];
      byId: (id: string) => CorpusDocument | undefined;
      miniSearch: MiniSearch<ChunkDoc>;
    };

export interface UseCorpusResult {
  status: "loading" | "error" | "ready";
  error?: Error;
  documents?: CorpusDocument[];
  byId?: (id: string) => CorpusDocument | undefined;
  miniSearch?: MiniSearch<ChunkDoc>;
  retry: () => void;
}

interface ChunkDoc {
  id: string;
  docId: string;
  page: number;
  text: string;
}

export function buildMiniSearch(documents: CorpusDocument[]): MiniSearch<ChunkDoc> {
  const ms = new MiniSearch<ChunkDoc>({
    fields: ["text"],
    storeFields: ["docId", "page", "text"],
    searchOptions: { combineWith: "AND", prefix: true, fuzzy: 0.2 },
  });
  const chunks: ChunkDoc[] = [];
  for (const doc of documents) {
    for (const chunk of doc.chunks) {
      chunks.push({
        id: `${doc.id}:${chunk.page}`,
        docId: doc.id,
        page: chunk.page,
        text: chunk.text,
      });
    }
  }
  ms.addAll(chunks);
  return ms;
}

export function useCorpus(): UseCorpusResult {
  const [state, setState] = useState<CorpusState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    const url = `${import.meta.env.BASE_URL}corpus.json`;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`corpus.json: HTTP ${res.status}`);
        const corpus = (await res.json()) as Corpus;
        if (cancelled) return;
        const miniSearch = buildMiniSearch(corpus.documents);
        const byIdMap = new Map(corpus.documents.map((d) => [d.id, d]));
        setState({
          status: "ready",
          documents: corpus.documents,
          byId: (id) => byIdMap.get(id),
          miniSearch,
        });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setState({ status: "error", error: err });
      });
    return () => { cancelled = true; };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return useMemo(() => {
    switch (state.status) {
      case "loading":
        return { status: "loading", retry };
      case "error":
        return { status: "error", error: state.error, retry };
      case "ready":
        return {
          status: "ready",
          documents: state.documents,
          byId: state.byId,
          miniSearch: state.miniSearch,
          retry,
        };
    }
  }, [state, retry]);
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
npm run test:run -- src/hooks/useCorpus.test.tsx
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCorpus.ts src/hooks/useCorpus.test.tsx
git commit -m "feat(frontend): useCorpus hook with MiniSearch index"
```

---

### Task 16: `CorpusContext` provider

**Files:**
- Create: `src/context/CorpusContext.tsx`

- [ ] **Step 1: Implement the context**

Create `src/context/CorpusContext.tsx`:

```typescript
import { createContext, useContext, type ReactNode } from "react";
import type MiniSearch from "minisearch";
import type { CorpusDocument } from "../types/corpus";

interface CorpusContextValue {
  documents: CorpusDocument[];
  byId: (id: string) => CorpusDocument | undefined;
  miniSearch: MiniSearch;
}

const CorpusContext = createContext<CorpusContextValue | null>(null);

export function CorpusProvider({
  value,
  children,
}: {
  value: CorpusContextValue;
  children: ReactNode;
}) {
  return <CorpusContext.Provider value={value}>{children}</CorpusContext.Provider>;
}

export function useCorpusContext(): CorpusContextValue {
  const ctx = useContext(CorpusContext);
  if (!ctx) throw new Error("useCorpusContext must be used inside CorpusProvider");
  return ctx;
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no new errors in these files.

- [ ] **Step 3: Commit**

```bash
git add src/context/CorpusContext.tsx
git commit -m "feat(frontend): CorpusContext provider"
```

---

### Task 17: Rewrite `useProject` as localStorage-backed

**Files:**
- Rewrite: `src/hooks/useProject.ts`
- Create: `src/hooks/useProject.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/useProject.test.tsx`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useProject, PROJECT_STORAGE_KEY } from "./useProject";

beforeEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

describe("useProject", () => {
  it("returns empty project when nothing in storage", () => {
    const { result } = renderHook(() => useProject());
    expect(result.current.project.title).toBe("Untitled");
    expect(result.current.project.citations).toEqual([]);
    expect(result.current.storageError).toBeNull();
  });

  it("loads an existing project from storage on mount", () => {
    window.localStorage.setItem(
      PROJECT_STORAGE_KEY,
      JSON.stringify({
        title: "Saved",
        contentJson: JSON.stringify({ type: "doc", content: [] }),
        citations: [],
      })
    );
    const { result } = renderHook(() => useProject());
    expect(result.current.project.title).toBe("Saved");
  });

  it("setTitle debounces a write to localStorage", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useProject());
    act(() => { result.current.setTitle("New"); });
    expect(window.localStorage.getItem(PROJECT_STORAGE_KEY)).toBeNull();
    act(() => { vi.advanceTimersByTime(600); });
    const saved = JSON.parse(window.localStorage.getItem(PROJECT_STORAGE_KEY)!);
    expect(saved.title).toBe("New");
    vi.useRealTimers();
  });

  it("setContentJson persists updated content", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useProject());
    act(() => { result.current.setContentJson('{"type":"doc","content":[1]}'); });
    act(() => { vi.advanceTimersByTime(600); });
    const saved = JSON.parse(window.localStorage.getItem(PROJECT_STORAGE_KEY)!);
    expect(saved.contentJson).toBe('{"type":"doc","content":[1]}');
    vi.useRealTimers();
  });

  it("surfaces quota errors via storageError without crashing", async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      const err = new Error("quota"); err.name = "QuotaExceededError"; throw err;
    });
    const { result } = renderHook(() => useProject());
    act(() => { result.current.setTitle("x"); });
    act(() => { vi.advanceTimersByTime(600); });
    await waitFor(() => expect(result.current.storageError).not.toBeNull());
    spy.mockRestore();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm run test:run -- src/hooks/useProject.test.tsx
```

Expected: FAIL — current `useProject` imports `@tauri-apps/api/core` (module resolution error after Task 10 removed it).

- [ ] **Step 3: Rewrite `useProject`**

Replace the entire contents of `src/hooks/useProject.ts` with:

```typescript
import { useCallback, useEffect, useRef, useState } from "react";
import { EMPTY_PROJECT, type ProjectState } from "../types/project";
import type { Citation } from "../types/citation";

export const PROJECT_STORAGE_KEY = "fragments:project";
const DEBOUNCE_MS = 500;

function readFromStorage(): { state: ProjectState; error: Error | null } {
  try {
    const raw = window.localStorage.getItem(PROJECT_STORAGE_KEY);
    if (!raw) return { state: EMPTY_PROJECT, error: null };
    const parsed = JSON.parse(raw) as ProjectState;
    return { state: parsed, error: null };
  } catch (err) {
    return { state: EMPTY_PROJECT, error: err as Error };
  }
}

export function useProject() {
  const [project, setProject] = useState<ProjectState>(() => readFromStorage().state);
  const [storageError, setStorageError] = useState<Error | null>(() => readFromStorage().error);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const persist = useCallback((next: ProjectState) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        window.localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(next));
        setStorageError(null);
      } catch (err) {
        setStorageError(err as Error);
      }
    }, DEBOUNCE_MS);
  }, []);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const setTitle = useCallback((title: string) => {
    setProject((prev) => {
      const next = { ...prev, title };
      persist(next);
      return next;
    });
  }, [persist]);

  const setContentJson = useCallback((contentJson: string) => {
    setProject((prev) => {
      const next = { ...prev, contentJson };
      persist(next);
      return next;
    });
  }, [persist]);

  const setCitations = useCallback((citations: Citation[]) => {
    setProject((prev) => {
      const next = { ...prev, citations };
      persist(next);
      return next;
    });
  }, [persist]);

  return { project, setTitle, setContentJson, setCitations, storageError };
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
npm run test:run -- src/hooks/useProject.test.tsx
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useProject.ts src/hooks/useProject.test.tsx
git commit -m "feat(frontend): rewrite useProject as localStorage-backed, single project"
```

---

### Task 18: Rewrite `utils/documents.ts` to consume corpus shape

**Files:**
- Rewrite: `src/utils/documents.ts`
- Create: `src/utils/documents.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/documents.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { docToMeta, getReferencedDocIds, sortByAuthorLastName, formatCitationHtml } from "./documents";
import type { CorpusDocument } from "../types/corpus";

function makeDoc(overrides: Partial<CorpusDocument> = {}): CorpusDocument {
  return {
    id: "deadbeef0001",
    title: "T",
    subtitle: null,
    authors: [{ firstName: "Jane", lastName: "Smith" }],
    year: 2020,
    publisher: "Pub",
    type: "book",
    editor_translator: null,
    journal_or_source: null,
    doi: null,
    isbn: null,
    url: null,
    category: "x",
    sections_cited: [],
    why_cited: null,
    chunks: [],
    ...overrides,
  };
}

describe("docToMeta", () => {
  it("maps year into publicationDate as a YYYY string", () => {
    const meta = docToMeta(makeDoc({ year: 2005 }));
    expect(meta.publicationDate).toBe("2005");
  });

  it("maps journal_or_source to journalName", () => {
    const meta = docToMeta(makeDoc({ journal_or_source: "Art Journal 80(4)" }));
    expect(meta.journalName).toBe("Art Journal 80(4)");
  });

  it("passes through type as documentType", () => {
    const meta = docToMeta(makeDoc({ type: "article" }));
    expect(meta.documentType).toBe("article");
  });

  it("defaults documentType to 'book' when type is null", () => {
    const meta = docToMeta(makeDoc({ type: null }));
    expect(meta.documentType).toBe("book");
  });
});

describe("sortByAuthorLastName", () => {
  it("sorts by first author last name", () => {
    const a = makeDoc({ authors: [{ firstName: "Ada", lastName: "Zed" }] });
    const b = makeDoc({ authors: [{ firstName: "Bob", lastName: "Alpha" }] });
    expect([a, b].sort(sortByAuthorLastName)[0]).toBe(b);
  });
});

describe("formatCitationHtml", () => {
  it("converts markdown emphasis and straight quotes", () => {
    expect(formatCitationHtml('*Book*. "Chapter".')).toBe(
      "<em>Book</em>. &ldquo;Chapter&rdquo;."
    );
  });
});

describe("getReferencedDocIds", () => {
  it("returns an empty array when editor is null", () => {
    expect(getReferencedDocIds(null)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm run test:run -- src/utils/documents.test.ts
```

Expected: FAIL — current `documents.ts` has the old shape.

- [ ] **Step 3: Rewrite**

Replace `src/utils/documents.ts` contents with:

```typescript
import type { Editor } from "@tiptap/react";
import type { CitationMetadata } from "./chicago";
import type { CorpusDocument } from "../types/corpus";
import { FRAGMENT_NODE_NAME } from "../extensions/FragmentNode";

export type DocumentWithMeta = CorpusDocument;

export function docToMeta(doc: CorpusDocument): CitationMetadata {
  return {
    title: doc.title,
    subtitle: doc.subtitle,
    authors: doc.authors.map((a) => ({ firstName: a.firstName, lastName: a.lastName })),
    publisher: doc.publisher,
    publicationDate: doc.year != null ? String(doc.year) : null,
    doi: doc.doi,
    isbn: doc.isbn,
    journalName: doc.journal_or_source,
    volume: null,
    issue: null,
    pageRange: null,
    edition: null,
    url: doc.url,
    containerTitle: null,
    documentType: doc.type ?? "book",
  };
}

export function formatCitationHtml(citation: string): string {
  return citation
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/"([^"]+)"/g, "&ldquo;$1&rdquo;");
}

export function sortByAuthorLastName(a: CorpusDocument, b: CorpusDocument): number {
  const aName = a.authors[0]?.lastName || a.title;
  const bName = b.authors[0]?.lastName || b.title;
  return aName.localeCompare(bName);
}

export function getReferencedDocIds(editor: Editor | null): string[] {
  if (!editor) return [];
  const ids = new Set<string>();
  editor.state.doc.descendants((node) => {
    if (node.type.name === FRAGMENT_NODE_NAME && node.attrs.docId) {
      ids.add(node.attrs.docId as string);
    }
  });
  return Array.from(ids);
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
npm run test:run -- src/utils/documents.test.ts
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/utils/documents.ts src/utils/documents.test.ts
git commit -m "feat(frontend): rewrite documents.ts for corpus shape (string docId)"
```

---

## Phase 3 — Frontend components

### Task 19: Update `FragmentNode` and `FragmentNodeView` to use `docId: string`

**Files:**
- Rewrite: `src/extensions/FragmentNode.ts`
- Modify: `src/extensions/FragmentNodeView.tsx`

- [ ] **Step 1: Read the current view to see what attrs it uses**

```bash
cat src/extensions/FragmentNodeView.tsx
```

Note: we need to change only attribute **names** that switch (`sourceId` → `docId`, removal of `rowId`).

- [ ] **Step 2: Rewrite `FragmentNode.ts`**

Replace `src/extensions/FragmentNode.ts` contents with:

```typescript
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { FragmentNodeView } from "./FragmentNodeView";

export const FRAGMENT_NODE_NAME = "fragment";
export const FRAGMENT_MIME_TYPE = "application/x-fragment";

export interface FragmentAttrs {
  docId: string;
  sourceTitle: string;
  pageNumber: number;
  originalText: string;
  displayText: string;
  edited: boolean;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fragment: {
      insertFragment: (attrs: FragmentAttrs) => ReturnType;
      dissolveFragment: () => ReturnType;
    };
  }
}

export const FragmentNode = Node.create({
  name: FRAGMENT_NODE_NAME,
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      docId: { default: "" },
      sourceTitle: { default: "" },
      pageNumber: { default: 0 },
      originalText: { default: "" },
      displayText: { default: "" },
      edited: { default: false },
    };
  },

  parseHTML() {
    return [{ tag: `span[data-type="${FRAGMENT_NODE_NAME}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-type": FRAGMENT_NODE_NAME }),
      HTMLAttributes.displayText || "",
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FragmentNodeView);
  },

  addCommands() {
    return {
      insertFragment:
        (attrs: FragmentAttrs) =>
        ({ chain }) =>
          chain().insertContent({ type: this.name, attrs }).run(),
      dissolveFragment:
        () =>
        ({ state, dispatch }) => {
          const { selection } = state;
          const node = state.doc.nodeAt(selection.from);
          if (!node || node.type.name !== this.name) return false;
          if (dispatch) {
            const text = node.attrs.displayText || node.attrs.originalText;
            const tr = state.tr.replaceWith(
              selection.from,
              selection.from + node.nodeSize,
              state.schema.text(text),
            );
            dispatch(tr);
          }
          return true;
        },
    };
  },
});
```

- [ ] **Step 3: Fix `FragmentNodeView.tsx` references**

Open `src/extensions/FragmentNodeView.tsx`. Find any references to `node.attrs.sourceId` or `node.attrs.rowId` and change to `node.attrs.docId` / remove respectively. Display is by `docId` + `sourceTitle` + `pageNumber`.

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: errors now concentrated in `SearchPanel.tsx`, `SearchResult.tsx`, `App.tsx` — all rewritten in later tasks. No errors in the two files we just touched.

- [ ] **Step 5: Commit**

```bash
git add src/extensions/FragmentNode.ts src/extensions/FragmentNodeView.tsx
git commit -m "feat(editor): fragment node uses string docId, drop rowId"
```

---

### Task 20: Rewrite `SearchPanel` against `CorpusContext` + MiniSearch + category filter

**Files:**
- Rewrite: `src/components/SearchPanel.tsx`
- Create: `src/components/SearchPanel.test.tsx`

- [ ] **Step 1: Write failing tests (using a helper to provide a real context)**

Create `src/components/SearchPanel.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SearchPanel } from "./SearchPanel";
import { CorpusProvider } from "../context/CorpusContext";
import { buildMiniSearch } from "../hooks/useCorpus";
import type { CorpusDocument } from "../types/corpus";

function makeDoc(overrides: Partial<CorpusDocument>): CorpusDocument {
  return {
    id: "id", title: "T", subtitle: null,
    authors: [], year: null, publisher: null, type: "book",
    editor_translator: null, journal_or_source: null,
    doi: null, isbn: null, url: null, category: null,
    sections_cited: [], why_cited: null, chunks: [],
    ...overrides,
  };
}

function renderWithCorpus(documents: CorpusDocument[]) {
  const miniSearch = buildMiniSearch(documents);
  const byIdMap = new Map(documents.map((d) => [d.id, d]));
  return render(
    <CorpusProvider value={{ documents, miniSearch, byId: (id) => byIdMap.get(id) }}>
      <SearchPanel onInsertFragment={vi.fn()} />
    </CorpusProvider>,
  );
}

describe("SearchPanel", () => {
  it("renders no results for an empty query", () => {
    renderWithCorpus([
      makeDoc({ id: "a", title: "A", chunks: [{ page: 1, text: "alpha" }] }),
    ]);
    expect(screen.getByText(/search your corpus/i)).toBeInTheDocument();
  });

  it("shows matching results after typing", async () => {
    renderWithCorpus([
      makeDoc({ id: "a", title: "The Opacity Book", category: "opacity_refusal",
               chunks: [{ page: 1, text: "The right to opacity for everyone." }] }),
      makeDoc({ id: "b", title: "Unrelated", category: "other",
               chunks: [{ page: 1, text: "nothing to see" }] }),
    ]);
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "opacity" } });
    await waitFor(() => {
      expect(screen.getByText(/The Opacity Book/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Unrelated/i)).not.toBeInTheDocument();
  });

  it("filters by category", async () => {
    renderWithCorpus([
      makeDoc({ id: "a", title: "Opacity A", category: "opacity_refusal",
               chunks: [{ page: 1, text: "shared keyword" }] }),
      makeDoc({ id: "b", title: "Queer B", category: "queer_abstraction",
               chunks: [{ page: 1, text: "shared keyword" }] }),
    ]);
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "shared" } });
    await waitFor(() => expect(screen.getByText(/Opacity A/i)).toBeInTheDocument());
    fireEvent.change(screen.getByTestId("search-category-select"), {
      target: { value: "queer_abstraction" },
    });
    await waitFor(() => {
      expect(screen.queryByText(/Opacity A/i)).not.toBeInTheDocument();
      expect(screen.getByText(/Queer B/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm run test:run -- src/components/SearchPanel.test.tsx
```

Expected: FAIL — old SearchPanel still calls `invoke("search_corpus")`.

- [ ] **Step 3: Rewrite `SearchPanel.tsx`**

Replace `src/components/SearchPanel.tsx` contents with:

```typescript
import { useMemo, useState } from "react";
import { SearchResult } from "./SearchResult";
import { useCorpusContext } from "../context/CorpusContext";
import { carveSnippet } from "../utils/search";
import type { SearchHit } from "../types/corpus";
import type { FragmentAttrs } from "../extensions/FragmentNode";
import "./SearchPanel.css";

const SEARCH_LIMIT = 50;

interface SearchPanelProps {
  onInsertFragment?: (attrs: FragmentAttrs) => void;
}

export function SearchPanel({ onInsertFragment }: SearchPanelProps) {
  const { documents, miniSearch, byId } = useCorpusContext();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const d of documents) if (d.category) set.add(d.category);
    return Array.from(set).sort();
  }, [documents]);

  const hits: SearchHit[] = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const raw = miniSearch.search(trimmed);
    const withDoc = raw
      .map((r) => ({
        r,
        doc: byId((r as { docId: string }).docId),
      }))
      .filter((x) => x.doc !== undefined) as { r: typeof raw[number]; doc: NonNullable<ReturnType<typeof byId>> }[];
    const filtered = category === "all"
      ? withDoc
      : withDoc.filter((x) => x.doc.category === category);
    return filtered.slice(0, SEARCH_LIMIT).map(({ r, doc }) => {
      const page = (r as { page: number }).page;
      const text = (r as { text: string }).text;
      const matchTerms = Object.keys((r as { match: Record<string, unknown> }).match ?? {});
      return {
        docId: doc.id,
        page,
        text,
        extract: carveSnippet(text, matchTerms),
        score: r.score,
        sourceTitle: doc.title,
      };
    });
  }, [query, category, miniSearch, byId]);

  const handleInsert = (hit: SearchHit) => {
    onInsertFragment?.({
      docId: hit.docId,
      sourceTitle: hit.sourceTitle,
      pageNumber: hit.page,
      originalText: hit.extract,
      displayText: hit.extract,
      edited: false,
    });
  };

  const showingEmpty = !query.trim();
  const showingNoResults = query.trim() && hits.length === 0;

  return (
    <div className="search-panel" data-testid="search-panel">
      <div className="search-panel__header">
        <input
          className="search-panel__input"
          data-testid="search-input"
          type="text"
          placeholder="Search fragments..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="search-panel__filter">
          <label className="search-panel__filter-label">
            Category
            <select
              data-testid="search-category-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="all">All</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="search-panel__results" data-testid="search-results">
        {showingEmpty && (
          <p className="search-panel__empty">Search your corpus to find fragments</p>
        )}
        {showingNoResults && (
          <p className="search-panel__empty">No results found</p>
        )}
        {hits.map((hit) => (
          <SearchResult
            key={`${hit.docId}:${hit.page}`}
            text={hit.extract}
            sourceTitle={hit.sourceTitle}
            docId={hit.docId}
            pageNumber={hit.page}
            score={hit.score}
            onInsert={() => handleInsert(hit)}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
npm run test:run -- src/components/SearchPanel.test.tsx
```

Expected: 3 passed (SearchResult will error-compile — we update it next; the SearchPanel test renders a stubbed version of SearchResult through imports, so it will fail until Task 21. If it fails specifically on `SearchResult` props, proceed to Task 21 and re-run after).

If Vitest errors on Task 21's yet-unwritten `SearchResult` props (`docId` vs `sourceId`/`rowId`), commit this task's file and move on — tests green after Task 21.

- [ ] **Step 5: Commit**

```bash
git add src/components/SearchPanel.tsx src/components/SearchPanel.test.tsx
git commit -m "feat(frontend): SearchPanel uses MiniSearch + category filter"
```

---

### Task 21: Update `SearchResult` to new prop shape

**Files:**
- Rewrite: `src/components/SearchResult.tsx`

- [ ] **Step 1: Rewrite the component**

Replace `src/components/SearchResult.tsx` contents with:

```typescript
import { FRAGMENT_MIME_TYPE } from "../extensions/FragmentNode";
import "./SearchPanel.css";

interface SearchResultProps {
  text: string;
  sourceTitle: string;
  docId: string;
  pageNumber: number;
  score: number;
  onInsert: () => void;
}

export function SearchResult({
  text,
  sourceTitle,
  docId,
  pageNumber,
  onInsert,
}: SearchResultProps) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(
      FRAGMENT_MIME_TYPE,
      JSON.stringify({
        docId,
        sourceTitle,
        pageNumber,
        originalText: text,
        displayText: text,
        edited: false,
      }),
    );
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div
      className="search-result"
      draggable
      onDragStart={handleDragStart}
      onClick={onInsert}
    >
      <div className="search-result__text">{text}</div>
      <div className="search-result__meta">
        <span className="search-result__source">{sourceTitle}</span>
        {pageNumber > 0 && (
          <span className="search-result__page">p. {pageNumber}</span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rerun all tests so far**

```bash
npm run test:run
```

Expected: all tests pass — SearchPanel tests now find matching `SearchResult` props.

- [ ] **Step 3: Commit**

```bash
git add src/components/SearchResult.tsx
git commit -m "feat(frontend): SearchResult uses docId, drops highlight badge"
```

---

### Task 22: Rewrite `CitationsPanel` to read from context

**Files:**
- Rewrite: `src/components/CitationsPanel.tsx`

- [ ] **Step 1: Rewrite**

Replace `src/components/CitationsPanel.tsx` contents with:

```typescript
import { formatChicagoBibliography } from "../utils/chicago";
import {
  docToMeta,
  formatCitationHtml,
  sortByAuthorLastName,
} from "../utils/documents";
import { useCorpusContext } from "../context/CorpusContext";
import "./CitationsPanel.css";

interface CitationsPanelProps {
  visible: boolean;
  onClose: () => void;
  referencedDocIds: string[];
}

export function CitationsPanel({
  visible,
  onClose,
  referencedDocIds,
}: CitationsPanelProps) {
  const { documents } = useCorpusContext();

  if (!visible) return null;

  const refSet = new Set(referencedDocIds);
  const referencedDocs = documents
    .filter((d) => refSet.has(d.id))
    .sort(sortByAuthorLastName);

  return (
    <div className="citations-panel" data-testid="citations-panel">
      <div className="citations-panel__header">
        <h3>Bibliography</h3>
        <button className="citations-panel__close" onClick={onClose} data-testid="citations-close">
          ×
        </button>
      </div>
      <div className="citations-panel__body">
        {referencedDocs.length === 0 && (
          <p className="citations-panel__empty">
            Insert fragments to generate citations
          </p>
        )}
        {referencedDocs.map((doc) => {
          const citation = formatChicagoBibliography(docToMeta(doc));
          return (
            <div key={doc.id} className="citations-panel__entry">
              <span
                className="citations-panel__text"
                dangerouslySetInnerHTML={{ __html: formatCitationHtml(citation) }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: errors only remain in `App.tsx` and `Toolbar.tsx` (handled next).

- [ ] **Step 3: Commit**

```bash
git add src/components/CitationsPanel.tsx
git commit -m "feat(frontend): CitationsPanel reads from CorpusContext"
```

---

### Task 23: Slim `Toolbar` (drop save-status and save button)

**Files:**
- Rewrite: `src/components/Toolbar.tsx`

- [ ] **Step 1: Rewrite**

Replace `src/components/Toolbar.tsx` contents with:

```typescript
import { useState } from "react";
import "./Toolbar.css";

interface ToolbarProps {
  projectName?: string;
  showCitations?: boolean;
  onToggleCitations?: () => void;
  onExport?: () => void;
  onTitleChange?: (title: string) => void;
  storageWarning?: string | null;
}

export function Toolbar({
  projectName = "Untitled",
  showCitations,
  onToggleCitations,
  onExport,
  onTitleChange,
  storageWarning,
}: ToolbarProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(projectName);

  const handleStartEdit = () => {
    setEditValue(projectName);
    setEditing(true);
  };

  const handleFinishEdit = () => {
    setEditing(false);
    if (editValue.trim() && editValue !== projectName) {
      onTitleChange?.(editValue.trim());
    }
  };

  return (
    <div className="toolbar" data-testid="toolbar">
      <div className="toolbar__left">
        <span className="toolbar__title">Fragments</span>
      </div>
      <div className="toolbar__center">
        {editing ? (
          <input
            className="toolbar__title-input"
            data-testid="toolbar-title-input"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleFinishEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleFinishEdit();
              if (e.key === "Escape") setEditing(false);
            }}
            autoFocus
          />
        ) : (
          <span
            className="toolbar__project-name"
            data-testid="toolbar-project-name"
            onDoubleClick={handleStartEdit}
            title="Double-click to rename"
          >
            {projectName}
          </span>
        )}
        {storageWarning && (
          <span className="toolbar__warning" data-testid="toolbar-warning" role="status">
            {storageWarning}
          </span>
        )}
      </div>
      <div className="toolbar__right">
        <button
          className={`toolbar__btn ${showCitations ? "toolbar__btn--active" : ""}`}
          onClick={onToggleCitations}
          data-testid="toolbar-citations-btn"
        >
          Citations
        </button>
        <button className="toolbar__btn" onClick={onExport} data-testid="toolbar-export-btn">
          Export
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add a tiny CSS rule for the warning**

Open `src/components/Toolbar.css` and append:

```css
.toolbar__warning {
  margin-left: 1rem;
  color: #b33;
  font-size: 0.85rem;
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: `App.tsx` is the only remaining error site.

- [ ] **Step 4: Commit**

```bash
git add src/components/Toolbar.tsx src/components/Toolbar.css
git commit -m "feat(frontend): slim Toolbar — drop save status and update banner"
```

---

### Task 24: Rewrite `App.tsx` around corpus loading + new hooks

**Files:**
- Rewrite: `src/App.tsx`
- Create: `src/components/AppLoading.tsx`
- Create: `src/components/AppError.tsx`

- [ ] **Step 1: Create `AppLoading.tsx`**

Create `src/components/AppLoading.tsx`:

```typescript
export function AppLoading() {
  return (
    <div className="app app--loading" data-testid="app-loading">
      <p>Loading corpus…</p>
    </div>
  );
}
```

- [ ] **Step 2: Create `AppError.tsx`**

Create `src/components/AppError.tsx`:

```typescript
interface AppErrorProps {
  error: Error;
  onRetry: () => void;
}

export function AppError({ error, onRetry }: AppErrorProps) {
  return (
    <div className="app app--error" data-testid="app-error">
      <h1>Could not load the corpus</h1>
      <p>{error.message}</p>
      <button onClick={onRetry} data-testid="app-error-retry">Retry</button>
    </div>
  );
}
```

- [ ] **Step 3: Rewrite `App.tsx`**

Replace `src/App.tsx` contents with:

```typescript
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { Toolbar } from "./components/Toolbar";
import { EditorPanel } from "./components/EditorPanel";
import { SearchPanel } from "./components/SearchPanel";
import { CitationsPanel } from "./components/CitationsPanel";
import { AppLoading } from "./components/AppLoading";
import { AppError } from "./components/AppError";
import { CorpusProvider } from "./context/CorpusContext";
import { useCorpus } from "./hooks/useCorpus";
import { useProject } from "./hooks/useProject";
import { exportRichText } from "./utils/export";
import { getReferencedDocIds } from "./utils/documents";
import type { FragmentAttrs } from "./extensions/FragmentNode";
import "./App.css";

function App() {
  const corpus = useCorpus();

  if (corpus.status === "loading") return <AppLoading />;
  if (corpus.status === "error") {
    return <AppError error={corpus.error!} onRetry={corpus.retry} />;
  }

  return (
    <CorpusProvider value={{
      documents: corpus.documents!,
      byId: corpus.byId!,
      miniSearch: corpus.miniSearch!,
    }}>
      <AppBody />
    </CorpusProvider>
  );
}

function AppBody() {
  const [showCitations, setShowCitations] = useState(false);
  const [editorVersion, setEditorVersion] = useState(0);
  const editorRef = useRef<Editor | null>(null);
  const { project, setTitle, setContentJson, storageError } = useProject();

  const handleEditorReady = useCallback((editor: Editor) => {
    editorRef.current = editor;
    try {
      editor.commands.setContent(JSON.parse(project.contentJson));
    } catch { /* empty */ }
    editor.on("update", () => {
      setEditorVersion((v) => v + 1);
      setContentJson(JSON.stringify(editor.getJSON()));
    });
  }, [project.contentJson, setContentJson]);

  const handleInsertFragment = useCallback((attrs: FragmentAttrs) => {
    editorRef.current?.chain().focus().insertFragment(attrs).run();
  }, []);

  const handleExport = useCallback(async () => {
    const editor = editorRef.current;
    if (editor) await exportRichText(editor, project.title);
  }, [project.title]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const referencedDocIds = useMemo(
    () => getReferencedDocIds(editorRef.current),
    [editorVersion],
  );

  useEffect(() => {
    // Warn once on mount if we booted in an errored storage state (e.g. JSON corruption).
  }, []);

  const storageWarning = storageError
    ? "Saving disabled — storage unavailable."
    : null;

  return (
    <div className="app">
      <Toolbar
        projectName={project.title}
        showCitations={showCitations}
        onToggleCitations={() => setShowCitations(!showCitations)}
        onExport={handleExport}
        onTitleChange={setTitle}
        storageWarning={storageWarning}
      />
      <div className="app__workspace">
        <div className="app__editor-area">
          <EditorPanel onEditorReady={handleEditorReady} />
          <CitationsPanel
            visible={showCitations}
            onClose={() => setShowCitations(false)}
            referencedDocIds={referencedDocIds}
          />
        </div>
        <SearchPanel onInsertFragment={handleInsertFragment} />
      </div>
    </div>
  );
}

export default App;
```

- [ ] **Step 4: Type-check and run full test suite**

```bash
npx tsc --noEmit
npm run test:run
```

Expected: 0 TS errors. All prior tests still green.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/AppLoading.tsx src/components/AppError.tsx
git commit -m "feat(frontend): App gates on corpus load, drops library panel and update banner"
```

---

## Phase 4 — Cleanup and deployment

### Task 25: Delete obsolete frontend files

**Files:**
- Delete: `src/components/LibraryPanel.tsx`, `LibraryPanel.css`, `DocumentList.tsx`, `ProjectList.tsx`, `MetadataEditor.tsx`

- [ ] **Step 1: Confirm nothing still imports them**

```bash
grep -rE "LibraryPanel|DocumentList|ProjectList|MetadataEditor" src/ || echo "no imports"
```

Expected: `no imports`.

- [ ] **Step 2: Delete the files**

```bash
git rm src/components/LibraryPanel.tsx src/components/LibraryPanel.css \
       src/components/DocumentList.tsx src/components/ProjectList.tsx \
       src/components/MetadataEditor.tsx
```

- [ ] **Step 3: Type-check and run tests**

```bash
npx tsc --noEmit && npm run test:run
```

Expected: 0 TS errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove obsolete library/document/project/metadata components"
```

---

### Task 26: Delete `src-tauri/`, `e2e/`, and wdio configs

**Files:**
- Delete: `src-tauri/`, `e2e/`, `wdio.conf.ts`, `tsconfig.e2e.json`

- [ ] **Step 1: Remove directories and config files**

```bash
git rm -r src-tauri/ e2e/
git rm wdio.conf.ts tsconfig.e2e.json
```

- [ ] **Step 2: Update `tsconfig.json` references**

Open `tsconfig.json` and ensure the `references` block is gone (or points only at `tsconfig.node.json` if that still exists). Final content:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

(If `tsconfig.node.json` no longer exists, also remove it from `references`.)

- [ ] **Step 3: Type-check and run tests**

```bash
npx tsc --noEmit && npm run test:run
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add tsconfig.json
git commit -m "chore: remove src-tauri, e2e, and wdio configs"
```

---

### Task 27: Update `vite.config.ts` for static build

**Files:**
- Rewrite: `vite.config.ts`

- [ ] **Step 1: Replace the file**

Replace `vite.config.ts` contents with:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/fragments/",
});
```

- [ ] **Step 2: Verify a production build**

```bash
npm run build
```

Expected: builds to `dist/` with no errors; `dist/corpus.json` is present.

- [ ] **Step 3: Verify a local preview**

```bash
npm run preview -- --port 4173 &
PREVIEW_PID=$!
sleep 2
curl -sf http://localhost:4173/fragments/ > /dev/null && echo OK || echo FAIL
curl -sf http://localhost:4173/fragments/corpus.json | head -c 80 && echo
kill $PREVIEW_PID
```

Expected: both `curl` calls succeed; corpus begins with `{` and mentions `"generated_at"`.

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts
git commit -m "chore: configure Vite base for GitHub Pages"
```

---

### Task 28: GitHub Pages deploy workflow

**Files:**
- Create: `.github/workflows/pages.yml`

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/pages.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build-deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: npm run test:run
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - id: deploy
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/pages.yml
git commit -m "ci: deploy to GitHub Pages on push to main"
```

- [ ] **Step 3 (manual, one-time, not a code step):**

In the GitHub UI for this repo, Settings → Pages → Source = "GitHub Actions". The workflow will deploy on the next push.

---

### Task 29: Rewrite README

**Files:**
- Rewrite: `README.md`

- [ ] **Step 1: Replace README contents**

Replace `README.md` with:

````markdown
# Fragments

Fragments is a single-page web app for composing writing against a fixed corpus of references. It is served statically from GitHub Pages; the user's draft lives in the browser's `localStorage`.

Live site: <https://rtibbles.github.io/fragments/>

## Development

```
npm install
npm run dev
```

Runs on `http://localhost:5173/fragments/`. The dev server reads `public/corpus.json`; if it's missing, the app will show an error state — generate it first with `npm run build:corpus` (see below).

## Building the corpus

The corpus is derived from the sibling [`mfa_thesis`](../mfa_thesis) repo's `references_todo.csv`. Rows with `status == "have"` are included; rows pointing at missing files are skipped with a warning.

```
npm run build:corpus            # defaults to ../mfa_thesis
# or
scripts/build_corpus.py --corpus-root /path/to/mfa_thesis --out public/corpus.json
```

The script uses a `uv` shebang (PEP 723 inline deps: `pymupdf`, `ebooklib`, `beautifulsoup4`). Install [uv](https://docs.astral.sh/uv/) once; no `requirements.txt` is needed.

Commit the resulting `public/corpus.json` when you want the deployed site to reflect new corpus content.

## Testing

```
npm run test               # vitest in watch mode
npm run test:run           # vitest once
cd scripts && uv run --project . pytest   # python build-script tests
```

## Deployment

Pushes to `main` run `.github/workflows/pages.yml`, which runs Vitest, builds `dist/`, and deploys to GitHub Pages. Enable Pages under Settings → Pages → Source = "GitHub Actions" (one-time).

## Project structure

```
public/
  corpus.json              Built artifact (committed)
scripts/
  build_corpus.py          Entry — uv shebang
  corpus_builder/          Extraction package
src/
  App.tsx                  Corpus-loading gate + editor layout
  context/CorpusContext    Provider for indexed corpus
  hooks/
    useCorpus              Fetches corpus.json, builds MiniSearch
    useProject             localStorage-backed project state
  components/              Toolbar, SearchPanel, CitationsPanel, etc.
  extensions/              TipTap fragment node
  utils/                   Chicago citation, search snippet, export
```
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README for static GitHub Pages build"
```

---

### Task 30: End-to-end smoke test

**Files:**
- (no code changes)

- [ ] **Step 1: Run the full build locally**

```bash
npm run test:run
cd scripts && uv run --project . pytest -q
cd -
npm run build
```

Expected: all tests pass; build succeeds; `dist/corpus.json` exists.

- [ ] **Step 2: Serve `dist/` and verify manually**

```bash
npm run preview -- --port 4173 &
PREVIEW_PID=$!
sleep 2
```

Open `http://localhost:4173/fragments/` in a browser. Verify:

- Corpus loads (no error screen, no infinite loading).
- Search for a known term from your corpus — results appear with snippets.
- Category dropdown has your categories and filters correctly.
- Drag/click a result into the editor — fragment appears.
- Toggle Citations — referenced sources appear in Chicago format.
- Reload the page — the draft persists, title persists.

Stop the preview: `kill $PREVIEW_PID`.

- [ ] **Step 3: Push and watch the workflow**

```bash
git push origin main
```

Expected: GitHub Actions runs, deploys. After ~2 minutes the live URL serves the new build.

---

## Plan self-review

**Spec coverage:** Every section of the spec is covered:
- Data source CSV / `status == "have"` filter → Task 3.
- `uv` shebang + PEP 723 → Tasks 1, 8.
- PDF / MD / EPUB extraction → Tasks 4, 5, 6.
- Directory aggregation + continued page numbers → Task 7.
- Stable SHA-256 id → Task 2.
- `public/corpus.json` shape → Tasks 7 (shape keys), 8 (envelope), 9 (artifact).
- `useCorpus` hook + MiniSearch config → Task 15.
- `CorpusContext` → Task 16.
- `useProject` localStorage only → Task 17.
- MiniSearch category filter + snippet / snap_to_punctuation → Tasks 13, 14, 20.
- Fragment node string docId → Task 19.
- Deleted components → Task 25.
- Delete `src-tauri`, `e2e`, wdio → Task 26.
- `vite.config.ts` base path → Task 27.
- GitHub Pages workflow → Task 28.
- README rewrite → Task 29.
- Error handling (full-screen error w/ Retry, storage warning, no crash) → Tasks 15 (retry), 17 (storageError), 23 (toolbar warning), 24 (AppError/AppLoading).
- Vitest + testing-library added to devDependencies → Task 10.

**Type consistency:**
- `FragmentAttrs.docId: string` consistent across FragmentNode (Task 19), SearchPanel (Task 20), SearchResult (Task 21), App's `handleInsertFragment` (Task 24).
- `CorpusDocument.category: string | null` — `SearchPanel` builds its dropdown from non-null categories (Task 20), `docToMeta` does not consume category. Consistent.
- `useProject` returns `setTitle / setContentJson / setCitations / storageError` — consumed by `App.tsx` for `setTitle`, `setContentJson`, `storageError`. `setCitations` is defined but not yet wired to the editor's insert flow; the follow-up UX-improvement spec will wire citation capture. Intentionally reserved, not dead code.

**Placeholder scan:** No "TBD", "TODO", or vague-handwavy steps. Every code block is complete.

No fixes needed.
