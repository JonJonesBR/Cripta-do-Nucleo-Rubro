import { describe, expect, it } from "vitest";
import { checksum, migrateRun } from "../src/core/save";

describe("checksum", () => {
  it("is stable for identical data and differs for changed data", () => {
    const a = { player: { hp: 10 }, floor: 2 };
    const b = { player: { hp: 11 }, floor: 2 };
    expect(checksum(a)).toBe(checksum(a));
    expect(checksum(a)).not.toBe(checksum(b));
  });

  it("returns a hex string", () => {
    expect(checksum({})).toMatch(/^[0-9a-f]+$/);
  });
});

describe("migrateRun", () => {
  it("returns null for garbage", () => {
    expect(migrateRun(null)).toBeNull();
    expect(migrateRun(42)).toBeNull();
    expect(migrateRun({})).toBeNull();
  });

  it("fills missing player fields", () => {
    const run = migrateRun({ player: { hp: 10 } });
    expect(run.player.statusEffects).toEqual({});
    expect(run.player.relicNames).toEqual([]);
    expect(run.player.gold).toBe(0);
    expect(run.player.monsters).toEqual([]);
    expect(run.player.captureCrystals).toBe(1);
    expect(run.runStats.kills).toBe(0);
  });

  it("drops dead enemies and used items", () => {
    const run = migrateRun({
      player: { hp: 10 },
      enemies: [{ alive: true, statusEffects: {} }, { alive: false }],
      items: [{ used: true }, { used: false }]
    });
    expect(run.enemies).toHaveLength(1);
    expect(run.items).toHaveLength(1);
    expect(run.items[0].used).toBe(false);
  });
});
