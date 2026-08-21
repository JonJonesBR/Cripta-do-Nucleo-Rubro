import { describe, expect, it, beforeEach } from "vitest";
import { setGameSeed, setSeedFloor } from "../src/core/rng";
import {
  generateDungeon, isWalkable, revealFog, isDiscovered, computeDijkstraMap,
  nextStepFromDijkstra, findFreeTile, randomFloorFarFrom, ensureDungeonRuntimeState
} from "../src/core/dungeon";
import { CONFIG, TILE_WALL, TILE_FLOOR } from "../src/data/config";

describe("generateDungeon", () => {
  beforeEach(() => {
    setGameSeed("dungeon-test");
    setSeedFloor(1);
  });

  it("produces at least MIN_ROOMS with wall borders and floor tiles", () => {
    const d = generateDungeon();
    expect(d.rooms.length).toBeGreaterThanOrEqual(CONFIG.MIN_ROOMS);
    // bordas são sempre parede
    for (let x = 0; x < CONFIG.MAP_W; x++) {
      expect(d.map[0][x]).toBe(TILE_WALL);
      expect(d.map[CONFIG.MAP_H - 1][x]).toBe(TILE_WALL);
    }
    for (let y = 0; y < CONFIG.MAP_H; y++) {
      expect(d.map[y][0]).toBe(TILE_WALL);
      expect(d.map[y][CONFIG.MAP_W - 1]).toBe(TILE_WALL);
    }
    // há piso
    const floors = d.map.flat().filter((v) => v === TILE_FLOOR).length;
    expect(floors).toBeGreaterThan(0);
  });

  it("rooms never overlap (with 2-tile gap)", () => {
    const d = generateDungeon();
    for (let i = 0; i < d.rooms.length; i++) {
      for (let j = i + 1; j < d.rooms.length; j++) {
        const a = d.rooms[i], b = d.rooms[j];
        const overlap =
          a.x < b.x + b.w + 2 && a.x + a.w + 2 > b.x &&
          a.y < b.y + b.h + 2 && a.y + a.h + 2 > b.y;
        expect(overlap).toBe(false);
      }
    }
  });

  it("is deterministic for the same seed + floor", () => {
    const a = generateDungeon();
    setSeedFloor(1);
    const b = generateDungeon();
    expect(a.map).toEqual(b.map);
    expect(a.rooms).toEqual(b.rooms);
  });

  it("starts with no runtime state (lazy)", () => {
    const d = generateDungeon();
    expect(d.discovered).toBeNull();
    expect(d.dijkstra).toBeNull();
  });
});

describe("isWalkable", () => {
  it("rejects out of bounds, null dungeon and walls", () => {
    const d = generateDungeon();
    expect(isWalkable(null, 0, 0)).toBe(false);
    expect(isWalkable(d, -1, 0)).toBe(false);
    expect(isWalkable(d, 0, -1)).toBe(false);
    expect(isWalkable(d, CONFIG.MAP_W, 0)).toBe(false);
    // tile 0,0 é parede (borda)
    expect(isWalkable(d, 0, 0)).toBe(false);
  });

  it("accepts floor tiles", () => {
    const d = generateDungeon();
    const floor = d.map.findIndex((row) => row.includes(TILE_FLOOR));
    const x = d.map[floor].indexOf(TILE_FLOOR);
    expect(isWalkable(d, x, floor)).toBe(true);
  });
});

describe("fog", () => {
  it("revealFog marks tiles within radius and isDiscovered reads it", () => {
    const d = generateDungeon();
    expect(isDiscovered(d, 5, 5)).toBe(false);
    revealFog(d, 5, 5, 2);
    expect(isDiscovered(d, 5, 5)).toBe(true);
    expect(isDiscovered(d, 6, 5)).toBe(true); // dist 1
    expect(isDiscovered(d, 7, 6)).toBe(false); // dist sqrt(5) > 2
  });

  it("ensureDungeonRuntimeState fills missing matrices", () => {
    const d = generateDungeon();
    ensureDungeonRuntimeState(d);
    expect(d.discovered).toHaveLength(CONFIG.MAP_H);
    expect(d.dijkstra).toHaveLength(CONFIG.MAP_H);
    expect(d.discovered![0][0]).toBe(false);
    expect(d.dijkstra![0][0]).toBe(Infinity);
  });
});

describe("randomFloorFarFrom / findFreeTile", () => {
  beforeEach(() => {
    setGameSeed("dungeon-test");
    setSeedFloor(1);
  });

  it("randomFloorFarFrom returns a floor at Manhattan distance >= minDistance", () => {
    const d = generateDungeon();
    const origin = { x: 5, y: 5 };
    const pos = randomFloorFarFrom(d, origin, 3);
    expect(pos).not.toBeNull();
    expect(d.map[pos!.y][pos!.x]).toBe(TILE_FLOOR);
    expect(Math.abs(pos!.x - origin.x) + Math.abs(pos!.y - origin.y)).toBeGreaterThanOrEqual(3);
  });

  it("findFreeTile never returns occupied tiles", () => {
    const d = generateDungeon();
    const occupied = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const pos = findFreeTile(d, { x: 5, y: 5 }, occupied, 2);
      if (!pos) break;
      expect(occupied.has(`${pos.x},${pos.y}`)).toBe(false);
      occupied.add(`${pos.x},${pos.y}`);
    }
    expect(occupied.size).toBeGreaterThanOrEqual(5);
  });
});

describe("dijkstra pathing", () => {
  it("computes distances and nextStepFromDijkstra walks toward the target", () => {
    // mapa 8x8 todo piso
    const map = Array.from({ length: 8 }, () => Array(8).fill(TILE_FLOOR));
    const d = { map, rooms: [], discovered: null, dijkstra: null };
    computeDijkstraMap(d, 7, 7);
    expect(d.dijkstra![7][7]).toBe(0);
    expect(d.dijkstra![0][0]).toBe(14);

    let x = 0, y = 0;
    for (let step = 0; step < 20; step++) {
      const next = nextStepFromDijkstra(d, { x, y }, []);
      if (next < 0) break;
      x = next % CONFIG.MAP_W;
      y = Math.floor(next / CONFIG.MAP_W);
    }
    expect(x).toBe(7);
    expect(y).toBe(7);
  });

  it("respects occupied tiles (avoids them)", () => {
    const map = Array.from({ length: 5 }, () => Array(5).fill(TILE_FLOOR));
    const d = { map, rooms: [], discovered: null, dijkstra: null };
    computeDijkstraMap(d, 4, 4);
    // bloqueia (0,1): o único vizinho viável de (0,0) é (1,0)
    const occupied = Array.from({ length: 5 }, () => Array(5).fill(false));
    occupied[1][0] = true;
    const step = nextStepFromDijkstra(d, { x: 0, y: 0 }, occupied);
    expect(step % CONFIG.MAP_W).toBe(1); // nx = 1, ny = 0
  });
});
