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
