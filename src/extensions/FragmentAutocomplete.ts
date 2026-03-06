import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { invoke } from "@tauri-apps/api/core";
import { createRoot } from "react-dom/client";
import { createElement } from "react";
import {
  AutocompleteDropdown,
  type AutocompleteItem,
} from "./AutocompleteDropdown";
import type { SearchResultData } from "../types/search";
import "./AutocompleteDropdown.css";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fragmentAutocomplete: {
      toggleAutocomplete: () => ReturnType;
    };
  }
}

interface AutocompleteState {
  active: boolean;
  items: AutocompleteItem[];
  ghostText: string;
  cursorPos: number;
  queryStartPos: number;
  queryText: string;
}

const CLEAR_STATE: AutocompleteState = {
  active: false,
  items: [],
  ghostText: "",
  cursorPos: 0,
  queryStartPos: 0,
  queryText: "",
};

const autocompletePluginKey = new PluginKey<AutocompleteState>(
  "fragmentAutocomplete"
);

export const FragmentAutocomplete = Extension.create({
  name: "fragmentAutocomplete",

  addStorage() {
    return {
      enabled: true,
      debounceTimer: null as ReturnType<typeof setTimeout> | null,
      dropdownContainer: null as HTMLDivElement | null,
      dropdownRoot: null as ReturnType<typeof createRoot> | null,
    };
  },

  addCommands() {
    return {
      toggleAutocomplete:
        () =>
        ({ editor }) => {
          const storage = (editor.storage as Record<string, any>).fragmentAutocomplete;
          storage.enabled = !storage.enabled;
          if (!storage.enabled) {
            // Clear autocomplete state
            const { view } = editor;
            view.dispatch(
              view.state.tr.setMeta(autocompletePluginKey, CLEAR_STATE)
            );
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const extension = this;

    return [
      new Plugin<AutocompleteState>({
        key: autocompletePluginKey,

        state: {
          init(): AutocompleteState {
            return { ...CLEAR_STATE };
          },

          apply(tr, prev): AutocompleteState {
            const meta = tr.getMeta(autocompletePluginKey);
            if (meta) return meta;
            // If document changed, clear suggestions
            if (tr.docChanged) {
              return { ...CLEAR_STATE };
            }
            return prev;
          },
        },

        props: {
          decorations(state) {
            const pluginState = autocompletePluginKey.getState(state);
            if (!pluginState?.active || !pluginState.ghostText) {
              return DecorationSet.empty;
            }

            const widget = Decoration.widget(
              pluginState.cursorPos,
              () => {
                const span = document.createElement("span");
                span.className = "autocomplete-ghost";
                span.textContent = pluginState.ghostText;
                return span;
              },
              { side: 1 }
            );

            return DecorationSet.create(state.doc, [widget]);
          },

          handleKeyDown(view, event) {
            const pluginState = autocompletePluginKey.getState(view.state);
            if (!pluginState?.active) return false;

            if (event.key === "Tab") {
              event.preventDefault();
              // Accept the top suggestion — replace query text with fragment node
              const item = pluginState.items[0];
              if (item) {
                const { state } = view;
                const fragmentType = state.schema.nodes.fragment;
                if (fragmentType) {
                  const node = fragmentType.create({
                    sourceId: item.sourceId,
                    sourceTitle: item.sourceTitle,
                    pageNumber: item.pageNumber,
                    originalText: item.text,
                    displayText: item.text,
                    edited: false,
                    rowId: item.rowId,
                  });
                  const tr = state.tr.replaceWith(
                    pluginState.queryStartPos,
                    pluginState.cursorPos,
                    node
                  );
                  tr.setMeta(autocompletePluginKey, CLEAR_STATE);
                  view.dispatch(tr);
                }
              }
              return true;
            }

            if (event.key === "Escape") {
              view.dispatch(
                view.state.tr.setMeta(autocompletePluginKey, CLEAR_STATE)
              );
              return true;
            }

            return false;
          },
        },

        view(editorView) {
          // Create dropdown container
          const container = document.createElement("div");
          container.style.position = "absolute";
          container.style.zIndex = "1000";
          container.style.display = "none";
          document.body.appendChild(container);
          const root = createRoot(container);

          extension.storage.dropdownContainer = container;
          extension.storage.dropdownRoot = root;

          function updateDropdown() {
            const pluginState = autocompletePluginKey.getState(
              editorView.state
            );
            if (
              !pluginState?.active ||
              pluginState.items.length <= 1
            ) {
              container.style.display = "none";
              return;
            }

            // Position below cursor
            const coords = editorView.coordsAtPos(pluginState.cursorPos);
            container.style.left = `${coords.left}px`;
            container.style.top = `${coords.bottom + 4}px`;
            container.style.display = "block";

            root.render(
              createElement(AutocompleteDropdown, {
                items: pluginState.items,
                onSelect: (item: AutocompleteItem) => {
                  const currentState = autocompletePluginKey.getState(
                    editorView.state
                  );
                  if (!currentState?.active) return;
                  const { state } = editorView;
                  const fragmentType = state.schema.nodes.fragment;
                  if (fragmentType) {
                    const node = fragmentType.create({
                      sourceId: item.sourceId,
                      sourceTitle: item.sourceTitle,
                      pageNumber: item.pageNumber,
                      originalText: item.text,
                      displayText: item.text,
                      edited: false,
                      rowId: item.rowId,
                    });
                    const tr = state.tr.replaceWith(
                      currentState.queryStartPos,
                      currentState.cursorPos,
                      node
                    );
                    tr.setMeta(autocompletePluginKey, CLEAR_STATE);
                    editorView.dispatch(tr);
                  }
                },
              })
            );
          }

          return {
            update(view) {
              if (!extension.storage.enabled) {
                container.style.display = "none";
                return;
              }

              // Debounce search based on text before cursor
              if (extension.storage.debounceTimer) {
                clearTimeout(extension.storage.debounceTimer);
              }

              const { state } = view;
              const { selection } = state;
              if (!selection.empty) {
                container.style.display = "none";
                return;
              }

              const pos = selection.from;
              const resolved = state.doc.resolve(pos);
              // Use "\n" as leaf text so atom nodes map 1:1 to positions
              const textBefore = resolved.parent.textBetween(
                0,
                resolved.parentOffset,
                "\n",
                "\n"
              );

              // Match last 1-4 words before cursor
              const match = textBefore.match(/(\S+(?:\s+\S+){0,3})\s*$/);
              if (!match || match[1].length < 3) {
                container.style.display = "none";
                return;
              }

              const queryText = match[1];
              const queryStartPos = resolved.start() + match.index!;

              extension.storage.debounceTimer = setTimeout(async () => {
                try {
                  const results = await invoke<SearchResultData[]>(
                    "search_corpus",
                    {
                      query: queryText,
                      highlightsOnly: false,
                      limit: 8,
                    }
                  );

                  if (results.length === 0) {
                    view.dispatch(
                      view.state.tr.setMeta(autocompletePluginKey, {
                        ...CLEAR_STATE,
                        cursorPos: pos,
                      })
                    );
                    return;
                  }

                  const items: AutocompleteItem[] = results.map((r) => ({
                    text: r.extract,
                    sourceTitle: r.source_title,
                    sourceId: r.source_id,
                    pageNumber: r.page_number,
                    isHighlight: r.is_highlight,
                    rowId: r.row_id,
                  }));

                  // Truncate ghost text to ~40 chars
                  const ghostText =
                    items[0].text.length > 40
                      ? items[0].text.slice(0, 40) + "…"
                      : items[0].text;

                  view.dispatch(
                    view.state.tr.setMeta(autocompletePluginKey, {
                      active: true,
                      items,
                      ghostText,
                      cursorPos: pos,
                      queryStartPos,
                      queryText,
                    })
                  );
                } catch {
                  // Search failed, ignore
                }
              }, 400);

              updateDropdown();
            },

            destroy() {
              if (extension.storage.debounceTimer) {
                clearTimeout(extension.storage.debounceTimer);
              }
              root.unmount();
              container.remove();
            },
          };
        },
      }),
    ];
  },
});
