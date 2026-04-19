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

def test_empty_chapters_are_skipped(tmp_path: Path):
    from ebooklib import epub
    book = epub.EpubBook()
    book.set_identifier("t")
    book.set_title("t")
    book.set_language("en")
    empty = epub.EpubHtml(title="Empty", file_name="e.xhtml", lang="en")
    empty.set_content("<html><body><div>   </div></body></html>")
    real = epub.EpubHtml(title="Real", file_name="r.xhtml", lang="en")
    real.set_content("<html><body><p>Visible text.</p></body></html>")
    book.add_item(empty)
    book.add_item(real)
    book.spine = ["nav", empty, real]
    book.add_item(epub.EpubNav())
    book.add_item(epub.EpubNcx())
    path = tmp_path / "mixed.epub"
    epub.write_epub(str(path), book)

    chunks = extract_epub(path)
    assert len(chunks) == 1
    assert chunks[0]["page"] == 1
    assert "Visible text." in chunks[0]["text"]
