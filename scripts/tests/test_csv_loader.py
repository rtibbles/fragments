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
