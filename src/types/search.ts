export interface SearchResultData {
  text: string;
  extract: string;
  source_title: string;
  source_id: number;
  page_number: number;
  is_highlight: boolean;
  row_id: number;
  score: number;
}
