// Pure combat formulas (no DOM/state dependency). `rng` is injectable for tests.

import { CONFIG } from "../data/config";

export type Rng = () => number;

// Basic physical hit: atk + [0..variance] - floor(def/2), minimum 1.
export function physicalDamage(atk, def, variance = 2, rng = Math.random) {
  return Math.max(1, atk + Math.floor(rng() * (variance + 1)) - Math.floor(def / 2));
}

// Magic hit that ignores most defense.
export function magicDamage(mag, def = 0, variance = 2, rng = Math.random) {
  return Math.max(1, mag + Math.floor(rng() * (variance + 1)) - Math.floor(def / 3));
}

// Applies critical multiplier when the roll passes.
export function applyCrit(baseDamage, critChance, mult, rng = Math.random) {
  return rng() < critChance ? Math.floor(baseDamage * mult) : baseDamage;
}

// Damage dealt by floor traps: 4-10 scaled by defense, minimum 3.
export function trapDamage(def, rng = Math.random) {
  const base = Math.floor(rng() * (10 - 4 + 1)) + 4;
  return Math.max(3, base - Math.floor(def / 3));
}

// Final damage after a guarding action (guard, then perfect block, cumulative).
export function guardedDamage(raw, blocking, perfect) {
  let d = raw;
  if (blocking) d = Math.max(1, Math.floor(d * CONFIG.GUARDING_DAMAGE_MULT));
  if (perfect) d = Math.max(1, Math.floor(d / CONFIG.PERFECT_BLOCK_DIVISOR));
  return d;
}

// XP needed to go from `level` to `level + 1` (mirrors the in-game curve).
export function xpForLevel(level) {
  let next = CONFIG.LEVEL_1_XP;
  for (let i = 1; i < level; i++) {
    next = Math.floor(next * CONFIG.XP_GROWTH_MULT + CONFIG.XP_GROWTH_ADD);
  }
  return next;
}
