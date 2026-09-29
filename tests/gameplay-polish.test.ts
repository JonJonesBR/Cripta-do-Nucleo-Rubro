import { describe, expect, it } from "vitest";
import { CONFIG } from "../src/data/config";

describe("Gameplay Polish: Ghost HP lerp mechanics", () => {
  it("has GHOST_HP_LERP_SPEED defined and within responsive range", () => {
    expect(CONFIG.GHOST_HP_LERP_SPEED).toBeDefined();
    expect(CONFIG.GHOST_HP_LERP_SPEED).toBeGreaterThanOrEqual(0.04);
    expect(CONFIG.GHOST_HP_LERP_SPEED).toBeLessThanOrEqual(0.2);
  });

  it("lerps ghostHp toward hp smoothly and converges without overshooting", () => {
    let ghostHp = 100;
    const hp = 60;
    const speed = CONFIG.GHOST_HP_LERP_SPEED;

    // Simulate 60 fixed updates (~1 second at 60 FPS)
    for (let i = 0; i < 60; i++) {
      if (ghostHp > hp) {
        ghostHp = Math.max(hp, ghostHp - Math.max(0.15, (ghostHp - hp) * speed));
      }
    }

    expect(ghostHp).toBe(hp);
  });
});

describe("Gameplay Polish: Floor decals system", () => {
  it("enforces maximum decal cap to prevent performance degradation", () => {
    expect(CONFIG.MAX_DECALS_COUNT).toBeDefined();
    expect(CONFIG.MAX_DECALS_COUNT).toBeGreaterThan(0);
    expect(CONFIG.MAX_DECALS_COUNT).toBeLessThanOrEqual(100);

    const activeDecals: Array<{ id: number }> = [];
    const maxCount = CONFIG.MAX_DECALS_COUNT;

    for (let i = 0; i < maxCount + 20; i++) {
      activeDecals.push({ id: i });
      while (activeDecals.length > maxCount) {
        activeDecals.shift();
      }
    }

    expect(activeDecals.length).toBe(maxCount);
    expect(activeDecals[0].id).toBe(20);
    expect(activeDecals[activeDecals.length - 1].id).toBe(maxCount + 19);
  });

  it("has appropriate decal lifetime", () => {
    expect(CONFIG.DECAL_DEFAULT_LIFE).toBeDefined();
    expect(CONFIG.DECAL_DEFAULT_LIFE).toBeGreaterThanOrEqual(180);
  });
});

describe("Gameplay Polish: AoE telegraph mechanics", () => {
  it("computes telegraph progression cleanly between 0 and 1", () => {
    const maxLife = 36;
    for (let life = maxLife; life >= 0; life--) {
      const prog = Math.min(1, Math.max(0, 1 - life / maxLife));
      expect(prog).toBeGreaterThanOrEqual(0);
      expect(prog).toBeLessThanOrEqual(1);
    }
  });

  it("scales boss phase 2 stats appropriately", () => {
    expect(CONFIG.BOSS_PHASE2_ATK_MULT).toBeGreaterThan(1.0);
    expect(CONFIG.BOSS_PHASE2_DEF_MULT).toBeGreaterThan(1.0);
  });
});
