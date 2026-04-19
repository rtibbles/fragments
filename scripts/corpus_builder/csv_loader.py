import csv
from pathlib import Path

STATUS_ACTIVE = "have"

OPTIONAL_STRING_FIELDS = (
    "subtitle", "publisher", "type", "editor_translator",
    "journal_or_source", "why_cited", "url", "doi", "isbn",
)

def split_authors(raw: str) -> list[dict]:
    # Assumes "Given [Middle ...] Family" form, semicolon-separated.
    # Does NOT handle "Family, Given", suffixes like "Jr.", compound
    # surnames ("Van den Berg"), or corporate authors — the source CSV
    # is hand-curated in a consistent form.
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
