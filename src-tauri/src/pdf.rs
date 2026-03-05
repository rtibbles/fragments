use std::path::Path;

pub struct ExtractedPage {
    pub page_number: u64,
    pub text: String,
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
}
