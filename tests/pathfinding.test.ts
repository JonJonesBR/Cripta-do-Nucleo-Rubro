import { describe, expect, it } from "vitest";
import { findPathBFSGrid } from "../src/core/pathfinding";

const mapW = 6, mapH = 6;
// 0 = free, 1 = wall
const grid = [
  [0, 0, 0, 0, 0, 0],
  [0, 1, 1, 1, 0, 0],
  [0, 0, 0, 1, 0, 0],
  [0, 1, 0, 1, 0, 0],
  [0, 1, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0]
];
const blocked = (x, y) => grid[y][x] === 1;

describe("findPathBFSGrid", () => {
  it("returns [] when start equals target", () => {
    expect(findPathBFSGrid(mapW, mapH, 0, 0, 0, 0, blocked)).toEqual([]);
  });

  it("finds a path avoiding walls, using 4-adjacent steps", () => {
    const path = findPathBFSGrid(mapW, mapH, 0, 0, 5, 5, blocked);
    expect(path).not.toBeNull();
    expect(path[path.length - 1]).toEqual({ x: 5, y: 5 });
    for (const p of path) expect(blocked(p.x, p.y)).toBe(false);
    for (let i = 1; i < path.length; i++) {
      const d = Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y);
      expect(d).toBe(1);
    }
  });

  it("returns null when unreachable", () => {
    const walled = (x, y) => y === 1; // full wall row blocks the map
    expect(findPathBFSGrid(mapW, mapH, 0, 0, 5, 5, walled)).toBeNull();
  });
});
