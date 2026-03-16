use rusqlite::{Connection, OpenFlags};
use std::path::Path;

#[derive(Debug, Clone, serde::Serialize)]
pub struct KoboHighlight {
    pub bookmark_id: String,
    pub volume_id: String,
    pub text: String,
    pub annotation: Option<String>,
    pub start_container_path: String,
    pub chapter_progress: f64,
    pub date_created: Option<String>,
    pub book_title: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct KoboBook {
    pub volume_id: String,
    pub title: Option<String>,
    pub attribution: Option<String>,
    pub file_path: String,
}

pub fn parse_page_number(start_container_path: &str) -> Option<u64> {
    let s = start_container_path.trim();
    if let Ok(n) = s.parse::<u64>() {
        return Some(n);
    }
    if let Some(rest) = s.strip_prefix("Page ") {
        if let Ok(n) = rest.trim().parse::<u64>() {
            return Some(n);
        }
    }
    None
}

pub fn volume_id_to_relative_path(volume_id: &str) -> Option<String> {
    volume_id.strip_prefix("file:///mnt/onboard/")
        .map(|s| s.to_string())
}

#[cfg(test)]
pub fn is_pdf_volume(volume_id: &str) -> bool {
    volume_id.to_lowercase().ends_with(".pdf")
}

pub fn read_highlights(kobo_db_path: &Path) -> Result<Vec<KoboHighlight>, String> {
    let conn = Connection::open_with_flags(
        kobo_db_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    ).map_err(|e| format!("Failed to open Kobo database: {}", e))?;

    let mut stmt = conn.prepare("
        SELECT
            b.BookmarkID,
            b.VolumeID,
            b.Text,
            b.Annotation,
            b.StartContainerPath,
            CAST(COALESCE(b.ChapterProgress, '0') AS REAL),
            b.DateCreated,
            c.BookTitle
        FROM Bookmark b
        LEFT JOIN content c
            ON c.ContentID = b.VolumeID
           AND c.ContentType = 6
        WHERE b.Text IS NOT NULL
          AND b.Text != ''
        ORDER BY b.VolumeID, CAST(COALESCE(b.ChapterProgress, '0') AS REAL)
    ").map_err(|e| format!("Query failed: {}", e))?;

    let highlights = stmt.query_map([], |row| {
        Ok(KoboHighlight {
            bookmark_id: row.get(0)?,
            volume_id: row.get(1)?,
            text: row.get(2)?,
            annotation: row.get(3)?,
            start_container_path: row.get::<_, String>(4).unwrap_or_default(),
            chapter_progress: row.get(5).unwrap_or(0.0),
            date_created: row.get(6)?,
            book_title: row.get(7)?,
        })
    }).map_err(|e| format!("Query map failed: {}", e))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("Row read failed: {}", e))?;

    Ok(highlights)
}

pub fn list_pdf_books(kobo_db_path: &Path) -> Result<Vec<KoboBook>, String> {
    let conn = Connection::open_with_flags(
        kobo_db_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    ).map_err(|e| format!("Failed to open Kobo database: {}", e))?;

    let mut stmt = conn.prepare("
        SELECT c6.ContentID, c6.BookTitle, c6.Attribution,
               c9.BookTitle AS PageBookTitle
        FROM content c6
        LEFT JOIN content c9
            ON c9.ContentType = 9
           AND c9.BookID = c6.ContentID
           AND c9.BookTitle IS NOT NULL
           AND c9.BookTitle != ''
        WHERE c6.ContentType = 6
          AND c6.ContentID LIKE '%.pdf'
        GROUP BY c6.ContentID
        ORDER BY COALESCE(c9.BookTitle, c6.BookTitle)
    ").map_err(|e| format!("Query failed: {}", e))?;

    let books = stmt.query_map([], |row| {
        let volume_id: String = row.get(0)?;
        let ct6_title: Option<String> = row.get(1)?;
        let attribution: Option<String> = row.get(2)?;
        let ct9_title: Option<String> = row.get(3)?;
        let file_path = volume_id_to_relative_path(&volume_id)
            .unwrap_or_else(|| volume_id.clone());
        let title = ct9_title
            .filter(|s| !s.is_empty())
            .or(ct6_title.filter(|s| !s.is_empty()));
        Ok(KoboBook {
            volume_id,
            title,
            attribution,
            file_path,
        })
    }).map_err(|e| format!("Query map failed: {}", e))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("Row read failed: {}", e))?;

    Ok(books)
}

/// Parse an attribution string into (first_name, last_name).
/// Handles "First Last", "Last, First", and single names.
/// For multiple authors (comma or "and" separated), takes the first.
pub fn parse_attribution(s: &str) -> (String, String) {
    let s = s.trim();
    if s.is_empty() {
        return (String::new(), String::new());
    }

    // Split on " and " first, take the first author segment
    let first_segment = s.split(" and ").next().unwrap_or(s).trim();

    // If the segment contains a comma, it could be:
    //   "Last, First" (single author) or "First Last, Second Author, ..." (multiple)
    // Heuristic: if before-comma part is a single word, treat as "Last, First"
    if let Some((before, after)) = first_segment.split_once(", ") {
        let after = after.trim();
        if before.split_whitespace().count() == 1 {
            // "Last, First" format
            return (after.to_string(), before.trim().to_string());
        }
        // Multiple comma-separated authors — take the first
        let first_author = before.trim();
        match first_author.rsplit_once(' ') {
            Some((first, last)) => return (first.trim().to_string(), last.trim().to_string()),
            None => return (String::new(), first_author.to_string()),
        }
    }

    // "First Last" format — split on last space
    match first_segment.rsplit_once(' ') {
        Some((first, last)) => (first.trim().to_string(), last.trim().to_string()),
        None => (String::new(), first_segment.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_page_number_integer() {
        assert_eq!(parse_page_number("42"), Some(42));
    }

    #[test]
    fn test_parse_page_number_prefix() {
        assert_eq!(parse_page_number("Page 7"), Some(7));
    }

    #[test]
    fn test_parse_page_number_invalid() {
        assert_eq!(parse_page_number("OEBPS/chapter.xhtml"), None);
    }

    #[test]
    fn test_volume_id_to_path() {
        assert_eq!(
            volume_id_to_relative_path("file:///mnt/onboard/Books/test.pdf"),
            Some("Books/test.pdf".to_string())
        );
    }

    #[test]
    fn test_is_pdf_volume() {
        assert!(is_pdf_volume("file:///mnt/onboard/Books/test.pdf"));
        assert!(is_pdf_volume("file:///mnt/onboard/Books/test.PDF"));
        assert!(!is_pdf_volume("file:///mnt/onboard/Books/test.epub"));
    }

    #[test]
    fn test_parse_attribution_first_last() {
        let (first, last) = parse_attribution("Jane Smith");
        assert_eq!(first, "Jane");
        assert_eq!(last, "Smith");
    }

    #[test]
    fn test_parse_attribution_last_comma_first() {
        let (first, last) = parse_attribution("Smith, Jane");
        assert_eq!(first, "Jane");
        assert_eq!(last, "Smith");
    }

    #[test]
    fn test_parse_attribution_single_name() {
        let (first, last) = parse_attribution("Aristotle");
        assert_eq!(first, "");
        assert_eq!(last, "Aristotle");
    }

    #[test]
    fn test_parse_attribution_multiple_authors() {
        let (first, last) = parse_attribution("Ella Haselswerdt, Sara H. Lindheim, and Kirk Ormand");
        assert_eq!(first, "Ella");
        assert_eq!(last, "Haselswerdt");
    }

    #[test]
    fn test_list_pdf_books_with_title_from_content_type_9() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("kobo.db");
        let conn = rusqlite::Connection::open(&db_path).unwrap();

        conn.execute_batch("
            CREATE TABLE content (
                ContentID TEXT PRIMARY KEY,
                ContentType INTEGER,
                BookTitle TEXT,
                Attribution TEXT,
                BookID TEXT
            );

            INSERT INTO content (ContentID, ContentType, BookTitle, Attribution, BookID)
            VALUES ('file:///mnt/onboard/Books/test.pdf', 6, NULL, NULL, NULL);

            INSERT INTO content (ContentID, ContentType, BookTitle, Attribution, BookID)
            VALUES ('file:///mnt/onboard/Books/test.pdf?page=1&position=0', 9,
                    'Actual Book Title', NULL,
                    'file:///mnt/onboard/Books/test.pdf');
        ").unwrap();

        let books = list_pdf_books(&db_path).unwrap();
        assert_eq!(books.len(), 1);
        assert_eq!(books[0].title, Some("Actual Book Title".to_string()));
    }

    #[test]
    fn test_list_pdf_books_falls_back_to_content_type_6_title() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("kobo.db");
        let conn = rusqlite::Connection::open(&db_path).unwrap();

        conn.execute_batch("
            CREATE TABLE content (
                ContentID TEXT PRIMARY KEY,
                ContentType INTEGER,
                BookTitle TEXT,
                Attribution TEXT,
                BookID TEXT
            );

            INSERT INTO content (ContentID, ContentType, BookTitle, Attribution, BookID)
            VALUES ('file:///mnt/onboard/Books/test.pdf', 6, 'CT6 Title', 'Some Author', NULL);
        ").unwrap();

        let books = list_pdf_books(&db_path).unwrap();
        assert_eq!(books.len(), 1);
        assert_eq!(books[0].title, Some("CT6 Title".to_string()));
        assert_eq!(books[0].attribution, Some("Some Author".to_string()));
    }
}
