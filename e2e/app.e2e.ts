import { $, expect } from "@wdio/globals";

describe("App launch", () => {
  it("should render the toolbar", async () => {
    const toolbar = await $('[data-testid="toolbar"]');
    await expect(toolbar).toBeDisplayed();
  });

  it("should show the app title", async () => {
    const title = await $(".toolbar__title");
    await expect(title).toHaveText("Fragments");
  });

  it("should render the library panel", async () => {
    const library = await $('[data-testid="library-panel"]');
    await expect(library).toBeDisplayed();
  });

  it("should render the editor panel", async () => {
    const editor = await $('[data-testid="editor-panel"]');
    await expect(editor).toBeDisplayed();
  });

  it("should render the search panel", async () => {
    const search = await $('[data-testid="search-panel"]');
    await expect(search).toBeDisplayed();
  });

  it("should render the editor toolbar with formatting buttons", async () => {
    const toolbar = await $('[data-testid="editor-toolbar"]');
    await expect(toolbar).toBeDisplayed();

    const boldBtn = await $('[data-testid="editor-btn-bold"]');
    await expect(boldBtn).toBeDisplayed();

    const italicBtn = await $('[data-testid="editor-btn-italic"]');
    await expect(italicBtn).toBeDisplayed();
  });
});
