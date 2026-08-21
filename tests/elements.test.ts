import { describe, expect, it } from "vitest";
import {
  playerElementForClass, elementMultiplier, assignEnemyElement, applyEliteAffix,
  type EnemyLike, type AffixableEnemy
} from "../src/core/elements";
import { CONFIG } from "../src/data/config";

const fixedRng = (v) => () => v;

describe("playerElementForClass", () => {
  it("maps each class to its element", () => {
    expect(playerElementForClass("mage")).toBe("arcane");
    expect(playerElementForClass("witch")).toBe("chaos");
    expect(playerElementForClass("warrior")).toBe("fire");
    expect(playerElementForClass("rogue")).toBe("ice");
    expect(playerElementForClass("beastmaster")).toBe("physical");
    expect(playerElementForClass()).toBe("physical");
    expect(playerElementForClass("unknown")).toBe("physical");
  });
});

describe("elementMultiplier", () => {
  it("weakness amplifies, resistance reduces, none is neutral", () => {
    expect(elementMultiplier("fire", { elementWeak: "fire" })).toBe(CONFIG.ELEMENT_WEAK_MULT);
    expect(elementMultiplier("fire", { elementResist: "fire" })).toBe(CONFIG.ELEMENT_RESIST_MULT);
    expect(elementMultiplier("ice", { elementWeak: "fire" })).toBe(1);
    expect(elementMultiplier("ice", null)).toBe(1);
    expect(elementMultiplier("ice", undefined)).toBe(1);
  });

  it("weakness takes precedence over resistance", () => {
    expect(elementMultiplier("fire", { elementWeak: "fire", elementResist: "fire" })).toBe(CONFIG.ELEMENT_WEAK_MULT);
  });
});

describe("assignEnemyElement", () => {
  it("assigns the profile for the kind", () => {
    const enemy: EnemyLike = { kind: "slime" };
    assignEnemyElement(enemy);
    expect(enemy.element).toBe("physical");
    expect(enemy.elementWeak).toBe("ice");
    expect(enemy.elementResist).toBe("physical");
  });

  it("falls back to physical profile for unknown kinds", () => {
    const enemy: EnemyLike = { kind: "mystery" };
    assignEnemyElement(enemy);
    expect(enemy.element).toBe("physical");
    expect(enemy.elementWeak).toBe("arcane");
    expect(enemy.elementResist).toBe("chaos");
  });
});

describe("applyEliteAffix", () => {
  it("applies the affix multipliers, name and color (deterministic)", () => {
    const enemy: AffixableEnemy = { kind: "slime", name: "Lodo Azul", maxHp: 20, hp: 20, def: 2, atk: 5, color: "#fff" };
    applyEliteAffix(enemy, fixedRng(0)); // idx 0 = armored
    expect(enemy.affix).toBe("armored");
    expect(enemy.eliteBaseName).toBe("Lodo Azul");
    expect(enemy.name).toBe("Lodo Azul [Blindado]");
    expect(enemy.maxHp).toBe(28); // round(20 * 1.4)
    expect(enemy.hp).toBe(28);
    expect(enemy.def).toBe(5); // 2 + 3
    expect(enemy.atk).toBe(5); // round(5 * 1)
    expect(enemy.color).toBe("#8fd0ff");
  });

  it("wild affix boosts attack", () => {
    const enemy: AffixableEnemy = { kind: "goblin", name: "Goblin", maxHp: 21, hp: 21, def: 2, atk: 7, color: "#fff" };
    applyEliteAffix(enemy, fixedRng(0.2)); // idx 1 = wild (atkMult 1.4)
    expect(enemy.affix).toBe("wild");
    expect(enemy.atk).toBe(10); // round(7 * 1.4)
    expect(enemy.maxHp).toBe(23); // round(21 * 1.1)
    expect(enemy.name).toBe("Goblin [Selvagem]");
  });
});
