import { useCallback, useEffect, useMemo, useState } from "react";
import MiniSearch from "minisearch";
import type { Corpus, CorpusDocument } from "../types/corpus";

export type CorpusState =
  | { status: "loading" }
  | { status: "error"; error: Error }
  | {
      status: "ready";
      documents: CorpusDocument[];
      byId: (id: string) => CorpusDocument | undefined;
      miniSearch: MiniSearch<ChunkDoc>;
    };

export type UseCorpusResult =
  | { status: "loading"; retry: () => void }
  | { status: "error"; error: Error; retry: () => void }
  | {
      status: "ready";
      documents: CorpusDocument[];
      byId: (id: string) => CorpusDocument | undefined;
      miniSearch: MiniSearch<ChunkDoc>;
      retry: () => void;
    };

interface ChunkDoc {
  id: string;
  docId: string;
  page: number;
  text: string;
}

export function buildMiniSearch(documents: CorpusDocument[]): MiniSearch<ChunkDoc> {
  const ms = new MiniSearch<ChunkDoc>({
    fields: ["text"],
    storeFields: ["docId", "page", "text"],
    searchOptions: { combineWith: "AND", prefix: true, fuzzy: 0.2 },
  });
  const chunks: ChunkDoc[] = [];
  for (const doc of documents) {
    for (const chunk of doc.chunks) {
      chunks.push({
        id: `${doc.id}:${chunk.page}`,
        docId: doc.id,
        page: chunk.page,
        text: chunk.text,
      });
    }
  }
  ms.addAll(chunks);
  return ms;
}

export function useCorpus(): UseCorpusResult {
  const [state, setState] = useState<CorpusState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    const url = `${import.meta.env.BASE_URL}corpus.json`;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`corpus.json: HTTP ${res.status}`);
        const corpus = (await res.json()) as Corpus;
        if (cancelled) return;
        const miniSearch = buildMiniSearch(corpus.documents);
        const byIdMap = new Map(corpus.documents.map((d) => [d.id, d]));
        setState({
          status: "ready",
          documents: corpus.documents,
          byId: (id) => byIdMap.get(id),
          miniSearch,
        });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setState({ status: "error", error: err });
      });
    return () => { cancelled = true; };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return useMemo(() => {
    switch (state.status) {
      case "loading":
        return { status: "loading", retry };
      case "error":
        return { status: "error", error: state.error, retry };
      case "ready":
        return {
          status: "ready",
          documents: state.documents,
          byId: state.byId,
          miniSearch: state.miniSearch,
          retry,
        };
    }
  }, [state, retry]);
}
