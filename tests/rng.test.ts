import { describe, expect, it } from "vitest";
import {
  hashSeed, mulberry32, seedRand, seedChance, setGameSeed, getGameSeed,
  setSeedFloor, clamp, key, distance
} from "../src/core/rng";

describe("hashSeed", () => {
  it("is deterministic and 32-bit", () => {
    expect(hashSeed("abc")).toBe(hashSeed("abc"));
    expect(hashSeed("abc")).toBeGreaterThanOrEqual(0);
    expect(hashSeed("abc")).toBeLessThanOrEqual(0xffffffff);
    expect(hashSeed("abc")).not.toBe(hashSeed("abd"));
  });
});

describe("mulberry32", () => {
  it("produces values in [0,1)", () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("is deterministic for the same seed", () => {
    const a = mulberry32(1234);
    const b = mulberry32(1234);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });
});

describe("seeded rand/chance", () => {
  it("seedRand stays in range and is stable for same seed+floor", () => {
    expect(seedRand(1, 5)).toBeGreaterThanOrEqual(1);
    expect(seedRand(1, 5)).toBeLessThanOrEqual(5);
    setGameSeed("test-seed");
    setSeedFloor(1);
    const r1 = seedRand(1, 1_000_000_000);
    setSeedFloor(1);
    const r2 = seedRand(1, 1_000_000_000);
    expect(r1).toBe(r2);
    expect(seedChance(0.5)).toBeTypeOf("boolean");
  });

  it("different floors produce different streams", () => {
    setGameSeed("seed-a");
    setSeedFloor(1);
    const a = seedRand(0, 1_000_000_000);
    setSeedFloor(2);
    const b = seedRand(0, 1_000_000_000);
    expect(a).not.toBe(b);
  });

  it("getGameSeed returns trimmed seed", () => {
    setGameSeed("  hello  ");
    expect(getGameSeed()).toBe("hello");
    expect(getGameSeed()).toBe("hello");
  });
});

describe("helpers", () => {
  it("clamp", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
  it("key", () => expect(key(3, -2)).toBe("3,-2"));
  it("distance (manhattan)", () => expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(7));
});
