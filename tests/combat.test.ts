import { describe, expect, it } from "vitest";
import {
  physicalDamage, magicDamage, applyCrit, trapDamage, guardedDamage, xpForLevel
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

describe("trapDamage", () => {
  it("scales with defense and floors at minimum 3", () => {
    expect(trapDamage(0, fixedRng(0))).toBe(4);
    expect(trapDamage(1000, fixedRng(0))).toBe(3);
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
