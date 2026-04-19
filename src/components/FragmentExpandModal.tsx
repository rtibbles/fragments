import { useEffect, useLayoutEffect, useRef } from "react";
import { useCorpusContext } from "../context/CorpusContext";
import "./FragmentExpandModal.css";

export interface ExpandResult {
  text: string;
  pageNumber: number;
}

interface Props {
  docId: string;
  pageNumber: number;
  originalText: string;
  onApply: (r: ExpandResult) => void;
  onCancel: () => void;
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function FragmentExpandModal({
  docId,
  pageNumber,
  originalText,
  onApply,
  onCancel,
}: Props) {
  const corpus = useCorpusContext();
  const doc = corpus.status === "ready" ? corpus.byId(docId) : undefined;
  const bodyRef = useRef<HTMLDivElement>(null);
  const chunkTextRefs = useRef<Map<number, HTMLSpanElement>>(new Map());

  useLayoutEffect(() => {
    if (!doc) return;
    const span = chunkTextRefs.current.get(pageNumber);
    const body = bodyRef.current;
    if (!span || !body) return;
    const text = span.textContent ?? "";
    const idx = text.indexOf(originalText);
    const textNode = span.firstChild;
    if (idx < 0 || !textNode) {
      span.scrollIntoView({ block: "center" });
      return;
    }
    const range = document.createRange();
    range.setStart(textNode, idx);
    range.setEnd(textNode, idx + originalText.length);
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
    const rect = range.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    body.scrollTop += rect.top - bodyRect.top - body.clientHeight / 3;
  }, [doc, pageNumber, originalText]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel]);

  const handleApply = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const text = normalizeWhitespace(sel.toString());
    if (!text) return;
    let node: Node | null = sel.anchorNode;
    let el: HTMLElement | null = null;
    while (node) {
      if (node instanceof HTMLElement) {
        el = node;
        break;
      }
      node = node.parentNode;
    }
    while (el && !el.dataset?.page) el = el.parentElement;
    const page = el?.dataset?.page ? Number(el.dataset.page) : pageNumber;
    onApply({ text, pageNumber: page });
  };

  if (corpus.status !== "ready" || !doc) return null;

  return (
    <div className="expand-modal__backdrop" onMouseDown={onCancel}>
      <div
        className="expand-modal"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Expand quote"
      >
        <div className="expand-modal__header">
          <div className="expand-modal__title">{doc.title}</div>
          <button
            className="expand-modal__close"
            onClick={onCancel}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="expand-modal__body" ref={bodyRef}>
          {doc.chunks.map((chunk) => (
            <div
              key={chunk.page}
              className="expand-modal__chunk"
              data-page={chunk.page}
            >
              <div className="expand-modal__page-marker">p. {chunk.page}</div>
              <span
                className="expand-modal__chunk-text"
                ref={(el) => {
                  if (el) chunkTextRefs.current.set(chunk.page, el);
                  else chunkTextRefs.current.delete(chunk.page);
                }}
              >
                {normalizeWhitespace(chunk.text)}
              </span>
            </div>
          ))}
        </div>
        <div className="expand-modal__footer">
          <span className="expand-modal__hint">
            Drag to adjust the selection, then apply.
          </span>
          <button
            className="expand-modal__cancel"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="expand-modal__apply"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleApply}
          >
            Use selection
          </button>
        </div>
      </div>
    </div>
  );
}
