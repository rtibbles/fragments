import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import "./FragmentNode.css";

export function FragmentNodeView({ node, updateAttributes, editor }: NodeViewProps) {
  const displayText: string = node.attrs.displayText || node.attrs.originalText;
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(displayText);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      const input = inputRef.current;
      input.focus();
      input.select();
    }
  }, [isEditing]);

  const commit = () => {
    const next = editText.trim();
    if (next && next !== displayText) {
      updateAttributes({
        displayText: next,
        edited: next !== node.attrs.originalText,
      });
    }
    setIsEditing(false);
  };

  const cancel = () => {
    setEditText(displayText);
    setIsEditing(false);
  };

  const startEditing = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditText(displayText);
    setIsEditing(true);
  };

  const handleDissolve = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const selector = `[data-fragment-id="${node.attrs.docId}:${node.attrs.pageNumber}"]`;
    const target = editor.view.dom.querySelector(selector);
    if (!target) return;
    const pos = editor.view.posAtDOM(target, 0);
    editor.chain().focus().setTextSelection(pos).run();
    editor.commands.dissolveFragment();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // ProseMirror registers keydown handlers at the editor level — stop the
    // event from bubbling up or it'll treat Backspace/ArrowLeft etc. as
    // document-level commands on the atom node.
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  };

  const stopProseMirror = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

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
            onBlur={commit}
            onKeyDown={handleKeyDown}
            onMouseDown={stopProseMirror}
            onClick={stopProseMirror}
            style={{ width: `${Math.max(editText.length, 8)}ch` }}
          />
        ) : (
          <span
            className="fragment-node__text"
            onMouseDown={startEditing}
            title="Click to edit"
          >
            {displayText}
          </span>
        )}
        <button
          className="fragment-node__btn fragment-node__btn--dissolve"
          onMouseDown={handleDissolve}
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
