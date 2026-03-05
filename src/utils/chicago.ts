export interface CitationMetadata {
  title: string;
  subtitle?: string | null;
  authors: { firstName: string; lastName: string }[];
  publisher?: string | null;
  publicationDate?: string | null;
  doi?: string | null;
  isbn?: string | null;
  journalName?: string | null;
  volume?: string | null;
  issue?: string | null;
  pageRange?: string | null;
  edition?: string | null;
  url?: string | null;
  containerTitle?: string | null;
  documentType: string;
}

function formatAuthorsBibliography(authors: CitationMetadata["authors"]): string {
  if (authors.length === 0) return "";
  if (authors.length === 1) {
    return `${authors[0].lastName}, ${authors[0].firstName}`;
  }
  if (authors.length === 2) {
    return `${authors[0].lastName}, ${authors[0].firstName}, and ${authors[1].firstName} ${authors[1].lastName}`;
  }
  // 3+ authors: first author inverted, then "et al." for bibliography
  // Actually Chicago allows listing all, but for brevity:
  const parts = [
    `${authors[0].lastName}, ${authors[0].firstName}`,
  ];
  for (let i = 1; i < authors.length - 1; i++) {
    parts.push(`${authors[i].firstName} ${authors[i].lastName}`);
  }
  const last = authors[authors.length - 1];
  parts.push(`and ${last.firstName} ${last.lastName}`);
  return parts.join(", ");
}

function extractYear(date?: string | null): string {
  if (!date) return "n.d.";
  const match = date.match(/(\d{4})/);
  return match ? match[1] : "n.d.";
}

function formatTitle(title: string, italic: boolean): string {
  if (italic) return `*${title}*`;
  return `"${title}"`;
}

export function formatChicagoBibliography(meta: CitationMetadata): string {
  const year = extractYear(meta.publicationDate);
  const authorStr = formatAuthorsBibliography(meta.authors);
  const fullTitle = meta.subtitle
    ? `${meta.title}: ${meta.subtitle}`
    : meta.title;

  switch (meta.documentType) {
    case "journal_article": {
      // Author. "Title." *Journal* Volume, no. Issue (Year): Pages. DOI.
      const parts: string[] = [];
      if (authorStr) parts.push(`${authorStr}.`);
      parts.push(formatTitle(fullTitle, false) + ".");
      if (meta.journalName) {
        let journalPart = `*${meta.journalName}*`;
        if (meta.volume) {
          journalPart += ` ${meta.volume}`;
          if (meta.issue) journalPart += `, no. ${meta.issue}`;
        }
        journalPart += ` (${year})`;
        if (meta.pageRange) journalPart += `: ${meta.pageRange}`;
        journalPart += ".";
        parts.push(journalPart);
      }
      if (meta.doi) parts.push(`https://doi.org/${meta.doi}.`);
      return parts.join(" ");
    }

    case "chapter": {
      // Author. "Chapter Title." In *Book Title*, edited by Editor, Pages. Place: Publisher, Year.
      const parts: string[] = [];
      if (authorStr) parts.push(`${authorStr}.`);
      parts.push(formatTitle(fullTitle, false) + ".");
      if (meta.containerTitle) {
        let inPart = `In ${formatTitle(meta.containerTitle, true)}`;
        if (meta.pageRange) inPart += `, ${meta.pageRange}`;
        inPart += ".";
        parts.push(inPart);
      }
      if (meta.publisher) {
        parts.push(`${meta.publisher}, ${year}.`);
      }
      if (meta.doi) parts.push(`https://doi.org/${meta.doi}.`);
      return parts.join(" ");
    }

    case "thesis": {
      // Author. "Title." Type, University, Year.
      const parts: string[] = [];
      if (authorStr) parts.push(`${authorStr}.`);
      parts.push(formatTitle(fullTitle, false) + ".");
      if (meta.publisher) {
        parts.push(`${meta.publisher}, ${year}.`);
      }
      return parts.join(" ");
    }

    case "report": {
      const parts: string[] = [];
      if (authorStr) parts.push(`${authorStr}.`);
      parts.push(formatTitle(fullTitle, true) + ".");
      if (meta.publisher) {
        parts.push(`${meta.publisher}, ${year}.`);
      }
      if (meta.url) parts.push(meta.url + ".");
      return parts.join(" ");
    }

    default: {
      // Book: Author. *Title*. Edition. Place: Publisher, Year.
      const parts: string[] = [];
      if (authorStr) parts.push(`${authorStr}.`);
      parts.push(formatTitle(fullTitle, true) + ".");
      if (meta.edition) parts.push(`${meta.edition} ed.`);
      if (meta.publisher) {
        parts.push(`${meta.publisher}, ${year}.`);
      }
      if (meta.doi) parts.push(`https://doi.org/${meta.doi}.`);
      return parts.join(" ");
    }
  }
}

export function formatChicagoNote(
  meta: CitationMetadata,
  pageNumber?: number
): string {
  const year = extractYear(meta.publicationDate);
  const fullTitle = meta.subtitle
    ? `${meta.title}: ${meta.subtitle}`
    : meta.title;

  // Notes format uses first name first
  const authorStr =
    meta.authors.length === 0
      ? ""
      : meta.authors.length === 1
        ? `${meta.authors[0].firstName} ${meta.authors[0].lastName}`
        : meta.authors.length === 2
          ? `${meta.authors[0].firstName} ${meta.authors[0].lastName} and ${meta.authors[1].firstName} ${meta.authors[1].lastName}`
          : `${meta.authors[0].firstName} ${meta.authors[0].lastName} et al.`;

  switch (meta.documentType) {
    case "journal_article": {
      const parts: string[] = [];
      if (authorStr) parts.push(`${authorStr},`);
      parts.push(`"${fullTitle},"`);
      if (meta.journalName) {
        let jPart = `*${meta.journalName}*`;
        if (meta.volume) {
          jPart += ` ${meta.volume}`;
          if (meta.issue) jPart += `, no. ${meta.issue}`;
        }
        jPart += ` (${year})`;
        if (pageNumber) jPart += `: ${pageNumber}`;
        parts.push(jPart + ".");
      }
      return parts.join(" ");
    }

    default: {
      const parts: string[] = [];
      if (authorStr) parts.push(`${authorStr},`);
      parts.push(`*${fullTitle}*`);
      if (meta.publisher) parts.push(`(${meta.publisher}, ${year})`);
      if (pageNumber) {
        parts.push(`, ${pageNumber}`);
      }
      return parts.join(" ") + ".";
    }
  }
}
