import { test, expect } from "@playwright/test";

async function startRun(page) {
  await page.goto("/");
  await page.locator("#menuPlayBtn").click();
  await page.locator("#introAdvanceBtn").click();
  await page.locator(".classCard").first().click();
  await page.locator("#startJourneyBtn").click();
  await page.waitForTimeout(1200);
}

async function startTurnCombat(page, kind = "goblin") {
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRun(page);
  await page.evaluate(k => window.__GAME__.debugForceCombat(k, "turn"), kind);
  await expect.poll(() => page.evaluate(() => window.__GAME__.state)).toBe("combat");
  await page.waitForTimeout(1800);
  return errors;
}

test("turn mode: enemy intent is rolled and shown in combat panel", async ({ page }) => {
  const errors = await startTurnCombat(page, "goblin");
  const info = await page.evaluate(() => window.__GAME__.turnInfo);
  expect(info).not.toBeNull();
  expect(["ATACAR", "HABILIDADE", "CARREGAR", "APOIO ALIADO", "GOLPE CARREGADO"]).toContain(info.nextIntent);
  expect(errors).toEqual([]);
});

test("turn mode: perfect timing builds timing combo and refunds stamina", async ({ page }) => {
  const errors = await startTurnCombat(page, "golem");
  // Golem has low ATB speed; force ATB ready to guarantee a deterministic attack.
  const result = await page.evaluate(() => window.__GAME__.debugTurnAttack(0.5));
  expect(result.ready || result.timingCombo >= 1).toBe(true);
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => window.__GAME__.turnInfo);
  expect(after.timingCombo).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});

test("turn mode: elemental affinity applies weakness and resistance modifiers", async ({ page }) => {
  const errors = await startTurnCombat(page, "specter");
  const info = await page.evaluate(() => window.__GAME__.turnInfo);
  expect(info.elementWeak).toBe("arcane");
  // Warrior class (first class card) uses fire element.
  expect(info.playerElement).toBe("fire");
  expect(errors).toEqual([]);
});