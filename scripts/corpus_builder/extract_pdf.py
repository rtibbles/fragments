import re
from pathlib import Path
import pymupdf

MIN_NONWHITESPACE = 10

# word-\n -> word (hyphen was inserted at a line break)
_HYPHEN_LINEBREAK_RE = re.compile(r"(\w)-\n(\w)")
# paragraph-preserving newline collapse: two+ newlines become a paragraph
# break; a single newline inside a paragraph becomes a space.
_PARAGRAPH_RE = re.compile(r"\n{2,}")
_SINGLE_NEWLINE_RE = re.compile(r"(?<!\n)\n(?!\n)")
_MULTI_SPACE_RE = re.compile(r"[ \t]{2,}")


def normalize(text: str) -> str:
    """Clean PDF-extracted text for prose: rejoin hyphenated line breaks,
    collapse single newlines to spaces, preserve paragraph breaks."""
    text = _HYPHEN_LINEBREAK_RE.sub(r"\1\2", text)
    parts = _PARAGRAPH_RE.split(text)
    parts = [_SINGLE_NEWLINE_RE.sub(" ", p) for p in parts]
    parts = [_MULTI_SPACE_RE.sub(" ", p).strip() for p in parts]
    return "\n\n".join(p for p in parts if p)


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
            chunks.append({"page": i, "text": normalize(text)})
    return chunks
