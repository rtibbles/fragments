import { $, expect } from "@wdio/globals";
import { jsSetValue, jsClick } from "./helpers.js";

describe("Search panel", () => {
  it("should display the search input", async () => {
    const searchInput = await $('[data-testid="search-input"]');
    await expect(searchInput).toBeDisplayed();
  });

  it("should show placeholder text", async () => {
    const searchInput = await $('[data-testid="search-input"]');
    const placeholder = await searchInput.getAttribute("placeholder");
    expect(placeholder).toBe("Search fragments...");
  });

  it("should show no results for a query with empty corpus", async () => {
    const searchInput = await $('[data-testid="search-input"]');
    await jsSetValue(searchInput, "test query");

    // Wait for debounced search
    await $(".search-panel__empty").waitForDisplayed({ timeout: 5000 });
    const empty = await $(".search-panel__empty");
    await expect(empty).toHaveText("No results found");
  });

  it("should display the highlights-only checkbox", async () => {
    const checkbox = await $('[data-testid="search-highlights-checkbox"]');
    await expect(checkbox).toBeDisplayed();
  });

  it("should toggle highlights-only filter", async () => {
    const checkbox = await $('[data-testid="search-highlights-checkbox"]');
    await jsClick(checkbox);

    const isChecked = await checkbox.isSelected();
    expect(isChecked).toBe(true);

    await jsClick(checkbox);
    const isUnchecked = await checkbox.isSelected();
    expect(isUnchecked).toBe(false);
  });
});
