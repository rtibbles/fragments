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
