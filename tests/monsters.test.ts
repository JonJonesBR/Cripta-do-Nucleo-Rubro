import { describe, expect, it } from "vitest";
import {
  captureChance, captureSuccess, makeWildEnemy,
  snapshotChampion, restoreChampion, applyMonsterToPlayer, readPlayerToMonster,
  type FighterState, type MonsterState
} from "../src/core/monsters";
import { CONFIG } from "../src/data/config";

const fixedRng = (v) => () => v;

const fighter = (over: Partial<FighterState> = {}): FighterState => ({
  className: "Guerreiro", classKey: "warrior", hp: 40, maxHp: 46, atk: 9, def: 5, mag: 1, crit: 0.08,
  stamina: 4, maxStamina: 5, special: "Guarda de Ferro", specialCd: 0, specialMaxCd: 4,
  statusEffects: {}, guarding: false, ...over
});

const monster = (over: Partial<MonsterState> = {}): MonsterState => ({
  name: "Lodo Azul", hp: 16, maxHp: 16, atk: 5, def: 1, mag: 0, crit: 0.08,
  skill: "Investida", skillCd: 0, statusEffects: {}, ...over
});

describe("captureChance", () => {
  it("scales from base at full HP to base+bonus at 0 HP", () => {
    expect(captureChance(100, 100)).toBe(CONFIG.CAPTURE_BASE_CHANCE);
    expect(captureChance(50, 100)).toBe(CONFIG.CAPTURE_BASE_CHANCE + 0.5 * CONFIG.CAPTURE_HP_RATIO_BONUS);
    expect(captureChance(0, 100)).toBe(CONFIG.CAPTURE_BASE_CHANCE + CONFIG.CAPTURE_HP_RATIO_BONUS);
  });

  it("clamps the HP ratio to [0,1]", () => {
    expect(captureChance(150, 100)).toBe(CONFIG.CAPTURE_BASE_CHANCE);
    expect(captureChance(-5, 100)).toBe(CONFIG.CAPTURE_BASE_CHANCE + CONFIG.CAPTURE_HP_RATIO_BONUS);
  });
});

describe("captureSuccess", () => {
  it("succeeds when the roll is below the chance", () => {
    expect(captureSuccess(0, 100, fixedRng(0))).toBe(true); // 0 < 0.9
    expect(captureSuccess(100, 100, fixedRng(0.99))).toBe(false); // 0.99 >= 0.5
  });
});

describe("makeWildEnemy", () => {
  it("floor 1 / level 1 has no bonus scaling", () => {
    const wild = makeWildEnemy(1, 1, fixedRng(0)); // Lodo Azul (hp 16, atk 5, def 1, xp 8)
    expect(wild.name).toBe("Lodo Azul");
    expect(wild.maxHp).toBe(16);
    expect(wild.hp).toBe(16);
    expect(wild.atk).toBe(5);
    expect(wild.def).toBe(1);
    expect(wild.xp).toBe(8);
    expect(wild.wild).toBe(true);
    expect(wild.alive).toBe(true);
  });

  it("scales with level and floor: +5 PV, +1 ATK, +4 XP por ponto de bônus", () => {
    const wild = makeWildEnemy(2, 3, fixedRng(0)); // Lodo Azul; bonus = 2 + 1 = 3
    expect(wild.maxHp).toBe(16 + 3 * 5);
    expect(wild.atk).toBe(5 + 3);
    expect(wild.def).toBe(1 + Math.floor(3 / 2));
    expect(wild.xp).toBe(8 + 3 * 4);
  });
});

describe("team transfer", () => {
  it("snapshot/restore is a roundtrip", () => {
    const p = fighter({ hp: 12, stamina: 1, specialCd: 2 });
    const snap = snapshotChampion(p);
    // muta o lutador como uma troca faria
    applyMonsterToPlayer(p, monster());
    expect(p.className).toBe("Lodo Azul");
    const restored = restoreChampion(p, snap);
    expect(restored).toBe(true);
    expect(p).toEqual(fighter({ hp: 12, stamina: 1, specialCd: 2 }));
  });

  it("restoreChampion returns false without a snapshot", () => {
    expect(restoreChampion(fighter(), null)).toBe(false);
    expect(restoreChampion(fighter(), undefined)).toBe(false);
  });

  it("applyMonsterToPlayer transfers monster state and resets stamina/skill", () => {
    const p = fighter();
    const m = monster({ skill: "Grito Sônico", skillCd: 1, skillAtkMult: 1.5, statusEffects: { stun: { turns: 1 } } });
    applyMonsterToPlayer(p, m);
    expect(p.className).toBe("Lodo Azul");
    expect(p.hp).toBe(16);
    expect(p.atk).toBe(5);
    expect(p.stamina).toBe(3);
    expect(p.maxStamina).toBe(3);
    expect(p.special).toBe("Grito Sônico");
    expect(p.specialCd).toBe(1);
    expect(p.specialMaxCd).toBe(CONFIG.MONSTER_SKILL_CD);
    expect(p.skillAtkMult).toBe(1.5);
    expect(p.skillHealRatio).toBe(0);
    expect(p.guarding).toBe(false);
    expect(p.statusEffects).toEqual({ stun: { turns: 1 } });
  });

  it("readPlayerToMonster copies active state back, including cooldown", () => {
    const p = fighter({ hp: 7, atk: 12, specialCd: 3 });
    const m = monster();
    readPlayerToMonster(m, p);
    expect(m.hp).toBe(7);
    expect(m.atk).toBe(12);
    expect(m.skillCd).toBe(3);
  });
});
