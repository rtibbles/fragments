import { useEffect, useState, useRef } from "react";
import type { Editor } from "@tiptap/react";
import "./SectionNav.css";

interface SectionItem {
  id: string;
  label: string;
  level: number;
  pos: number;
}

interface SectionNavProps {
  editor: Editor;
}

function sectionsEqual(a: SectionItem[], b: SectionItem[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].label !== b[i].label || a[i].level !== b[i].level || a[i].pos !== b[i].pos) {
      return false;
    }
  }
  return true;
}

export function SectionNav({ editor }: SectionNavProps) {
  const [sections, setSections] = useState<SectionItem[]>([]);
  const prevSectionsRef = useRef<SectionItem[]>(sections);

  useEffect(() => {
    const updateSections = () => {
      const items: SectionItem[] = [];
      let sectionCount = 0;

      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "heading") {
          items.push({
            id: `heading-${pos}`,
            label: node.textContent || "Untitled",
            level: node.attrs.level as number,
            pos,
          });
        } else if (node.type.name === "horizontalRule") {
          sectionCount++;
          items.push({
            id: `section-${pos}`,
            label: `Section ${sectionCount}`,
            level: 0,
            pos,
          });
        }
      });

      if (!sectionsEqual(items, prevSectionsRef.current)) {
        prevSectionsRef.current = items;
        setSections(items);
      }
    };

    updateSections();
    editor.on("update", updateSections);
    return () => {
      editor.off("update", updateSections);
    };
  }, [editor]);

  if (sections.length === 0) return null;

  const scrollTo = (pos: number) => {
    editor.chain().focus().setTextSelection(pos).run();
    const domPos = editor.view.coordsAtPos(pos);
    const editorEl = editor.view.dom.closest(".editor-panel__content");
    if (editorEl) {
      editorEl.scrollTo({
        top: editorEl.scrollTop + domPos.top - editorEl.getBoundingClientRect().top - 20,
        behavior: "smooth",
      });
    }
  };

  return (
    <div className="section-nav">
      <div className="section-nav__title">Outline</div>
      {sections.map((item) => (
        <button
          key={item.id}
          className={`section-nav__item section-nav__item--level-${item.level}`}
          onClick={() => scrollTo(item.pos)}
          title={item.label}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
