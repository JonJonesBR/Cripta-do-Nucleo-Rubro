import { describe, expect, it } from "vitest";
import { rollRelic } from "../src/core/relics";
import { RELIC_POOL } from "../src/data/relics";

const fixedRng = (v) => () => v;

describe("rollRelic", () => {
  it("returns a relic the player does not own (deterministic)", () => {
    const relic = rollRelic(["Coração de Brasa"], fixedRng(0));
    expect(RELIC_POOL).toContain(relic);
    expect(relic.name).not.toBe("Coração de Brasa");
    // rng 0 → primeiro da pool filtrada = Lâmina Rúnica
    expect(relic.name).toBe("Lâmina Rúnica");
  });

  it("falls back to Fragmento Rubro when the whole pool is owned", () => {
    const all = RELIC_POOL.map((r) => r.name);
    const relic = rollRelic(all, fixedRng(0));
    expect(relic.name).toBe("Fragmento Rubro");
  });

  it("is deterministic for the same rng", () => {
    expect(rollRelic([], fixedRng(0.4))).toEqual(rollRelic([], fixedRng(0.4)));
  });
});
