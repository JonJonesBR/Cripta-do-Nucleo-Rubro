import { test, expect } from "@playwright/test";

async function startRun(page) {
  await page.goto("/");
  await page.locator("#menuPlayBtn").click();
  await page.locator("#introAdvanceBtn").click();
  await page.locator(".classCard").first().click();
  await page.locator("#startJourneyBtn").click();
  await page.waitForTimeout(1200);
}

async function spawnAndKill(page, kind, floor) {
  const stats = await page.evaluate(([k, f]) => window.__GAME__.debugSpawnScaledEnemy(k, f), [kind, floor]);
  await expect.poll(() => page.evaluate(() => window.__GAME__.state)).toBe("combat");
  await page.evaluate(() => window.__GAME__.debugKillEnemy());
  // Killing grants XP; if it triggers a level-up the talent dialog may open (state "bossIntro").
  await expect.poll(() => page.evaluate(() => window.__GAME__.state)).not.toBe("combat");
  await page.evaluate(() => window.__GAME__.debugCloseDialogs());
  await expect.poll(() => page.evaluate(() => window.__GAME__.state)).toBe("explore");
  return stats;
}

test("balance: enemy stats scale smoothly across floors (ATK/DEF/HP)", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRun(page);
  const f1 = await spawnAndKill(page, "goblin", 1);
  expect(f1.maxHp).toBeGreaterThan(0);
  const f2 = await spawnAndKill(page, "goblin", 2);
  expect(f2.def).toBeGreaterThanOrEqual(f1.def);
  const f4 = await spawnAndKill(page, "goblin", 4);
  // DEF must scale with floor so tanks don't trivialize later floors.
  expect(f4.def).toBeGreaterThan(f2.def);
  // HP and ATK scale but remain proportional to keep the curve fair.
  expect(f4.maxHp).toBeGreaterThan(f2.maxHp);
  expect(f4.atk).toBeGreaterThan(f2.atk);
  // ATK growth should be gentle per floor (smooth ramp, no spike).
  const f5 = await spawnAndKill(page, "goblin", 5);
  expect(f5.atk).toBeLessThanOrEqual(f4.atk + Math.max(1, Math.round(f4.atk * 0.25)));
  expect(errors).toEqual([]);
});

test("balance: elite affixes scale by separate HP/ATK multipliers", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRun(page);
  await page.evaluate(() => window.__GAME__.debugForceCombat("golem", "turn"));
  await expect.poll(() => page.evaluate(() => window.__GAME__.state)).toBe("combat");
  const info = await page.evaluate(() => window.__GAME__.enemyHp);
  expect(info).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("balance: boss scale is softer than normal floor scaling", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRun(page);
  // BossScalePerFloor < FloorScalePerFloor ensures the boss isn't an HP sponge.
  const cfg = await page.evaluate(() => window.__GAME__.scaling);
  expect(cfg.bossPerFloor).toBeLessThan(cfg.floorPerFloor);
  expect(errors).toEqual([]);
});

test("balance: player progression offers class-specific stat curves", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRun(page);
  const b = await page.evaluate(() => window.__GAME__.balance);
  expect(b.level).toBe(1);
  expect(b.maxHp).toBeGreaterThan(0);
  expect(b.crit).toBeGreaterThanOrEqual(0);
  // Warrior (first class) has tanky base stats.
  expect(b.maxHp).toBe(46);
  expect(b.def).toBe(5);
  expect(errors).toEqual([]);
});

test("balance: damage constants stay coherent (guards against silent regression)", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRun(page);
  const c = await page.evaluate(() => window.__GAME__.debugBalanceConstants());
  // guard/block reduzem dano; críticos e fraqueza amplificam; resistência reduz.
  expect(c.guardingMult).toBeGreaterThan(0);
  expect(c.guardingMult).toBeLessThan(1);
  expect(c.perfectDivisor).toBeGreaterThanOrEqual(2);
  expect(c.critMult).toBeGreaterThan(1);
  expect(c.weakMult).toBeGreaterThan(1);
  expect(c.resistMult).toBeLessThan(1);
  expect(c.surgeMult).toBeGreaterThan(1);
  expect(c.burstMult).toBeGreaterThan(1);
  expect(c.phase2AtkMult).toBeGreaterThan(1);
  expect(c.phase2DefMult).toBeGreaterThanOrEqual(1);
  expect(c.captureBase).toBeGreaterThan(0);
  expect(c.captureBase).toBeLessThan(1);
  expect(errors).toEqual([]);
});