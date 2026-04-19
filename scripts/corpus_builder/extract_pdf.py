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
