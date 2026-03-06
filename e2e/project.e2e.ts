import { $, expect } from "@wdio/globals";
import { jsClick } from "./helpers.js";

describe("Project management", () => {
  it("should switch to Projects tab", async () => {
    const projectsTab = await $('[data-testid="library-tab-projects"]');
    await projectsTab.waitForExist({ timeout: 5000 });
    await jsClick(projectsTab);

    const tabClass = await projectsTab.getAttribute("class");
    expect(tabClass).toContain("library-panel__tab--active");
  });

  it("should show New button in projects view", async () => {
    const newBtn = await $('[data-testid="project-new-btn"]');
    await newBtn.waitForExist({ timeout: 5000 });
    await expect(newBtn).toBeDisplayed();
  });

  it("should open create form when clicking New", async () => {
    const newBtn = await $('[data-testid="project-new-btn"]');
    await newBtn.waitForExist({ timeout: 5000 });
    await jsClick(newBtn);

    const input = await $(".library-project__input");
    await input.waitForExist({ timeout: 5000 });
    await expect(input).toBeDisplayed();
  });

  it("should show the project name in toolbar", async () => {
    const projectName = await $('[data-testid="toolbar-project-name"]');
    await expect(projectName).toBeDisplayed();
  });

  it("should show save status", async () => {
    const saveStatus = await $('[data-testid="toolbar-save-status"]');
    await expect(saveStatus).toBeDisplayed();
  });
});
