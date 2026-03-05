use crate::crossref::{self, CrossRefMetadata};
use crate::db;
use crate::kobo;
use crate::pdf;
use crate::search::SearchResult;
use crate::AppState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct DocumentInfo {
    pub id: i64,
    pub title: String,
    pub subtitle: Option<String>,
    pub publication_date: Option<String>,
    pub publisher: Option<String>,
    pub journal_name: Option<String>,
    pub volume: Option<String>,
    pub issue: Option<String>,
    pub page_range: Option<String>,
    pub edition: Option<String>,
    pub doi: Option<String>,
    pub isbn: Option<String>,
    pub url: Option<String>,
    pub retrieval_date: Option<String>,
    pub document_type: String,
    pub container_title: Option<String>,
    pub file_path: String,
    pub import_date: String,
    pub authors: Vec<AuthorInfo>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthorInfo {
    pub first_name: String,
    pub last_name: String,
    pub role: String,
    pub position: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HighlightInfo {
    pub id: i64,
    pub document_id: Option<i64>,
    pub text: String,
    pub annotation: Option<String>,
    pub page_number: Option<u64>,
    pub date_created: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectInfo {
    pub id: i64,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectContent {
    pub id: i64,
    pub title: String,
    pub content_json: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CitationData {
    pub chunk_id: Option<i64>,
    pub highlight_id: Option<i64>,
    pub inserted_text: String,
    pub source_snapshot: String,
    pub modified: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CitationInfo {
    pub id: i64,
    pub project_id: i64,
    pub chunk_id: Option<i64>,
    pub highlight_id: Option<i64>,
    pub inserted_text: String,
    pub source_snapshot: String,
    pub modified: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DocumentMetadata {
    pub title: String,
    pub subtitle: Option<String>,
    pub publication_date: Option<String>,
    pub publisher: Option<String>,
    pub journal_name: Option<String>,
    pub volume: Option<String>,
    pub issue: Option<String>,
    pub page_range: Option<String>,
    pub edition: Option<String>,
    pub doi: Option<String>,
    pub isbn: Option<String>,
    pub url: Option<String>,
    pub retrieval_date: Option<String>,
    pub document_type: String,
    pub container_title: Option<String>,
    pub authors: Vec<AuthorInfo>,
}

// --- Import Commands ---

#[tauri::command]
pub async fn import_pdf(path: String, state: State<'_, AppState>) -> Result<i64, String> {
    let pages = pdf::extract_pages(std::path::Path::new(&path))?;
    let doi = pdf::extract_doi(&pages);
    let now = chrono::Local::now().format("%Y-%m-%d").to_string();

    let title = std::path::Path::new(&path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled")
        .to_string();

    let db = state.db.lock().map_err(|e| e.to_string())?;

    let doc_id = {
        db.execute(
            "INSERT INTO documents (title, document_type, file_path, import_date, doi)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![title, "book", path, now, doi],
        ).map_err(|e| e.to_string())?;
        db.last_insert_rowid()
    };

    for page in &pages {
        db.execute(
            "INSERT INTO chunks (document_id, content, page_number, position)
             VALUES (?1, ?2, ?3, ?4)",
            params![doc_id, page.text, page.page_number as i64, page.page_number as i64],
        ).map_err(|e| e.to_string())?;
    }

    // Index in Tantivy
    let search = state.search.lock().map_err(|e| e.to_string())?;
    let mut writer = search.writer()?;
    for page in &pages {
        let chunk_id = db.query_row(
            "SELECT id FROM chunks WHERE document_id = ?1 AND page_number = ?2",
            params![doc_id, page.page_number as i64],
            |row| row.get::<_, i64>(0),
        ).map_err(|e| e.to_string())?;

        search.add_chunk(
            &mut writer,
            &page.text, &title, doc_id as u64,
            page.page_number, false, chunk_id as u64,
        )?;
    }
    writer.commit().map_err(|e| e.to_string())?;
    search.reload()?;

    Ok(doc_id)
}

#[tauri::command]
pub async fn import_kobo(db_path: String, mount_path: String, state: State<'_, AppState>) -> Result<Vec<i64>, String> {
    let kobo_db = std::path::Path::new(&db_path);
    let highlights = kobo::read_highlights(kobo_db)?;
    let books = kobo::list_pdf_books(kobo_db)?;
    let now = chrono::Local::now().format("%Y-%m-%d").to_string();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let search = state.search.lock().map_err(|e| e.to_string())?;
    let mut writer = search.writer()?;
    let mut imported_ids = Vec::new();

    for book in &books {
        let full_path = format!("{}/{}", mount_path, book.file_path);
        let pdf_path = std::path::Path::new(&full_path);

        if !pdf_path.exists() {
            continue;
        }

        // Check if already imported
        let exists: bool = db.query_row(
            "SELECT COUNT(*) > 0 FROM documents WHERE file_path = ?1",
            params![full_path],
            |row| row.get(0),
        ).unwrap_or(false);

        if exists {
            continue;
        }

        let title = book.title.clone().unwrap_or_else(|| "Untitled".into());

        // Extract and import PDF text
        let pages = match pdf::extract_pages(pdf_path) {
            Ok(p) => p,
            Err(_) => continue,
        };
        let doi = pdf::extract_doi(&pages);

        db.execute(
            "INSERT INTO documents (title, document_type, file_path, import_date, doi)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![title, "book", full_path, now, doi],
        ).map_err(|e| e.to_string())?;
        let doc_id = db.last_insert_rowid();
        imported_ids.push(doc_id);

        for page in &pages {
            db.execute(
                "INSERT INTO chunks (document_id, content, page_number, position)
                 VALUES (?1, ?2, ?3, ?4)",
                params![doc_id, page.text, page.page_number as i64, page.page_number as i64],
            ).map_err(|e| e.to_string())?;

            let chunk_id = db.last_insert_rowid();
            search.add_chunk(
                &mut writer,
                &page.text, &title, doc_id as u64,
                page.page_number, false, chunk_id as u64,
            )?;
        }

        // Import highlights for this book
        let book_highlights: Vec<_> = highlights.iter()
            .filter(|h| h.volume_id == book.volume_id)
            .collect();

        for h in book_highlights {
            let page_num = kobo::parse_page_number(&h.start_container_path);

            // Try to find matching chunk
            let chunk_id: Option<i64> = page_num.and_then(|pn| {
                db.query_row(
                    "SELECT id FROM chunks WHERE document_id = ?1 AND page_number = ?2",
                    params![doc_id, pn as i64],
                    |row| row.get(0),
                ).ok()
            });

            db.execute(
                "INSERT INTO highlights (document_id, chunk_id, text, annotation, kobo_chapter_progress, kobo_volume_id, date_created)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![doc_id, chunk_id, h.text, h.annotation, h.chapter_progress, h.volume_id, h.date_created],
            ).map_err(|e| e.to_string())?;

            let highlight_id = db.last_insert_rowid();
            search.add_chunk(
                &mut writer,
                &h.text, &title, doc_id as u64,
                page_num.unwrap_or(0), true, highlight_id as u64,
            )?;
        }
    }

    writer.commit().map_err(|e| e.to_string())?;
    search.reload()?;

    Ok(imported_ids)
}

// --- Search Commands ---

#[tauri::command]
pub async fn search_corpus(
    query: String,
    highlights_only: bool,
    limit: usize,
    state: State<'_, AppState>,
) -> Result<Vec<SearchResult>, String> {
    let search = state.search.lock().map_err(|e| e.to_string())?;
    search.search(&query, highlights_only, limit, 2.0)
}

// --- CrossRef Commands ---

#[tauri::command]
pub async fn lookup_doi(doi: String) -> Result<Option<CrossRefMetadata>, String> {
    crossref::lookup_doi(&doi).await
}

#[tauri::command]
pub async fn search_crossref(query: String) -> Result<Vec<CrossRefMetadata>, String> {
    crossref::search_works(&query, 5).await
}

// --- Document Commands ---

#[tauri::command]
pub async fn list_documents(state: State<'_, AppState>) -> Result<Vec<DocumentInfo>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare(
        "SELECT id, title, subtitle, publication_date, publisher, journal_name,
                volume, issue, page_range, edition, doi, isbn, url, retrieval_date,
                document_type, container_title, file_path, import_date
         FROM documents ORDER BY title"
    ).map_err(|e| e.to_string())?;

    let docs = stmt.query_map([], |row| {
        Ok(DocumentInfo {
            id: row.get(0)?,
            title: row.get(1)?,
            subtitle: row.get(2)?,
            publication_date: row.get(3)?,
            publisher: row.get(4)?,
            journal_name: row.get(5)?,
            volume: row.get(6)?,
            issue: row.get(7)?,
            page_range: row.get(8)?,
            edition: row.get(9)?,
            doi: row.get(10)?,
            isbn: row.get(11)?,
            url: row.get(12)?,
            retrieval_date: row.get(13)?,
            document_type: row.get(14)?,
            container_title: row.get(15)?,
            file_path: row.get(16)?,
            import_date: row.get(17)?,
            authors: Vec::new(),
        })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;

    // Load authors for each document
    let mut result = docs;
    for doc in &mut result {
        let mut author_stmt = db.prepare(
            "SELECT first_name, last_name, role, position FROM authors
             WHERE document_id = ?1 ORDER BY position"
        ).map_err(|e| e.to_string())?;

        doc.authors = author_stmt.query_map(params![doc.id], |row| {
            Ok(AuthorInfo {
                first_name: row.get(0)?,
                last_name: row.get(1)?,
                role: row.get(2)?,
                position: row.get(3)?,
            })
        }).map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    }

    Ok(result)
}

#[tauri::command]
pub async fn update_document_metadata(
    doc_id: i64,
    metadata: DocumentMetadata,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    db.execute(
        "UPDATE documents SET title=?1, subtitle=?2, publication_date=?3, publisher=?4,
         journal_name=?5, volume=?6, issue=?7, page_range=?8, edition=?9, doi=?10,
         isbn=?11, url=?12, retrieval_date=?13, document_type=?14, container_title=?15
         WHERE id=?16",
        params![
            metadata.title, metadata.subtitle, metadata.publication_date,
            metadata.publisher, metadata.journal_name, metadata.volume,
            metadata.issue, metadata.page_range, metadata.edition,
            metadata.doi, metadata.isbn, metadata.url,
            metadata.retrieval_date, metadata.document_type,
            metadata.container_title, doc_id,
        ],
    ).map_err(|e| e.to_string())?;

    // Replace authors
    db.execute("DELETE FROM authors WHERE document_id = ?1", params![doc_id])
        .map_err(|e| e.to_string())?;

    for author in &metadata.authors {
        db.execute(
            "INSERT INTO authors (document_id, first_name, last_name, role, position)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![doc_id, author.first_name, author.last_name, author.role, author.position],
        ).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn get_document_highlights(
    doc_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<HighlightInfo>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare(
        "SELECT h.id, h.document_id, h.text, h.annotation, c.page_number, h.date_created
         FROM highlights h
         LEFT JOIN chunks c ON c.id = h.chunk_id
         WHERE h.document_id = ?1
         ORDER BY c.page_number"
    ).map_err(|e| e.to_string())?;

    let highlights = stmt.query_map(params![doc_id], |row| {
        Ok(HighlightInfo {
            id: row.get(0)?,
            document_id: row.get(1)?,
            text: row.get(2)?,
            annotation: row.get(3)?,
            page_number: row.get::<_, Option<i64>>(4)?.map(|n| n as u64),
            date_created: row.get(5)?,
        })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;

    Ok(highlights)
}

// --- Project Commands ---

#[tauri::command]
pub async fn save_project(
    id: Option<i64>,
    title: String,
    content_json: String,
    state: State<'_, AppState>,
) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().format("%Y-%m-%dT%H:%M:%S").to_string();

    match id {
        Some(existing_id) => {
            db.execute(
                "UPDATE projects SET title=?1, content_json=?2, updated_at=?3 WHERE id=?4",
                params![title, content_json, now, existing_id],
            ).map_err(|e| e.to_string())?;
            Ok(existing_id)
        }
        None => {
            db.execute(
                "INSERT INTO projects (title, content_json, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4)",
                params![title, content_json, now, now],
            ).map_err(|e| e.to_string())?;
            Ok(db.last_insert_rowid())
        }
    }
}

#[tauri::command]
pub async fn list_projects(state: State<'_, AppState>) -> Result<Vec<ProjectInfo>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare(
        "SELECT id, title, created_at, updated_at FROM projects ORDER BY updated_at DESC"
    ).map_err(|e| e.to_string())?;

    let projects = stmt.query_map([], |row| {
        Ok(ProjectInfo {
            id: row.get(0)?,
            title: row.get(1)?,
            created_at: row.get(2)?,
            updated_at: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;

    Ok(projects)
}

#[tauri::command]
pub async fn load_project(id: i64, state: State<'_, AppState>) -> Result<ProjectContent, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.query_row(
        "SELECT id, title, content_json, created_at, updated_at FROM projects WHERE id = ?1",
        params![id],
        |row| {
            Ok(ProjectContent {
                id: row.get(0)?,
                title: row.get(1)?,
                content_json: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        },
    ).map_err(|e| e.to_string())
}

// --- Citation Commands ---

#[tauri::command]
pub async fn save_citation(
    project_id: i64,
    citation: CitationData,
    state: State<'_, AppState>,
) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO citations (project_id, chunk_id, highlight_id, inserted_text, source_snapshot, modified)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            project_id, citation.chunk_id, citation.highlight_id,
            citation.inserted_text, citation.source_snapshot, citation.modified as i64,
        ],
    ).map_err(|e| e.to_string())?;
    Ok(db.last_insert_rowid())
}

#[tauri::command]
pub async fn get_project_citations(
    project_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<CitationInfo>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare(
        "SELECT id, project_id, chunk_id, highlight_id, inserted_text, source_snapshot, modified
         FROM citations WHERE project_id = ?1"
    ).map_err(|e| e.to_string())?;

    let citations = stmt.query_map(params![project_id], |row| {
        Ok(CitationInfo {
            id: row.get(0)?,
            project_id: row.get(1)?,
            chunk_id: row.get(2)?,
            highlight_id: row.get(3)?,
            inserted_text: row.get(4)?,
            source_snapshot: row.get(5)?,
            modified: row.get::<_, i64>(6)? != 0,
        })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;

    Ok(citations)
}

// --- Index Commands ---

#[tauri::command]
pub async fn rebuild_search_index(state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let search = state.search.lock().map_err(|e| e.to_string())?;
    let mut writer = search.clear_and_rebuild()?;

    // Re-index all chunks
    let mut chunk_stmt = db.prepare(
        "SELECT c.id, c.content, c.page_number, d.title, d.id
         FROM chunks c JOIN documents d ON d.id = c.document_id"
    ).map_err(|e| e.to_string())?;

    let chunks: Vec<(i64, String, i64, String, i64)> = chunk_stmt.query_map([], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;

    for (id, content, page, title, doc_id) in &chunks {
        search.add_chunk(&mut writer, content, title, *doc_id as u64, *page as u64, false, *id as u64)?;
    }

    // Re-index all highlights
    let mut hl_stmt = db.prepare(
        "SELECT h.id, h.text, COALESCE(c.page_number, 0), COALESCE(d.title, 'Unknown'), COALESCE(d.id, 0)
         FROM highlights h
         LEFT JOIN chunks c ON c.id = h.chunk_id
         LEFT JOIN documents d ON d.id = h.document_id"
    ).map_err(|e| e.to_string())?;

    let highlights: Vec<(i64, String, i64, String, i64)> = hl_stmt.query_map([], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;

    for (id, text, page, title, doc_id) in &highlights {
        search.add_chunk(&mut writer, text, title, *doc_id as u64, *page as u64, true, *id as u64)?;
    }

    writer.commit().map_err(|e| e.to_string())?;
    search.reload()?;

    Ok(())
}
