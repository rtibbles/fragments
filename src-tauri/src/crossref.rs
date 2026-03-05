use serde::{Deserialize, Serialize};

const CROSSREF_API: &str = "https://api.crossref.org/works";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrossRefMetadata {
    pub title: String,
    pub subtitle: Option<String>,
    pub authors: Vec<CrossRefAuthor>,
    pub publisher: Option<String>,
    pub publication_date: Option<String>,
    pub doi: String,
    pub document_type: String,
    pub container_title: Option<String>,
    pub volume: Option<String>,
    pub issue: Option<String>,
    pub page_range: Option<String>,
    pub isbn: Option<String>,
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrossRefAuthor {
    pub given: Option<String>,
    pub family: String,
}

#[derive(Deserialize)]
struct CrossRefResponse {
    message: CrossRefMessage,
}

#[derive(Deserialize)]
struct CrossRefSearchResponse {
    message: CrossRefSearchMessage,
}

#[derive(Deserialize)]
struct CrossRefSearchMessage {
    items: Vec<CrossRefWork>,
}

#[derive(Deserialize)]
struct CrossRefMessage {
    #[serde(flatten)]
    work: CrossRefWork,
}

#[derive(Deserialize)]
struct CrossRefWork {
    #[serde(rename = "DOI")]
    doi: Option<String>,
    title: Option<Vec<String>>,
    subtitle: Option<Vec<String>>,
    author: Option<Vec<CrossRefAuthorRaw>>,
    publisher: Option<String>,
    #[serde(rename = "type")]
    work_type: Option<String>,
    #[serde(rename = "container-title")]
    container_title: Option<Vec<String>>,
    volume: Option<String>,
    issue: Option<String>,
    page: Option<String>,
    #[serde(rename = "ISBN")]
    isbn: Option<Vec<String>>,
    #[serde(rename = "URL")]
    url: Option<String>,
    #[serde(rename = "published-print")]
    published_print: Option<DateParts>,
    #[serde(rename = "published-online")]
    published_online: Option<DateParts>,
    issued: Option<DateParts>,
}

#[derive(Deserialize)]
struct CrossRefAuthorRaw {
    given: Option<String>,
    family: Option<String>,
}

#[derive(Deserialize)]
struct DateParts {
    #[serde(rename = "date-parts")]
    date_parts: Option<Vec<Vec<u32>>>,
}

fn parse_date(dp: &Option<DateParts>) -> Option<String> {
    dp.as_ref()
        .and_then(|d| d.date_parts.as_ref())
        .and_then(|parts| parts.first())
        .map(|parts| {
            parts.iter()
                .map(|n| n.to_string())
                .collect::<Vec<_>>()
                .join("-")
        })
}

fn work_to_metadata(work: CrossRefWork) -> Option<CrossRefMetadata> {
    let title = work.title?.into_iter().next()?;
    let doi = work.doi?;

    let date = parse_date(&work.published_print)
        .or_else(|| parse_date(&work.published_online))
        .or_else(|| parse_date(&work.issued));

    Some(CrossRefMetadata {
        title,
        subtitle: work.subtitle.and_then(|s| s.into_iter().next()),
        authors: work.author.unwrap_or_default().into_iter()
            .filter_map(|a| {
                Some(CrossRefAuthor {
                    given: a.given,
                    family: a.family?,
                })
            })
            .collect(),
        publisher: work.publisher,
        publication_date: date,
        doi,
        document_type: work.work_type.unwrap_or_else(|| "unknown".into()),
        container_title: work.container_title.and_then(|c| c.into_iter().next()),
        volume: work.volume,
        issue: work.issue,
        page_range: work.page,
        isbn: work.isbn.and_then(|i| i.into_iter().next()),
        url: work.url,
    })
}

pub async fn lookup_doi(doi: &str) -> Result<Option<CrossRefMetadata>, String> {
    let url = format!("{}/{}", CROSSREF_API, doi);
    let client = reqwest::Client::new();
    let resp = client.get(&url)
        .header("User-Agent", "Fragments/0.1 (mailto:fragments@example.com)")
        .send()
        .await
        .map_err(|e| format!("CrossRef request failed: {}", e))?;

    if resp.status() == 404 {
        return Ok(None);
    }

    let data: CrossRefResponse = resp.json()
        .await
        .map_err(|e| format!("CrossRef parse failed: {}", e))?;

    Ok(work_to_metadata(data.message.work))
}

pub async fn search_works(query: &str, limit: usize) -> Result<Vec<CrossRefMetadata>, String> {
    let client = reqwest::Client::new();
    let resp = client.get(CROSSREF_API)
        .query(&[("query", query), ("rows", &limit.to_string())])
        .header("User-Agent", "Fragments/0.1 (mailto:fragments@example.com)")
        .send()
        .await
        .map_err(|e| format!("CrossRef search failed: {}", e))?;

    let data: CrossRefSearchResponse = resp.json()
        .await
        .map_err(|e| format!("CrossRef parse failed: {}", e))?;

    Ok(data.message.items.into_iter()
        .filter_map(work_to_metadata)
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_date_full() {
        let dp = Some(DateParts { date_parts: Some(vec![vec![2024, 3, 15]]) });
        assert_eq!(parse_date(&dp), Some("2024-3-15".to_string()));
    }

    #[test]
    fn test_parse_date_year_only() {
        let dp = Some(DateParts { date_parts: Some(vec![vec![2024]]) });
        assert_eq!(parse_date(&dp), Some("2024".to_string()));
    }

    #[test]
    fn test_parse_date_none() {
        assert_eq!(parse_date(&None), None);
    }
}
