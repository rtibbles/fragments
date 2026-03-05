use std::path::Path;
use tantivy::{
    doc, Index, IndexReader, IndexWriter, ReloadPolicy, TantivyDocument, Term,
    collector::TopDocs,
    query::{BooleanQuery, BoostQuery, Occur, QueryParser, TermQuery},
    schema::{
        Field, IndexRecordOption, NumericOptions, OwnedValue, Schema, STORED, STRING, TEXT,
    },
};

pub struct SearchIndex {
    index: Index,
    reader: IndexReader,
    schema: Schema,
    pub content: Field,
    pub source_title: Field,
    pub source_id: Field,
    pub page_number: Field,
    pub is_highlight: Field,
    pub row_id: Field,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SearchResult {
    pub text: String,
    pub source_title: String,
    pub source_id: u64,
    pub page_number: u64,
    pub is_highlight: bool,
    pub row_id: u64,
    pub score: f32,
}

impl SearchIndex {
    pub fn open_or_create(dir: &Path) -> Result<Self, String> {
        let mut builder = Schema::builder();

        let content = builder.add_text_field("content", TEXT | STORED);
        let source_title = builder.add_text_field("source_title", STRING | STORED);
        let source_id = builder.add_u64_field("source_id",
            NumericOptions::default().set_indexed().set_stored().set_fast());
        let page_number = builder.add_u64_field("page_number",
            NumericOptions::default().set_indexed().set_stored().set_fast());
        let is_highlight = builder.add_bool_field("is_highlight",
            NumericOptions::default().set_indexed().set_stored().set_fast());
        let row_id = builder.add_u64_field("row_id",
            NumericOptions::default().set_indexed().set_stored().set_fast());

        let schema = builder.build();

        let index = if dir.join("meta.json").exists() {
            Index::open_in_dir(dir).map_err(|e| e.to_string())?
        } else {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
            Index::create_in_dir(dir, schema.clone()).map_err(|e| e.to_string())?
        };

        let reader = index.reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()
            .map_err(|e: tantivy::TantivyError| e.to_string())?;

        Ok(Self { index, reader, schema, content, source_title, source_id, page_number, is_highlight, row_id })
    }

    pub fn writer(&self) -> Result<IndexWriter, String> {
        self.index.writer(50_000_000).map_err(|e| e.to_string())
    }

    pub fn add_chunk(
        &self, writer: &mut IndexWriter,
        text: &str, title: &str, doc_id: u64, page: u64, highlight: bool, id: u64,
    ) -> Result<(), String> {
        writer.add_document(doc!(
            self.content      => text,
            self.source_title => title,
            self.source_id    => doc_id,
            self.page_number  => page,
            self.is_highlight  => highlight,
            self.row_id       => id,
        )).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn search(
        &self, query_str: &str, highlights_only: bool, limit: usize, highlight_boost: f32,
    ) -> Result<Vec<SearchResult>, String> {
        let searcher = self.reader.searcher();
        let mut parser = QueryParser::for_index(&self.index, vec![self.content]);
        parser.set_conjunction_by_default();

        let base_query = parser.parse_query(query_str).map_err(|e| e.to_string())?;

        let final_query: Box<dyn tantivy::query::Query> = if highlights_only {
            let highlight_term = Term::from_field_bool(self.is_highlight, true);
            let filter = TermQuery::new(highlight_term, IndexRecordOption::Basic);
            Box::new(BooleanQuery::new(vec![
                (Occur::Must, Box::new(base_query)),
                (Occur::Must, Box::new(filter)),
            ]))
        } else {
            let highlight_term = Term::from_field_bool(self.is_highlight, true);
            let boost = BoostQuery::new(
                Box::new(TermQuery::new(highlight_term, IndexRecordOption::Basic)),
                highlight_boost,
            );
            Box::new(BooleanQuery::new(vec![
                (Occur::Must, Box::new(base_query)),
                (Occur::Should, Box::new(boost)),
            ]))
        };

        let hits = searcher.search(&final_query, &TopDocs::with_limit(limit))
            .map_err(|e| e.to_string())?;

        let mut results = Vec::new();
        for (score, addr) in hits {
            let doc: TantivyDocument = searcher.doc(addr).map_err(|e| e.to_string())?;

            let get_str = |field: Field| -> String {
                doc.get_first(field)
                    .map(|v| OwnedValue::from(v))
                    .and_then(|v| match v {
                        OwnedValue::Str(s) => Some(s),
                        _ => None,
                    })
                    .unwrap_or_default()
            };
            let get_u64 = |field: Field| -> u64 {
                doc.get_first(field)
                    .map(|v| OwnedValue::from(v))
                    .and_then(|v| match v {
                        OwnedValue::U64(n) => Some(n),
                        _ => None,
                    })
                    .unwrap_or(0)
            };
            let get_bool = |field: Field| -> bool {
                doc.get_first(field)
                    .map(|v| OwnedValue::from(v))
                    .and_then(|v| match v {
                        OwnedValue::Bool(b) => Some(b),
                        _ => None,
                    })
                    .unwrap_or(false)
            };

            results.push(SearchResult {
                text: get_str(self.content),
                source_title: get_str(self.source_title),
                source_id: get_u64(self.source_id),
                page_number: get_u64(self.page_number),
                is_highlight: get_bool(self.is_highlight),
                row_id: get_u64(self.row_id),
                score,
            });
        }
        Ok(results)
    }

    pub fn clear_and_rebuild(&self) -> Result<IndexWriter, String> {
        let mut writer = self.writer()?;
        writer.delete_all_documents().map_err(|e| e.to_string())?;
        writer.commit().map_err(|e| e.to_string())?;
        Ok(writer)
    }

    pub fn reload(&self) -> Result<(), String> {
        self.reader.reload().map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_test_index() -> (SearchIndex, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        let idx = SearchIndex::open_or_create(dir.path()).unwrap();
        let mut writer = idx.writer().unwrap();

        idx.add_chunk(&mut writer, "The mitochondria is the powerhouse of the cell", "Biology 101", 1, 42, false, 1).unwrap();
        idx.add_chunk(&mut writer, "ATP synthesis drives active transport across membranes", "Biology 101", 1, 43, true, 2).unwrap();
        idx.add_chunk(&mut writer, "Photosynthesis converts light energy into chemical energy", "Plant Science", 2, 10, false, 3).unwrap();

        writer.commit().unwrap();
        idx.reload().unwrap();
        (idx, dir)
    }

    #[test]
    fn test_basic_search() {
        let (idx, _dir) = setup_test_index();
        let results = idx.search("mitochondria", false, 10, 2.0).unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].text.contains("mitochondria"));
    }

    #[test]
    fn test_highlights_only_filter() {
        let (idx, _dir) = setup_test_index();
        let results = idx.search("transport", true, 10, 2.0).unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].is_highlight);
    }

    #[test]
    fn test_highlight_boost() {
        let (idx, _dir) = setup_test_index();
        let results = idx.search("energy", false, 10, 2.0).unwrap();
        assert!(!results.is_empty());
    }

    #[test]
    fn test_rebuild_index() {
        let (idx, _dir) = setup_test_index();
        let mut writer = idx.clear_and_rebuild().unwrap();
        idx.add_chunk(&mut writer, "New content after rebuild", "New Book", 3, 1, false, 10).unwrap();
        writer.commit().unwrap();
        idx.reload().unwrap();

        let results = idx.search("mitochondria", false, 10, 2.0).unwrap();
        assert_eq!(results.len(), 0);

        let results = idx.search("rebuild", false, 10, 2.0).unwrap();
        assert_eq!(results.len(), 1);
    }
}
