import { test, expect } from "@playwright/test";

// Validates the refactored module build boots and starts a run without JS errors.
test("game boots, starts a run and draws the dungeon", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  await page.goto("/");

  // Menu overlay is shown with the journey button
  await expect(page.locator("#menuOverlay")).toBeVisible();
  await expect(page.locator("#menuPlayBtn")).toContainText("INICIAR JORNADA");

  // Start the intro cinematic and advance it
  await page.locator("#menuPlayBtn").click();
  await expect(page.locator("#introAdvanceBtn")).toBeVisible();
  await page.locator("#introAdvanceBtn").click();

  // Class select screen
  await expect(page.locator("#characterSelectView")).toBeVisible();
  await page.locator(".classCard").first().click();

  // HUD stats should populate once the run starts
  await expect(page.locator("#stats")).toContainText("PV");
  await page.waitForTimeout(1500);

  expect(pageErrors).toEqual([]);
});
