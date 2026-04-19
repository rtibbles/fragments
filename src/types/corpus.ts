export interface CorpusAuthor {
  firstName: string;
  lastName: string;
}

export interface CorpusChunk {
  page: number;
  text: string;
}

export interface CorpusDocument {
  id: string;
  title: string;
  subtitle: string | null;
  authors: CorpusAuthor[];
  year: number | null;
  publisher: string | null;
  type: string | null;
  editor_translator: string | null;
  journal_or_source: string | null;
  doi: string | null;
  isbn: string | null;
  url: string | null;
  category: string | null;
  sections_cited: number[];
  why_cited: string | null;
  chunks: CorpusChunk[];
}

export interface Corpus {
  generated_at: string;
  documents: CorpusDocument[];
}

export interface SearchHit {
  docId: string;
  page: number;
  text: string;
  extract: string;
  score: number;
  sourceTitle: string;
}
