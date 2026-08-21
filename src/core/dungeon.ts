// Geração de masmorra e navegação — lógica pura sobre o mapa (sem DOM/estado de jogo).
// Fonte única da geometria do andar; game.ts importa daqui.

import { CONFIG, DIR_X, DIR_Y } from "../data/config";
import { seedRand, seedChance, rand, distance, key } from "./rng";

export type Room = { x: number; y: number; w: number; h: number; cx: number; cy: number };

export type Dungeon = {
  map: number[][];
  rooms: Room[];
  discovered: boolean[][] | null;
  dijkstra: number[][] | null;
  /** cache de luz gerado por game.ts (opcional — não usado pelas funções puras) */
  lightSources?: boolean[][];
};

export type DungeonRuntime = Dungeon & { discovered: boolean[][]; dijkstra: number[][] };

// Gera um andar com salas conectadas por corredores (usando o RNG semeado).
export function generateDungeon(): Dungeon {
  const map = Array.from({ length: CONFIG.MAP_H }, () => Array(CONFIG.MAP_W).fill(CONFIG.TILE_WALL));
  const rooms: Room[] = [];
  const attempts = CONFIG.ROOM_ATTEMPTS;

  for (let i = 0; i < attempts; i++) {
    const w = seedRand(5, 10);
    const h = seedRand(5, 9);
    const x = seedRand(2, CONFIG.MAP_W - w - 3);
    const y = seedRand(2, CONFIG.MAP_H - h - 3);
    const room: Room = { x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) };

    const overlaps = rooms.some(r =>
      x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y
    );
    if (overlaps) continue;

    carveRoom(map, room);

    if (rooms.length > 0) {
      const prev = rooms[rooms.length - 1];
      if (seedChance(0.5)) {
        carveHorizontal(map, prev.cx, room.cx, prev.cy);
        carveVertical(map, prev.cy, room.cy, room.cx);
      } else {
        carveVertical(map, prev.cy, room.cy, prev.cx);
        carveHorizontal(map, prev.cx, room.cx, room.cy);
      }
    }

    rooms.push(room);
    if (rooms.length >= CONFIG.MAX_ROOMS) break;
  }

  if (rooms.length < CONFIG.MIN_ROOMS) return generateDungeon();

  return { map, rooms, discovered: null, dijkstra: null };
}

export function carveRoom(map: number[][], room: Room) {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      map[y][x] = CONFIG.TILE_FLOOR;
    }
  }
}

export function carveHorizontal(map: number[][], x1: number, x2: number, y: number) {
  for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) map[y][x] = CONFIG.TILE_FLOOR;
}

export function carveVertical(map: number[][], y1: number, y2: number, x: number) {
  for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) map[y][x] = CONFIG.TILE_FLOOR;
}

export function isWalkable(dungeon: Dungeon | null | undefined, x: number, y: number) {
  if (!dungeon || x < 0 || y < 0) return false;
  const row = dungeon.map[y];
  if (!row || x >= row.length) return false;
  return row[x] !== CONFIG.TILE_WALL;
}

// Garante as matrizes de runtime (descoberta + dijkstra) e estreita o tipo.
export function ensureDungeonRuntimeState(dungeon: Dungeon): asserts dungeon is DungeonRuntime {
  if (!dungeon.discovered) dungeon.discovered = Array.from({ length: CONFIG.MAP_H }, () => Array(CONFIG.MAP_W).fill(false));
  if (!dungeon.dijkstra) dungeon.dijkstra = Array.from({ length: CONFIG.MAP_H }, () => Array(CONFIG.MAP_W).fill(Infinity));
}

export function revealFog(dungeon: Dungeon, px: number, py: number, radius: number = CONFIG.FOG_RADIUS) {
  ensureDungeonRuntimeState(dungeon);
  for (let y = py - radius; y <= py + radius; y++) {
    for (let x = px - radius; x <= px + radius; x++) {
      if (x < 0 || y < 0 || x >= CONFIG.MAP_W || y >= CONFIG.MAP_H) continue;
      if (Math.hypot(x - px, y - py) <= radius) dungeon.discovered[y][x] = true;
    }
  }
}

export function isDiscovered(dungeon: Dungeon | null | undefined, x: number, y: number) {
  return !!dungeon?.discovered?.[y]?.[x];
}

// Tile de piso aleatório a uma distância mínima (Manhattan) da origem.
export function randomFloorFarFrom(dungeon: Dungeon, origin: { x: number; y: number }, minDistance = 8) {
  const floors: { x: number; y: number }[] = [];
  for (let y = 1; y < CONFIG.MAP_H - 1; y++) {
    for (let x = 1; x < CONFIG.MAP_W - 1; x++) {
      if (dungeon.map[y][x] === CONFIG.TILE_FLOOR && distance({ x, y }, origin) >= minDistance) {
        floors.push({ x, y });
      }
    }
  }
  if (floors.length === 0) return null;
  return floors[rand(0, floors.length - 1)];
}

// Tile de piso livre (não ocupado) distante da origem, com fallback para qualquer piso livre.
export function findFreeTile(dungeon: Dungeon, origin: { x: number; y: number }, occupiedSet: Set<string>, minDist = 4, maxAttempts = 60) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const pos = randomFloorFarFrom(dungeon, origin, minDist);
    if (pos && !occupiedSet.has(key(pos.x, pos.y))) return pos;
  }
  for (let y = 1; y < CONFIG.MAP_H - 1; y++) {
    for (let x = 1; x < CONFIG.MAP_W - 1; x++) {
      if (dungeon.map[y][x] === CONFIG.TILE_FLOOR && !occupiedSet.has(key(x, y))) return { x, y };
    }
  }
  return null;
}

// Mapa de distâncias (BFS) a partir de (targetX, targetY) — base do movimento dos inimigos.
export function computeDijkstraMap(dungeon: Dungeon, targetX: number, targetY: number) {
  ensureDungeonRuntimeState(dungeon);
  for (let y = 0; y < CONFIG.MAP_H; y++) dungeon.dijkstra[y].fill(Infinity);
  const queueX = [targetX];
  const queueY = [targetY];
  dungeon.dijkstra[targetY][targetX] = 0;

  for (let i = 0; i < queueX.length; i++) {
    const curX = queueX[i];
    const curY = queueY[i];
    const nextDist = dungeon.dijkstra[curY][curX] + 1;
    for (let d = 0; d < 4; d++) {
      const nx = curX + DIR_X[d];
      const ny = curY + DIR_Y[d];
      if (!isWalkable(dungeon, nx, ny) || dungeon.dijkstra[ny][nx] <= nextDist) continue;
      dungeon.dijkstra[ny][nx] = nextDist;
      queueX.push(nx);
      queueY.push(ny);
    }
  }
}

// Próximo passo (codificado ny*MAP_W+nx, ou -1) que aproxima o inimigo do alvo.
export function nextStepFromDijkstra(dungeon: DungeonRuntime, enemy: { x: number; y: number }, occupied: boolean[][]) {
  let best = -1;
  let bestDist = dungeon.dijkstra?.[enemy.y]?.[enemy.x] ?? Infinity;
  for (let d = 0; d < 4; d++) {
    const nx = enemy.x + DIR_X[d];
    const ny = enemy.y + DIR_Y[d];
    if (!isWalkable(dungeon, nx, ny) || occupied[ny]?.[nx]) continue;
    const dist = dungeon.dijkstra?.[ny]?.[nx] ?? Infinity;
    if (dist < bestDist) {
      bestDist = dist;
      best = ny * CONFIG.MAP_W + nx;
    }
  }
  return best;
}
