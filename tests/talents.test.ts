import { describe, expect, it } from "vitest";
import { TALENT_POOL, rollTalentChoices } from "../src/data/talents";
import { CONFIG } from "../src/data/config";

const fixedRng = (v) => () => v;

describe("TALENT_POOL", () => {
  it("has 10 distinct talents", () => {
    expect(TALENT_POOL).toHaveLength(10);
    const names = new Set(TALENT_POOL.map((t) => t.name));
    expect(names.size).toBe(10);
  });

  it("apply mutates the player like the legacy behavior", () => {
    const p = { def: 2, atk: 3, maxHp: 30, hp: 20, crit: 0.5 };
    TALENT_POOL.find((t) => t.name === "Muralha").apply(p);
    expect(p.def).toBe(5);
    TALENT_POOL.find((t) => t.name === "Sangue Rubro").apply(p);
    expect(p.maxHp).toBe(42);
    expect(p.hp).toBe(32);
    // crit é capado por MAX_CRIT
    TALENT_POOL.find((t) => t.name === "Olhos do Caçador").apply(p);
    expect(p.crit).toBe(CONFIG.MAX_CRIT);
  });
});

describe("rollTalentChoices", () => {
  it("returns 3 distinct, unchosen talents (deterministic)", () => {
    const choices = rollTalentChoices([], fixedRng(0));
    expect(choices).toHaveLength(3);
    const names = choices.map((t) => t.name);
    expect(new Set(names).size).toBe(3);
  });

  it("excludes already chosen talents", () => {
    const choices = rollTalentChoices(["Muralha", "Saqueador", "Alquimista"], fixedRng(0));
    expect(choices.map((t) => t.name)).not.toContain("Muralha");
    expect(choices.map((t) => t.name)).not.toContain("Saqueador");
    expect(choices.map((t) => t.name)).not.toContain("Alquimista");
  });

  it("returns fewer (or none) when the pool is nearly exhausted", () => {
    const all = TALENT_POOL.map((t) => t.name);
    expect(rollTalentChoices(all, fixedRng(0))).toHaveLength(0);
    expect(rollTalentChoices(all.slice(0, 9), fixedRng(0))).toHaveLength(1);
  });
});
