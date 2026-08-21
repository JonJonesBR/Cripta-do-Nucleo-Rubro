import { CONFIG } from "../data/config";

// CRC32-like checksum for save corruption detection (pure).
export function checksum(data) {
  let hash = 0x811c9dc5;
  const str = JSON.stringify(data);
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x1000193);
  }
  return (hash >>> 0).toString(16);
}

// Migrates older save structures into the current schema (pure).
export function migrateRun(run) {
  if (!run || typeof run !== "object") return null;
  if (!run.player) return null;
  run.player.statusEffects = run.player.statusEffects || {};
  run.player.relicNames = run.player.relicNames || [];
  run.player.gold = typeof run.player.gold === "number" ? run.player.gold : 0;
  run.player.combo = run.player.combo || 0;
  run.player.momentum = run.player.momentum || 0;
  run.player.maxStamina = run.player.maxStamina || CONFIG.PLAYER_STAMINA_MAX;
  run.player.stamina = typeof run.player.stamina === "number" ? run.player.stamina : run.player.maxStamina;
  run.player.monsters = run.player.monsters || [];
  run.player.captureCrystals = typeof run.player.captureCrystals === "number" ? run.player.captureCrystals : 1;
  run.player.activeSlot = typeof run.player.activeSlot === "number" ? run.player.activeSlot : 0;
  if (run.enemies && Array.isArray(run.enemies)) {
    run.enemies = run.enemies.filter((e) => e && e.alive);
    for (const e of run.enemies) e.statusEffects = e.statusEffects || {};
  }
  if (run.items && Array.isArray(run.items)) {
    run.items = run.items.filter((it) => it && !it.used);
  }
  run.runStats = run.runStats || { kills: 0, chests: 0, shrines: 0, traps: 0, relics: 0 };
  return run;
}
