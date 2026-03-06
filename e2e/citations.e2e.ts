import { $, expect } from "@wdio/globals";
import { jsClick } from "./helpers.js";

describe("Citations panel", () => {
  it("should not show citations panel by default", async () => {
    const panel = await $('[data-testid="citations-panel"]');
    await expect(panel).not.toBeDisplayed();
  });

  it("should show citations panel when toggled", async () => {
    const citationsBtn = await $('[data-testid="toolbar-citations-btn"]');
    await jsClick(citationsBtn);

    const panel = await $('[data-testid="citations-panel"]');
    await expect(panel).toBeDisplayed();
  });

  it("should show bibliography header", async () => {
    const header = await $('[data-testid="citations-panel"] h3');
    const text = await header.getText();
    expect(text.toLowerCase()).toBe("bibliography");
  });

  it("should hide citations panel when toggled again", async () => {
    const citationsBtn = await $('[data-testid="toolbar-citations-btn"]');
    await jsClick(citationsBtn);

    const panel = await $('[data-testid="citations-panel"]');
    await expect(panel).not.toBeDisplayed();
  });
});
