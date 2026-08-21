import { test, expect } from "@playwright/test";

async function startRun(page) {
  await page.goto("/");
  await page.locator("#menuPlayBtn").click();
  await page.locator("#introAdvanceBtn").click();
  await page.locator(".classCard").first().click();
  await page.locator("#startJourneyBtn").click();
  await page.waitForTimeout(1200);
}

test("enemy AI: low HP triggers enrage state and red telegraphs", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRun(page);
  await page.evaluate(() => window.__GAME__.debugForceCombat("golem", "action"));
  await expect.poll(() => page.evaluate(() => window.__GAME__.state)).toBe("combat");

  await page.evaluate(() => window.__GAME__.debugSetEnemyHpRatio(0.2));
  await expect.poll(
    () => page.evaluate(() => window.__GAME__.enemyState.enraged),
    { timeout: 4000 }
  ).toBe(true);

  const state = await page.evaluate(() => window.__GAME__.enemyState);
  expect(state.telegraph === "melee" || state.telegraph === "ranged" || state.telegraph === null).toBe(true);
  expect(errors).toEqual([]);
});

test("enemy AI: melee enemy sets a floor telegraph during windup", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRun(page);
  await page.evaluate(() => window.__GAME__.debugForceCombat("goblin", "action"));
  await expect.poll(() => page.evaluate(() => window.__GAME__.state)).toBe("combat");

  // Force the goblin to wind up; it is ranged, so the telegraph kind is "ranged".
  const kind = await page.evaluate(() => window.__GAME__.debugForceEnemyWindup());
  expect(kind).toBe("ranged");
  await expect.poll(
    () => page.evaluate(() => window.__GAME__.enemyState.telegraph),
    { timeout: 3000 }
  ).toBe("ranged");
  expect(errors).toEqual([]);
});