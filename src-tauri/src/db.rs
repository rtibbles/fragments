use rusqlite::Connection;
use std::path::Path;

pub fn open_database(path: &Path) -> Result<Connection, rusqlite::Error> {
    let conn = Connection::open(path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
    run_migrations(&conn)?;
    Ok(conn)
}

fn run_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS documents (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            title           TEXT NOT NULL,
            subtitle        TEXT,
            publication_date TEXT,
            publisher       TEXT,
            journal_name    TEXT,
            volume          TEXT,
            issue           TEXT,
            page_range      TEXT,
            edition         TEXT,
            doi             TEXT,
            isbn            TEXT,
            url             TEXT,
            retrieval_date  TEXT,
            document_type   TEXT NOT NULL DEFAULT 'book',
            container_title TEXT,
            file_path       TEXT NOT NULL,
            import_date     TEXT NOT NULL,
            UNIQUE(file_path)
        );

        CREATE TABLE IF NOT EXISTS authors (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            first_name  TEXT NOT NULL,
            last_name   TEXT NOT NULL,
            role        TEXT NOT NULL DEFAULT 'author',
            position    INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS chunks (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            content     TEXT NOT NULL,
            page_number INTEGER NOT NULL,
            position    INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS highlights (
            id                   INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id          INTEGER REFERENCES documents(id) ON DELETE SET NULL,
            chunk_id             INTEGER REFERENCES chunks(id) ON DELETE SET NULL,
            text                 TEXT NOT NULL,
            annotation           TEXT,
            kobo_chapter_progress REAL,
            kobo_volume_id       TEXT,
            date_created         TEXT
        );

        CREATE TABLE IF NOT EXISTS projects (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            title         TEXT NOT NULL,
            content_json  TEXT NOT NULL DEFAULT '{}',
            created_at    TEXT NOT NULL,
            updated_at    TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS citations (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            chunk_id      INTEGER REFERENCES chunks(id) ON DELETE SET NULL,
            highlight_id  INTEGER REFERENCES highlights(id) ON DELETE SET NULL,
            inserted_text TEXT NOT NULL,
            source_snapshot TEXT NOT NULL,
            modified      INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id);
        CREATE INDEX IF NOT EXISTS idx_highlights_document ON highlights(document_id);
        CREATE INDEX IF NOT EXISTS idx_authors_document ON authors(document_id);
        CREATE INDEX IF NOT EXISTS idx_citations_project ON citations(project_id);
    ")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    #[test]
    fn test_open_database_creates_tables() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let conn = open_database(&db_path).unwrap();

        let tables: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();

        assert!(tables.contains(&"documents".to_string()));
        assert!(tables.contains(&"authors".to_string()));
        assert!(tables.contains(&"chunks".to_string()));
        assert!(tables.contains(&"highlights".to_string()));
        assert!(tables.contains(&"projects".to_string()));
        assert!(tables.contains(&"citations".to_string()));
    }

    #[test]
    fn test_insert_document_with_authors() {
        let dir = tempfile::tempdir().unwrap();
        let conn = open_database(&dir.path().join("test.db")).unwrap();

        conn.execute(
            "INSERT INTO documents (title, document_type, file_path, import_date)
             VALUES (?1, ?2, ?3, ?4)",
            params!["Test Book", "book", "/path/to/book.pdf", "2026-03-04"],
        ).unwrap();

        let doc_id = conn.last_insert_rowid();

        conn.execute(
            "INSERT INTO authors (document_id, first_name, last_name, role, position)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![doc_id, "Jane", "Smith", "author", 0],
        ).unwrap();

        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM authors WHERE document_id = ?1",
            params![doc_id],
            |row| row.get(0),
        ).unwrap();

        assert_eq!(count, 1);
    }
}
