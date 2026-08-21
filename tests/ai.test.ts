import { describe, expect, it } from "vitest";
import { bossPatternIndex, decideEnemyAction, computeSynergy, ENEMY_SPECIAL_KINDS } from "../src/core/ai";

const fixedRng = (v) => () => v;

describe("bossPatternIndex", () => {
  it("rotates 3 patterns in phase 1 and 4 in phase 2", () => {
    expect(bossPatternIndex(undefined, false)).toBe(0);
    expect(bossPatternIndex(0, false)).toBe(0);
    expect(bossPatternIndex(1, false)).toBe(1);
    expect(bossPatternIndex(2, false)).toBe(2);
    expect(bossPatternIndex(3, false)).toBe(0); // volta ao início
    expect(bossPatternIndex(3, true)).toBe(3);
    expect(bossPatternIndex(4, true)).toBe(0);
  });
});

describe("decideEnemyAction", () => {
  it("unleash wins over everything when an intent is stored", () => {
    expect(decideEnemyAction({ intent: { power: 10 } }, fixedRng(0))).toBe("unleash");
  });

  it("boss phase 1 follows the pattern rotation: charge, drain, attack", () => {
    const boss = { boss: true, phase2: false };
    expect(decideEnemyAction({ ...boss, bossPattern: 0 }, fixedRng(0))).toBe("charge");
    expect(decideEnemyAction({ ...boss, bossPattern: 1 }, fixedRng(0))).toBe("drain");
    expect(decideEnemyAction({ ...boss, bossPattern: 2 }, fixedRng(0))).toBe("attack");
  });

  it("boss phase 2 follows the pattern rotation: fire, stun, purge, drain", () => {
    const boss = { boss: true, phase2: true };
    expect(decideEnemyAction({ ...boss, bossPattern: 0 }, fixedRng(0))).toBe("fire");
    expect(decideEnemyAction({ ...boss, bossPattern: 1 }, fixedRng(0))).toBe("stun");
    expect(decideEnemyAction({ ...boss, bossPattern: 2 }, fixedRng(0))).toBe("purge");
    expect(decideEnemyAction({ ...boss, bossPattern: 3 }, fixedRng(0))).toBe("drain");
  });

  it("priority: synergy assist > special > telegraph > attack", () => {
    const withAllies = { kind: "goblin", synergy: { allies: [{}] }, telegraphCooldown: 0 };
    expect(decideEnemyAction(withAllies, fixedRng(0))).toBe("assist"); // rng 0 < 0.18
    // 0.99 pula assist, special e telegraph
    expect(decideEnemyAction(withAllies, fixedRng(0.99))).toBe("attack");
  });

  it("special requires a kind in ENEMY_SPECIAL_KINDS", () => {
    const noSpecial = { kind: "slime", telegraphCooldown: 0 };
    // 0.99 pula assist (sem aliados), special (slime não tem) e telegraph (0.99 >= 0.45)
    expect(decideEnemyAction(noSpecial, fixedRng(0.99))).toBe("attack");
    // 0.3 cai no telegraph (0.3 < 0.45)
    expect(decideEnemyAction(noSpecial, fixedRng(0.3))).toBe("charge");
    // bat tem special, mas 0.3 >= 0.28 → cai no telegraph
    expect(decideEnemyAction({ kind: "bat", telegraphCooldown: 0 }, fixedRng(0.3))).toBe("charge");
    // 0.1 < 0.28 → habilidade especial
    expect(decideEnemyAction({ kind: "bat", telegraphCooldown: 0 }, fixedRng(0.1))).toBe("special");
  });

  it("telegraph blocked while on cooldown", () => {
    const e = { kind: "slime", telegraphCooldown: 2 };
    expect(decideEnemyAction(e, fixedRng(0))).toBe("attack");
  });
});

describe("computeSynergy", () => {
  const self = { x: 5, y: 5, kind: "slime" };

  it("ignores self, dead and out-of-range enemies", () => {
    const syn = computeSynergy(
      [
        self,
        { x: 20, y: 20, kind: "treant", alive: true },
        { x: 6, y: 5, kind: "goblin", alive: false },
        { x: 6, y: 5, kind: "goblin", alive: true }
      ],
      self
    );
    expect(syn.allies).toHaveLength(1);
    expect(syn.auraAtk).toBe(2); // goblin comum: SYNERGY_AURA_ATK
    expect(syn.auraDef).toBe(0);
    expect(syn.regen).toBe(0);
  });

  it("treant grants regen, golem grants def, lich grants atk+1", () => {
    const syn = computeSynergy(
      [
        { x: 6, y: 5, kind: "treant", alive: true },
        { x: 5, y: 6, kind: "golem", alive: true },
        { x: 4, y: 5, kind: "lich", alive: true },
        { x: 6, y: 6, kind: "bat", alive: true }
      ],
      self
    );
    expect(syn.allies).toHaveLength(4);
    expect(syn.regen).toBe(0.03);
    expect(syn.auraDef).toBe(2); // SYNERGY_AURA_DEF + 1
    expect(syn.auraAtk).toBe(3 + 2); // lich (SYNERGY_AURA_ATK+1) + bat (SYNERGY_AURA_ATK)
  });
});

describe("ENEMY_SPECIAL_KINDS", () => {
  it("roster covers the special-enabled kinds", () => {
    expect(ENEMY_SPECIAL_KINDS.sort()).toEqual(["armor", "bat", "goblin", "golem", "specter", "wraith"]);
  });
});
