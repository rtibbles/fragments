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
import "./AutocompleteDropdown.css";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fragmentAutocomplete: {
      toggleAutocomplete: () => ReturnType;
    };
  }
}

interface SearchResultData {
  text: string;
  source_title: string;
  source_id: number;
  page_number: number;
  is_highlight: boolean;
  row_id: number;
  score: number;
}

interface AutocompleteState {
  active: boolean;
  items: AutocompleteItem[];
  ghostText: string;
  cursorPos: number;
  queryText: string;
}

const autocompletePluginKey = new PluginKey<AutocompleteState>(
  "fragmentAutocomplete"
);

function getLastWords(text: string, count: number): string {
  const words = text.trim().split(/\s+/);
  return words.slice(-count).join(" ");
}

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
              view.state.tr.setMeta(autocompletePluginKey, {
                active: false,
                items: [],
                ghostText: "",
                cursorPos: 0,
                queryText: "",
              })
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
            return {
              active: false,
              items: [],
              ghostText: "",
              cursorPos: 0,
              queryText: "",
            };
          },

          apply(tr, prev): AutocompleteState {
            const meta = tr.getMeta(autocompletePluginKey);
            if (meta) return meta;
            // If document changed, clear suggestions
            if (tr.docChanged) {
              return {
                active: false,
                items: [],
                ghostText: "",
                cursorPos: 0,
                queryText: "",
              };
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
              // Accept the top suggestion — insert a fragment node
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
                  const tr = state.tr.insert(pluginState.cursorPos, node);
                  tr.setMeta(autocompletePluginKey, {
                    active: false,
                    items: [],
                    ghostText: "",
                    cursorPos: 0,
                    queryText: "",
                  });
                  view.dispatch(tr);
                }
              }
              return true;
            }

            if (event.key === "Escape") {
              view.dispatch(
                view.state.tr.setMeta(autocompletePluginKey, {
                  active: false,
                  items: [],
                  ghostText: "",
                  cursorPos: 0,
                  queryText: "",
                })
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
                    const tr = state.tr.insert(pluginState.cursorPos, node);
                    tr.setMeta(autocompletePluginKey, {
                      active: false,
                      items: [],
                      ghostText: "",
                      cursorPos: 0,
                      queryText: "",
                    });
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
              const textBefore = resolved.parent.textBetween(
                0,
                resolved.parentOffset,
                " "
              );

              const queryText = getLastWords(textBefore, 4);
              if (queryText.length < 3) {
                container.style.display = "none";
                return;
              }

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
                        active: false,
                        items: [],
                        ghostText: "",
                        cursorPos: pos,
                        queryText: "",
                      })
                    );
                    return;
                  }

                  const items: AutocompleteItem[] = results.map((r) => ({
                    text: r.text,
                    sourceTitle: r.source_title,
                    sourceId: r.source_id,
                    pageNumber: r.page_number,
                    isHighlight: r.is_highlight,
                    rowId: r.row_id,
                  }));

                  // Truncate ghost text to ~60 chars
                  const ghostText =
                    items[0].text.length > 60
                      ? items[0].text.slice(0, 60) + "…"
                      : items[0].text;

                  view.dispatch(
                    view.state.tr.setMeta(autocompletePluginKey, {
                      active: true,
                      items,
                      ghostText,
                      cursorPos: pos,
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
