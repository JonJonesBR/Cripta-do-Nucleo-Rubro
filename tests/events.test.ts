import { describe, expect, it } from "vitest";
import { resolveEventChoice, type EventPlayerState } from "../src/core/events";

const fixedRng = (v) => () => v;

const base: EventPlayerState = { gold: 50, hp: 40, maxHp: 50, atk: 10, mag: 12, def: 5, level: 3, potions: 1 };

describe("gold_cost", () => {
  it("pays gold and grants a potion when affordable", () => {
    const { state, outcome } = resolveEventChoice("gold_cost", base, 10, fixedRng(0));
    expect(state.gold).toBe(40);
    expect(state.potions).toBe(2);
    expect(outcome).toEqual({ type: "gold_cost_paid", value: 10 });
  });

  it("returns insufficient without changing state", () => {
    const poor = { ...base, gold: 5 };
    const { state, outcome } = resolveEventChoice("gold_cost", poor, 10, fixedRng(0));
    expect(state).toEqual(poor);
    expect(outcome).toEqual({ type: "insufficient" });
  });
});

describe("rob", () => {
  it("steals rand(6..20) gold", () => {
    expect(resolveEventChoice("rob", base, undefined, fixedRng(0)).outcome).toEqual({ type: "rob", amount: 6 });
    expect(resolveEventChoice("rob", base, undefined, fixedRng(0.99)).outcome).toEqual({ type: "rob", amount: 20 });
    expect(resolveEventChoice("rob", base, undefined, fixedRng(0.5)).state.gold).toBe(50 + 13); // 6 + floor(0.5*15)=7
  });
});

describe("risk_power", () => {
  it("55%: grants power (+atk/+mag/+3 maxHp)", () => {
    const { state, outcome } = resolveEventChoice("risk_power", base, undefined, fixedRng(0));
    expect(outcome).toEqual({ type: "power" });
    expect(state.atk).toBe(11);
    expect(state.mag).toBe(13);
    expect(state.maxHp).toBe(53);
    expect(state.hp).toBe(43);
  });

  it("45%: rolls damage rand(4..10) without touching state (scaling é do game.ts)", () => {
    const { state, outcome } = resolveEventChoice("risk_power", base, undefined, fixedRng(0.9));
    expect(outcome).toEqual({ type: "damage", amount: 10 }); // 4 + floor(0.9*7)
    expect(state).toEqual(base);
  });
});

describe("gold_blessing", () => {
  it("costs gold, grants +atk/+mag", () => {
    const { state, outcome } = resolveEventChoice("gold_blessing", base, 15, fixedRng(0));
    expect(state.gold).toBe(35);
    expect(state.atk).toBe(11);
    expect(state.mag).toBe(13);
    expect(outcome).toEqual({ type: "gold_blessing_paid" });
  });

  it("insufficient when broke", () => {
    expect(resolveEventChoice("gold_blessing", { ...base, gold: 10 }, 15, fixedRng(0)).outcome.type).toBe("insufficient");
  });
});

describe("xp_boost / heal", () => {
  it("xp = 20 + level*4", () => {
    expect(resolveEventChoice("xp_boost", base, undefined, fixedRng(0)).outcome).toEqual({ type: "xp", amount: 32 });
  });

  it("heal caps at maxHp: min(maxHp-hp, 20+level*3)", () => {
    const { state, outcome } = resolveEventChoice("heal", base, undefined, fixedRng(0));
    expect(outcome).toEqual({ type: "heal", amount: 10 });
    expect(state.hp).toBe(50);
    const full = { ...base, hp: 50 };
    expect(resolveEventChoice("heal", full, undefined, fixedRng(0)).outcome).toEqual({ type: "heal", amount: 0 });
  });
});

describe("gamble_gold", () => {
  it("win (50%): doubles the wager", () => {
    const { state, outcome } = resolveEventChoice("gamble_gold", base, 20, fixedRng(0));
    expect(outcome).toEqual({ type: "gamble_win", amount: 40 });
    expect(state.gold).toBe(50 - 20 + 40);
  });

  it("lose: keeps the wager deducted", () => {
    const { state, outcome } = resolveEventChoice("gamble_gold", base, 20, fixedRng(0.99));
    expect(outcome).toEqual({ type: "gamble_lose", wager: 20 });
    expect(state.gold).toBe(30);
  });

  it("insufficient without gold", () => {
    expect(resolveEventChoice("gamble_gold", { ...base, gold: 10 }, 20, fixedRng(0)).outcome.type).toBe("insufficient");
  });
});

describe("gamble_hp / sacrifice_hp", () => {
  it("gamble_hp requires hp > value (strict) and always costs hp", () => {
    const win = resolveEventChoice("gamble_hp", base, 10, fixedRng(0));
    expect(win.outcome).toEqual({ type: "gamble_hp_win", hpCost: 10 });
    expect(win.state.hp).toBe(30);
    const lose = resolveEventChoice("gamble_hp", base, 10, fixedRng(0.99));
    expect(lose.outcome).toEqual({ type: "gamble_hp_lose", hpCost: 10 });
    expect(lose.state.hp).toBe(30);
    expect(resolveEventChoice("gamble_hp", { ...base, hp: 10 }, 10, fixedRng(0)).outcome.type).toBe("insufficient");
  });

  it("sacrifice_hp grants relic and deducts hp", () => {
    const { state, outcome } = resolveEventChoice("sacrifice_hp", base, 10, fixedRng(0));
    expect(outcome).toEqual({ type: "relic", hpCost: 10 });
    expect(state.hp).toBe(30);
    expect(resolveEventChoice("sacrifice_hp", { ...base, hp: 10 }, 10, fixedRng(0)).outcome.type).toBe("insufficient");
  });

  it("sacrifice_gold grants relic and deducts gold", () => {
    const { state, outcome } = resolveEventChoice("sacrifice_gold", base, 30, fixedRng(0));
    expect(outcome).toEqual({ type: "relic", goldCost: 30 });
    expect(state.gold).toBe(20);
  });
});

describe("force_lock / pay_lock", () => {
  it("force_lock: 60% relic, 40% damage rand(6..14)", () => {
    expect(resolveEventChoice("force_lock", base, undefined, fixedRng(0)).outcome).toEqual({ type: "relic" });
    expect(resolveEventChoice("force_lock", base, undefined, fixedRng(0.99)).outcome).toEqual({ type: "damage", amount: 14 });
  });

  it("pay_lock: gold cost for a relic", () => {
    const { state, outcome } = resolveEventChoice("pay_lock", base, 25, fixedRng(0));
    expect(outcome).toEqual({ type: "relic", goldCost: 25 });
    expect(state.gold).toBe(25);
  });
});

describe("fountain / bone_smith", () => {
  it("fountain_drink: 60% power (+4 maxHp), 40% damage rand(5..12)", () => {
    const win = resolveEventChoice("fountain_drink", base, undefined, fixedRng(0));
    expect(win.outcome).toEqual({ type: "power" });
    expect(win.state.maxHp).toBe(54);
    expect(win.state.hp).toBe(44);
    expect(resolveEventChoice("fountain_drink", base, undefined, fixedRng(0.99)).outcome).toEqual({ type: "damage", amount: 12 });
  });

  it("fountain_bottle: +1 potion", () => {
    const { state, outcome } = resolveEventChoice("fountain_bottle", base, undefined, fixedRng(0));
    expect(outcome).toEqual({ type: "potion" });
    expect(state.potions).toBe(2);
  });

  it("bone_upgrade/bone_armor: flat stat bonuses", () => {
    expect(resolveEventChoice("bone_upgrade", base, undefined, fixedRng(0)).outcome).toEqual({ type: "stats", atk: 2 });
    expect(resolveEventChoice("bone_armor", base, undefined, fixedRng(0)).outcome).toEqual({ type: "stats", def: 2 });
    expect(resolveEventChoice("bone_upgrade", base, undefined, fixedRng(0)).state.atk).toBe(12);
    expect(resolveEventChoice("bone_armor", base, undefined, fixedRng(0)).state.def).toBe(7);
  });
});

describe("unknown effect", () => {
  it("falls back to insufficient", () => {
    const { state, outcome } = resolveEventChoice("mystery", base, undefined, fixedRng(0));
    expect(outcome.type).toBe("insufficient");
    expect(state).toEqual(base);
  });
});
