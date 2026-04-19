const MARGIN = 60;
const MAX_CHARS = 250;

const SENTENCE_STOPS = new Set([".", "!", "?", ";", "\n"]);
const OPEN_QUOTES = new Set(["\u201C", "\u2018"]);
const CLOSE_QUOTES = new Set(["\u201D", "\u2019"]);
const STRAIGHT_QUOTES = new Set(['"', "'"]);

function isSentenceStop(c: string): boolean { return SENTENCE_STOPS.has(c); }
function isOpenQuote(c: string): boolean { return OPEN_QUOTES.has(c); }
function isCloseQuote(c: string): boolean { return CLOSE_QUOTES.has(c); }
function isStraightQuote(c: string): boolean { return STRAIGHT_QUOTES.has(c); }

/**
 * Expand `extract` to nearby sentence/quote boundaries within `fullText`.
 * Ported from src-tauri/src/search.rs::snap_to_punctuation — keeps the same
 * ~60 char margin, 250 char max, and quote-awareness rules.
 */
export function snapToPunctuation(fullText: string, extract: string): string {
  const chars = Array.from(fullText);
  const fullStr = chars.join("");
  const idx = fullStr.indexOf(extract);
  if (idx === -1) return extract;

  // Convert byte-ish index (string) to char index by walking from start.
  // JS strings are UTF-16, but we treat them as code-point arrays here.
  let charStart = 0;
  {
    let counted = 0;
    for (const c of fullText) {
      if (counted === idx) break;
      counted += c.length;
      charStart += 1;
    }
  }
  const charEnd = charStart + Array.from(extract).length;

  // Snap start backward
  const scanStart = Math.max(0, charStart - MARGIN);
  let start = scanStart;
  for (let i = charStart - 1; i >= scanStart; i--) {
    const c = chars[i];
    if (isOpenQuote(c) || isStraightQuote(c)) { start = i; break; }
    if (isSentenceStop(c)) { start = i + 1; break; }
  }

  // Snap end forward
  const scanEnd = Math.min(chars.length, charEnd + MARGIN);
  let end = scanEnd;
  for (let i = charEnd; i < scanEnd; i++) {
    const c = chars[i];
    if (isCloseQuote(c) || isStraightQuote(c)) { end = i + 1; break; }
    if (isSentenceStop(c)) { end = i + 1; break; }
  }

  // Enforce max length
  if (end - start > MAX_CHARS) {
    end = Math.min(start + MAX_CHARS, chars.length);
    for (let i = end - 1; i >= charEnd; i--) {
      const c = chars[i];
      if (isSentenceStop(c) || isCloseQuote(c) || isStraightQuote(c)) {
        end = i + 1;
        break;
      }
    }
  }

  return chars.slice(start, end).join("").trim();
}

const SNIPPET_WINDOW = 150;

/**
 * Carve a ~150-char window around the first occurrence of any match term
 * in `text`, then snap it to sentence/quote boundaries.
 */
export function carveSnippet(text: string, matchTerms: string[]): string {
  if (matchTerms.length === 0) {
    const head = text.slice(0, SNIPPET_WINDOW);
    return snapToPunctuation(text, head);
  }

  const lower = text.toLowerCase();
  let firstIdx = -1;
  let firstLen = 0;
  for (const term of matchTerms) {
    const t = term.toLowerCase();
    const idx = lower.indexOf(t);
    if (idx !== -1 && (firstIdx === -1 || idx < firstIdx)) {
      firstIdx = idx;
      firstLen = t.length;
    }
  }

  if (firstIdx === -1) {
    const head = text.slice(0, SNIPPET_WINDOW);
    return snapToPunctuation(text, head);
  }

  const half = Math.floor(SNIPPET_WINDOW / 2);
  const start = Math.max(0, firstIdx - half);
  const end = Math.min(text.length, firstIdx + firstLen + half);
  const window = text.slice(start, end);
  return snapToPunctuation(text, window);
}
