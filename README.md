# Fragments

Fragments is a single-page web app for composing writing against a fixed corpus of references. It is served statically from GitHub Pages; the user's draft lives in the browser's `localStorage`.

Live site: <https://rtibbles.github.io/fragments/>

## Development

```
npm install
npm run dev
```

Runs on `http://localhost:5173/fragments/`. The dev server reads `public/corpus.json`; if it's missing, the app will show an error state — generate it first with `npm run build:corpus` (see below).

## Building the corpus

The corpus is derived from the sibling [`mfa_thesis`](../mfa_thesis) repo's `references_todo.csv`. Rows with `status == "have"` are included; rows pointing at missing files are skipped with a warning.

```
npm run build:corpus            # defaults to ../mfa_thesis
# or
scripts/build_corpus.py --corpus-root /path/to/mfa_thesis --out public/corpus.json
```

The script uses a `uv` shebang (PEP 723 inline deps: `pymupdf`, `ebooklib`, `beautifulsoup4`). Install [uv](https://docs.astral.sh/uv/) once; no `requirements.txt` is needed.

Commit the resulting `public/corpus.json` when you want the deployed site to reflect new corpus content.

## Testing

```
npm run test               # vitest in watch mode
npm run test:run           # vitest once
cd scripts && uv run --project . pytest   # python build-script tests
```

## Deployment

Pushes to `main` run `.github/workflows/pages.yml`, which runs Vitest, builds `dist/`, and deploys to GitHub Pages. Enable Pages under Settings → Pages → Source = "GitHub Actions" (one-time).

## Project structure

```
public/
  corpus.json              Built artifact (committed)
scripts/
  build_corpus.py          Entry — uv shebang
  corpus_builder/          Extraction package
src/
  App.tsx                  Corpus-loading gate + editor layout
  context/CorpusContext    Provider for indexed corpus
  hooks/
    useCorpus              Fetches corpus.json, builds MiniSearch
    useProject             localStorage-backed project state
  components/              Toolbar, SearchPanel, CitationsPanel, etc.
  extensions/              TipTap fragment node
  utils/                   Chicago citation, search snippet, export
```
