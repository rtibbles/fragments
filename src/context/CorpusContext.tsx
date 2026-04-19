import { createContext, useContext, type ReactNode } from "react";
import type MiniSearch from "minisearch";
import type { CorpusDocument } from "../types/corpus";

interface CorpusContextValue {
  documents: CorpusDocument[];
  byId: (id: string) => CorpusDocument | undefined;
  miniSearch: MiniSearch;
}

const CorpusContext = createContext<CorpusContextValue | null>(null);

export function CorpusProvider({
  value,
  children,
}: {
  value: CorpusContextValue;
  children: ReactNode;
}) {
  return <CorpusContext.Provider value={value}>{children}</CorpusContext.Provider>;
}

export function useCorpusContext(): CorpusContextValue {
  const ctx = useContext(CorpusContext);
  if (!ctx) throw new Error("useCorpusContext must be used inside CorpusProvider");
  return ctx;
}
