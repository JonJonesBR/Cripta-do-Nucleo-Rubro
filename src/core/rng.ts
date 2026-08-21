// Deterministic, seedable RNG primitives (pure, no DOM dependency).

export const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
export const chance = (value) => Math.random() < value;

let gameSeed = "";
let seedRngCache = null;
let seedFloor = 1;

export function hashSeed(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getSeedRng() {
  if (!gameSeed) return null;
  if (!seedRngCache) seedRngCache = mulberry32(hashSeed(gameSeed) ^ (seedFloor || 1));
  return seedRngCache;
}

export function seedRand(min, max) {
  const rng = getSeedRng();
  if (!rng) return rand(min, max);
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function seedChance(v) {
  const rng = getSeedRng();
  if (!rng) return chance(v);
  return rng() < v;
}

export function setGameSeed(seed) {
  gameSeed = (seed || "").trim();
  seedRngCache = null;
}

export function getGameSeed() {
  return gameSeed;
}

export function setSeedFloor(floor) {
  seedFloor = floor || 1;
  seedRngCache = null;
}

export function resetSeedForFloor() {
  seedRngCache = null;
}

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const key = (x, y) => `${x},${y}`;
export const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
