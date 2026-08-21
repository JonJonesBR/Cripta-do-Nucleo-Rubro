import { test, expect } from "@playwright/test";

async function startRun(page) {
  await page.goto("/");
  await page.locator("#menuPlayBtn").click();
  await page.locator("#introAdvanceBtn").click();
  await page.locator(".classCard").first().click();
  await page.locator("#startJourneyBtn").click();
  await page.waitForTimeout(1200);
}

test("cinema: boss intro triggers letterbox, zoom and tremor", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRun(page);
  const result = await page.evaluate(() => window.__GAME__.debugCinema("bossIntro"));
  expect(result).toBe("ok");
  const c = await page.evaluate(() => window.__GAME__.cinema);
  expect(c.bossZoom).toBeGreaterThan(0);
  expect(c.tremor).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.__GAME__.cinema.letterbox)).toBeGreaterThan(0.5);
  expect(errors).toEqual([]);
});

test("cinema: floor transition triggers letterbox sweep and scale-in", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRun(page);
  const result = await page.evaluate(() => window.__GAME__.debugCinema("sweep"));
  expect(result).toBe("ok");
  const c = await page.evaluate(() => window.__GAME__.cinema);
  expect(c.floorSweep).toBeGreaterThan(0);
  expect(c.floorScale).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("cinema: surge triggers shockwave and scanline boost", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRun(page);
  const result = await page.evaluate(() => window.__GAME__.debugCinema("surge"));
  expect(result).toBe("ok");
  await expect.poll(() => page.evaluate(() => window.__GAME__.cinema.surgeFx)).toBeGreaterThan(0);
  const c = await page.evaluate(() => window.__GAME__.cinema);
  expect(c.surgeScanline).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("cinema: low HP draws red tension vignette state without errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRun(page);
  await page.evaluate(() => window.__GAME__.debugForceCombat("goblin", "turn"));
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__GAME__.debugSetEnemyHpRatio(0.99));
  // Damage the player below 30% HP so the tension vignette path executes.
  await page.evaluate(() => { const g = window.__GAME__; g.playerStamina; });
  await expect.poll(() => page.evaluate(() => window.__GAME__.state)).toBe("combat");
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);
});