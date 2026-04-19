import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import "./FragmentNode.css";

/**
 * Fragment NodeView with inline editing.
 *
 * The fragment is a ProseMirror atom node. Clicks inside it would normally
 * trigger PM's node-selection, then Backspace deletes the whole thing. PM's
 * keydown/mousedown listeners are attached to the editor DOM, which sits
 * *between* our fragment and React's root listener — so React's own
 * stopPropagation is too late.
 *
 * Fix: register NATIVE (not React) event listeners via useEffect+ref on the
 * clickable text and on the edit input. They stopPropagation before the
 * event bubbles up to PM, and they drive the state changes directly.
 */
export function FragmentNodeView({ node, updateAttributes, editor }: NodeViewProps) {
  const displayText: string = node.attrs.displayText || node.attrs.originalText;
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(displayText);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const dissolveRef = useRef<HTMLButtonElement | null>(null);

  const commit = useCallback(() => {
    const next = editText.trim();
    if (next && next !== displayText) {
      updateAttributes({
        displayText: next,
        edited: next !== node.attrs.originalText,
      });
    }
    setIsEditing(false);
  }, [editText, displayText, node.attrs.originalText, updateAttributes]);

  const cancel = useCallback(() => {
    setEditText(displayText);
    setIsEditing(false);
  }, [displayText]);

  const dissolve = useCallback(() => {
    const selector = `[data-fragment-id="${node.attrs.docId}:${node.attrs.pageNumber}"]`;
    const target = editor.view.dom.querySelector(selector);
    if (!target) return;
    const pos = editor.view.posAtDOM(target, 0);
    editor.chain().focus().setTextSelection(pos).run();
    editor.commands.dissolveFragment();
  }, [editor, node.attrs.docId, node.attrs.pageNumber]);

  // --- click on text → enter edit mode ---
  useEffect(() => {
    if (isEditing) return;
    const el = textRef.current;
    if (!el) return;
    const onMouseDown = (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setEditText(displayText);
      setIsEditing(true);
    };
    el.addEventListener("mousedown", onMouseDown);
    return () => el.removeEventListener("mousedown", onMouseDown);
  }, [isEditing, displayText]);

  // --- dissolve button → native mousedown (bypass PM node selection) ---
  useEffect(() => {
    const btn = dissolveRef.current;
    if (!btn) return;
    const onMouseDown = (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      dissolve();
    };
    btn.addEventListener("mousedown", onMouseDown);
    return () => btn.removeEventListener("mousedown", onMouseDown);
  }, [dissolve]);

  // --- while editing, intercept all keyboard + mousedown on the input so PM
  //     doesn't see them. Handle Enter/Escape here too. ---
  useEffect(() => {
    if (!isEditing) return;
    const input = inputRef.current;
    if (!input) return;

    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      e.stopPropagation();
    };
    const onBlur = () => commit();

    input.addEventListener("keydown", onKey);
    input.addEventListener("keyup", onKey);
    input.addEventListener("keypress", onKey);
    input.addEventListener("mousedown", onMouseDown);
    input.addEventListener("blur", onBlur);

    input.focus();
    input.select();

    return () => {
      input.removeEventListener("keydown", onKey);
      input.removeEventListener("keyup", onKey);
      input.removeEventListener("keypress", onKey);
      input.removeEventListener("mousedown", onMouseDown);
      input.removeEventListener("blur", onBlur);
    };
  }, [isEditing, commit, cancel]);

  return (
    <NodeViewWrapper
      as="span"
      className={`fragment-node ${node.attrs.edited ? "fragment-node--edited" : ""}`}
      data-fragment-id={`${node.attrs.docId}:${node.attrs.pageNumber}`}
      contentEditable={false}
    >
      <span className="fragment-node__inner">
        {isEditing ? (
          <input
            ref={inputRef}
            className="fragment-node__edit-input"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            style={{ width: `${Math.max(editText.length, 8)}ch` }}
          />
        ) : (
          <span
            ref={textRef}
            className="fragment-node__text"
            title="Click to edit"
          >
            {displayText}
          </span>
        )}
        <button
          ref={dissolveRef}
          className="fragment-node__btn fragment-node__btn--dissolve"
          title="Dissolve to plain text"
          aria-label="Dissolve fragment"
        >
          ×
        </button>
      </span>
      <span
        className="fragment-node__source"
        title={`${node.attrs.sourceTitle}, p. ${node.attrs.pageNumber}`}
      >
        {node.attrs.sourceTitle}
      </span>
    </NodeViewWrapper>
  );
}
