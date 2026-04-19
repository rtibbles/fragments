import { Mark, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import "./FragmentMark.css";

export const FRAGMENT_MARK_NAME = "fragment";
export const FRAGMENT_MIME_TYPE = "application/x-fragment";

export interface FragmentAttrs {
  docId: string;
  sourceTitle: string;
  pageNumber: number;
  originalText: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fragment: {
      /** Insert `text` at the current selection, wrapped in a fragment mark. */
      insertFragment: (attrs: FragmentAttrs & { text: string }) => ReturnType;
      /** Strip the fragment mark from the current selection (text stays). */
      dissolveFragment: () => ReturnType;
    };
  }
}

const footnoteKey = new PluginKey("fragmentFootnotes");

/**
 * Find every middle-deletion gap between `original` and `current`, returning
 * the offsets into `current` where ellipses belong.
 *
 * Prefix/suffix anchoring: we peel off the longest common prefix and the
 * longest common suffix. If that consumes all of `current`, any leftover
 * characters in `original` between the two form a single interior gap —
 * good. Otherwise, the middle of both strings still has content, so we
 * find the longest contiguous common substring (the "anchor"), split the
 * middle around it, and recurse on each side. The recursion terminates
 * when one side is empty (a gap) or the substrings exactly match.
 *
 * Why not plain LCS: LCS has many equivalent optimal alignments and
 * backtracking picks one that happens to produce scattered matches near
 * repeating letters (e.g. "Transparency" + "and" shares 'n' and 'a' with
 * the kept "Tran" prefix, so LCS can spread matches across the deleted
 * region). Anchoring on contiguous substrings avoids that.
 *
 * We emit no ellipsis for deletions at the outer edges of the fragment
 * (leading or trailing). If the user typed new characters in, the anchor
 * search fails and we bail out with an empty result.
 */
export function computeEllipsisOffsets(original: string, current: string): number[] {
  if (current === original) return [];
  if (current.length === 0 || current.length >= original.length) return [];

  // When a boundary character appears on both sides of a deletion, greedy
  // alignment is ambiguous. "The because" → "Thecause" can either be read
  // as "Th[e b]ecause" (suffix-first, ellipsis before the 'e') or
  // "The[ b]cause" (prefix-first, ellipsis before 'c'). Compute both and
  // pick whichever produces more interior ellipses; tie goes to
  // suffix-first (which keeps repeated boundary letters aligned to their
  // later occurrence, matching how users usually intend a deletion).
  const prefixFirst = tryAlign(original, current, /*prefixFirst=*/ true);
  const suffixFirst = tryAlign(original, current, /*prefixFirst=*/ false);
  return suffixFirst.length >= prefixFirst.length ? suffixFirst : prefixFirst;
}

function tryAlign(
  original: string,
  current: string,
  prefixFirst: boolean,
): number[] {
  const offsets: number[] = [];
  let ok = true;
  const walk = (oS: number, oE: number, cS: number, cE: number): void => {
    if (!ok) return;
    const oLen = oE - oS;
    const cLen = cE - cS;
    if (cLen === 0) {
      if (oLen > 0) offsets.push(cS);
      return;
    }
    if (oLen < cLen) {
      ok = false;
      return;
    }
    let p: number;
    let s: number;
    if (prefixFirst) {
      p = 0;
      while (p < cLen && p < oLen && original[oS + p] === current[cS + p]) p++;
      s = 0;
      while (
        s < cLen - p &&
        s < oLen - p &&
        original[oE - 1 - s] === current[cE - 1 - s]
      ) {
        s++;
      }
    } else {
      s = 0;
      while (s < cLen && s < oLen && original[oE - 1 - s] === current[cE - 1 - s]) s++;
      p = 0;
      while (
        p < cLen - s &&
        p < oLen - s &&
        original[oS + p] === current[cS + p]
      ) {
        p++;
      }
    }
    if (p + s === cLen) {
      if (oLen - p - s > 0) offsets.push(cS + p);
      return;
    }
    const anchor = longestCommonSubstring(
      original, oS + p, oE - s,
      current, cS + p, cE - s,
    );
    if (!anchor) {
      ok = false;
      return;
    }
    walk(oS + p, anchor.origPos, cS + p, anchor.curPos);
    walk(anchor.origPos + anchor.length, oE - s, anchor.curPos + anchor.length, cE - s);
  };
  walk(0, original.length, 0, current.length);
  if (!ok) return [];
  return offsets.filter((o) => o > 0 && o < current.length);
}

interface Anchor {
  origPos: number;
  curPos: number;
  length: number;
}

function longestCommonSubstring(
  a: string, aS: number, aE: number,
  b: string, bS: number, bE: number,
): Anchor | null {
  const m = aE - aS;
  const n = bE - bS;
  if (m === 0 || n === 0) return null;
  // Rolling two-row DP.
  let prev = new Uint32Array(n + 1);
  let curr = new Uint32Array(n + 1);
  let best = 0;
  let bestI = 0;
  let bestJ = 0;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[aS + i - 1] === b[bS + j - 1]) {
        curr[j] = prev[j - 1] + 1;
        if (curr[j] > best) {
          best = curr[j];
          bestI = i;
          bestJ = j;
        }
      } else {
        curr[j] = 0;
      }
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
    curr.fill(0);
  }
  if (best === 0) return null;
  return {
    origPos: aS + bestI - best,
    curPos: bS + bestJ - best,
    length: best,
  };
}

/**
 * Walk the doc in order, number each docId by first appearance, and emit a
 * widget decoration with the number as a superscript at the end of each
 * contiguous run of the fragment mark.
 */
function computeDecorations(doc: PMNode): DecorationSet {
  const numberByDocId = new Map<string, number>();
  const decorations: Decoration[] = [];

  let currentDocId: string | null = null;
  let currentEnd = 0;

  const flush = () => {
    if (currentDocId == null) return;
    const docId = currentDocId; // capture by value before mutation
    const end = currentEnd;
    const n = numberByDocId.get(docId)!;
    decorations.push(
      Decoration.widget(
        end,
        () => {
          const sup = document.createElement("sup");
          sup.className = "fragment-footnote";
          sup.setAttribute("data-fragment-num", String(n));
          sup.setAttribute("data-doc-id", docId);
          sup.textContent = String(n);
          sup.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            document.dispatchEvent(
              new CustomEvent("fragment-footnote-click", {
                detail: { docId },
              }),
            );
          });
          return sup;
        },
        { side: 1, key: `fn-${docId}-${end}` },
      ),
    );
    currentDocId = null;
  };

  doc.descendants((node, pos) => {
    if (!node.isText) {
      flush();
      return;
    }
    const mark = node.marks.find((m) => m.type.name === FRAGMENT_MARK_NAME);
    if (!mark) {
      flush();
      return;
    }
    const docId = mark.attrs.docId as string;
    if (!numberByDocId.has(docId)) {
      numberByDocId.set(docId, numberByDocId.size + 1);
    }
    if (currentDocId === docId) {
      currentEnd = pos + node.nodeSize;
    } else {
      flush();
      currentDocId = docId;
      currentEnd = pos + node.nodeSize;
    }

    // Middle-deletion ellipsis widgets — one per gap.
    const original = (mark.attrs.originalText as string) ?? "";
    const current = node.text ?? "";
    for (const offset of computeEllipsisOffsets(original, current)) {
      decorations.push(
        Decoration.widget(
          pos + offset,
          () => {
            const span = document.createElement("span");
            span.className = "fragment-ellipsis";
            span.textContent = "\u2026";
            return span;
          },
          { side: 0, key: `ell-${pos}-${offset}` },
        ),
      );
    }
  });
  flush();

  return DecorationSet.create(doc, decorations);
}

/**
 * Read the current docId → footnote-number mapping from the editor state.
 * Used by the CitationsPanel to show matching numbers.
 */
export function getFootnoteNumbers(doc: PMNode): Map<string, number> {
  const numberByDocId = new Map<string, number>();
  doc.descendants((node) => {
    if (!node.isText) return;
    const mark = node.marks.find((m) => m.type.name === FRAGMENT_MARK_NAME);
    if (!mark) return;
    const docId = mark.attrs.docId as string;
    if (!numberByDocId.has(docId)) {
      numberByDocId.set(docId, numberByDocId.size + 1);
    }
  });
  return numberByDocId;
}

export const FragmentMark = Mark.create({
  name: FRAGMENT_MARK_NAME,
  inclusive: false,
  excludes: "",

  addAttributes() {
    return {
      docId: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-doc-id") ?? "",
        renderHTML: (attrs) => ({ "data-doc-id": attrs.docId }),
      },
      sourceTitle: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-source-title") ?? "",
        renderHTML: (attrs) => ({ "data-source-title": attrs.sourceTitle }),
      },
      pageNumber: {
        default: 0,
        parseHTML: (el) => Number(el.getAttribute("data-page") ?? 0),
        renderHTML: (attrs) => ({ "data-page": String(attrs.pageNumber) }),
      },
      originalText: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-original-text") ?? "",
        renderHTML: (attrs) => ({ "data-original-text": attrs.originalText }),
      },
    };
  },

  parseHTML() {
    return [{ tag: `span[data-type="${FRAGMENT_MARK_NAME}"]` }];
  },

  renderHTML({ HTMLAttributes, mark }) {
    const title = `${mark.attrs.sourceTitle}, p. ${mark.attrs.pageNumber}`;
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-type": FRAGMENT_MARK_NAME,
        class: "fragment-mark",
        title,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      insertFragment:
        (attrs) =>
        ({ chain }) => {
          const { text, ...markAttrs } = attrs;
          return chain()
            .insertContent({
              type: "text",
              text,
              marks: [{ type: this.name, attrs: markAttrs }],
            })
            .run();
        },
      dissolveFragment:
        () =>
        ({ chain }) => chain().unsetMark(this.name, { extendEmptyMarkRange: true }).run(),
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: footnoteKey,
        state: {
          init: (_config, state) => computeDecorations(state.doc),
          apply: (tr, old) => (tr.docChanged ? computeDecorations(tr.doc) : old),
        },
        props: {
          decorations(state) {
            return footnoteKey.getState(state) as DecorationSet;
          },
        },
      }),
    ];
  },
});
