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

def test_parse_sections_skips_non_integer_pieces():
    assert parse_sections("1;abc;3") == [1, 3]

def test_load_rows_blank_optional_fields_become_none(fixtures_dir: Path):
    rows = load_rows(fixtures_dir / "sample.csv")
    # Row 0 (Glissant) has blank subtitle, doi, isbn, journal_or_source, url
    assert rows[0]["subtitle"] is None
    assert rows[0]["doi"] is None
    assert rows[0]["journal_or_source"] is None
    # Row 1 (Getsy) has a non-blank doi
    assert rows[1]["doi"] == "10.1080/00043249.2021.1947710"

def test_load_rows_non_numeric_year_becomes_none(tmp_path: Path):
    csv_path = tmp_path / "nd.csv"
    csv_path.write_text(
        "priority,status,category,author,title,subtitle,year,publisher,type,"
        "editor_translator,journal_or_source,sections_cited,why_cited,"
        "access_notes,file_location,url,doi,isbn,acquired_date,notes\n"
        "1,have,x,J Doe,Untitled,,forthcoming,,book,,,,,,,,,,,\n",
        encoding="utf-8",
    )
    rows = load_rows(csv_path)
    assert len(rows) == 1
    assert rows[0]["year"] is None
