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

describe("Gameplay Polish: Ambush and Initiative Advantage", () => {
  it("provides positive momentum bonus and stagger duration on ambush", () => {
    expect(CONFIG.AMBUSH_MOMENTUM_BONUS).toBeDefined();
    expect(CONFIG.AMBUSH_MOMENTUM_BONUS).toBeGreaterThanOrEqual(15);
    expect(CONFIG.AMBUSH_MOMENTUM_BONUS).toBeLessThanOrEqual(50);

    expect(CONFIG.AMBUSH_ACTION_STAGGER_TICKS).toBeDefined();
    expect(CONFIG.AMBUSH_ACTION_STAGGER_TICKS).toBeGreaterThanOrEqual(30);
  });
});

describe("Gameplay Polish: Flash Counter mechanics", () => {
  it("defines responsive flash counter window and potent damage multiplier", () => {
    expect(CONFIG.FLASH_COUNTER_WINDOW_TICKS).toBeDefined();
    expect(CONFIG.FLASH_COUNTER_WINDOW_TICKS).toBeGreaterThanOrEqual(20);
    expect(CONFIG.FLASH_COUNTER_WINDOW_TICKS).toBeLessThanOrEqual(45);

    expect(CONFIG.FLASH_COUNTER_DMG_MULT).toBeDefined();
    expect(CONFIG.FLASH_COUNTER_DMG_MULT).toBeGreaterThanOrEqual(1.5);
    expect(CONFIG.FLASH_COUNTER_DMG_MULT).toBeLessThanOrEqual(2.2);
  });
});

describe("Gameplay Polish: Trap Disarming mechanics", () => {
  it("defines balanced XP, Gold, and default success rate", () => {
    expect(CONFIG.DISARM_TRAP_XP).toBeGreaterThanOrEqual(10);
    expect(CONFIG.DISARM_TRAP_GOLD).toBeGreaterThanOrEqual(3);
    expect(CONFIG.DISARM_SUCCESS_CHANCE_DEFAULT).toBeGreaterThanOrEqual(0.6);
    expect(CONFIG.DISARM_SUCCESS_CHANCE_DEFAULT).toBeLessThan(1.0);
  });

  it("rogue class always succeeds at disarming (100% chance)", () => {
    const isRogue = (classKey: string) => classKey === "rogue";
    const disarmSuccess = (classKey: string, roll: number) => isRogue(classKey) || roll < CONFIG.DISARM_SUCCESS_CHANCE_DEFAULT;

    // Rogue succeeds even with worst roll
    expect(disarmSuccess("rogue", 0.99)).toBe(true);
    // Other classes succeed with good roll, fail with bad roll
    expect(disarmSuccess("warrior", 0.1)).toBe(true);
    expect(disarmSuccess("warrior", 0.95)).toBe(false);
  });
});

describe("Visual Polish: 16-bit Sprite Animation Systems", () => {
  it("defines animation configuration tokens with responsive timing", () => {
    expect(CONFIG.HERO_WALK_CYCLE_FRAMES).toBe(4);
    expect(CONFIG.HERO_WALK_TICK_DIVISOR).toBeGreaterThanOrEqual(4);
    expect(CONFIG.HERO_WALK_TICK_DIVISOR).toBeLessThanOrEqual(8);
    expect(CONFIG.SPRITE_HIT_FLASH_MOD).toBe(4);
    expect(CONFIG.SLIME_SQUISH_DIVISOR).toBeCloseTo(5.5, 1);
    expect(CONFIG.BAT_FLAP_CYCLE_FRAMES).toBe(3);
    expect(CONFIG.BAT_FLAP_TICK_DIVISOR).toBe(4);
  });

  it("calculates 4-frame walk cycle alternating left and right legs when moving", () => {
    const calcWalkLegs = (tick: number, isMoving: boolean) => {
      if (!isMoving) return { legL: 0, legR: 0, bob: 0 };
      const phase = Math.floor(tick / CONFIG.HERO_WALK_TICK_DIVISOR) % CONFIG.HERO_WALK_CYCLE_FRAMES;
      const legL = phase === 0 ? 1 : phase === 2 ? -1 : 0;
      const legR = phase === 2 ? 1 : phase === 0 ? -1 : 0;
      const bob = phase % 2 === 0 ? 1 : 0;
      return { legL, legR, bob };
    };

    // Idle
    expect(calcWalkLegs(0, false)).toEqual({ legL: 0, legR: 0, bob: 0 });

    // Moving step 0 (tick 0): left forward, right back
    const step0 = calcWalkLegs(0, true);
    expect(step0.legL).toBe(1);
    expect(step0.legR).toBe(-1);

    // Moving step 1 (tick 5): neutral passing
    const step1 = calcWalkLegs(5, true);
    expect(step1.legL).toBe(0);
    expect(step1.legR).toBe(0);

    // Moving step 2 (tick 10): left back, right forward
    const step2 = calcWalkLegs(10, true);
    expect(step2.legL).toBe(-1);
    expect(step2.legR).toBe(1);

    // Moving step 3 (tick 15): neutral passing
    const step3 = calcWalkLegs(15, true);
    expect(step3.legL).toBe(0);
    expect(step3.legR).toBe(0);
  });

  it("calculates volume-preserving squash and stretch for slimes", () => {
    const calcSquish = (tick: number) => {
      const squish = Math.sin(tick / CONFIG.SLIME_SQUISH_DIVISOR);
      const wMod = Math.round(squish * 1.5);
      const hMod = -Math.round(squish * 1.0);
      return { wMod, hMod };
    };

    // When width expands, height compresses
    const peakStretch = calcSquish(8); // near peak of sine
    if (peakStretch.wMod > 0) {
      expect(peakStretch.hMod).toBeLessThanOrEqual(0);
    }

    // Peak compression
    const peakSquash = calcSquish(24);
    if (peakSquash.wMod < 0) {
      expect(peakSquash.hMod).toBeGreaterThanOrEqual(0);
    }
  });

  it("triggers white silhouette retro hit flash on damage frames", () => {
    const isHitFlash = (hitPulse: number) => hitPulse > 0 && (hitPulse % CONFIG.SPRITE_HIT_FLASH_MOD) < 2;

    expect(isHitFlash(0)).toBe(false); // No hit
    expect(isHitFlash(8)).toBe(true);  // 8 % 4 = 0 -> flash active
    expect(isHitFlash(9)).toBe(true);  // 9 % 4 = 1 -> flash active
    expect(isHitFlash(10)).toBe(false); // 10 % 4 = 2 -> normal color
    expect(isHitFlash(11)).toBe(false); // 11 % 4 = 3 -> normal color
  });
});


