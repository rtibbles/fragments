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
