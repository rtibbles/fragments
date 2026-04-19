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

def test_blank_pages_are_skipped(tmp_path: Path):
    import pymupdf
    blank = tmp_path / "blank.pdf"
    doc = pymupdf.open()
    doc.new_page()  # no text inserted
    doc.save(blank)
    assert extract_pdf(blank) == []
