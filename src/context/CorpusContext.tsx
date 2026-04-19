import { createContext, useContext, type ReactNode } from "react";
import type { UseCorpusResult } from "../hooks/useCorpus";

const CorpusContext = createContext<UseCorpusResult | null>(null);

export function CorpusProvider({
  value,
  children,
}: {
  value: UseCorpusResult;
  children: ReactNode;
}) {
  return <CorpusContext.Provider value={value}>{children}</CorpusContext.Provider>;
}

export function useCorpusContext(): UseCorpusResult {
  const ctx = useContext(CorpusContext);
  if (!ctx) throw new Error("useCorpusContext must be used inside CorpusProvider");
  return ctx;
}
