import { test, expect } from "@playwright/test";

async function startRun(page) {
  await page.goto("/");
  await page.locator("#menuPlayBtn").click();
  await page.locator("#introAdvanceBtn").click();
  await page.locator(".classCard").first().click();
  await page.locator("#startJourneyBtn").click();
  await page.waitForTimeout(1200);
}

test("action combo: consecutive attacks advance the combo step to finisher", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRun(page);
  await page.evaluate(() => window.__GAME__.debugForceCombat("golem", "action"));
  await expect.poll(() => page.evaluate(() => window.__GAME__.state)).toBe("combat");

  // Force the enemy close and take 3 consecutive hits within the combo window
  const step1 = await page.evaluate(() => window.__GAME__.debugPlayerAttack());
  expect(step1.step).toBe(0);
  await page.waitForTimeout(300);
  const step2 = await page.evaluate(() => window.__GAME__.debugPlayerAttack());
  expect(step2.step).toBe(1);
  await page.waitForTimeout(300);
  const step3 = await page.evaluate(() => window.__GAME__.debugPlayerAttack());
  expect(step3.step).toBe(2);
  expect(step3.freezeFrames).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("action combo: combo step resets to 0 after the window expires", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRun(page);
  await page.evaluate(() => window.__GAME__.debugForceCombat("goblin", "action"));
  await expect.poll(() => page.evaluate(() => window.__GAME__.state)).toBe("combat");

  await page.evaluate(() => window.__GAME__.debugPlayerAttack());
  await page.waitForTimeout(600);
  const step = await page.evaluate(() => window.__GAME__.comboStep);
  expect(step).toBe(0);
  expect(errors).toEqual([]);
});

test("perfect dodge: dodging right at the enemy hit grants vulnerable counter window", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRun(page);
  await page.evaluate(() => window.__GAME__.debugForceCombat("goblin", "action"));
  await expect.poll(() => page.evaluate(() => window.__GAME__.state)).toBe("combat");

  const beforeHits = await page.evaluate(() => window.__GAME__.juice.hitsTaken);
  await page.evaluate(() => window.__GAME__.debugForcePerfectDodge());
  await page.waitForTimeout(500);
  const g = await page.evaluate(() => window.__GAME__);
  expect(g.juice.hitsTaken).toBe(beforeHits);
  expect(errors).toEqual([]);
});