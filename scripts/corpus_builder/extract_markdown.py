import re
from pathlib import Path

_FRONTMATTER_RE = re.compile(r"\A---\r?\n.*?\r?\n---\r?\n", re.DOTALL)

def extract_markdown(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8")
    text = _FRONTMATTER_RE.sub("", text, count=1).strip()
    if not text:
        return []
    return [{"page": 1, "text": text}]
