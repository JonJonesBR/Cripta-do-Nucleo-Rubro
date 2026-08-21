import { test, expect } from "@playwright/test";

test("mouse hold moves player toward cursor without errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto("/");
  await page.locator("#menuPlayBtn").click();
  await page.locator("#introAdvanceBtn").click();
  await page.locator(".classCard").first().click();
  await page.locator("#startJourneyBtn").click();
  await page.waitForTimeout(1200);
  const pos = () => page.evaluate(() => window.__GAME__);
  const before = await pos();
  expect(before.state).toBe("explore");
  const box = await page.locator("#screenWrap").boundingBox();
  expect(box).not.toBeNull();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  const offsets = [[150, -60], [0, -120], [-150, -30], [80, 90], [-90, 100]];
  let moved = false;
  for (const [dx, dy] of offsets) {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(300);
    await page.mouse.move(cx + dx, cy + dy, { steps: 6 });
    await page.waitForTimeout(600);
    await page.mouse.up();
    await page.waitForTimeout(100);
    const p = await pos();
    if (p.px !== before.px || p.py !== before.py) { moved = true; break; }
  }
  expect(moved).toBe(true);
  expect(errors).toEqual([]);
});
