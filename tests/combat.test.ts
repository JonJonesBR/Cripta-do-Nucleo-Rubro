import { describe, expect, it } from "vitest";
import {
  physicalDamage, magicDamage, applyCrit, trapDamage, guardedDamage, xpForLevel,
  attackRoll, specialDamage, summonDamage,
  rogueBleedPower, mageBurnPower, witchBurnPower, beastBleedPower, venomBleedPower
} from "../src/core/combat";

const fixedRng = (v) => () => v;

describe("physicalDamage", () => {
  it("respects minimum 1", () => {
    expect(physicalDamage(0, 0, 2, fixedRng(0))).toBe(1);
  });

  it("reduces by half of defense (floor)", () => {
    expect(physicalDamage(10, 8, 0, fixedRng(0))).toBe(6); // 10 - 4
    expect(physicalDamage(10, 5, 0, fixedRng(0))).toBe(8); // 10 - 2
  });
});

describe("magicDamage", () => {
  it("ignores most defense (def/3)", () => {
    expect(magicDamage(10, 0, 0, fixedRng(0))).toBe(10);
    expect(magicDamage(10, 9, 0, fixedRng(0))).toBe(7); // 10 - floor(9/3)
  });
});

describe("applyCrit", () => {
  it("applies multiplier on crit roll", () => {
    expect(applyCrit(10, 0.5, 1.85, fixedRng(0))).toBe(18); // floor(10*1.85)
    expect(applyCrit(10, 0.5, 1.85, fixedRng(0.9))).toBe(10);
  });
});

describe("guardedDamage", () => {
  it("reduces with guard then perfect block (cumulative)", () => {
    expect(guardedDamage(20, false, false)).toBe(20);
    expect(guardedDamage(20, true, false)).toBe(9); // floor(20*0.45)
    expect(guardedDamage(20, true, true)).toBe(4); // floor(9/2)
  });
});

describe("xpForLevel", () => {
  it("matches the in-game curve", () => {
    expect(xpForLevel(1)).toBe(24);
    for (let l = 1; l < 20; l++) {
      expect(xpForLevel(l + 1)).toBeGreaterThanOrEqual(xpForLevel(l));
    }
  });
});

// ---------------------------------------------------------------------------
// attackRoll — fonte única de todos os rolamentos físicos do jogo.
// Casos dourados: fixam a paridade com as fórmulas históricas (antes espalhadas
// em game.ts), para que qualquer mudança de balanceamento seja intencional.
// ---------------------------------------------------------------------------
describe("attackRoll", () => {
  it("standard physical hit: atk + rand(0..2) - floor(def/2), min 1", () => {
    expect(attackRoll(10, 8, {}, fixedRng(0))).toBe(6); // 10 - 4
    expect(attackRoll(1, 99, {}, fixedRng(0))).toBe(1);
    expect(attackRoll(10, 5, {}, fixedRng(0.99))).toBe(10); // +2 no rolamento
  });

  it("full defense variant (defDiv 1): atk + rand(0..4) - def", () => {
    expect(attackRoll(10, 4, { variance: 4, defDiv: 1 }, fixedRng(0))).toBe(6);
    expect(attackRoll(10, 4, { variance: 4, defDiv: 1 }, fixedRng(0.99))).toBe(10);
  });

  it("offset roll (min): surge rand(2..6) e rogue rand(2..5)", () => {
    expect(attackRoll(10, 0, { variance: 4, min: 2, defDiv: 1 }, fixedRng(0))).toBe(12); // 10+2
    expect(attackRoll(10, 0, { variance: 4, min: 2, defDiv: 1 }, fixedRng(0.99))).toBe(16); // 10+2+4
    expect(attackRoll(10, 0, { variance: 3, min: 2, defDiv: 1 }, fixedRng(0))).toBe(12); // 10+2
    expect(attackRoll(10, 0, { variance: 3, min: 2, defDiv: 1 }, fixedRng(0.99))).toBe(15); // 10+2+3
  });

  it("atk multiplier: warrior floor(atk*0.7), bash floor(atk*1.4)", () => {
    expect(attackRoll(11, 4, { atkMult: 0.7, variance: 0 })).toBe(5); // floor(7.7)=7 - 2
    expect(attackRoll(11, 4, { atkMult: 1.4, variance: 0, defDiv: 1 })).toBe(11); // floor(15.4)=15 - 4
  });

  it("rounded base: monster skill round(atk*mult + level*0.8)", () => {
    // round(10*1.3 + 1*0.8) = round(13.8) = 14 - floor(def/2)
    expect(attackRoll(10, 4, { atkMult: 1.3, min: 1 * 0.8, variance: 0, roundAtk: true, floor: 2 })).toBe(12);
  });

  it("def/3 (witch magic) and floor minima", () => {
    expect(attackRoll(13, 9, { variance: 4, min: 3, defDiv: 3, floor: 2 }, fixedRng(0))).toBe(13); // 13+3-3
    expect(attackRoll(1, 10, { variance: 4, min: 3, defDiv: 3, floor: 2 }, fixedRng(0))).toBe(2); // floor mínimo
  });
});

// ---------------------------------------------------------------------------
// specialDamage — fórmulas das 5 classes, idênticas nos 2 modos de combate.
// ---------------------------------------------------------------------------
describe("specialDamage", () => {
  const base = { atk: 10, mag: 12, level: 3, def: 4 };

  it("warrior: floor(atk*0.7) - floor(def/2), min 1", () => {
    expect(specialDamage({ classKey: "warrior", ...base })).toBe(5); // 7 - 2
  });

  it("rogue: atk + rand(2,5) - def", () => {
    expect(specialDamage({ classKey: "rogue", ...base }, fixedRng(0))).toBe(8); // 10+2-4
    expect(specialDamage({ classKey: "rogue", ...base }, fixedRng(0.99))).toBe(11); // 10+5-4
  });

  it("mage: mag + rand(5,10) + level*2 - floor(def/2), min 3", () => {
    expect(specialDamage({ classKey: "mage", ...base }, fixedRng(0))).toBe(21); // 12+5+6-2
    expect(specialDamage({ classKey: "mage", ...base }, fixedRng(0.99))).toBe(26); // 12+10+6-2
  });

  it("beastmaster: atk + rand(1,3) + floor(level/2) - def, min 2", () => {
    expect(specialDamage({ classKey: "beastmaster", ...base }, fixedRng(0))).toBe(8); // 10+1+1-4
    expect(specialDamage({ classKey: "beastmaster", ...base }, fixedRng(0.99))).toBe(10); // 10+3+1-4
  });

  it("witch: mag + rand(3,7) + floor(level*1.2) - floor(def/3), min 2", () => {
    expect(specialDamage({ classKey: "witch", ...base }, fixedRng(0))).toBe(17); // 12+3+3-1
    expect(specialDamage({ classKey: "witch", ...base }, fixedRng(0.99))).toBe(21); // 12+7+3-1
  });

  it("monster skill: round(atk*mult + level*0.8) - floor(def/2), min 2", () => {
    const st = { ...base, classKey: "monster", monsterSkill: true, skillAtkMult: 1.3 };
    expect(specialDamage(st, fixedRng(0))).toBe(13); // round(10*1.3 + 3*0.8) = 15 - 2
  });
});

describe("summonDamage", () => {
  it("beast companion: rand(4..8) + floor(level*0.8), min 2", () => {
    expect(summonDamage(3, fixedRng(0))).toBe(6); // 4 + 2
    expect(summonDamage(3, fixedRng(0.99))).toBe(10); // 8 + 2
    expect(summonDamage(0, fixedRng(0))).toBe(4);
  });
});

describe("trapDamage", () => {
  it("uses CONFIG range 4..8 and floors at min-after-def", () => {
    expect(trapDamage(0, fixedRng(0))).toBe(4);
    expect(trapDamage(0, fixedRng(0.99))).toBe(8);
    expect(trapDamage(1000, fixedRng(0))).toBe(3);
    expect(trapDamage(3, fixedRng(0))).toBe(3); // 4 - floor(3/3) = 3
  });
});

describe("status powers", () => {
  it("rogueBleedPower: 3 + floor(level/2)", () => {
    expect(rogueBleedPower(1)).toBe(3);
    expect(rogueBleedPower(10)).toBe(8);
  });

  it("mageBurnPower: max(3, floor(mag*0.45))", () => {
    expect(mageBurnPower(12)).toBe(5); // floor(5.4)
    expect(mageBurnPower(2)).toBe(3); // floor(0.9) → piso 3
  });

  it("witchBurnPower: max(3, floor(mag*0.4))", () => {
    expect(witchBurnPower(12)).toBe(4); // floor(4.8)
    expect(witchBurnPower(2)).toBe(3);
  });

  it("beastBleedPower: max(2, floor(level*0.5))", () => {
    expect(beastBleedPower(3)).toBe(2);
    expect(beastBleedPower(10)).toBe(5);
  });

  it("venomBleedPower: max(1, floor(level*0.4)), defaulting unknown level to 1", () => {
    expect(venomBleedPower(3)).toBe(1);
    expect(venomBleedPower(10)).toBe(4);
    expect(venomBleedPower(undefined)).toBe(1);
  });
});
