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
