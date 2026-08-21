import { test, expect } from "@playwright/test";

async function startRun(page) {
  await page.goto("/");
  await page.locator("#menuPlayBtn").click();
  await page.locator("#introAdvanceBtn").click();
  await page.locator(".classCard").first().click();
  await page.locator("#startJourneyBtn").click();
  await page.waitForTimeout(1200);
}

test("accessibility: colorblind palette remaps status colors without errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto("/");
  await page.evaluate(() => window.__GAME__.debugSetAccessibility({ colorBlindMode: "deuteranopia" }));
  const a = await page.evaluate(() => window.__GAME__.accessibility);
  expect(a.colorBlindMode).toBe("deuteranopia");
  await page.evaluate(() => window.__GAME__.debugSetAccessibility({ colorBlindMode: "protanopia" }));
  await page.evaluate(() => window.__GAME__.debugSetAccessibility({ colorBlindMode: "tritanopia" }));
  const done = await page.evaluate(() => window.__GAME__.debugSetAccessibility({ colorBlindMode: "off" }));
  expect(done.colorBlindMode).toBe("off");
  expect(errors).toEqual([]);
});

test("accessibility: high contrast and flash reduction flags persist", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto("/");
  const out = await page.evaluate(() => window.__GAME__.debugSetAccessibility({ highContrast: true, reduceFlash: true }));
  expect(out.highContrast).toBe(true);
  expect(out.reduceFlash).toBe(true);
  // flash() should be suppressed when reduceFlash is on (no crash)
  await page.evaluate(() => { window.__GAME__.debugCinema("surge"); });
  await page.waitForTimeout(200);
  const a = await page.evaluate(() => window.__GAME__.accessibility);
  expect(a.highContrast).toBe(true);
  expect(a.reduceFlash).toBe(true);
  expect(errors).toEqual([]);
});

test("accessibility: easy and story difficulty grant bonus potions and reduced damage", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  // Set difficulty before boot so createPlayer picks up the bonus.
  await page.addInitScript(() => {
    try {
      const s = JSON.parse(localStorage.getItem("criptaSettings") || "{}");
      s.difficulty = "easy";
      localStorage.setItem("criptaSettings", JSON.stringify(s));
    } catch {}
  });
  await startRun(page);
  const a = await page.evaluate(() => window.__GAME__.accessibility);
  expect(a.difficulty).toBe("easy");
  expect(a.dmgMult).toBeLessThan(1);
  expect(a.bonusPotions).toBeGreaterThan(0);
  expect(a.potions).toBeGreaterThanOrEqual(1 + a.bonusPotions);
  expect(errors).toEqual([]);
});

test("accessibility: UI scale cycles through sizes without errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto("/");
  for (const scale of ["large", "xl", "normal"]) {
    const out = await page.evaluate(s => window.__GAME__.debugSetAccessibility({ uiScale: s }), scale);
    expect(out.uiScale).toBe(scale);
  }
  expect(errors).toEqual([]);
});
