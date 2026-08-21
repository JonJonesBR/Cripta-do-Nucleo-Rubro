import { describe, expect, it } from "vitest";
import { buildShopOfferings } from "../src/core/shop";
import { CONFIG } from "../src/data/config";
import { RELIC_POOL } from "../src/data/relics";

const fixedRng = (v) => () => v;

describe("buildShopOfferings", () => {
  it("always offers potion and crystal at base cost on floors 1-2", () => {
    for (const floor of [1, 2]) {
      const offers = buildShopOfferings([], floor, fixedRng(0));
      expect(offers[0]).toEqual({ kind: "potion", name: "Poção de Cura", cost: CONFIG.SHOP_POTION_COST });
      expect(offers[1]).toEqual({ kind: "crystal", name: "Cristal de Captura", cost: CONFIG.CAPTURE_CRYSTAL_COST });
    }
  });

  it("applies floor surcharge from floor 3 onward", () => {
    const f3 = buildShopOfferings([], 3, fixedRng(0));
    const surcharge3 = (3 - 2) * CONFIG.SHOP_FLOOR_COST_ADD;
    expect(f3[0].cost).toBe(CONFIG.SHOP_POTION_COST + surcharge3);

    const f5 = buildShopOfferings([], 5, fixedRng(0));
    const surcharge5 = (5 - 2) * CONFIG.SHOP_FLOOR_COST_ADD;
    expect(f5[2].cost).toBe(CONFIG.SHOP_RELIC_COST + surcharge5);
    expect(f5[0].cost).toBe(CONFIG.SHOP_POTION_COST + surcharge5);
  });

  it("offers a relic the player does not own", () => {
    const offers = buildShopOfferings([], 1, fixedRng(0));
    expect(offers.length).toBe(3);
    expect(offers[2].kind).toBe("relic");
    expect(offers[2].name).toBe(RELIC_POOL[0].name); // rng 0 → primeiro da pool
  });

  it("skips the relic when the whole pool is owned", () => {
    const allNames = RELIC_POOL.map((r) => r.name);
    const offers = buildShopOfferings(allNames, 1, fixedRng(0));
    expect(offers.length).toBe(2);
  });

  it("is deterministic for the same rng stream", () => {
    const a = buildShopOfferings([], 4, fixedRng(0.5));
    const b = buildShopOfferings([], 4, fixedRng(0.5));
    expect(a).toEqual(b);
  });
});
