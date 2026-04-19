#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = [
#   "pymupdf>=1.24",
#   "ebooklib>=0.18",
#   "beautifulsoup4>=4.12",
# ]
# ///
"""Build public/corpus.json from mfa_thesis/references_todo.csv.

Usage:
    uv run scripts/build_corpus.py --corpus-root ~/mfa_thesis --out public/corpus.json
"""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

# Make the sibling `corpus_builder` package importable when run directly.
sys.path.insert(0, str(Path(__file__).parent))
from corpus_builder.csv_loader import load_rows  # noqa: E402
from corpus_builder.pipeline import build_document  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus-root", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--csv", default="references_todo.csv",
                    help="CSV filename relative to --corpus-root")
    args = ap.parse_args()

    csv_path = args.corpus_root / args.csv
    if not csv_path.exists():
        print(f"error: CSV not found at {csv_path}", file=sys.stderr)
        return 1

    rows = load_rows(csv_path)
    docs = []
    skipped: list[tuple[str, str]] = []
    for row in rows:
        try:
            doc = build_document(row, corpus_root=args.corpus_root)
        except Exception as err:
            skipped.append((row["file_location"], f"{type(err).__name__}: {err}"))
            continue
        if doc is None:
            skipped.append((row["file_location"], "missing or empty"))
            continue
        docs.append(doc)

    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "documents": docs,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(out, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    print(f"wrote {len(docs)} documents to {args.out}")
    if skipped:
        print(f"skipped {len(skipped)} rows:", file=sys.stderr)
        for path, reason in skipped:
            print(f"  - {path}  ({reason})", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
