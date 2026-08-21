import { test, expect } from "@playwright/test";

async function startRun(page) {
  await page.goto("/");
  await page.locator("#menuPlayBtn").click();
  await page.locator("#introAdvanceBtn").click();
  await page.locator(".classCard").first().click();
  await page.locator("#startJourneyBtn").click();
  await page.waitForTimeout(1200);
}

test("juice: kill triggers slow-mo, zoom pulse and victory sting", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRun(page);
  await page.evaluate(() => window.__GAME__.debugForceCombat("goblin", "action"));
  await expect.poll(() => page.evaluate(() => window.__GAME__.state)).toBe("combat");

  await page.evaluate(() => window.__GAME__.debugKillEnemy());
  await expect.poll(() => page.evaluate(() => window.__GAME__.state)).toBe("explore");

  const juice = await page.evaluate(() => window.__GAME__.juice);
  expect(juice.slowMoTicks).toBeGreaterThan(0);
  expect(juice.zoomPulse).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("juice: player taking a hit triggers directional shake and flash", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRun(page);
  await page.evaluate(() => window.__GAME__.debugForceCombat("slime", "action"));
  await expect.poll(() => page.evaluate(() => window.__GAME__.state)).toBe("combat");

  // Teleport the enemy adjacent and force its windup so the hit lands immediately
  const before = await page.evaluate(() => window.__GAME__.juice.hitsTaken);
  await page.evaluate(() => window.__GAME__.debugForcePlayerHit());
  const handle = await page.waitForFunction(
    (prev) => {
      const j = window.__GAME__.juice;
      if (j.hitsTaken > prev && j.shake > 0 && j.flash > 0) return { shake: j.shake, flash: j.flash };
      return false;
    },
    before,
    { timeout: 4000 }
  );
  const snapshot = await handle.jsonValue();
  expect(snapshot.shake).toBeGreaterThan(0);
  expect(snapshot.flash).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});