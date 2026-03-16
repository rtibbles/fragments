use std::path::Path;

pub struct ExtractedPage {
    pub page_number: u64,
    pub text: String,
}

#[derive(Debug)]
pub struct PdfMetadata {
    pub title: Option<String>,
    pub author: Option<String>,
}

#[derive(Debug)]
pub struct PdfAnnotation {
    pub page_number: u64,
    pub text: String,
    pub _annotation_type: String,
    pub date_created: Option<String>,
    pub _author: Option<String>,
}

pub fn extract_pages(path: &Path) -> Result<Vec<ExtractedPage>, String> {
    let pages = pdf_extract::extract_text_by_pages(path)
        .map_err(|e| format!("PDF extraction failed: {}", e))?;

    Ok(pages
        .into_iter()
        .enumerate()
        .filter_map(|(idx, text)| {
            let trimmed = text.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(ExtractedPage {
                    page_number: (idx + 1) as u64,
                    text: trimmed,
                })
            }
        })
        .collect())
}

/// Try to extract a DOI from the first few pages of a PDF.
pub fn extract_doi(pages: &[ExtractedPage]) -> Option<String> {
    let doi_regex = regex::Regex::new(
        r"(?i)(?:doi[:\s]*|https?://(?:dx\.)?doi\.org/)?(10\.\d{4,}/[^\s,;}\]]+)"
    ).ok()?;

    for page in pages.iter().take(3) {
        if let Some(captures) = doi_regex.captures(&page.text) {
            if let Some(doi) = captures.get(1) {
                return Some(doi.as_str().trim_end_matches('.').to_string());
            }
        }
    }
    None
}

fn get_string_from_obj(obj: &lopdf::Object) -> Option<String> {
    match obj {
        lopdf::Object::String(bytes, _) => {
            let s = String::from_utf8_lossy(bytes).trim().to_string();
            if s.is_empty() { None } else { Some(s) }
        }
        _ => None,
    }
}

/// Parse PDF date format D:YYYYMMDDHHmmSS+HH'mm' to ISO 8601.
fn parse_pdf_date(s: &str) -> Option<String> {
    let s = s.strip_prefix("D:").unwrap_or(s);
    if s.len() < 4 {
        return None;
    }
    let year = &s[0..4];
    let month = s.get(4..6).unwrap_or("01");
    let day = s.get(6..8).unwrap_or("01");
    let hour = s.get(8..10).unwrap_or("00");
    let min = s.get(10..12).unwrap_or("00");
    let sec = s.get(12..14).unwrap_or("00");
    Some(format!("{}-{}-{}T{}:{}:{}", year, month, day, hour, min, sec))
}

pub fn extract_metadata(path: &Path) -> Result<PdfMetadata, String> {
    let doc = lopdf::Document::load(path)
        .map_err(|e| format!("Failed to load PDF for metadata: {}", e))?;

    let info = doc.trailer.get(b"Info")
        .ok()
        .and_then(|obj| {
            match obj {
                lopdf::Object::Reference(id) => doc.get_object(*id).ok(),
                lopdf::Object::Dictionary(_) => Some(obj),
                _ => None,
            }
        })
        .and_then(|obj| obj.as_dict().ok());

    let title = info
        .and_then(|d| d.get(b"Title").ok())
        .and_then(get_string_from_obj)
        .filter(|s| !s.is_empty());

    let author = info
        .and_then(|d| d.get(b"Author").ok())
        .and_then(get_string_from_obj)
        .filter(|s| !s.is_empty());

    Ok(PdfMetadata { title, author })
}

pub fn extract_annotations(path: &Path) -> Result<Vec<PdfAnnotation>, String> {
    let doc = lopdf::Document::load(path)
        .map_err(|e| format!("Failed to load PDF for annotations: {}", e))?;

    let mut annotations = Vec::new();

    for (page_num, page_id) in doc.get_pages() {
        let page = match doc.get_object(page_id).and_then(|o| o.as_dict()) {
            Ok(d) => d,
            _ => continue,
        };

        let annots_array = match page.get(b"Annots") {
            Ok(obj) => {
                match obj {
                    lopdf::Object::Array(arr) => arr.clone(),
                    lopdf::Object::Reference(id) => {
                        match doc.get_object(*id) {
                            Ok(lopdf::Object::Array(arr)) => arr.clone(),
                            _ => continue,
                        }
                    }
                    _ => continue,
                }
            }
            Err(_) => continue,
        };

        for annot_ref in &annots_array {
            let annot_obj = match annot_ref {
                lopdf::Object::Reference(id) => {
                    match doc.get_object(*id) {
                        Ok(obj) => obj,
                        _ => continue,
                    }
                }
                obj => obj,
            };

            let annot = match annot_obj.as_dict() {
                Ok(d) => d,
                _ => continue,
            };

            let subtype = match annot.get(b"Subtype") {
                Ok(lopdf::Object::Name(name)) => String::from_utf8_lossy(name).to_string(),
                _ => continue,
            };

            let annotation_type = match subtype.as_str() {
                "Highlight" => "highlight",
                "Ink" => "ink",
                _ => continue,
            };

            let text = match annot.get(b"Contents").ok().and_then(get_string_from_obj) {
                Some(t) => t,
                None => continue,
            };

            let date_created = annot.get(b"CreationDate").ok()
                .and_then(get_string_from_obj)
                .and_then(|s| parse_pdf_date(&s));

            let author = annot.get(b"T").ok()
                .and_then(get_string_from_obj);

            annotations.push(PdfAnnotation {
                page_number: page_num as u64,
                text,
                _annotation_type: annotation_type.to_string(),
                date_created,
                _author: author,
            });
        }
    }

    Ok(annotations)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_doi_from_text() {
        let pages = vec![
            ExtractedPage { page_number: 1, text: "Title\nSome text doi:10.1234/test.2024 more text".into() },
        ];
        assert_eq!(extract_doi(&pages), Some("10.1234/test.2024".into()));
    }

    #[test]
    fn test_extract_doi_url_format() {
        let pages = vec![
            ExtractedPage { page_number: 1, text: "https://doi.org/10.5678/example more".into() },
        ];
        assert_eq!(extract_doi(&pages), Some("10.5678/example".into()));
    }

    #[test]
    fn test_extract_doi_not_found() {
        let pages = vec![
            ExtractedPage { page_number: 1, text: "No DOI here.".into() },
        ];
        assert_eq!(extract_doi(&pages), None);
    }

    fn make_test_pdf(with_info: bool) -> (tempfile::TempDir, std::path::PathBuf) {
        use lopdf::{Document, Object, Dictionary, Stream};
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.pdf");
        let mut doc = Document::with_version("1.5");
        let pages_id = doc.new_object_id();
        let page_id = doc.new_object_id();
        let content_id = doc.add_object(Stream::new(Dictionary::new(), Vec::new()));
        let page = Dictionary::from_iter(vec![
            ("Type", Object::Name(b"Page".to_vec())),
            ("Parent", Object::Reference(pages_id)),
            ("Contents", Object::Reference(content_id)),
        ]);
        doc.objects.insert(page_id, Object::Dictionary(page));
        let pages = Dictionary::from_iter(vec![
            ("Type", Object::Name(b"Pages".to_vec())),
            ("Kids", Object::Array(vec![Object::Reference(page_id)])),
            ("Count", Object::Integer(1)),
        ]);
        doc.objects.insert(pages_id, Object::Dictionary(pages));
        let catalog_id = doc.add_object(Dictionary::from_iter(vec![
            ("Type", Object::Name(b"Catalog".to_vec())),
            ("Pages", Object::Reference(pages_id)),
        ]));
        doc.trailer.set("Root", Object::Reference(catalog_id));
        if with_info {
            let info = Dictionary::from_iter(vec![
                ("Title", Object::string_literal("Test Title")),
                ("Author", Object::string_literal("Test Author")),
            ]);
            let info_id = doc.add_object(info);
            doc.trailer.set("Info", Object::Reference(info_id));
        }
        doc.save(&path).unwrap();
        (dir, path)
    }

    #[test]
    fn test_extract_metadata_with_info() {
        let (_dir, path) = make_test_pdf(true);
        let meta = extract_metadata(&path).unwrap();
        assert_eq!(meta.title, Some("Test Title".to_string()));
        assert_eq!(meta.author, Some("Test Author".to_string()));
    }

    #[test]
    fn test_extract_metadata_missing_info() {
        let (_dir, path) = make_test_pdf(false);
        let meta = extract_metadata(&path).unwrap();
        assert_eq!(meta.title, None);
        assert_eq!(meta.author, None);
    }

    #[test]
    fn test_parse_pdf_date() {
        assert_eq!(
            parse_pdf_date("D:20220929165826+02'00'"),
            Some("2022-09-29T16:58:26".to_string())
        );
        assert_eq!(
            parse_pdf_date("D:20220930"),
            Some("2022-09-30T00:00:00".to_string())
        );
        assert_eq!(parse_pdf_date(""), None);
        assert_eq!(parse_pdf_date("D:"), None);
    }

    #[test]
    fn test_extract_annotations_highlight() {
        use lopdf::{Document, Object, Dictionary, Stream};
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("annotated.pdf");

        let mut doc = Document::with_version("1.5");
        let pages_id = doc.new_object_id();
        let page_id = doc.new_object_id();
        let content_id = doc.add_object(Stream::new(Dictionary::new(), Vec::new()));

        let annot = Dictionary::from_iter(vec![
            ("Type", Object::Name(b"Annot".to_vec())),
            ("Subtype", Object::Name(b"Highlight".to_vec())),
            ("Contents", Object::string_literal("Important passage")),
            ("T", Object::string_literal("testuser")),
            ("CreationDate", Object::string_literal("D:20220929165826+02'00'")),
        ]);
        let annot_id = doc.add_object(annot);

        let page = Dictionary::from_iter(vec![
            ("Type", Object::Name(b"Page".to_vec())),
            ("Parent", Object::Reference(pages_id)),
            ("Contents", Object::Reference(content_id)),
            ("Annots", Object::Array(vec![Object::Reference(annot_id)])),
        ]);
        doc.objects.insert(page_id, Object::Dictionary(page));
        let pages = Dictionary::from_iter(vec![
            ("Type", Object::Name(b"Pages".to_vec())),
            ("Kids", Object::Array(vec![Object::Reference(page_id)])),
            ("Count", Object::Integer(1)),
        ]);
        doc.objects.insert(pages_id, Object::Dictionary(pages));
        let catalog_id = doc.add_object(Dictionary::from_iter(vec![
            ("Type", Object::Name(b"Catalog".to_vec())),
            ("Pages", Object::Reference(pages_id)),
        ]));
        doc.trailer.set("Root", Object::Reference(catalog_id));
        doc.save(&path).unwrap();

        let annots = extract_annotations(&path).unwrap();
        assert_eq!(annots.len(), 1);
        assert_eq!(annots[0].text, "Important passage");
        assert_eq!(annots[0].page_number, 1);
        assert_eq!(annots[0]._annotation_type, "highlight");
        assert_eq!(annots[0]._author, Some("testuser".to_string()));
        assert!(annots[0].date_created.is_some());
    }

    #[test]
    fn test_extract_annotations_skips_empty_contents() {
        use lopdf::{Document, Object, Dictionary, Stream};
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("ink.pdf");

        let mut doc = Document::with_version("1.5");
        let pages_id = doc.new_object_id();
        let page_id = doc.new_object_id();
        let content_id = doc.add_object(Stream::new(Dictionary::new(), Vec::new()));

        let annot = Dictionary::from_iter(vec![
            ("Type", Object::Name(b"Annot".to_vec())),
            ("Subtype", Object::Name(b"Ink".to_vec())),
        ]);
        let annot_id = doc.add_object(annot);

        let page = Dictionary::from_iter(vec![
            ("Type", Object::Name(b"Page".to_vec())),
            ("Parent", Object::Reference(pages_id)),
            ("Contents", Object::Reference(content_id)),
            ("Annots", Object::Array(vec![Object::Reference(annot_id)])),
        ]);
        doc.objects.insert(page_id, Object::Dictionary(page));
        let pages = Dictionary::from_iter(vec![
            ("Type", Object::Name(b"Pages".to_vec())),
            ("Kids", Object::Array(vec![Object::Reference(page_id)])),
            ("Count", Object::Integer(1)),
        ]);
        doc.objects.insert(pages_id, Object::Dictionary(pages));
        let catalog_id = doc.add_object(Dictionary::from_iter(vec![
            ("Type", Object::Name(b"Catalog".to_vec())),
            ("Pages", Object::Reference(pages_id)),
        ]));
        doc.trailer.set("Root", Object::Reference(catalog_id));
        doc.save(&path).unwrap();

        let annots = extract_annotations(&path).unwrap();
        assert_eq!(annots.len(), 0);
    }

    #[test]
    fn test_extract_annotations_skips_links() {
        use lopdf::{Document, Object, Dictionary, Stream};
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("links.pdf");

        let mut doc = Document::with_version("1.5");
        let pages_id = doc.new_object_id();
        let page_id = doc.new_object_id();
        let content_id = doc.add_object(Stream::new(Dictionary::new(), Vec::new()));

        let annot = Dictionary::from_iter(vec![
            ("Type", Object::Name(b"Annot".to_vec())),
            ("Subtype", Object::Name(b"Link".to_vec())),
            ("Contents", Object::string_literal("http://example.com")),
        ]);
        let annot_id = doc.add_object(annot);

        let page = Dictionary::from_iter(vec![
            ("Type", Object::Name(b"Page".to_vec())),
            ("Parent", Object::Reference(pages_id)),
            ("Contents", Object::Reference(content_id)),
            ("Annots", Object::Array(vec![Object::Reference(annot_id)])),
        ]);
        doc.objects.insert(page_id, Object::Dictionary(page));
        let pages = Dictionary::from_iter(vec![
            ("Type", Object::Name(b"Pages".to_vec())),
            ("Kids", Object::Array(vec![Object::Reference(page_id)])),
            ("Count", Object::Integer(1)),
        ]);
        doc.objects.insert(pages_id, Object::Dictionary(pages));
        let catalog_id = doc.add_object(Dictionary::from_iter(vec![
            ("Type", Object::Name(b"Catalog".to_vec())),
            ("Pages", Object::Reference(pages_id)),
        ]));
        doc.trailer.set("Root", Object::Reference(catalog_id));
        doc.save(&path).unwrap();

        let annots = extract_annotations(&path).unwrap();
        assert_eq!(annots.len(), 0);
    }
}
