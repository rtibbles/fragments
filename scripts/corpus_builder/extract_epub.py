from pathlib import Path
from ebooklib import epub, ITEM_DOCUMENT
from bs4 import BeautifulSoup

def extract_epub(path: Path) -> list[dict]:
    book = epub.read_epub(str(path))
    chunks: list[dict] = []
    idx = 0
    for item in book.get_items_of_type(ITEM_DOCUMENT):
        if item.file_name.endswith("nav.xhtml"):
            continue  # skip the auto-added nav
        soup = BeautifulSoup(item.get_content(), "html.parser")
        text = soup.get_text("\n").strip()
        if not text:
            continue
        idx += 1
        chunks.append({"page": idx, "text": text})
    return chunks
