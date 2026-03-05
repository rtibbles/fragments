import { useEffect, useState } from "react";
import "./AutocompleteDropdown.css";

export interface AutocompleteItem {
  text: string;
  sourceTitle: string;
  sourceId: number;
  pageNumber: number;
  isHighlight: boolean;
  rowId: number;
}

interface AutocompleteDropdownProps {
  items: AutocompleteItem[];
  onSelect: (item: AutocompleteItem) => void;
}

export function AutocompleteDropdown({
  items,
  onSelect,
}: AutocompleteDropdownProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [items]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, items.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && items[activeIndex]) {
        e.preventDefault();
        onSelect(items[activeIndex]);
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [items, activeIndex, onSelect]);

  if (items.length === 0) return null;

  return (
    <div className="autocomplete-dropdown">
      {items.map((item, i) => (
        <div
          key={`${item.rowId}-${item.isHighlight}`}
          className={`autocomplete-dropdown__item ${i === activeIndex ? "autocomplete-dropdown__item--active" : ""}`}
          onMouseEnter={() => setActiveIndex(i)}
          onClick={() => onSelect(item)}
        >
          <div className="autocomplete-dropdown__text">{item.text}</div>
          <div className="autocomplete-dropdown__meta">
            {item.sourceTitle}
            {item.pageNumber > 0 && ` · p. ${item.pageNumber}`}
            {item.isHighlight && " · Highlight"}
          </div>
        </div>
      ))}
    </div>
  );
}
