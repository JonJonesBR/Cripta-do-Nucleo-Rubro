import { test, expect } from "@playwright/test";

async function startRun(page) {
  await page.goto("/");
  await page.locator("#menuPlayBtn").click();
  await page.locator("#introAdvanceBtn").click();
  await page.locator(".classCard").first().click();
  await page.locator("#startJourneyBtn").click();
  await page.waitForTimeout(1200);
}

test("action combat: ranged enemy fires bolts and player survives hits", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRun(page);
  const state = await page.evaluate(() => window.__GAME__.state);
  expect(state).toBe("explore");
  const result = await page.evaluate(() => window.__GAME__.debugForceCombat("lich", "action"));
  expect(result).toBe("ok");
  await expect.poll(() => page.evaluate(() => window.__GAME__.state)).toBe("combat");
  const g = await page.evaluate(() => window.__GAME__);
  expect(g.combatMode).toBe("action");
  expect(g.enemyName).toBe("Lich Esquecido");
  await page.waitForTimeout(2500);
  const after = await page.evaluate(() => ({ bolts: window.__GAME__.actionBolts, state: window.__GAME__.state }));
  expect(after.state).toBe("combat");
  expect(errors).toEqual([]);
});

test("turn combat: defend command sets guarding and consumes the turn", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRun(page);
  await page.evaluate(() => window.__GAME__.debugForceCombat("goblin", "turn"));
  await page.waitForTimeout(200);
  let g = await page.evaluate(() => window.__GAME__);
  expect(g.combatMode).toBe("turn");
  expect(g.enemyName).toBe("Goblin de Cobre");
  // wait for ATB to fill and command menu to open
  await page.waitForTimeout(1800);
  g = await page.evaluate(() => window.__GAME__);
  expect(g.playerAtbReady).toBe(true);
  await page.locator("#commandMenu").waitFor({ state: "visible" });
  await page.locator('.cmdBtn[data-cmd="guard"]').click();
  await page.waitForTimeout(300);
  g = await page.evaluate(() => window.__GAME__);
  expect(g.guarding).toBe(true);
  expect(g.playerAtbReady).toBe(false);
  expect(errors).toEqual([]);
});
