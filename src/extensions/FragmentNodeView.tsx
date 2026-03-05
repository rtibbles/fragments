import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { useState } from "react";
import "./FragmentNode.css";

export function FragmentNodeView({ node, updateAttributes, editor }: NodeViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(node.attrs.displayText || node.attrs.originalText);
  const [showControls, setShowControls] = useState(false);

  const displayText = node.attrs.displayText || node.attrs.originalText;

  const handleEdit = () => {
    setEditText(displayText);
    setIsEditing(true);
  };

  const handleSave = () => {
    updateAttributes({
      displayText: editText,
      edited: editText !== node.attrs.originalText,
    });
    setIsEditing(false);
  };

  const handleDissolve = () => {
    const pos = editor.view.posAtDOM(editor.view.dom.querySelector(`[data-fragment-id="${node.attrs.rowId}"]`)!, 0);
    editor.chain().focus().setTextSelection(pos).run();
    editor.commands.dissolveFragment();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      setIsEditing(false);
    }
  };

  return (
    <NodeViewWrapper
      as="span"
      className={`fragment-node ${node.attrs.edited ? "fragment-node--edited" : ""}`}
      data-fragment-id={node.attrs.rowId}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      <span className="fragment-node__inner">
        {isEditing ? (
          <input
            className="fragment-node__edit-input"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        ) : (
          <span className="fragment-node__text">{displayText}</span>
        )}
        {showControls && !isEditing && (
          <span className="fragment-node__controls">
            <button
              className="fragment-node__btn"
              onClick={handleEdit}
              title="Edit text"
            >
              e
            </button>
            <button
              className="fragment-node__btn"
              onClick={handleDissolve}
              title="Dissolve to plain text"
            >
              d
            </button>
          </span>
        )}
      </span>
      <span className="fragment-node__source" title={`${node.attrs.sourceTitle}, p. ${node.attrs.pageNumber}`}>
        {node.attrs.sourceTitle}
      </span>
    </NodeViewWrapper>
  );
}
