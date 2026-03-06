import { browser, $, expect } from "@wdio/globals";
import { jsClick } from "./helpers.js";

describe("Editor", () => {
  it("should allow typing text", async () => {
    const editorContent = await $('[data-testid="editor-content"] .ProseMirror');
    await editorContent.waitForExist({ timeout: 5000 });

    await browser.execute(() => {
      const editor = document.querySelector('[data-testid="editor-content"] .ProseMirror') as HTMLElement;
      editor.focus();
      document.execCommand("insertText", false, "Hello, Fragments!");
    });

    const text = await editorContent.getText();
    expect(text).toContain("Hello, Fragments!");
  });

  it("should apply bold formatting to selected text", async () => {
    // Use execCommand("bold") directly — toolbar click requires window focus
    // which is unreliable when multiple app instances run in parallel
    const hasBold = await browser.execute(() => {
      const editor = document.querySelector('[data-testid="editor-content"] .ProseMirror') as HTMLElement;
      editor.focus();
      document.execCommand("selectAll");
      document.execCommand("delete");
      document.execCommand("insertText", false, "Bold test");
      document.execCommand("selectAll");
      document.execCommand("bold");
      return editor.querySelector("strong") !== null;
    });
    expect(hasBold).toBe(true);
  });

  it("should apply italic formatting to selected text", async () => {
    const hasItalic = await browser.execute(() => {
      const editor = document.querySelector('[data-testid="editor-content"] .ProseMirror') as HTMLElement;
      editor.focus();
      document.execCommand("selectAll");
      document.execCommand("delete");
      document.execCommand("insertText", false, "Italic test");
      document.execCommand("selectAll");
      document.execCommand("italic");
      return editor.querySelector("em") !== null;
    });
    expect(hasItalic).toBe(true);
  });

  it("should toggle heading 1", async () => {
    const editorContent = await $('[data-testid="editor-content"] .ProseMirror');
    await editorContent.waitForExist({ timeout: 5000 });
    await jsClick(editorContent);

    const h1Btn = await $('[data-testid="editor-btn-h1"]');
    await jsClick(h1Btn);

    const isActive = await h1Btn.getAttribute("class");
    expect(isActive).toContain("editor-btn--active");
  });

  it("should insert a section divider", async () => {
    const editorContent = await $('[data-testid="editor-content"] .ProseMirror');
    await editorContent.waitForExist({ timeout: 5000 });
    await jsClick(editorContent);

    const hrBtn = await $('[data-testid="editor-btn-hr"]');
    await jsClick(hrBtn);

    const hasHr = await browser.execute(() => {
      return document.querySelector('[data-testid="editor-content"] .ProseMirror hr') !== null;
    });
    expect(hasHr).toBe(true);
  });
});
