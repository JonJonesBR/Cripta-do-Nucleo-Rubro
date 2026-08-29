// @ts-nocheck
// Arquivo legado migrado em Fase 0. Os módulos em src/core e src/data são totalmente tipados.
import { COLORS, applyAccessibilityPalette } from "./data/colors";
import {
  CONFIG, TILE, SPRITE_SCALE, MAP_W, MAP_H, VIEW_W, VIEW_H, FINAL_FLOOR,
  TILE_WALL, TILE_FLOOR, TILE_EXIT, DIR_X, DIR_Y
} from "./data/config";
import { CLASS_DATA } from "./data/classes";
import { ENEMY_TYPES, BOSS, MINIBOSSES, ELITE_AFFIXES, ENEMY_ELEMENT_BY_KIND, ELEMENT_AFFINITY } from "./data/enemies";
import { RELIC_EFFECTS, RELIC_POOL } from "./data/relics";
import { EVENT_TYPES, EVENT_OPTIONS } from "./data/events";
import { INTRO_TEXT, LORE_FRAGMENTS, FLOOR_MESSAGES, MENTOR_TEXT } from "./data/lore";
import { ACHIEVEMENTS } from "./data/achievements";
import { STRINGS } from "./data/strings";
import {
  rand, chance, seedRand, seedChance, setGameSeed,
  getGameSeed, setSeedFloor, resetSeedForFloor, clamp, key, distance
} from "./core/rng";
import { checksum, migrateRun } from "./core/save";
import { findPathBFSGrid } from "./core/pathfinding";
import { attackRoll, applyCrit, guardedDamage, specialDamage, summonDamage, trapDamage, xpForLevel, rogueBleedPower, mageBurnPower, witchBurnPower, beastBleedPower, venomBleedPower } from "./core/combat";
import { generateDungeon, isWalkable, revealFog, isDiscovered, computeDijkstraMap, nextStepFromDijkstra, findFreeTile, ensureDungeonRuntimeState } from "./core/dungeon";
import { resolveEventChoice } from "./core/events";
import { buildShopOfferings } from "./core/shop";
import { playerElementForClass, elementMultiplier, assignEnemyElement, applyEliteAffix } from "./core/elements";
import { rollTalentChoices } from "./data/talents";
import { captureChance, captureSuccess, makeWildEnemy, snapshotChampion, restoreChampion, applyMonsterToPlayer, readPlayerToMonster } from "./core/monsters";
import { rollRelic } from "./core/relics";
import { bossPatternIndex, decideEnemyAction, computeSynergy } from "./core/ai";

"use strict";


function initAdaptiveViewport() {
  let availW = 0, availH = 0;
  const wrap = document.getElementById("screenWrap");
  if (wrap && typeof wrap.getBoundingClientRect === "function") {
    const r = wrap.getBoundingClientRect();
    if (r && r.width > 0 && r.height > 0) { availW = r.width; availH = r.height; }
  }
  if (!availW && typeof window !== "undefined" && window.innerWidth) { availW = window.innerWidth; availH = window.innerHeight; }
  if (!availW) { availW = 320; availH = 240; }
  const aspect = availW / availH;

  let viewW, viewH;
  if (aspect >= 1) {
    viewW = 18;
    viewH = Math.max(7, Math.min(15, Math.round(viewW / aspect)));
  } else {
    viewH = 16;
    viewW = Math.max(10, Math.min(18, Math.round(viewH * aspect)));
  }
  viewW = Math.min(viewW, MAP_W - 1);
  viewH = Math.min(viewH, MAP_H - 1);
  if (!isFinite(viewW)) viewW = 14;
  if (!isFinite(viewH)) viewH = 10;

  CONFIG.VIEW_W = viewW;
  CONFIG.VIEW_H = viewH;
  CONFIG.CANVAS_W = viewW * TILE;
  CONFIG.CANVAS_H = viewH * TILE;
}

function applyCanvasSize() {
  canvas.width = CONFIG.CANVAS_W * RENDER_SCALE;
  canvas.height = CONFIG.CANVAS_H * RENDER_SCALE;
  if (typeof ctx.scale === "function") ctx.scale(RENDER_SCALE, RENDER_SCALE);
  ctx.imageSmoothingEnabled = false;
  if (typeof resizeCanvasDisplay === "function") resizeCanvasDisplay();
}

function reflowAdaptiveViewport() {
  initAdaptiveViewport();
  applyCanvasSize();
}

initAdaptiveViewport();

const enemyPool = [];
const itemPool = [];

function acquireEnemy() {
  const e = enemyPool.pop() || {};
  e.intent = null;
  e.nextIntent = null;
  e.telegraphCooldown = 0;
  return e;
}

function releaseEnemy(enemy) {
  if (!enemy) return;
  for (const key in enemy) delete enemy[key];
  if (enemyPool.length < CONFIG.POOL_ENEMY_MAX) enemyPool.push(enemy);
}

function acquireItem() {
  return itemPool.pop() || {};
}

function releaseItem(item) {
  if (!item) return;
  for (const key in item) delete item[key];
  if (itemPool.length < CONFIG.POOL_ITEM_MAX) itemPool.push(item);
}

function resetEnemyPool() {
  enemyPool.length = 0;
}

function resetItemPool() {
  itemPool.length = 0;
}


let audioCtx = null;
let masterComp = null;
let musicTimer = null;
let musicStep = 0;
let soundEnabled = true;
let sfxVolume = 1;
let musicVolume = 0.3;
let colorBlindMode = "off";
let highContrast = false;
let reduceFlash = false;
let uiScale = "normal";
let difficulty = "normal";

function getSoundEnabled() {
  return soundEnabled;
}

function setSoundEnabled(enabled) {
  soundEnabled = enabled;
  if (!enabled) stopMusic();
  saveSettings();
  return soundEnabled;
}

function toggleSound() {
  return setSoundEnabled(!soundEnabled);
}

function getAudioCtx() {
  return audioCtx;
}

function ensureCtx() {
  if (!soundEnabled) return null;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  if (!audioCtx) audioCtx = new AudioCtor();
  if (!masterComp) {
    masterComp = audioCtx.createDynamicsCompressor();
    masterComp.threshold.value = -12;
    masterComp.knee.value = 4;
    masterComp.ratio.value = 12;
    masterComp.attack.value = 0.003;
    masterComp.release.value = 0.08;
    masterComp.connect(audioCtx.destination);
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function tone(freq, start, duration, type = "square", gain = 0.05) {
  const ctx = audioCtx;
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const vol = ctx.createGain();
  const end = start + duration;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  vol.gain.setValueAtTime(0.0001, start);
  vol.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), start + 0.015);
  vol.gain.setTargetAtTime(gain * 0.72, start + 0.02, 0.03);
  vol.gain.exponentialRampToValueAtTime(0.0001, end);
  vol.gain.linearRampToValueAtTime(0.00001, end + 0.006);
  osc.connect(vol).connect(masterComp || ctx.destination);
  osc.start(start);
  osc.stop(end + 0.012);
}

function noise(start, duration, gain = 0.08) {
  const ctx = audioCtx;
  if (!ctx) return;
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  const src = ctx.createBufferSource();
  const vol = ctx.createGain();
  const end = start + duration;
  src.buffer = buffer;
  vol.gain.setValueAtTime(0.0001, start);
  vol.gain.linearRampToValueAtTime(gain, start + 0.008);
  vol.gain.exponentialRampToValueAtTime(0.0001, end);
  vol.gain.linearRampToValueAtTime(0.00001, end + 0.006);
  src.connect(vol).connect(masterComp || ctx.destination);
  src.start(start);
  src.stop(end + 0.012);
}

function playSfx(name, opts = {}) {
  if (!soundEnabled) return;
  try {
    const ctx = ensureCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const g = sfxVolume;
    const pitch = (opts.pitch || 0) * 0.05;
    const p = (f) => f * (1 + pitch);
    if (name === "step") tone(95, t, 0.055, "square", 0.025 * g);
    if (name === "bump") { tone(70, t, 0.08, "sawtooth", 0.04 * g); noise(t, 0.07, 0.025 * g); }
    if (name === "hit") { tone(p(180), t, 0.06, "square", 0.065 * g); tone(p(92), t + 0.04, 0.09, "sawtooth", 0.05 * g); }
    if (name === "crit") { tone(p(240), t, 0.07, "square", 0.08 * g); tone(p(360), t + 0.03, 0.1, "square", 0.06 * g); noise(t, 0.06, 0.06 * g); }
    if (name === "hurt") { tone(p(110), t, 0.12, "sawtooth", 0.07 * g); noise(t, 0.12, 0.05 * g); }
    if (name === "potion") { tone(523, t, 0.08, "triangle", 0.05 * g); tone(784, t + 0.08, 0.12, "triangle", 0.05 * g); }
    if (name === "trap") { noise(t, 0.15, 0.08 * g); tone(72, t, 0.16, "sawtooth", 0.06 * g); }
    if (name === "ominous") { tone(55, t, 0.42, "sine", 0.075 * g); tone(82, t + 0.04, 0.34, "triangle", 0.035 * g); }
    if (name === "boom") { tone(46, t, 0.5, "sawtooth", 0.09 * g); noise(t, 0.22, 0.06 * g); }
    if (name === "bossHit") { tone(38, t, 0.35, "sawtooth", 0.1 * g); noise(t, 0.12, 0.07 * g); }
    if (name === "rune") { tone(740, t, 0.08, "triangle", 0.07 * g); tone(1108, t + 0.045, 0.11, "square", 0.04 * g); }
    if (name === "level") [392, 523, 659, 784].forEach((f, i) => tone(f, t + i * 0.08, 0.12, "square", 0.045 * g));
    if (name === "win") {
      [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(f, t + i * 0.1, 0.2, "triangle", 0.05 * g));
      [261, 329].forEach((f, i) => tone(f, t + 0.3 + i * 0.2, 0.5, "sine", 0.05 * g));
    }
    if (name === "victory") {
      [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => tone(f, t + i * 0.08, 0.22, "triangle", 0.06 * g));
      [262, 330, 392].forEach((f, i) => tone(f, t + 0.5 + i * 0.12, 0.4, "sine", 0.05 * g));
    }
    if (name === "select") tone(440, t, 0.08, "triangle", 0.04 * g);
    if (name === "clash") { tone(120, t, 0.06, "sawtooth", 0.09 * g); tone(180, t + 0.03, 0.04, "square", 0.07 * g); noise(t, 0.04, 0.08 * g); }
    if (name === "block") { tone(440, t, 0.04, "square", 0.05 * g); tone(660, t + 0.02, 0.06, "triangle", 0.04 * g); noise(t, 0.03, 0.03 * g); }
    if (name === "chest") [440, 554, 659].forEach((f, i) => tone(f, t + i * 0.08, 0.14, "triangle", 0.05 * g));
    if (name === "shrine") [392, 523, 659, 784].forEach((f, i) => tone(f, t + i * 0.09, 0.2, "sine", 0.04 * g));
    if (name === "relic") [784, 988, 1175].forEach((f, i) => tone(f, t + i * 0.07, 0.15, "triangle", 0.06 * g));
    if (name === "descend") { tone(130, t, 0.3, "sawtooth", 0.04 * g); tone(65, t + 0.05, 0.35, "sine", 0.03 * g); noise(t, 0.12, 0.03 * g); }
    if (name === "death") [440, 370, 294, 220, 146].forEach((f, i) => tone(f + i * -60, t + i * 0.12, 0.35, "sawtooth", 0.04 * g));
  } catch (e) { /* WebAudio unavailable — silent fallback */ }
}

const FLOOR_THEMES = [
  [146.83, 174.61, 196.0, 220.0, 196.0, 174.61, 130.81, 146.83],
  [98.0, 110.0, 130.81, 146.83, 130.81, 110.0, 98.0, 82.41],
  [82.41, 98.0, 110.0, 130.81, 146.83, 130.81, 110.0, 98.0],
  [72.0, 82.41, 98.0, 110.0, 130.81, 98.0, 82.41, 72.0],
  [65.41, 72.0, 82.41, 98.0, 110.0, 130.81, 82.41, 65.41],
  [55.0, 65.41, 72.0, 82.41, 98.0, 110.0, 72.0, 65.41]
];

function startMusic(opts = {}) {
  if (!soundEnabled || !audioCtx) return;
  const bossCombat = opts.bossCombat || false;
  const floorIndex = opts.floor !== undefined ? Math.min(opts.floor, FLOOR_THEMES.length - 1) : 0;
  const isCombat = opts.isCombat || false;
  if (musicTimer && !isCombat) return;
  if (musicTimer) { clearTimeout(musicTimer); musicTimer = null; }
  const scheduleNext = () => {
    if (!soundEnabled || !audioCtx) {
      musicTimer = null;
      return;
    }
    const t = audioCtx.currentTime;
    const g = musicVolume;
    const notes = bossCombat
      ? [146.83, 164.81, 196.0, 220.0, 233.08, 277.18, 293.66, 233.08]
      : FLOOR_THEMES[floorIndex];
    const root = notes[musicStep % notes.length];
    tone(root, t, bossCombat ? 0.18 : 0.14, bossCombat ? "sawtooth" : "triangle", (bossCombat ? 0.032 : 0.018) * g);
    if (musicStep % 4 === 0) tone(root / 2, t, bossCombat ? 0.3 : 0.22, "sine", (bossCombat ? 0.072 : 0.025) * g);
    if (isCombat || bossCombat) tone(root * (bossCombat ? 1.75 : 1.5), t + 0.08, 0.1, "square", (bossCombat ? 0.028 : 0.017) * g);
    musicStep++;
    musicTimer = setTimeout(scheduleNext, bossCombat ? CONFIG.MUSIC_BOSS_INTERVAL_MS : CONFIG.MUSIC_NORMAL_INTERVAL_MS);
  };
  scheduleNext();
}

function stopMusic() {
  clearTimeout(musicTimer);
  musicTimer = null;
}

function unlockAudio() {
  ensureCtx();
  if (!audioCtx) return;
  startMusic();
}

function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

function setSfxVolume(v) { sfxVolume = v; saveSettings(); }
function setMusicVolume(v) { musicVolume = v; saveSettings(); }

// =============================================================
// SETTINGS PERSISTENCE
// =============================================================
function saveSettings() {
  try {
localStorage.setItem(CONFIG.STORAGE_SETTINGS, JSON.stringify({
      soundEnabled,
      sfxVolume,
      musicVolume,
      oneHandedMode,
      endlessMode,
      combatMode,
      locale: currentLocale,
      gameSeed: getGameSeed(),
      gfxPresent,
      colorBlindMode,
      highContrast,
      reduceFlash,
      uiScale,
      difficulty
    }));
  } catch (e) {
    if (typeof addLog === "function") addLog(`Erro ao salvar configurações: ${e.message}`, "red");
  }
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(CONFIG.STORAGE_SETTINGS);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (typeof s.soundEnabled === "boolean") soundEnabled = s.soundEnabled;
    if (typeof s.sfxVolume === "number") sfxVolume = Math.min(1, Math.max(0, s.sfxVolume));
    if (typeof s.musicVolume === "number") musicVolume = Math.min(1, Math.max(0, s.musicVolume));
    if (typeof s.oneHandedMode === "boolean") oneHandedMode = s.oneHandedMode;
if (typeof s.endlessMode === "boolean") endlessMode = s.endlessMode;
    if (s.combatMode === "action" || s.combatMode === "turn") combatMode = s.combatMode;
    else combatMode = "action";
    if (s.locale && STRINGS[s.locale]) currentLocale = s.locale;
if (typeof s.gameSeed === "string") { setGameSeed(s.gameSeed); }
    if (s.gfxPresent === "ps1" || s.gfxPresent === "2d") gfxPresent = s.gfxPresent;
    if (["off", "deuteranopia", "protanopia", "tritanopia"].includes(s.colorBlindMode)) colorBlindMode = s.colorBlindMode;
    if (typeof s.highContrast === "boolean") highContrast = s.highContrast;
    if (typeof s.reduceFlash === "boolean") reduceFlash = s.reduceFlash;
    if (["normal", "large", "xl"].includes(s.uiScale)) uiScale = s.uiScale;
    if (["normal", "easy", "story"].includes(s.difficulty)) difficulty = s.difficulty;
  } catch (e) {
    if (typeof addLog === "function") addLog(`Erro ao carregar configurações: ${e.message}`, "red");
  }
}



function getPlayerElement() {
  return playerElementForClass(player ? player.classKey : undefined);
}

function spawnEnemiesAndItems(dungeon, enemies, items, player, exitTile, currentFloor, runStats, meta) {
  const occupied = new Set([key(player.x, player.y), key(exitTile.x, exitTile.y)]);

const floorScale = CONFIG.FLOOR_SCALE_BASE + (currentFloor - 1) * CONFIG.FLOOR_SCALE_PER_FLOOR;
  const bossScale = CONFIG.FLOOR_SCALE_BASE + (currentFloor - 1) * CONFIG.BOSS_SCALE_PER_FLOOR;
  const defScale = Math.floor((currentFloor - 1) * CONFIG.ENEMY_DEF_SCALE_PER_FLOOR);

  if (currentFloor === CONFIG.FINAL_FLOOR) {
    const bossSpot = { x: exitTile.x, y: Math.max(1, exitTile.y - 1) };
    const finalBossSpot = isWalkable(dungeon, bossSpot.x, bossSpot.y) ? bossSpot : { x: exitTile.x - 1, y: exitTile.y };
    const boss = acquireEnemy();
    Object.assign(boss, {
      ...BOSS,
      x: finalBossSpot.x,
      y: finalBossSpot.y,
maxHp: Math.round(BOSS.hp * bossScale),
      hp: Math.round(BOSS.hp * bossScale),
      atk: Math.round(BOSS.atk * bossScale),
      def: BOSS.def + defScale,
      xp: Math.round(BOSS.xp * bossScale),
      alive: true, alert: false, statusEffects: {}, phase2: false, bossPattern: 0
    });
    assignEnemyElement(boss);
    enemies.push(boss);
    occupied.add(key(finalBossSpot.x, finalBossSpot.y));
  }

  const enemyCount = CONFIG.ENEMY_BASE_COUNT + currentFloor + rand(0, CONFIG.ENEMY_COUNT_VARIANCE);
  for (let i = 0; i < enemyCount; i++) {
    const pos = findFreeTile(dungeon, player, occupied, 7);
    if (!pos) break;
    occupied.add(key(pos.x, pos.y));
    const floorPool = ENEMY_TYPES.filter(e => e.minFloor <= currentFloor);
    const base = floorPool[rand(0, floorPool.length - 1)];
    const scale = floorScale + Math.floor(i / CONFIG.FLOOR_SCALE_EVERY_5_DIV) * CONFIG.FLOOR_SCALE_EVERY_5;
    const enemy = acquireEnemy();
    Object.assign(enemy, {
      ...base,
      x: pos.x, y: pos.y,
      maxHp: Math.round(base.hp * scale),
      hp: Math.round(base.hp * scale),
      atk: Math.round(base.atk * scale),
      def: base.def + defScale,
xp: Math.round(base.xp * scale),
      alive: true, alert: false, statusEffects: {}
    });
    assignEnemyElement(enemy);
    if (currentFloor >= 2 && chance(CONFIG.ELITE_CHANCE) && !enemy.boss && !enemy.miniboss) applyEliteAffix(enemy);
    enemies.push(enemy);
  }

  const potionCount = Math.max(CONFIG.POTION_MIN_COUNT, CONFIG.POTION_BASE_COUNT - currentFloor);
  for (let i = 0; i < potionCount; i++) {
    const pos = findFreeTile(dungeon, player, occupied, 4, 40);
    if (!pos) break;
    occupied.add(key(pos.x, pos.y));
    const item = acquireItem();
    Object.assign(item, { type: "potion", x: pos.x, y: pos.y, used: false });
    items.push(item);
  }

  const specialRooms = dungeon.rooms.slice(1, -1).sort(() => Math.random() - 0.5);
  const specials = [
    { type: "chest", count: CONFIG.CHEST_COUNT },
    { type: "shrine", count: CONFIG.SHRINE_COUNT },
    { type: "trap", count: CONFIG.TRAP_COUNT }
  ];

  for (const spec of specials) {
    for (let i = 0; i < spec.count && specialRooms.length; i++) {
      const room = specialRooms.pop();
      let pos = null;
      for (let attempt = 0; attempt < 20; attempt++) {
        const tryPos = { x: room.cx + rand(-1, 1), y: room.cy + rand(-1, 1) };
        if (isWalkable(dungeon, tryPos.x, tryPos.y) && !occupied.has(key(tryPos.x, tryPos.y))) {
          pos = tryPos;
          break;
        }
      }
      if (!pos) continue;
      occupied.add(key(pos.x, pos.y));
      const item = acquireItem();
      Object.assign(item, { type: spec.type, x: pos.x, y: pos.y, used: false });
      items.push(item);
    }
  }

  if (currentFloor === 3) {
    const mbDef = MINIBOSSES.find(m => m.floor === 3);
    if (mbDef) {
      const minibossSpot = findFreeTile(dungeon, player, occupied, 7);
      if (minibossSpot) {
        occupied.add(key(minibossSpot.x, minibossSpot.y));
        const mb = acquireEnemy();
        const mbScale = floorScale + mbDef.scaleOffset;
        Object.assign(mb, {
          ...mbDef,
          hp: Math.round(mbDef.hp * mbScale), maxHp: Math.round(mbDef.hp * mbScale),
          atk: Math.round(mbDef.atk * mbScale), def: mbDef.def + defScale,
          boss: false, miniboss: true,
          x: minibossSpot.x, y: minibossSpot.y,
          alive: true, alert: false, statusEffects: {}
        });
        assignEnemyElement(mb);
        enemies.push(mb);
      }
    }
  }

  if (currentFloor === CONFIG.FINAL_FLOOR) {
    const mbDef = MINIBOSSES.find(m => m.floor === 5);
    if (mbDef) {
      const minibossSpot = findFreeTile(dungeon, player, occupied, 7);
      if (minibossSpot) {
        occupied.add(key(minibossSpot.x, minibossSpot.y));
        const mb = acquireEnemy();
        const mbScale = floorScale + mbDef.scaleOffset;
        Object.assign(mb, {
          ...mbDef,
          hp: Math.round(mbDef.hp * mbScale), maxHp: Math.round(mbDef.hp * mbScale),
          atk: Math.round(mbDef.atk * mbScale), def: mbDef.def + defScale,
          boss: false, miniboss: true,
          x: minibossSpot.x, y: minibossSpot.y,
          alive: true, alert: false, statusEffects: {}
        });
        assignEnemyElement(mb);
        enemies.push(mb);
      }
    }
  }

  if (currentFloor >= 2 && chance(0.55) && specialRooms.length) {
    const room = specialRooms.pop();
    let pos = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      const tryPos = { x: room.cx + rand(-1, 1), y: room.cy + rand(-1, 1) };
      if (isWalkable(dungeon, tryPos.x, tryPos.y) && !occupied.has(key(tryPos.x, tryPos.y))) {
        pos = tryPos;
        break;
      }
    }
    if (pos) {
      occupied.add(key(pos.x, pos.y));
      const item = acquireItem();
      Object.assign(item, { type: "event", x: pos.x, y: pos.y, used: false, eventIdx: rand(0, EVENT_TYPES.length - 1) });
      items.push(item);
    }
  }

  if (currentFloor === 1) {
    const candidates = [
      { x: player.x + 2, y: player.y },
      { x: player.x - 2, y: player.y },
      { x: player.x, y: player.y + 2 },
      { x: player.x, y: player.y - 2 },
      { x: player.x + 3, y: player.y },
      { x: player.x, y: player.y + 3 }
    ];
    const spot = candidates.find(pos => isWalkable(dungeon, pos.x, pos.y) && !occupied.has(key(pos.x, pos.y)));
    if (spot) {
      occupied.add(key(spot.x, spot.y));
      const item = acquireItem();
      Object.assign(item, { type: "mentor", x: spot.x, y: spot.y, used: false });
      items.push(item);
    }
  }

  if (currentFloor >= 2) {
    const shopRooms = dungeon.rooms.slice(1, -1).sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(CONFIG.SHOP_ITEMS_PER_FLOOR, shopRooms.length); i++) {
      const room = shopRooms[i];
      let pos = null;
      for (let attempt = 0; attempt < 20; attempt++) {
        const tryPos = { x: room.cx + rand(-1, 1), y: room.cy + rand(-1, 1) };
        if (isWalkable(dungeon, tryPos.x, tryPos.y) && !occupied.has(key(tryPos.x, tryPos.y))) {
          pos = tryPos;
          break;
        }
      }
      if (!pos) continue;
      occupied.add(key(pos.x, pos.y));
      const item = acquireItem();
      Object.assign(item, { type: "shop", x: pos.x, y: pos.y, used: false });
      items.push(item);
    }
  }

  floorEnemySpawned = enemies.length;
  floorKills = 0;
}

function createPlayer(classKey, data, startRoom) {
  return {
    classKey,
    className: data.name,
    title: data.title,
    special: data.special,
    x: startRoom.cx,
    y: startRoom.cy,
    rx: startRoom.cx,
    ry: startRoom.cy,
    movePulse: 0,
    dir: "down",
    level: 1,
    xp: 0,
    nextXp: CONFIG.LEVEL_1_XP,
    maxHp: data.maxHp,
    hp: data.maxHp,
    atk: data.atk,
    def: data.def,
    mag: data.mag,
    crit: data.crit,
    potions: CONFIG.INITIAL_POTIONS + getDifficultyBonusPotions(),
    guarding: false,
    statusEffects: {},
    specialCd: 0,
    specialMaxCd: CONFIG.INITIAL_SPECIAL_CD,
thornShield: 0,
    ironGuardThorn: 0,
relicNames: [],
    gold: getDifficultyStartGold(),
    steps: 0,
    hitPulse: 0,
    combo: 0,
    comboMult: 0,
    timingCombo: 0,
    timingComboMult: 0,
    momentum: 0,
    attackPulse: 0,
    lungePulse: 0,
    stamina: CONFIG.PLAYER_STAMINA_MAX,
    maxStamina: CONFIG.PLAYER_STAMINA_MAX,
    monsters: [],
    captureCrystals: 1,
    activeSlot: 0
  };
}

const MONSTER_SKILLS = {
  slime: { name: "Gosma Ácida", atkMult: 1.4 },
  bat: { name: "Grito Sônico", atkMult: 1.3 },
  goblin: { name: "Finta Escura", atkMult: 1.5 },
  armor: { name: "Golpe de Escudo", atkMult: 1.6 },
  specter: { name: "Toque Espectral", atkMult: 1.35 },
  treant: { name: "Raízes Devoradoras", atkMult: 1.5 },
  golem: { name: "Martelo de Pedra", atkMult: 1.7 },
  lich: { name: "Dreno Vital", atkMult: 1.45, healRatio: 0.25 },
  wraith: { name: "Toque Rubro", atkMult: 1.4 }
};

function createMonsterFromEnemy(enemy) {
  const kind = enemy.kind || "slime";
  const skill = MONSTER_SKILLS[kind] || { name: "Investida", atkMult: 1.2 };
  const level = Math.max(1, enemy.level || 1);
  const scale = 1 + (level - 1) * 0.18;
  return {
    name: (enemy.eliteBaseName || enemy.name || "Monstro"),
    kind,
    color: enemy.color || "#8888ff",
    level,
    xp: 0,
    nextXp: CONFIG.LEVEL_1_XP,
    maxHp: Math.round((enemy.maxHp || 20) * 0.85),
    hp: Math.round((enemy.maxHp || 20) * 0.85),
    atk: Math.max(3, Math.round((enemy.atk || 5) * 0.8)),
    def: Math.max(1, Math.round((enemy.def || 1) * 0.9)),
    mag: Math.max(1, Math.round((enemy.atk || 5) * 0.5)),
    crit: 0.08,
    skill: skill.name,
    skillAtkMult: skill.atkMult,
    skillHealRatio: skill.healRatio || 0,
    skillCd: 0,
    alive: true
  };
}

function gainMonsterXp(monster, amount) {
  if (!monster) return;
  monster.xp += amount;
  while (monster.xp >= monster.nextXp) {
    monster.xp -= monster.nextXp;
    monster.level++;
    monster.nextXp = xpForLevel(monster.level);
    monster.maxHp += 5;
    monster.hp = monster.maxHp;
    monster.atk += 2;
    monster.def += 1;
    monster.mag += 1;
  }
}

function getActiveFighterName() {
  if (player && player.activeSlot > 0 && player.monsters[player.activeSlot - 1]) {
    return player.monsters[player.activeSlot - 1].name;
  }
  return player ? player.className : "";
}

function gainXp(player, amount) {
  player.xp += amount;
  let leveled = false;
  while (player.xp >= player.nextXp) {
    player.xp -= player.nextXp;
    player.level++;
    player.nextXp = xpForLevel(player.level);
    const hpBonus = { warrior: CONFIG.LEVEL_UP_HP_WARRIOR, rogue: CONFIG.LEVEL_UP_HP_ROGUE, mage: CONFIG.LEVEL_UP_HP_MAGE, beastmaster: CONFIG.LEVEL_UP_HP_BEASTMASTER, witch: CONFIG.LEVEL_UP_HP_WITCH }[player.classKey] || 6;
    player.maxHp += hpBonus;
    player.hp = player.maxHp;
    const atkBonus = { mage: CONFIG.LEVEL_UP_ATK_MAGE, witch: CONFIG.LEVEL_UP_ATK_WITCH, beastmaster: CONFIG.LEVEL_UP_ATK_BEASTMASTER, warrior: CONFIG.LEVEL_UP_ATK_WARRIOR, rogue: CONFIG.LEVEL_UP_ATK_ROGUE }[player.classKey] || 2;
    player.atk += atkBonus;
    const defBonus = { warrior: CONFIG.LEVEL_UP_DEF_WARRIOR, beastmaster: CONFIG.LEVEL_UP_DEF_BEASTMASTER, rogue: CONFIG.LEVEL_UP_DEF_ROGUE, mage: CONFIG.LEVEL_UP_DEF_MAGE, witch: CONFIG.LEVEL_UP_DEF_WITCH }[player.classKey] || 1;
    player.def += defBonus;
    player.mag += player.classKey === "mage" ? CONFIG.LEVEL_UP_MAG_MAGE : player.classKey === "witch" ? CONFIG.LEVEL_UP_MAG_WITCH : CONFIG.LEVEL_UP_MAG_OTHER;
    const critBonus = { rogue: CONFIG.LEVEL_UP_CRIT_ROGUE, beastmaster: CONFIG.LEVEL_UP_CRIT_BEASTMASTER, witch: CONFIG.LEVEL_UP_CRIT_WITCH, warrior: CONFIG.LEVEL_UP_CRIT_WARRIOR, mage: CONFIG.LEVEL_UP_CRIT_MAGE }[player.classKey] || 0.01;
    player.crit = Math.min(CONFIG.MAX_CRIT, player.crit + critBonus);
    player.pendingTalents = (player.pendingTalents || 0) + 1;
    leveled = true;
  }
  return leveled;
}

function tryOpenTalentDialog() {
  if (!player || !player.pendingTalents || player.pendingTalents <= 0) return false;
  if (gameState !== "explore") return false;
  player.pendingTalents--;
  startTalentDialog();
  return true;
}

function pickRelic(player) {
  const relic = rollRelic(player.relicNames || []);
  relic.apply(player);
  if (!player.relicNames.includes(relic.name)) player.relicNames.push(relic.name);
  return relic;
}

function startTalentDialog() {
  const choices = rollTalentChoices(player.chosenTalents || []);
  if (!choices.length) return;
  talentDialog = { choices, selected: 0 };
  gameState = "bossIntro";
  inputFrozen = true;
  playSfx("level");
  updateUI();
}

function chooseTalent(idx) {
  if (!talentDialog || gameState !== "bossIntro") return;
  const t = talentDialog.choices[idx];
  if (!t) return;
  player.chosenTalents = player.chosenTalents || [];
  player.chosenTalents.push(t.name);
  t.apply(player);
  const x = sxFor(player.x), y = syFor(player.y);
  burst(x, y, COLORS.gold, 18, "spark");
  showToast(t.name.toUpperCase());
  talentDialog = null;
  inputFrozen = false;
  gameState = "explore";
  updateUI();
  saveCurrentRun();
}

function closeTalentDialog() {
  if (!talentDialog) return;
  talentDialog = null;
  inputFrozen = false;
  gameState = "explore";
  updateUI();
}

function addStatus(target, type, turns, power = 0) {
  if (!target.statusEffects) target.statusEffects = {};
  target.statusEffects[type] = { turns, power };
}

function processStatusTurn(target) {
  if (!target.statusEffects) target.statusEffects = {};

  if (target.statusEffects.bleed?.turns > 0) {
    const dmg = target.statusEffects.bleed.power || CONFIG.BLEED_DEFAULT_POWER;
    target.hp = Math.max(0, target.hp - dmg);
    target.statusEffects.bleed.turns--;
    if (target.statusEffects.bleed.turns <= 0) delete target.statusEffects.bleed;
    return { dmg, type: "bleed" };
  }

  if (target.statusEffects.burn?.turns > 0) {
    const dmg = target.statusEffects.burn.power || CONFIG.BURN_DEFAULT_POWER;
    target.hp = Math.max(0, target.hp - dmg);
    target.statusEffects.burn.turns--;
    if (target.statusEffects.burn.turns <= 0) delete target.statusEffects.burn;
    return { dmg, type: "burn" };
  }

  if (target.statusEffects.vulnerable?.turns > 0) {
    target.statusEffects.vulnerable.turns--;
    if (target.statusEffects.vulnerable.turns <= 0) delete target.statusEffects.vulnerable;
  }

  if (target.statusEffects.stun?.turns > 0) {
    target.statusEffects.stun.turns--;
    if (target.statusEffects.stun.turns <= 0) delete target.statusEffects.stun;
    return { type: "stun", skipTurn: true };
  }

  return { skipTurn: false };
}


const effectPool = [];
let effects = [];
let motes = [];
let embers = [];
function getEffects() { return effects; }
function getMotes() { return motes; }
function getEmbers() { return embers; }
function setTick(v) { tick = v; }

function spawnEffect(type, x, y, text = "", color = COLORS.white, options = {}) {
  spawnEffectDirect(
    type, x, y, text, color,
    options.life || CONFIG.EFFECT_LIFE_DEFAULT,
    options.vx ?? rand(-8, 8) / 10,
    options.vy ?? -0.45 - Math.random() * 0.45,
    options.size || 1,
    options.spin || rand(-2, 2)
  );
}

function spawnEffectDirect(type, x, y, text, color, life, vx, vy, size, spin = 0) {
  const effect = effectPool.pop() || {};
  effect.type = type;
  effect.x = x;
  effect.y = y;
  effect.text = text;
  effect.color = color;
  effect.life = life;
  effect.maxLife = life;
  effect.vx = vx;
  effect.vy = vy;
  effect.size = size;
  effect.spin = spin;
  effects.push(effect);
  while (effects.length > CONFIG.EFFECTS_MAX_COUNT) recycleEffectAt(0);
}

function spawnFloatingText(x, y, text, color, scale = 1) {
  spawnEffectDirect("text", x + rand(-6, 6), y, text, color, CONFIG.EFFECT_LIFE_TEXT, rand(-8, 8) / 10, -0.45 - Math.random() * 0.45, scale, rand(-2, 2));
}

function recycleEffectAt(index) {
  const effect = effects[index];
  effects.splice(index, 1);
  if (effectPool.length < CONFIG.EFFECT_POOL_MAX) effectPool.push(effect);
}

function burst(x, y, color, count = 8, type = "spark") {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.45;
    const speed = 0.7 + Math.random() * 1.6;
    spawnEffectDirect(type, x, y, "", color, rand(CONFIG.EFFECT_LIFE_SPARK_MIN, CONFIG.EFFECT_LIFE_SPARK_MAX), Math.cos(angle) * speed, Math.sin(angle) * speed, rand(1, 3), rand(-2, 2));
  }
}

function hitStop(level) {
  if (reducedMotion) return;
  freezeFrames = Math.max(freezeFrames, level || 1);
}

function triggerKillSlowMo() {
  if (reducedMotion) { if (!reduceFlash) { flash = 8; flashColor = "#ffffff"; } return; }
  slowMoTicks = CONFIG.SLOW_MO_TICKS;
  if (!reduceFlash) { flash = 10; flashColor = "#ffffff"; }
  if (!reduceFlash) zoomPulse = CONFIG.ZOOM_PULSE_MAX;
}

function triggerZoomPulse() {
  if (reducedMotion) return;
  zoomPulse = Math.max(zoomPulse, CONFIG.ZOOM_PULSE_MAX);
}

function setCinemaLetterbox(target) {
  cinemaLetterboxTarget = target;
}

function triggerBossIntroCinema() {
  setCinemaLetterbox(1);
  cinemaBossZoom = CONFIG.CINEMA_BOSS_ZOOM_IN;
  if (!reducedMotion && !reduceFlash) cinemaBossTremor = CONFIG.CINEMA_BOSS_TREMOR * 40;
  slowMoTicks = Math.max(slowMoTicks, CONFIG.CINEMA_BOSS_SLOWMO_TICKS);
}

function triggerBossDeathCinema() {
  if (reducedMotion) return;
  cinemaBossZoom = CONFIG.CINEMA_BOSS_DEATH_ZOOM_OUT;
  slowMoTicks = Math.max(slowMoTicks, CONFIG.CINEMA_BOSS_SLOWMO_TICKS);
  if (!reduceFlash) { flash = Math.max(flash, 12); flashColor = "#ff4040"; }
  setCinemaLetterbox(1);
  setTimeout(() => setCinemaLetterbox(0), 900);
}

function triggerSurgeScreenFx() {
  if (reducedMotion) { if (!reduceFlash) flashOf(COLORS.gold, 8); return; }
  cinemaSurgeFx = CONFIG.CINEMA_SURGE_SHOCKWAVE_TICKS;
  cinemaSurgeScanline = CONFIG.CINEMA_SURGE_SCANLINE_BOOST;
  if (!reduceFlash) flashOf(COLORS.gold, CONFIG.CINEMA_SURGE_FLASH_TICKS);
}

function shakeFrom(fromX, fromY, toX, toY, magnitude) {
  if (reducedMotion) return;
  const ang = Math.atan2(toY - fromY, toX - fromX);
  shakeDirX = -Math.cos(ang);
  shakeDirY = -Math.sin(ang);
  shake = Math.max(shake, magnitude);
}

function flashOf(color, strength = 6) {
  if (reduceFlash) strength = Math.min(2, strength);
  flash = Math.max(flash, strength);
  flashColor = color || "#ffffff";
}

function seedMotes() {
  const W = CONFIG.CANVAS_W, H = CONFIG.CANVAS_H;
  motes = Array.from({ length: CONFIG.MOTE_COUNT }, (_, i) => ({
    x: rand(0, W),
    y: rand(0, H),
    r: rand(1, 2),
    speed: CONFIG.MOTE_SPEED_MIN + Math.random() * (CONFIG.MOTE_SPEED_MAX - CONFIG.MOTE_SPEED_MIN),
    phase: i * CONFIG.MOTE_PHASE_STEP
  }));
  embers = Array.from({ length: CONFIG.EMBER_COUNT }, () => ({
    x: rand(0, W),
    y: rand(0, H),
    r: rand(1, 3),
    speed: 0.35 + Math.random() * 0.55,
    drift: Math.random() * Math.PI * 2,
    life: rand(60, 200),
    maxLife: 200
  }));
}

function updateEffects() {
  for (let i = effects.length - 1; i >= 0; i--) {
    const effect = effects[i];
    effect.life--;
    effect.x += effect.vx;
    effect.y += effect.vy;
    effect.vx *= 0.96;
    effect.vy *= 0.96;
    if (effect.life <= 0) recycleEffectAt(i);
  }
}

function updateMotes() {
  const W = CONFIG.CANVAS_W, H = CONFIG.CANVAS_H;
  for (let i = 0; i < motes.length; i++) {
    const mote = motes[i];
    mote.y -= mote.speed;
    mote.x += Math.sin((tick + mote.phase) / CONFIG.MOTE_CYCLE_DIVISOR) * 0.08;
    if (mote.y < -4) {
      mote.y = H + rand(0, 20);
      mote.x = rand(0, W);
    }
  }
  for (let i = 0; i < embers.length; i++) {
    const e = embers[i];
    e.y -= e.speed;
    e.x += Math.sin((tick + e.drift) / 24) * 0.25;
    e.life--;
    if (e.life <= 0) {
      e.life = rand(60, 200);
      e.x = rand(0, W);
      e.y = H + rand(0, 10);
    }
  }
}

function spawnStatusParticles(entity, cameraRx, cameraRy) {
  const sfx = entity?.statusEffects || {};
  if (!sfx.bleed && !sfx.burn && !sfx.stun) return;
  const TILE = CONFIG.TILE_SIZE, W = CONFIG.CANVAS_W, H = CONFIG.CANVAS_H;
  const x = (entity.x - cameraRx) * TILE + TILE / 2;
  const y = (entity.y - cameraRy) * TILE + TILE / 2;
  if (x < -TILE || y < -TILE || x > W + TILE || y > H + TILE) return;
  if (sfx.bleed) spawnEffectDirect("spark", x + rand(-5, 5), y + rand(-8, 4), "", COLORS.red, CONFIG.EFFECT_LIFE_SPARK_MIN, rand(-2, 2) / 10, -0.35, 1, rand(-2, 2));
  if (sfx.burn) spawnEffectDirect("spark", x + rand(-5, 5), y + rand(-8, 4), "", COLORS.orange, CONFIG.EFFECT_LIFE_SPARK_MIN, rand(-2, 2) / 10, -0.45, 1, rand(-2, 2));
  if (sfx.stun) spawnEffectDirect("spark", x + rand(-6, 6), y - 10 + rand(-2, 2), "", COLORS.gold, 20, rand(-2, 2) / 10, -0.25, 1, rand(-2, 2));
}

function px(ctx, x, y, w, h, color, s = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w * s, h * s);
}

function drawShadow(ctx, x, y, s = 1) {
  ctx.fillStyle = COLORS.shadow;
  ctx.fillRect(x + 2 * s, y + 14 * s, 13 * s, 2 * s);
  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  ctx.fillRect(x + 4 * s, y + 13 * s, 9 * s, 1 * s);
}
function drawPs1Shadow(ctx, x, y, s = 1) {
  ctx.fillStyle = "rgba(6,6,18,0.75)";
  ctx.fillRect(x + 1 * s, y + 12 * s, 15 * s, 3 * s);
  ctx.fillRect(x + 2 * s, y + 14 * s, 13 * s, 2 * s);
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(x + 3 * s, y + 11 * s, 11 * s, 1 * s);
}

function ux(v) { return Math.round(v * CONFIG.CANVAS_W / 320); }
function uy(v) { return Math.round(v * CONFIG.CANVAS_H / 240); }

function drawPixelText(ctx, text, x, y, color = COLORS.text, scale = 1) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${8 * scale}px Courier New, monospace`;
  ctx.textBaseline = "top";
  ctx.shadowColor = "#000";
  ctx.shadowOffsetX = scale;
  ctx.shadowOffsetY = scale;
  ctx.shadowBlur = 0;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawWrappedPixelText(ctx, text, x, y, maxWidth, color = COLORS.text, scale = 1) {
  ctx.save();
  ctx.font = `${8 * scale}px Courier New, monospace`;
  const words = text.split(" ");
  let line = "";
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      drawPixelText(ctx, line, x, yy, color, scale);
      line = word;
      yy += 12 * scale;
    } else {
      line = test;
    }
  }
  if (line) drawPixelText(ctx, line, x, yy, color, scale);
  ctx.restore();
}

function drawWrappedUiText(ctx, text, x, y, maxWidth, color = COLORS.text, size = 11, lineHeight = 15) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `600 ${size}px system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = "top";
  ctx.shadowColor = "#000";
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;
  ctx.shadowBlur = 0;
  const words = text.split(" ");
  let line = "";
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
  ctx.restore();
}

function drawEntityGlow(ctx, x, y, color, alpha, tick) {
  ctx.globalAlpha = alpha + Math.sin(tick / 12) * 0.04;
  ctx.fillStyle = color;
  ctx.fillRect(x + 3, y + 4, TILE - 6, TILE - 6);
  ctx.globalAlpha = 1;
}

function drawTinyHpBar(ctx, x, y, ratio, color) {
  if (ratio >= 1) return;
  ctx.fillStyle = COLORS.black;
  ctx.fillRect(x, y, 16, 3);
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, Math.max(1, Math.floor(14 * ratio)), 1);
}

function drawFacingMarker(ctx, x, y, dir) {
  ctx.fillStyle = COLORS.gold;
  if (dir === "up") ctx.fillRect(x + 11, y + 1, 3, 2);
  if (dir === "down") ctx.fillRect(x + 11, y + 21, 3, 2);
  if (dir === "left") ctx.fillRect(x + 1, y + 11, 2, 3);
  if (dir === "right") ctx.fillRect(x + 21, y + 11, 2, 3);
}

function drawSpriteWarrior(ctx, x, y, s, tick, player) {
  drawShadow(ctx, x, y, s);
  const bob = Math.sin(tick / 9) > 0 ? 0 : 1;
  px(ctx, x + 6*s, y + (2+bob)*s, 5, 4, "#ffd59f", s);
  px(ctx, x + 5*s, y + (1+bob)*s, 7, 2, "#7a4a2a", s);
  px(ctx, x + 5*s, y + (6+bob)*s, 7, 6, hasRelic(player, "Manto Cinzento") ? "#a8a8d7" : "#5ca8ff", s);
  if (hasRelic(player, "Manto Cinzento")) px(ctx, x + 6*s, y + (7+bob)*s, 5, 3, "#d7d7ff", s);
  px(ctx, x + 3*s, y + (7+bob)*s, 3, 6, "#d7d7ff", s);
  px(ctx, x + 11*s, y + (7+bob)*s, 3, 6, "#d7d7ff", s);
  px(ctx, x + 4*s, y + (12+bob)*s, 3, 2, "#30306b", s);
  px(ctx, x + 10*s, y + (12+bob)*s, 3, 2, "#30306b", s);
  px(ctx, x + 12*s, y + (4+bob)*s, 2, 6, hasRelic(player, "Lâmina Rúnica") ? COLORS.blue : "#f7f3d7", s);
  if (hasRelic(player, "Lâmina Rúnica")) px(ctx, x + 14*s, y + (3+bob)*s, 1, 1, COLORS.white, s);
}

function drawSpriteRogue(ctx, x, y, s, tick, player) {
  drawShadow(ctx, x, y, s);
  const bob = Math.sin(tick / 8) > 0 ? 0 : 1;
  px(ctx, x + 6*s, y + (2+bob)*s, 5, 4, "#ffd59f", s);
  px(ctx, x + 5*s, y + (1+bob)*s, 7, 3, "#2b1747", s);
  px(ctx, x + 5*s, y + (6+bob)*s, 7, 6, hasRelic(player, "Manto Cinzento") ? "#7474a8" : "#b86cff", s);
  if (hasRelic(player, "Manto Cinzento")) px(ctx, x + 6*s, y + (7+bob)*s, 5, 2, "#c6c6e8", s);
  px(ctx, x + 4*s, y + (8+bob)*s, 2, 5, "#30306b", s);
  px(ctx, x + 11*s, y + (8+bob)*s, 2, 5, "#30306b", s);
  px(ctx, x + 12*s, y + (9+bob)*s, 3, 1, hasRelic(player, "Lâmina Rúnica") ? COLORS.blue : "#f7f3d7", s);
  if (hasRelic(player, "Lâmina Rúnica")) px(ctx, x + 15*s, y + (8+bob)*s, 1, 1, COLORS.white, s);
  px(ctx, x + 4*s, y + (12+bob)*s, 3, 2, "#151536", s);
  px(ctx, x + 10*s, y + (12+bob)*s, 3, 2, "#151536", s);
}

function drawSpriteBeastmaster(ctx, x, y, s, tick, player) {
  drawShadow(ctx, x, y, s);
  const bob = Math.sin(tick / 9) > 0 ? 0 : 1;
  px(ctx, x + 6*s, y + (2+bob)*s, 5, 4, "#ffd59f", s);
  px(ctx, x + 5*s, y + (1+bob)*s, 7, 2, "#6b3a1f", s);
  px(ctx, x + 5*s, y + (6+bob)*s, 7, 6, hasRelic(player, "Manto Cinzento") ? "#6b8f6b" : "#4ade80", s);
  if (hasRelic(player, "Manto Cinzento")) px(ctx, x + 6*s, y + (7+bob)*s, 5, 3, "#b8d7b8", s);
  px(ctx, x + 3*s, y + (7+bob)*s, 3, 5, "#7a4a2a", s);
  px(ctx, x + 11*s, y + (7+bob)*s, 3, 5, "#7a4a2a", s);
  px(ctx, x + 4*s, y + (12+bob)*s, 3, 2, "#30306b", s);
  px(ctx, x + 10*s, y + (12+bob)*s, 3, 2, "#30306b", s);
  px(ctx, x + 13*s, y + (5+bob)*s, 2, 2, COLORS.white, s);
  px(ctx, x + 14*s, y + (4+bob)*s, 1, 1, COLORS.white, s);
}

function drawSpriteWitch(ctx, x, y, s, tick, player) {
  drawShadow(ctx, x, y, s);
  const bob = Math.sin(tick / 10) > 0 ? 0 : 1;
  const robe = hasRelic(player, "Manto Cinzento") ? "#7a4a7a" : "#b86cff";
  px(ctx, x + 6*s, y + (2+bob)*s, 5, 4, "#d4a574", s);
  px(ctx, x + 5*s, y + (1+bob)*s, 7, 2, "#3b0764", s);
  px(ctx, x + 5*s, y + (6+bob)*s, 7, 7, robe, s);
  if (hasRelic(player, "Manto Cinzento")) px(ctx, x + 6*s, y + (7+bob)*s, 5, 2, "#c084c0", s);
  px(ctx, x + 7*s, y + (7+bob)*s, 3, 3, COLORS.gold, s);
  px(ctx, x + 4*s, y + (8+bob)*s, 2, 4, "#151536", s);
  px(ctx, x + 11*s, y + (8+bob)*s, 2, 4, "#151536", s);
  px(ctx, x + 12*s, y + (4+bob)*s, 2, 4, hasRelic(player, "Lâmina Rúnica") ? COLORS.blue : COLORS.green, s);
  if (hasRelic(player, "Lâmina Rúnica")) px(ctx, x + 14*s, y + (3+bob)*s, 1, 1, COLORS.white, s);
  px(ctx, x + 4*s, y + (12+bob)*s, 3, 2, "#151536", s);
  px(ctx, x + 10*s, y + (12+bob)*s, 3, 2, "#151536", s);
}

function drawSpriteMage(ctx, x, y, s, tick, player, ghostColor = null) {
  drawShadow(ctx, x, y, s);
  const bob = Math.sin(tick / 10) > 0 ? 0 : 1;
  const robe = ghostColor || (hasRelic(player, "Manto Cinzento") ? "#7474a8" : "#30306b");
  px(ctx, x + 6*s, y + (2+bob)*s, 5, 4, ghostColor || "#ffd59f", s);
  px(ctx, x + 5*s, y + (1+bob)*s, 7, 3, ghostColor || "#ffd45c", s);
  px(ctx, x + 5*s, y + (6+bob)*s, 7, 7, robe, s);
  if (hasRelic(player, "Manto Cinzento") && !ghostColor) px(ctx, x + 6*s, y + (7+bob)*s, 5, 2, "#d7d7ff", s);
  px(ctx, x + 7*s, y + (7+bob)*s, 3, 5, ghostColor || "#5ca8ff", s);
  px(ctx, x + 13*s, y + (5+bob)*s, 1, 9, hasRelic(player, "Lâmina Rúnica") && !ghostColor ? COLORS.blue : (ghostColor || "#ffd45c"), s);
  px(ctx, x + 12*s, y + (4+bob)*s, 3, 2, hasRelic(player, "Lâmina Rúnica") && !ghostColor ? COLORS.blue : (ghostColor || "#5ca8ff"), s);
  if (hasRelic(player, "Lâmina Rúnica") && !ghostColor) px(ctx, x + 14*s, y + (3+bob)*s, 1, 1, COLORS.white, s);
  px(ctx, x + 4*s, y + (13+bob)*s, 9, 1, "#151536", s);
}

function drawSpriteSlime(ctx, x, y, s, color, tick) {
  drawShadow(ctx, x, y, s);
  const bob = Math.sin(tick / 11) > 0 ? 0 : 1;
  px(ctx, x + 4*s, y + (8+bob)*s, 9, 4, color, s);
  px(ctx, x + 5*s, y + (6+bob)*s, 7, 3, color, s);
  px(ctx, x + 7*s, y + (7+bob)*s, 1, 1, COLORS.white, s);
  px(ctx, x + 11*s, y + (10+bob)*s, 1, 1, "#080816", s);
}

function drawSpriteBat(ctx, x, y, s, color, tick) {
  const bob = Math.sin(tick / 7) > 0 ? -1 : 1;
  drawShadow(ctx, x, y, s);
  px(ctx, x + 6*s, y + (6+bob)*s, 4, 5, color, s);
  px(ctx, x + 2*s, y + (5+bob)*s, 4, 3, color, s);
  px(ctx, x + 10*s, y + (5+bob)*s, 4, 3, color, s);
  px(ctx, x + 1*s, y + (8+bob)*s, 3, 2, "#30306b", s);
  px(ctx, x + 12*s, y + (8+bob)*s, 3, 2, "#30306b", s);
  px(ctx, x + 7*s, y + (7+bob)*s, 1, 1, COLORS.red, s);
  px(ctx, x + 9*s, y + (7+bob)*s, 1, 1, COLORS.red, s);
}

function drawSpriteGoblin(ctx, x, y, s, color, tick) {
  drawShadow(ctx, x, y, s);
  const bob = Math.sin(tick / 9) > 0 ? 0 : 1;
  px(ctx, x + 5*s, y + (3+bob)*s, 7, 5, color, s);
  px(ctx, x + 3*s, y + (4+bob)*s, 2, 2, color, s);
  px(ctx, x + 12*s, y + (4+bob)*s, 2, 2, color, s);
  px(ctx, x + 6*s, y + (8+bob)*s, 6, 5, "#7a4a2a", s);
  px(ctx, x + 6*s, y + (5+bob)*s, 1, 1, COLORS.black, s);
  px(ctx, x + 10*s, y + (5+bob)*s, 1, 1, COLORS.black, s);
  px(ctx, x + 12*s, y + (8+bob)*s, 3, 1, COLORS.white, s);
}

function drawSpriteArmor(ctx, x, y, s, color, tick) {
  drawShadow(ctx, x, y, s);
  const bob = Math.sin(tick / 12) > 0 ? 0 : 1;
  px(ctx, x + 5*s, y + (2+bob)*s, 7, 5, color, s);
  px(ctx, x + 6*s, y + (4+bob)*s, 5, 1, COLORS.black, s);
  px(ctx, x + 5*s, y + (7+bob)*s, 7, 6, "#7474a8", s);
  px(ctx, x + 3*s, y + (8+bob)*s, 3, 5, "#a8a8d7", s);
  px(ctx, x + 11*s, y + (8+bob)*s, 3, 5, "#a8a8d7", s);
  px(ctx, x + 13*s, y + (5+bob)*s, 1, 9, COLORS.red, s);
}

function drawSpriteSpecter(ctx, x, y, s, color, tick) {
  drawShadow(ctx, x, y, s);
  const bob = Math.sin(tick / 10) > 0 ? 0 : -2;
  const alpha = 0.7 + Math.sin(tick / 14) * 0.2;
  ctx.globalAlpha = alpha;
  px(ctx, x + 5*s, y + (3+bob)*s, 7, 8, color, s);
  px(ctx, x + 4*s, y + (5+bob)*s, 3, 5, "#522c78", s);
  px(ctx, x + 10*s, y + (5+bob)*s, 3, 5, "#522c78", s);
  px(ctx, x + 6*s, y + (4+bob)*s, 1, 1, COLORS.white, s);
  px(ctx, x + 10*s, y + (4+bob)*s, 1, 1, COLORS.white, s);
  px(ctx, x + 7*s, y + (8+bob)*s, 3, 2, COLORS.black, s);
  ctx.globalAlpha = 1;
}

function drawSpriteGolem(ctx, x, y, s, color, tick) {
  drawShadow(ctx, x, y, s);
  const bob = Math.sin(tick / 16) > 0 ? 0 : 1;
  px(ctx, x + 3*s, y + (2+bob)*s, 11, 11, color, s);
  px(ctx, x + 5*s, y + (1+bob)*s, 7, 2, "#92400e", s);
  px(ctx, x + 4*s, y + (4+bob)*s, 2, 2, COLORS.black, s);
  px(ctx, x + 10*s, y + (4+bob)*s, 2, 2, COLORS.black, s);
  px(ctx, x + 6*s, y + (8+bob)*s, 5, 2, "#92400e", s);
  px(ctx, x + 2*s, y + (6+bob)*s, 3, 6, "#78350f", s);
  px(ctx, x + 12*s, y + (6+bob)*s, 3, 6, "#78350f", s);
  px(ctx, x + 5*s, y + (12+bob)*s, 7, 1, "#92400e", s);
}

function drawSpriteWraith(ctx, x, y, s, color, tick) {
  drawShadow(ctx, x, y, s);
  const bob = Math.sin(tick / 9) > 0 ? 0 : -1;
  px(ctx, x + 5*s, y + (3+bob)*s, 6, 6, color, s);
  px(ctx, x + 3*s, y + (5+bob)*s, 4, 5, "#7f1d1d", s);
  px(ctx, x + 9*s, y + (5+bob)*s, 4, 5, "#7f1d1d", s);
  px(ctx, x + 6*s, y + (5+bob)*s, 1, 1, COLORS.white, s);
  px(ctx, x + 9*s, y + (5+bob)*s, 1, 1, COLORS.white, s);
  px(ctx, x + 4*s, y + (9+bob)*s, 8, 3, "#450a0a", s);
  px(ctx, x + 5*s, y + (11+bob)*s, 2, 1, color, s);
  px(ctx, x + 9*s, y + (11+bob)*s, 2, 1, color, s);
}

function drawSpriteTreant(ctx, x, y, s, color, tick) {
  drawShadow(ctx, x, y, s);
  const bob = Math.sin(tick / 13) > 0 ? 0 : 1;
  px(ctx, x + 4*s, y + (2+bob)*s, 8, 8, color, s);
  px(ctx, x + 5*s, y + (1+bob)*s, 6, 2, "#7a4a2a", s);
  px(ctx, x + 3*s, y + (4+bob)*s, 2, 2, COLORS.black, s);
  px(ctx, x + 11*s, y + (4+bob)*s, 2, 2, COLORS.black, s);
  px(ctx, x + 4*s, y + (10+bob)*s, 8, 3, "#7a4a2a", s);
  px(ctx, x + 2*s, y + (8+bob)*s, 3, 5, "#78350f", s);
  px(ctx, x + 11*s, y + (8+bob)*s, 3, 5, "#78350f", s);
  px(ctx, x + 3*s, y + (12+bob)*s, 4, 2, "#78350f", s);
  px(ctx, x + 9*s, y + (12+bob)*s, 4, 2, "#78350f", s);
}

function drawSpriteLich(ctx, x, y, s, color, tick) {
  drawShadow(ctx, x, y, s);
  const bob = Math.sin(tick / 10) > 0 ? 0 : -1;
  const alpha = 0.8 + Math.sin(tick / 12) * 0.15;
  ctx.globalAlpha = alpha;
  px(ctx, x + 5*s, y + (2+bob)*s, 6, 6, color, s);
  px(ctx, x + 4*s, y + (4+bob)*s, 3, 4, "#4c1d95", s);
  px(ctx, x + 9*s, y + (4+bob)*s, 3, 4, "#4c1d95", s);
  px(ctx, x + 6*s, y + (8+bob)*s, 5, 3, "#4c1d95", s);
  px(ctx, x + 6*s, y + (4+bob)*s, 1, 1, COLORS.white, s);
  px(ctx, x + 9*s, y + (4+bob)*s, 1, 1, COLORS.white, s);
  px(ctx, x + 5*s, y + (11+bob)*s, 2, 3, color, s);
  px(ctx, x + 9*s, y + (11+bob)*s, 2, 3, color, s);
  px(ctx, x + 7*s, y + (6+bob)*s, 2, 3, COLORS.red, s);
  ctx.globalAlpha = 1;
}

function drawSpriteBoss(ctx, x, y, s, tick) {
  drawShadow(ctx, x + 0, y + 4*s, s);
  const bob = Math.sin(tick / 10) > 0 ? 0 : 1;
  px(ctx, x + 4*s, y + (3+bob)*s, 10, 8, COLORS.red, s);
  px(ctx, x + 2*s, y + (5+bob)*s, 3, 6, "#8d1f4f", s);
  px(ctx, x + 13*s, y + (5+bob)*s, 3, 6, "#8d1f4f", s);
  px(ctx, x + 5*s, y + (1+bob)*s, 2, 3, COLORS.gold, s);
  px(ctx, x + 11*s, y + (1+bob)*s, 2, 3, COLORS.gold, s);
  px(ctx, x + 6*s, y + (6+bob)*s, 2, 2, COLORS.gold, s);
  px(ctx, x + 11*s, y + (6+bob)*s, 2, 2, COLORS.gold, s);
  px(ctx, x + 7*s, y + (10+bob)*s, 5, 2, COLORS.black, s);
  px(ctx, x + 5*s, y + (12+bob)*s, 4, 3, "#522c78", s);
  px(ctx, x + 10*s, y + (12+bob)*s, 4, 3, "#522c78", s);
}

function drawStatusBadges(ctx, entity, x, y) {
  const effects = entity.statusEffects || {};
  let bx = x;
  if (effects.bleed) { drawPixelText(ctx, "[SNG]", bx, y, COLORS.red, 1); bx += 34; }
  if (effects.burn) { drawPixelText(ctx, "[INC]", bx, y, COLORS.orange, 1); bx += 34; }
  if (effects.stun) drawPixelText(ctx, "[TRN]", bx, y, COLORS.gold, 1);
}

function drawSpriteByKind(ctx, enemy, x, y, s, color, tick) {
  if (enemy.boss) { drawSpriteBoss(ctx, x, y, s, tick); return; }
  switch (enemy.kind) {
    case "slime":   drawSpriteSlime(ctx, x, y, s, color, tick); break;
    case "bat":     drawSpriteBat(ctx, x, y, s, color, tick); break;
    case "goblin":  drawSpriteGoblin(ctx, x, y, s, color, tick); break;
    case "armor":   drawSpriteArmor(ctx, x, y, s, color, tick); break;
    case "specter": drawSpriteSpecter(ctx, x, y, s, color, tick); break;
    case "treant":  drawSpriteTreant(ctx, x, y, s, color, tick); break;
    case "golem":   drawSpriteGolem(ctx, x, y, s, color, tick); break;
    case "lich":    drawSpriteLich(ctx, x, y, s, color, tick); break;
    case "wraith":  drawSpriteWraith(ctx, x, y, s, color, tick); break;
  }
}

function drawEntityOnMap(ctx, enemy, cameraRx, cameraRy, tick) {
  const TILE = CONFIG.TILE_SIZE, W = CONFIG.CANVAS_W, H = CONFIG.CANVAS_H;
  const sx = (enemy.x - cameraRx) * TILE;
  const sy = (enemy.y - cameraRy) * TILE;
  if (sx < -TILE || sy < -TILE || sx > W || sy > H) return;
  const hitJolt = enemy.hitPulse > 0 ? Math.sin(enemy.hitPulse * CONFIG.HIT_PULSE_MULT) * CONFIG.HIT_JOLT_HEIGHT : 0;
  const stepLift = enemy.stepPulse > 0 ? -Math.sin((enemy.stepPulse / CONFIG.STEP_LIFT_DIVISOR) * Math.PI) * CONFIG.STEP_LIFT_HEIGHT : 0;
  const drawX = sx + hitJolt;
  const drawY = sy + stepLift + (enemy.hitPulse > 0 ? -1 : 0);
  drawEntityGlow(ctx, sx, sy, enemy.boss ? COLORS.red : enemy.color, enemy.boss ? 0.32 : 0.18, tick);
  if (enemy.hitPulse > 0) {
    ctx.globalAlpha = 0.48;
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(sx + 4, sy + 3, TILE - 8, TILE - 5);
    ctx.globalAlpha = 1;
  }
  drawSpriteByKind(ctx, enemy, drawX, drawY, CONFIG.SPRITE_SCALE, enemy.color, tick);
  drawTinyHpBar(ctx, sx + 4, sy + 1, enemy.hp / enemy.maxHp, enemy.boss ? COLORS.red : COLORS.green);
}

function drawPlayer(ctx, player, cameraRx, cameraRy, tick) {
  const TILE = CONFIG.TILE_SIZE;
  const sx = (player.rx - cameraRx) * TILE;
  const sy = (player.ry - cameraRy) * TILE;
  const stepLift = player.movePulse > 0 ? -Math.sin((player.movePulse / CONFIG.MOVE_LIFT_DIVISOR) * Math.PI) * CONFIG.MOVE_LIFT_HEIGHT : 0;
  const hitJolt = player.hitPulse > 0 ? Math.sin(player.hitPulse * CONFIG.HIT_PULSE_MULT_PLAYER) * CONFIG.HIT_JOLT_HEIGHT : 0;
  let lungeX = 0;
  let lungeY = 0;
  if (player.attackPulse > 0) {
    const l = Math.sin((1 - player.attackPulse / CONFIG.LUNGE_ANIM_TICKS) * Math.PI);
    lungeX = l * CONFIG.LUNGE_DISTANCE * (player.dir === "right" ? 1 : player.dir === "left" ? -1 : 0);
    lungeY = l * CONFIG.LUNGE_DISTANCE * (player.dir === "down" ? 1 : player.dir === "up" ? -1 : 0);
  }
  const glowColor = player.classKey === "warrior" ? COLORS.blue : player.classKey === "rogue" ? COLORS.purple : player.classKey === "mage" ? COLORS.gold : player.classKey === "beastmaster" ? COLORS.green : COLORS.purple;
  drawEntityGlow(ctx, sx, sy, glowColor, 0.24, tick);
  if (player.hitPulse > 0) {
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = COLORS.red;
    ctx.fillRect(sx + 4, sy + 4, TILE - 8, TILE - 6);
    ctx.globalAlpha = 1;
  }
  if (player.classKey === "warrior") drawSpriteWarrior(ctx, sx + hitJolt + lungeX, sy + stepLift + lungeY, CONFIG.SPRITE_SCALE, tick, player);
  if (player.classKey === "rogue") drawSpriteRogue(ctx, sx + hitJolt + lungeX, sy + stepLift + lungeY, CONFIG.SPRITE_SCALE, tick, player);
  if (player.classKey === "mage") drawSpriteMage(ctx, sx + hitJolt + lungeX, sy + stepLift + lungeY, CONFIG.SPRITE_SCALE, tick, player);
  if (player.classKey === "beastmaster") drawSpriteBeastmaster(ctx, sx + hitJolt + lungeX, sy + stepLift + lungeY, CONFIG.SPRITE_SCALE, tick, player);
  if (player.classKey === "witch") drawSpriteWitch(ctx, sx + hitJolt + lungeX, sy + stepLift + lungeY, CONFIG.SPRITE_SCALE, tick, player);
  drawFacingMarker(ctx, sx, sy, player.dir);
}

function drawPotion(ctx, x, y, s, tick) {
  const bob = Math.sin(tick / 12) > 0 ? 0 : 1;
  ctx.globalAlpha = 0.35 + Math.sin(tick / 9) * 0.12;
  ctx.fillStyle = "rgba(255, 90, 90, 0.65)";
  ctx.fillRect(x + 4 * s, y + (5 + bob) * s, 9 * s, 9 * s);
  ctx.globalAlpha = 1;
  ctx.fillStyle = COLORS.shadow;
  ctx.fillRect(x + 5 * s, y + 13 * s, 7 * s, 2 * s);
  ctx.fillStyle = COLORS.black;
  ctx.fillRect(x + 4 * s, y + (5 + bob) * s, 9 * s, 8 * s);
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(x + 6 * s, y + (3 + bob) * s, 4 * s, 2 * s);
  ctx.fillStyle = COLORS.red;
  ctx.fillRect(x + 5 * s, y + (6 + bob) * s, 7 * s, 6 * s);
  ctx.fillStyle = "#ff9da0";
  ctx.fillRect(x + 7 * s, y + (7 + bob) * s, 2 * s, 2 * s);
  ctx.fillStyle = COLORS.black;
  ctx.fillRect(x + 5 * s, y + (12 + bob) * s, 7 * s, 1 * s);
}

function drawChest(ctx, x, y, tick) {
  const bob = Math.sin(tick / 18) > 0 ? 0 : 1;
  ctx.fillStyle = "rgba(255, 212, 92, 0.22)";
  ctx.fillRect(x + 3, y + 7 + bob, 18, 12);
  ctx.fillStyle = COLORS.shadow;
  ctx.fillRect(x + 5, y + 18, 15, 3);
  ctx.fillStyle = "#5a2f24";
  ctx.fillRect(x + 5, y + 9 + bob, 15, 9);
  ctx.fillStyle = COLORS.gold;
  ctx.fillRect(x + 5, y + 9 + bob, 15, 3);
  ctx.fillRect(x + 11, y + 12 + bob, 3, 4);
  ctx.fillStyle = COLORS.black;
  ctx.fillRect(x + 5, y + 13 + bob, 15, 1);
}

function drawShrine(ctx, x, y, tick) {
  const pulse = 0.4 + Math.sin(tick / 10) * 0.18;
  ctx.globalAlpha = pulse;
  ctx.fillStyle = COLORS.purple;
  ctx.fillRect(x + 4, y + 3, 16, 18);
  ctx.globalAlpha = 1;
  ctx.fillStyle = COLORS.shadow;
  ctx.fillRect(x + 5, y + 19, 14, 3);
  ctx.fillStyle = "#2b1747";
  ctx.fillRect(x + 7, y + 8, 10, 11);
  ctx.fillStyle = COLORS.purple;
  ctx.fillRect(x + 10, y + 4, 4, 11);
  ctx.fillStyle = COLORS.gold;
  ctx.fillRect(x + 11, y + 6, 2, 2);
}

function drawTrap(ctx, x, y, tick) {
  const glint = Math.sin(tick / 8) > 0;
  ctx.fillStyle = "#111126";
  ctx.fillRect(x + 4, y + 8, 16, 10);
  ctx.fillStyle = "#3a3a66";
  ctx.fillRect(x + 5, y + 9, 14, 8);
  ctx.fillStyle = glint ? COLORS.red : "#7474a8";
  ctx.fillRect(x + 7, y + 11, 10, 1);
  ctx.fillRect(x + 9, y + 14, 6, 1);
}

function drawMentor(ctx, x, y, tick) {
  ctx.save();
  ctx.globalAlpha = 0.7 + Math.sin(tick / 12) * 0.12;
  // use a simple spectral figure
  drawSpriteMage(ctx, x, y - 2, 1.5, tick, { relicNames: [] }, "rgba(92, 168, 255, 0.7)");
  ctx.restore();
}

function drawShop(ctx, x, y, tick) {
  ctx.save();
  const bob = Math.sin(tick / 10) * 1.5;
  // cart/gold sack
  ctx.fillStyle = "#c8a24a";
  ctx.fillRect(x - 7, y - 6 + bob, 14, 9);
  ctx.fillStyle = "#7a5c1e";
  ctx.fillRect(x - 7, y - 8 + bob, 14, 2);
  ctx.strokeStyle = "#ffd45c";
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 10, y - 12 + bob, 20, 17);
  // floating gold coins
  ctx.globalAlpha = 0.6 + Math.sin(tick / 8) * 0.3;
  ctx.fillStyle = "#ffd45c";
  ctx.beginPath();
  ctx.arc(x + 8, y - 10 + bob, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x - 8, y - 4 + bob, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEvent(ctx, x, y, tick) {
  ctx.save();
  const bob = Math.sin(tick / 11) * 1.5;
  const pulse = Math.sin(tick / 9);
  // glowing rune circle
  ctx.globalAlpha = 0.55 + pulse * 0.25;
  ctx.strokeStyle = "#b06cff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y - 4 + bob, 11, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.35 + pulse * 0.2;
  ctx.fillStyle = "#7c3fbf";
  ctx.beginPath();
  ctx.arc(x, y - 4 + bob, 6, 0, Math.PI * 2);
  ctx.fill();
  // question mark
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#ffffff";
  drawPixelText(ctx, "?", x - 2, y - 6 + bob, "#e8d8ff", 1);
  // sparkles
  ctx.fillStyle = "#d9b6ff";
  ctx.beginPath();
  ctx.arc(x + 9, y - 12 + bob + Math.sin(tick / 6) * 2, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x - 10, y + 2 + bob + Math.cos(tick / 7) * 2, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawItems(ctx, items, cameraRx, cameraRy, tick) {
  const TILE = CONFIG.TILE_SIZE;
  for (const item of items) {
    if (item.used) continue;
    const sx = (item.x - cameraRx) * TILE;
    const sy = (item.y - cameraRy) * TILE;
    if (sx < -TILE || sy < -TILE || sx > CONFIG.CANVAS_W || sy > CONFIG.CANVAS_H) continue;
    if (item.type === "potion") drawPotion(ctx, sx, sy, 1, tick);
    if (item.type === "chest") drawChest(ctx, sx, sy, tick);
    if (item.type === "shrine") drawShrine(ctx, sx, sy, tick);
    if (item.type === "trap") drawTrap(ctx, sx, sy, tick);
    if (item.type === "mentor") drawMentor(ctx, sx, sy, tick);
    if (item.type === "shop") drawShop(ctx, sx, sy, tick);
    if (item.type === "event") drawEvent(ctx, sx, sy, tick);
  }
}

function drawCombatPanel(ctx, currentEnemy, tick) {
  const W = CONFIG.CANVAS_W, H = CONFIG.CANVAS_H;
  const boxX = CONFIG.COMBAT_PANEL_X, boxY = CONFIG.COMBAT_PANEL_Y, boxW = W - CONFIG.COMBAT_PANEL_W_OFFSET, boxH = CONFIG.COMBAT_PANEL_H;
  ctx.fillStyle = `rgba(7, 7, 20, ${CONFIG.COMBAT_PANEL_BG_ALPHA})`;
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = COLORS.wallHi;
  ctx.lineWidth = CONFIG.COMBAT_PANEL_BORDER_WIDTH;
  ctx.strokeRect(boxX + CONFIG.COMBAT_PANEL_BORDER_OFFSET, boxY + CONFIG.COMBAT_PANEL_BORDER_OFFSET, boxW - 2, boxH - 2);

const hpRatio = currentEnemy.hp / currentEnemy.maxHp;
  drawPixelText(ctx, currentEnemy.name.toUpperCase(), boxX + CONFIG.COMBAT_PANEL_TEXT_X, boxY + CONFIG.COMBAT_PANEL_TEXT_Y_NAME, currentEnemy.boss ? COLORS.red : COLORS.gold, 1);
  drawStatusBadges(ctx, currentEnemy, boxX + CONFIG.COMBAT_PANEL_TEXT_X, boxY + CONFIG.COMBAT_PANEL_TEXT_Y_STATUS);

  // Elemental affinity badges (weakness / resistance).
  if (currentEnemy.elementWeak || currentEnemy.elementResist) {
    const wInfo = ELEMENT_AFFINITY[currentEnemy.elementWeak];
    const rInfo = ELEMENT_AFFINITY[currentEnemy.elementResist];
    const eX = boxX + CONFIG.COMBAT_PANEL_TEXT_X, eY = boxY + CONFIG.COMBAT_PANEL_TEXT_Y_STATUS + 13;
    if (wInfo) drawPixelText(ctx, `FRACO: ${wInfo.icon} ${wInfo.name}`, eX, eY, wInfo.color, 1);
    if (rInfo) drawPixelText(ctx, `RESISTE: ${rInfo.icon} ${rInfo.name}`, eX + 13 * 9, eY, rInfo.color, 1);
  }

  // Timing combo meter (turn mode).
  if (combatMode === "turn" && player && player.timingCombo > 0) {
    const tX = boxX + CONFIG.COMBAT_PANEL_TEXT_X, tY = boxY + 78;
    drawPixelText(ctx, `ENCADEADO x${player.timingCombo} (+${Math.round(player.timingComboMult * 100)}%)`, tX, tY, COLORS.purple, 1);
  }

  ctx.fillStyle = "#101027";
  ctx.fillRect(boxX + CONFIG.COMBAT_PANEL_HP_BAR_X, boxY + CONFIG.COMBAT_PANEL_HP_BAR_Y, boxW - 20, CONFIG.COMBAT_PANEL_HP_BAR_H);
  ctx.fillStyle = hpRatio > 0.5 ? COLORS.green : hpRatio > 0.25 ? COLORS.gold : COLORS.red;
  ctx.fillRect(boxX + CONFIG.COMBAT_PANEL_HP_BAR_FILL_X, boxY + CONFIG.COMBAT_PANEL_HP_BAR_FILL_Y, Math.floor((boxW - 22) * hpRatio), CONFIG.COMBAT_PANEL_HP_BAR_FILL_H);
  drawPixelText(ctx, `PV ${currentEnemy.hp}/${currentEnemy.maxHp}`, boxX + CONFIG.COMBAT_PANEL_HP_BAR_X, boxY + CONFIG.COMBAT_PANEL_HP_BAR_TEXT_Y, COLORS.text, 1);

  const spriteX = boxX + boxW - CONFIG.COMBAT_PANEL_SPRITE_X_OFFSET, spriteY = boxY + CONFIG.COMBAT_PANEL_SPRITE_Y;
  drawSpriteByKind(ctx, currentEnemy, spriteX, spriteY, 3, currentEnemy.color, tick);

  if (blockWindow) {
    const elapsed = performance.now() - blockStartTs;
    const frac = Math.min(1, Math.max(0, elapsed / CONFIG.BLOCK_WINDOW_MS));
    const barX = boxX + CONFIG.COMBAT_PANEL_TEXT_X, barW = boxW - 40;
    const barY = boxY + boxH - 12;
    ctx.fillStyle = "rgba(5,5,16,0.85)";
    ctx.fillRect(barX, barY, barW, 6);
    const perfectW = barW * CONFIG.RIPOSTE_WINDOW_FRACTION;
    ctx.fillStyle = "rgba(120,255,170,0.35)";
    ctx.fillRect(barX, barY, perfectW, 6);
    ctx.fillStyle = frac > 0.5 ? "#ffd75e" : "#ff8a3c";
    ctx.fillRect(barX + Math.floor(barW * frac), barY, 2, 6);
    drawPixelText(ctx, frac < CONFIG.RIPOSTE_WINDOW_FRACTION ? "RIPOSTE!" : "Defenda", barX, barY - 11, frac < CONFIG.RIPOSTE_WINDOW_FRACTION ? COLORS.green : COLORS.gold, 1);
  }

  if (attackTimingActive && !attackTimingResolved) {
    const elapsed = performance.now() - attackTimingStartTs;
    const frac = Math.min(1, Math.max(0, elapsed / CONFIG.ATTACK_TIMING_WINDOW_MS));
    const barX = boxX + CONFIG.COMBAT_PANEL_TEXT_X, barW = boxW - 40;
    const barY = boxY + boxH - 12;
    ctx.fillStyle = "rgba(5,5,16,0.85)";
    ctx.fillRect(barX, barY, barW, 6);
    const sweetW = barW * CONFIG.ATTACK_TIMING_SWEET_FRACTION * 2;
    ctx.fillStyle = "rgba(255,212,92,0.4)";
    ctx.fillRect(barX + Math.floor(barW * 0.5 - sweetW / 2), barY, Math.floor(sweetW), 6);
    const goodW = barW * CONFIG.ATTACK_TIMING_SWEET_FRACTION * 4;
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(barX + Math.floor(barW * 0.5 - goodW / 2), barY, Math.floor(goodW), 6);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(barX + Math.floor(barW * frac), barY, 2, 6);
    const dist = Math.abs(frac - 0.5);
    const label = dist < CONFIG.ATTACK_TIMING_SWEET_FRACTION ? "PONTO DOCE!" : dist < CONFIG.ATTACK_TIMING_SWEET_FRACTION * 2 ? "BOM" : "ESPERA...";
    drawPixelText(ctx, label, barX, barY - 11, dist < CONFIG.ATTACK_TIMING_SWEET_FRACTION ? COLORS.gold : COLORS.text, 1);
  }

  // Enemy intent indicator — what the enemy plans to do next turn.
  if (currentEnemy && (currentEnemy.nextIntent || currentEnemy.intent)) {
    const intentInfo = currentEnemy.nextIntent || { type: "unleash", label: "GOLPE CARREGADO", color: COLORS.red };
    const tlX = boxX + boxW - CONFIG.COMBAT_PANEL_SPRITE_X_OFFSET - 128, tlY = boxY + CONFIG.COMBAT_PANEL_TEXT_Y_NAME;
    const pulse = Math.sin(tick * 0.15) > 0;
    const showCharging = currentEnemy.intent && !currentEnemy.nextIntent;
    if (!showCharging || pulse) {
      drawPixelText(ctx, `${intentInfo.label}`, tlX, tlY, intentInfo.color, 1);
      drawPixelText(ctx, "PRÓXIMO MOVE →", tlX - 12 * 14, tlY, COLORS.muted || COLORS.text, 1);
    }
  }

  // Telegraph indicator
  if (currentEnemy && currentEnemy.intent && !currentEnemy.nextIntent) {
    const tlX = boxX + boxW - CONFIG.COMBAT_PANEL_SPRITE_X_OFFSET - 92, tlY = boxY + CONFIG.COMBAT_PANEL_TEXT_Y_NAME;
    if (Math.sin(tick * 0.15) > 0) {
      drawPixelText(ctx, "! CARREGANDO !", tlX, tlY, COLORS.orange, 1);
    }
  }

  // Synergy indicator
  if (currentEnemy && currentEnemy.synergy && currentEnemy.synergy.allies.length > 0) {
    const sX = boxX + CONFIG.COMBAT_PANEL_TEXT_X, sY = boxY + 66;
    drawPixelText(ctx, `ALIADOS: ${currentEnemy.synergy.allies.length}`, sX, sY, COLORS.purple, 1);
    drawPixelText(ctx, `+${currentEnemy.synergy.auraAtk}ATK${currentEnemy.synergy.regen > 0 ? " +regen" : ""}`, sX + 12 * 9, sY, COLORS.orange, 1);
  }

  // Stagger meter
  if (currentEnemy && currentEnemy.stagger > 0) {
    const barX = boxX + CONFIG.COMBAT_PANEL_TEXT_X, barW = boxW - 40;
    const barY = boxY + 56;
    ctx.fillStyle = "rgba(5,5,16,0.85)";
    ctx.fillRect(barX, barY, barW, 4);
    const fill = Math.min(1, currentEnemy.stagger / CONFIG.STAGGER_STACKS_TO_BREAK);
    ctx.fillStyle = COLORS.gold;
    ctx.fillRect(barX, barY, Math.floor(barW * fill), 4);
  }
}

function drawAtbBars(ctx) {
  const W = CONFIG.CANVAS_W;
  const bw = 74, bx = 6, by1 = CONFIG.CANVAS_H - 30, by2 = CONFIG.CANVAS_H - 18;
  const rows = [
    { label: "VOCÊ", value: playerAtbReady ? 1 : atbPlayer / CONFIG.ATB_MAX, y: by1, color: COLORS.green, ready: playerAtbReady },
    { label: "INIMIGO", value: enemyAtbPending ? atbEnemy / CONFIG.ATB_MAX : 0, y: by2, color: COLORS.red, ready: false }
  ];
  for (const r of rows) {
    ctx.fillStyle = "rgba(5,5,16,0.82)";
    ctx.fillRect(bx, r.y, bw, 8);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, r.y, bw, 8);
    ctx.fillStyle = r.ready ? COLORS.gold : r.color;
    ctx.fillRect(bx + 1, r.y + 1, Math.floor((bw - 2) * Math.min(1, r.value)), 6);
    drawPixelText(ctx, r.ready ? "PRONTO!" : r.label, bx + bw + 5, r.y + 8, r.ready ? COLORS.gold : COLORS.text, 1);
  }
}
const STORAGE_META = "criptaRubroMeta";
const STORAGE_PREFIX = "criptaRubroSlot_";
const MAX_SLOTS = 3;
const SAVE_VERSION = 1;

// Migrate older save structures into the current schema. Runs as a chain so
// future version bumps only append new upgrade steps here.


// =============================================================
// CHECKSUM (simple CRC32-like for corruption detection)
// =============================================================


// =============================================================
// META (shared across slots)
// =============================================================
function loadMeta() {
  const defaults = { wins: 0, bestLevel: 1, relicsFound: 0, kills: 0, chests: 0, activeSlot: 0, achievements: {}, monstersCaptured: 0, elitesKilled: 0, runGold: 0 };
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_META)) || {};
    stored.achievements = stored.achievements || {};
    return { ...defaults, ...stored };
  } catch {
    return defaults;
  }
}

function saveMeta(meta) {
  try {
    localStorage.setItem(STORAGE_META, JSON.stringify(meta));
  } catch (e) {
    if (typeof addLog === "function") addLog(`Erro ao salvar meta: ${e.message}`, "red");
  }
}

// =============================================================
// ACHIEVEMENTS
// =============================================================


function unlockAchievement(id) {
  const meta = loadMeta();
  if (meta.achievements[id]) return false;
  const def = ACHIEVEMENTS.find(a => a.id === id);
  if (!def) return false;
  meta.achievements[id] = true;
  saveMeta(meta);
  addLog(`Conquista desbloqueada: ${def.name}!`, "gold");
  showToast(`🏆 ${def.name}`, 1600);
  playSfx("relic");
  return true;
}

function checkAchievements() {
  const meta = loadMeta();
  if (meta.kills >= 1) unlockAchievement("first_blood");
  if (meta.relicsFound >= 1) unlockAchievement("relic_hunter");
  if (meta.bestLevel >= 5) unlockAchievement("level_5");
  if (meta.chests >= 5) unlockAchievement("chest_5");
if (meta.kills >= 20) unlockAchievement("kill_20");
  if (meta.wins >= 1) unlockAchievement("victor");
  if (meta.bossDefeated) unlockAchievement("slayer");
  if ((meta.monstersCaptured || 0) >= 1) unlockAchievement("capture_one");
  if ((meta.monstersCaptured || 0) >= 3) unlockAchievement("team_three");
  if ((meta.elitesKilled || 0) >= 3) unlockAchievement("elite_hunter");
  if ((meta.runGold || 0) >= 200) unlockAchievement("gold_200");
}

function achievementSummary() {
  const meta = loadMeta();
  const unlocked = Object.keys(meta.achievements || {}).length;
  return `${unlocked}/${ACHIEVEMENTS.length}`;
}

// =============================================================
// PER-SLOT SAVE/RESTORE
// =============================================================
function slotKey(slotIndex) {
  return `${STORAGE_PREFIX}${slotIndex}`;
}

function hasSaveInSlot(slotIndex) {
  try {
    const raw = localStorage.getItem(slotKey(slotIndex));
    if (!raw) return false;
    const data = JSON.parse(raw);
    return !!(data && data.csum && data.run && data.run.player && data.run.dungeon);
  } catch {
    return false;
  }
}

function anySaveExists() {
  for (let i = 0; i < MAX_SLOTS; i++) {
    if (hasSaveInSlot(i)) return true;
  }
  return false;
}

function writeSlot(slotIndex, runData, meta) {
  try {
    const run = {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      playerName: runData.player?.className || "Herói",
      floor: runData.currentFloor || 1,
      ...runData
    };
    const payload = { run, csum: "" };
    payload.csum = checksum(payload);
    localStorage.setItem(slotKey(slotIndex), JSON.stringify(payload));
    meta.activeSlot = slotIndex;
    saveMeta(meta);
    return true;
  } catch {
    return false;
  }
}

function readSlot(slotIndex) {
  try {
    const raw = localStorage.getItem(slotKey(slotIndex));
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (!payload || !payload.run || !payload.csum) return null;
    const storedCsum = payload.csum;
    payload.csum = "";
    const expectedCsum = checksum(payload);
    if (storedCsum !== expectedCsum) {
      // corruption detected
      localStorage.removeItem(slotKey(slotIndex));
      return null;
    }
    payload.csum = storedCsum; // restore
    return migrateRun(payload.run);
  } catch {
    return null;
  }
}

function deleteSlot(slotIndex) {
  try {
    localStorage.removeItem(slotKey(slotIndex));
    return true;
  } catch {
    return false;
  }
}

function getSlotInfo(slotIndex) {
  const exists = hasSaveInSlot(slotIndex);
  if (!exists) return { exists: false };
  try {
    const raw = localStorage.getItem(slotKey(slotIndex));
    const data = JSON.parse(raw);
    if (!data?.run) return { exists: false };
    return {
      exists: true,
      savedAt: data.run.savedAt,
      playerName: data.run.playerName || "Herói",
      floor: data.run.floor || 1,
      corrupted: false
    };
  } catch {
    return { exists: false };
  }
}

// =============================================================
// LEGACY SINGLE-SLOT SUPPORT (backward compat)
// =============================================================
function hasSavedRun() {
  return anySaveExists() || legacyHasSave();
}

function legacyHasSave() {
  try {
    const saved = JSON.parse(localStorage.getItem("criptaRubroRun"));
    return !!(saved && typeof saved.version === "number" && saved.version <= SAVE_VERSION && saved.player && saved.dungeon && saved.exitTile);
  } catch {
    return false;
  }
}

function writeCurrentRun(state) {
  const meta = loadMeta();
  const slot = meta.activeSlot ?? 0;
  return writeSlot(slot, state, meta);
}

function loadSavedRun() {
  const meta = loadMeta();
  let slot = meta.activeSlot ?? 0;
  // Fallback: find first non-empty slot
  if (!hasSaveInSlot(slot)) {
    for (let i = 0; i < MAX_SLOTS; i++) {
      if (hasSaveInSlot(i)) { slot = i; break; }
    }
    if (!hasSaveInSlot(slot)) {
      // try legacy save
      return legacyLoadRun();
    }
    meta.activeSlot = slot;
    saveMeta(meta);
  }
  return readSlot(slot);
}

function legacyLoadRun() {
  try {
    const saved = JSON.parse(localStorage.getItem("criptaRubroRun"));
    if (!saved || typeof saved.version !== "number" || saved.version > SAVE_VERSION || !saved.player || !saved.dungeon) return null;
    return migrateRun(saved);
  } catch {
    return null;
  }
}

function clearSavedRun() {
  const meta = loadMeta();
  for (let i = 0; i < MAX_SLOTS; i++) deleteSlot(i);
  try { localStorage.removeItem(CONFIG.STORAGE_LEGACY); } catch (e) {
    if (typeof addLog === "function") addLog(`Erro ao limpar save: ${e.message}`, "red");
  }
  meta.activeSlot = 0;
  saveMeta(meta);
}

// =============================================================
// EXPORT / IMPORT
// =============================================================
function exportSlot(slotIndex) {
  try {
    const raw = localStorage.getItem(slotKey(slotIndex));
    if (!raw) return null;
    const compressed = btoa(unescape(encodeURIComponent(raw)));
    return `CRIPTA_RUN_${slotIndex}_${compressed}`;
  } catch {
    return null;
  }
}

function importSlot(encoded) {
  if (!encoded || !encoded.startsWith("CRIPTA_RUN_")) return false;
  const parts = encoded.split("_");
  if (parts.length < 3) return false;
  const slotIndex = parseInt(parts[2], 10);
  if (isNaN(slotIndex) || slotIndex < 0 || slotIndex >= MAX_SLOTS) return false;
  const compressed = parts.slice(3).join("_");
  try {
    const raw = decodeURIComponent(escape(atob(compressed)));
    const payload = JSON.parse(raw);
    if (!payload?.run?.player) return false;
    // Sanitização anti-XSS: dados importados são renderizados via innerHTML
    // (lista de slots, log, painel de pausa). Escapa HTML em todas as strings
    // para impedir injeção por save malicioso (ex.: onerror em playerName).
    payload.run = sanitizeImportedRun(payload.run);
    localStorage.setItem(slotKey(slotIndex), JSON.stringify(payload));
    const meta = loadMeta();
    meta.activeSlot = slotIndex;
    saveMeta(meta);
    return true;
  } catch {
    return false;
  }
}

function sanitizeImportedRun(run) {
  const esc = (v) => (typeof v === "string" ? v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])) : v);
  const walk = (o) => {
    if (Array.isArray(o)) return o.map(walk);
    if (o && typeof o === "object") {
      const out = {};
      for (const k of Object.keys(o)) out[k] = walk(o[k]);
      return out;
    }
    return esc(o);
  };
  return walk(run);
}

function getMaxSlots() {
  return MAX_SLOTS;
}

// =============================================================
// SLOT LIST UI
// =============================================================
function renderSlotList() {
  const listEl = document.getElementById("slotList");
  if (!listEl) return;
  const meta = loadMeta();
  let html = "";
  for (let i = 0; i < MAX_SLOTS; i++) {
    const info = getSlotInfo(i);
    const active = meta.activeSlot === i;
    if (info.exists) {
      const d = new Date(info.savedAt);
      const stamp = d ? `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : "?";
      html += `
        <div class="slotRow">
          <span class="slotInfo"><b>${info.playerName}</b> · Andar ${info.floor}${active ? " · ATIVO" : ""}<br><em>${stamp}</em></span>
          <span class="slotActions">
            <button data-slot-load="${i}">CARREGAR</button>
            <button data-slot-export="${i}">EXPORTAR</button>
            <button data-slot-delete="${i}">APAGAR</button>
          </span>
        </div>`;
    } else {
      html += `
        <div class="slotRow">
          <span class="slotInfo slotEmpty">Slot ${i + 1} — vazio</span>
        </div>`;
    }
  }
  listEl.innerHTML = html;
}

function handleSlotAction(slotIndex, action) {
  if (action === "load") {
    const run = readSlot(slotIndex);
    if (!run) { addLog("Não foi possível carregar o save.", "red"); renderSlotList(); return; }
    const meta = loadMeta();
    meta.activeSlot = slotIndex;
    saveMeta(meta);
    addLog(`Carregando save do ${run.playerName}...`);
    loadSave();
    return true;
  }
  if (action === "export") {
    const encoded = exportSlot(slotIndex);
    if (!encoded) { addLog("Falha ao exportar save.", "red"); return; }
    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(encoded).then(() => {
          addLog("Save exportado para a área de transferência!", "green");
          showToast("EXPORTADO!", 900);
        });
        copied = true;
      }
    } catch (e) { /* ignore */ }
    if (!copied) {
      addLog(`Save exportado: ${encoded.slice(0, 40)}...`, "green");
    }
    return;
  }
  if (action === "delete") {
    if (deleteSlot(slotIndex)) {
      addLog(`Slot ${slotIndex + 1} apagado.`, "red");
      renderSlotList();
    } else {
      addLog("Falha ao apagar save.", "red");
    }
    return;
  }
}

function promptImportSlot() {
  const text = prompt("Cole o código de save exportado (CRIPTA_RUN_...):");
  if (!text) return;
  const parts = text.split("_");
  if (parts.length < 3) { addLog("Código inválido.", "red"); showToast("FALHA AO IMPORTAR", 1200); return; }
  const slotIndex = parseInt(parts[2], 10);
  const ok = importSlot(text);
  if (ok) {
    addLog(`Save importado no slot ${slotIndex + 1}!`, "green");
    showToast("IMPORTADO!", 900);
    renderSlotList();
  } else {
    addLog("Falha ao importar save.", "red");
    showToast("FALHA AO IMPORTAR", 1200);
  }
}



let currentLocale = "pt-BR";

function setLocale(locale) {
  if (STRINGS[locale]) currentLocale = locale;
  try {
    localStorage.setItem(CONFIG.STORAGE_LOCALE, locale);
  } catch (e) {
    if (typeof addLog === "function") addLog(`Erro ao salvar idioma: ${e.message}`, "red");
  }
  saveSettings();
  refreshMenuText();
}

function getLocale() {
  return currentLocale;
}

function getLocales() {
  return Object.keys(STRINGS);
}

function getLocaleName(locale) {
  return STRINGS[locale]?.LANG_NAME || locale;
}

function t(key) {
  return STRINGS[currentLocale]?.[key] || STRINGS.en?.[key] || key;
}

function refreshMenuText() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    el.textContent = t(key);
  });
  const langBtn = document.getElementById("menuLangBtn");
  if (langBtn) langBtn.textContent = `${t("LANGUAGE")} ${t("LANG_NAME")}`;
  const sound = getSoundEnabled() ? "SOUND_ON" : "SOUND_OFF";
  const soundText = t(sound);
  const soundBtnEl = document.getElementById("soundBtn");
  if (soundBtnEl) soundBtnEl.textContent = getSoundEnabled() ? "♪" : "×";
  if (menuSoundBtn) menuSoundBtn.textContent = soundText;
  if (pauseSoundBtn) pauseSoundBtn.textContent = soundText;
  if (menuOneHandBtn) menuOneHandBtn.textContent = oneHandedMode ? t("ONE_HAND") : t("TWO_HAND");
  const menuEndlessBtn = document.getElementById("menuEndlessBtn");
  if (menuEndlessBtn) menuEndlessBtn.textContent = `${t("ENDLESS")}: ${endlessMode ? t("ENDLESS_ON") : t("ENDLESS_OFF")}`;
  const menuCombatBtn = document.getElementById("menuCombatBtn");
  if (menuCombatBtn) menuCombatBtn.textContent = `COMBATE: ${getCombatModeName()}`;
  const pauseCombatBtn = document.getElementById("pauseCombatBtn");
  if (pauseCombatBtn) pauseCombatBtn.textContent = `COMBATE: ${getCombatModeName()}`;
  const menuGfxBtn = document.getElementById("menuGfxBtn");
  if (menuGfxBtn) menuGfxBtn.textContent = `GRÁFICOS: ${gfxPresent === "ps1" ? "PS1" : "2D"}`;
  const menuColorBtn = document.getElementById("menuColorBtn");
  if (menuColorBtn) menuColorBtn.textContent = `CORES: ${getColorBlindName()}`;
  const menuContrastBtn = document.getElementById("menuContrastBtn");
  if (menuContrastBtn) menuContrastBtn.textContent = `CONTRASTE: ${highContrast ? "ALTO" : "NORMAL"}`;
  const menuFlashBtn = document.getElementById("menuFlashBtn");
  if (menuFlashBtn) menuFlashBtn.textContent = `FLASH: ${reduceFlash ? "REDUZIDO" : "NORMAL"}`;
  const menuUIBtn = document.getElementById("menuUIBtn");
  if (menuUIBtn) menuUIBtn.textContent = `TAMANHO UI: ${getUiScaleName()}`;
  const menuDifficultyBtn = document.getElementById("menuDifficultyBtn");
  if (menuDifficultyBtn) menuDifficultyBtn.textContent = `DIFICULDADE: ${getDifficultyName()}`;
  if (currentEnemy) updateUI();
}

let locale = null;
try {
  locale = localStorage.getItem(CONFIG.STORAGE_LOCALE);
} catch (e) {
  if (typeof addLog === "function") addLog(`Erro ao carregar idioma: ${e.message}`, "red");
  locale = null;
}
if (locale && STRINGS[locale]) currentLocale = locale;



// =============================================================
// DOM REFS
// =============================================================
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const RENDER_SCALE = 3;
applyCanvasSize();
const statsEl = document.getElementById("stats");
const logEl = document.getElementById("logLines");
const menuOverlay = document.getElementById("menuOverlay");
const toastEl = document.getElementById("toast");
const aLabel = document.getElementById("aLabel");
const bLabel = document.getElementById("bLabel");
const soundBtn = document.getElementById("soundBtn");
const pauseBtn = document.getElementById("pauseBtn");
const pauseOverlay = document.getElementById("pauseOverlay");
const resumeBtn = document.getElementById("resumeBtn");
const restartBtn = document.getElementById("restartBtn");
const pauseSaveBtn = document.getElementById("pauseSaveBtn");
const continueBtn = document.getElementById("continueBtn");
const menuHomeView = document.getElementById("menuHomeView");
const characterSelectView = document.getElementById("characterSelectView");
const optionsView = document.getElementById("optionsView");
const menuPlayBtn = document.getElementById("menuPlayBtn");
const menuOptionsBtn = document.getElementById("menuOptionsBtn");
const backToMenuFromClassBtn = document.getElementById("backToMenuFromClassBtn");
const backToMenuFromOptionsBtn = document.getElementById("backToMenuFromOptionsBtn");
const menuSoundBtn = document.getElementById("menuSoundBtn");
const menuOneHandBtn = document.getElementById("menuOneHandBtn");
const introCinematicView = document.getElementById("introCinematicView");
const introText = document.getElementById("introText");
const introAdvanceBtn = document.getElementById("introAdvanceBtn");
const startJourneyBtn = document.getElementById("startJourneyBtn");
const classDetails = document.getElementById("classDetails");
const metaRecordLines = document.getElementById("metaRecordLines");
const pauseSoundBtn = document.getElementById("pauseSoundBtn");
const pauseHero = document.getElementById("pauseHero");
const pauseProgress = document.getElementById("pauseProgress");
const pauseHp = document.getElementById("pauseHp");
const pauseItems = document.getElementById("pauseItems");

ctx.imageSmoothingEnabled = false;
const W = canvas.width, H = canvas.height;

// =============================================================
// STATE
// =============================================================
let gameState = "menu";
let stateBeforePause = "explore";
let dungeon = null;
let player = null;
let enemies = [];
let items = [];
let exitTile = { x: 0, y: 0 };
let bossDefeated = false;
let currentEnemy = null;
let inTurn = false;
let blockWindow = false;
let pendingDmg = 0;
let blockStartTs = 0;
let blockTutorialShown = false;
let potionTutorialShown = false;
let captureTutorialShown = false;
let switchTutorialShown = false;
let combatTutorialShown = false;
let attackTimingActive = false;
let attackTimingStartTs = 0;
let attackTimingResolved = false;
let camera = { x: 0, y: 0, rx: 0, ry: 0 };
let mapCache = null;
let lightGradientCache = null;
let playerLightAuraCache = null;
let logLines = ["Escolha uma classe para entrar na cripta."];
let shake = 0;
let flash = 0;
let slowMoTicks = 0;
let zoomPulse = 0;
let shakeDirX = 0, shakeDirY = 0;
let flashColor = "#ffffff";
let juiceHitsTaken = 0;
let cinemaLetterbox = 0;
let cinemaLetterboxTarget = 0;
let cinemaBossZoom = 0;
let cinemaBossTremor = 0;
let cinemaFloorSweep = 0;
let cinemaFloorScale = 0;
let cinemaSurgeFx = 0;
let cinemaSurgeScanline = 0;
let tick = 0;
let lastFrameAt = 0;
let fixedAccumulator = 0;
let lastMoveAt = 0;
let toastTimer = 0;
let currentFloor = 1;
let floorEnemySpawned = 0;
let floorKills = 0;
let runStats = { kills: 0, chests: 0, shrines: 0, traps: 0, relics: 0 };
let meta = loadMeta();
let selectedClassKey = null;
let introTimer = null;
let floorTransition = null;
let bossIntroTimer = 0;
let mentorDialog = null;
let shopDialog = null;
let eventDialog = null;
let talentDialog = null;
let inputFrozen = false;
let freezeFrames = 0;
let saveRunTimer = 0;
let saveRunDirty = false;
let lastStatsHtml = "";
let swipeTrail = null;
let touchStart = null;
let lastTap = 0;
let movePath = [];
let hoveredTile = null;
let mouseHeld = false;
let mouseHoldTarget = null;
let mouseHoldStart = 0;
let lastMousePathAt = 0;
let lastGamepadButtons = {};
let oneHandedMode = false;
let endlessMode = false;
let combatMode = "action";
let atbPlayer = 0;
let atbEnemy = 0;
let playerAtbReady = false;
let enemyAtbPending = false;
let commandMenuOpen = false;
let commandMenuIndex = 0;
let commandMenuMode = "main";
let atbEnemyFallbackTimer = null;
let actionState = null;
let actionMoveDir = null;
let actionHeldKeys = new Set();
let actionStatusTimer = 0;
let actionBolts = [];
let actionTutorialShown = false;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// =============================================================
// PS1 GFX: post-processing + 2.5D presentation
// gfxPresent: "ps1" (escanlado/dither/2.5D) ou "2d" (clássico)
// =============================================================
const GFX = {
  wallExtrude: 7,
  scanlineAlpha: 0.28,
  vignetteMag: 0.5,
  frameJitter: 1,
  arenaShear: 0.42,
  arenaFogStart: 0.6
};
let gfxPresent = "ps1";
let postFxCache = null;

function initPostFxCache() {
  if (postFxCache) return postFxCache;
  postFxCache = {
    scanlines: null,
    vignette: null
  };
  return postFxCache;
}

function ensureScanlinePattern() {
  const c = initPostFxCache();
  if (c.scanlines) return c.scanlines;
  const cw = CONFIG.CANVAS_W, ch = CONFIG.CANVAS_H;
  const cv = document.createElement("canvas");
  cv.width = cw; cv.height = ch;
  const g = cv.getContext("2d");
  g.clearRect(0, 0, cw, ch);
  g.fillStyle = "rgba(0,0,0,0)";
  g.fillRect(0, 0, cw, ch);
  g.fillStyle = "rgba(8,6,20,0.55)";
  for (let y = 0; y < ch; y += 2) g.fillRect(0, y + 1, cw, 1);
  c.scanlines = cv;
  return cv;
}
function ensureVignettePattern() {
  const c = initPostFxCache();
  if (c.vignette) return c.vignette;
  const cw = CONFIG.CANVAS_W, ch = CONFIG.CANVAS_H;
  const cv = document.createElement("canvas");
  cv.width = cw; cv.height = ch;
  const g = cv.getContext("2d");
  const grad = g.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.72);
  grad.addColorStop(0, "rgba(10,8,24,0)");
  grad.addColorStop(1, `rgba(5,4,18,${GFX.vignetteMag})`);
  g.fillStyle = grad;
  g.fillRect(0, 0, cw, ch);
  c.vignette = cv;
  return cv;
}

function drawPostProcess() {
  if (gfxPresent !== "ps1" || !ctx) return;
  try {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const scan = ensureScanlinePattern();
    ctx.globalAlpha = GFX.scanlineAlpha + cinemaSurgeScanline;
    ctx.drawImage(scan, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(ensureVignettePattern(), 0, 0);
    ctx.restore();
    ctx.globalAlpha = 1;
  } catch (e) { /* pós-processamento é best-effort */ }
}

function frameJitter() {
  if (gfxPresent !== "ps1" || reducedMotion || GFX.frameJitter <= 0) return;
  ctx.translate(Math.round(rand(-1, 1) * GFX.frameJitter), Math.round(rand(-1, 1) * GFX.frameJitter));
}

// =============================================================
// INIT CACHES
// =============================================================
function ensureCaches() {
  if (!mapCache) {
    mapCache = document.createElement("canvas");
    mapCache.width = CONFIG.MAP_W * CONFIG.TILE_SIZE;
    mapCache.height = CONFIG.MAP_H * CONFIG.TILE_SIZE;
    mapCache.getContext("2d").imageSmoothingEnabled = false;
  }
if (!lightGradientCache) {
    lightGradientCache = document.createElement("canvas");
    const size = CONFIG.LIGHT_GRADIENT_SIZE;
    lightGradientCache.width = size;
    lightGradientCache.height = size;
    const lctx = lightGradientCache.getContext("2d");
    lctx.imageSmoothingEnabled = false;
    const light = lctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, CONFIG.LIGHT_GRADIENT_RADIUS);
    light.addColorStop(0, "rgba(255, 212, 92, 1)");
    light.addColorStop(1, "rgba(255, 157, 79, 0)");
    lctx.fillStyle = light;
    lctx.fillRect(0, 0, size, size);
  }
  if (!playerLightAuraCache) {
    playerLightAuraCache = document.createElement("canvas");
    const size = CONFIG.LIGHT_AURA_CACHE_SIZE;
    playerLightAuraCache.width = size;
    playerLightAuraCache.height = size;
    const actx = playerLightAuraCache.getContext("2d");
    actx.imageSmoothingEnabled = false;
    const aura = actx.createRadialGradient(size / 2, size / 2, CONFIG.LIGHT_AURA_INNER, size / 2, size / 2, CONFIG.LIGHT_AURA_RADIUS);
    aura.addColorStop(0, "rgba(200, 180, 255, 0.04)");
    aura.addColorStop(0.5, "rgba(200, 180, 255, 0.015)");
    aura.addColorStop(1, "rgba(200, 180, 255, 0)");
    actx.fillStyle = aura;
    actx.fillRect(0, 0, size, size);
  }
}

// =============================================================
// LOGGING
// =============================================================
function addLog(message, cssClass = "") {
  logLines.push(cssClass ? `<span class="${cssClass}">${message}</span>` : message);
  while (logLines.length > CONFIG.LOG_MAX_LINES) logLines.shift();
  renderLogLines();
}

function renderLogLines() {
  let html = "";
  for (let i = 0; i < logLines.length; i++) html += `<div style="animation: logFadeIn ${CONFIG.LOG_LINE_FADE_MS}ms ease-out">› ${logLines[i]}</div>`;
  logEl.innerHTML = html;
}

function showToast(message, duration = CONFIG.TOAST_DEFAULT_MS) {
  toastEl.textContent = message;
  toastEl.style.display = "block";
  toastTimer = duration;
}

// =============================================================
// HELPERS
// =============================================================
function sxFor(x) { return (x - camera.rx) * TILE + TILE / 2; }
function syFor(y) { return (y - camera.ry) * TILE + TILE / 2; }

function hasRelic(ownerOrName, maybeName) {
  const owner = maybeName === undefined ? player : ownerOrName;
  const name = maybeName === undefined ? ownerOrName : maybeName;
  return !!owner?.relicNames?.includes(name);
}

function occupiedByEnemy(x, y) {
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.alive && e.x === x && e.y === y) return e;
  }
  return null;
}

function itemAt(x, y) {
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it.used && it.x === x && it.y === y) return it;
  }
  return null;
}

// =============================================================
// META / SAVE
// =============================================================
function updateMetaRecords() {
  metaRecordLines.textContent = `Vitórias ${meta.wins} · Melhor Nv. ${meta.bestLevel} · Abates ${meta.kills || 0} · Baús ${meta.chests || 0} · Conquistas ${achievementSummary()}`;
}

function updateContinueButton() {
  continueBtn.classList.toggle("hidden", !hasSavedRun());
}

function saveCurrentRun() {
  saveRunDirty = true;
  if (saveRunTimer) return;
  saveRunTimer = setTimeout(() => {
    saveRunTimer = 0;
    if (!player || !dungeon) return;
    if (!saveRunDirty) return;
    writeCurrentRun({ player, dungeon, enemies, items, currentFloor, exitTile, bossDefeated, runStats, logLines, gameState });
    saveRunDirty = false;
    updateContinueButton();
  }, CONFIG.SAVE_DEBOUNCE_MS);
}

function flushCurrentRunSave() {
  if (!saveRunTimer && !saveRunDirty) return;
  clearTimeout(saveRunTimer);
  if (player && dungeon && saveRunDirty) {
    writeCurrentRun({ player, dungeon, enemies, items, currentFloor, exitTile, bossDefeated, runStats, logLines, gameState });
    saveRunDirty = false;
  }
  saveRunTimer = 0;
  updateContinueButton();
}

function loadSave() {
  const saved = loadSavedRun();
  if (!saved) return false;
  player = saved.player;
  enemies = (saved.enemies || []).filter(e => e && e.alive);
  items = saved.items || [];
  currentFloor = saved.currentFloor || 1;
  dungeon = saved.dungeon;
  exitTile = saved.exitTile;
  bossDefeated = !!saved.bossDefeated;
  floorEnemySpawned = enemies.length;
  floorKills = 0;
  runStats = saved.runStats || { kills: 0, chests: 0, shrines: 0, traps: 0, relics: 0 };
  logLines = saved.logLines || [`Expedição retomada no Andar ${currentFloor}/${CONFIG.FINAL_FLOOR}.`];
  currentEnemy = null;
  inTurn = false;
  gameState = "explore";
  stateBeforePause = "explore";
  menuOverlay.classList.add("hidden");
  pauseOverlay.classList.add("hidden");
  player.rx = player.x;
  player.ry = player.y;
  player.statusEffects = player.statusEffects || {};
  for (let i = 0; i < enemies.length; i++) enemies[i].statusEffects = enemies[i].statusEffects || {};
  ensureDungeonRuntimeState(dungeon);
  revealFog(dungeon, player.x, player.y, CONFIG.FOG_RADIUS);
  computeDijkstraMap(dungeon, player.x, player.y);
  ensureCaches();
  buildMapCache();
  seedMotesFallback();
  updateCamera();
  renderLogLines();
  addLog(`Expedição retomada no Andar ${currentFloor}/${CONFIG.FINAL_FLOOR}.`, "gold");
  updateUI();
  return true;
}

function clearRun() {
  clearTimeout(saveRunTimer);
  saveRunTimer = 0;
  saveRunDirty = false;
  clearSavedRun();
  updateContinueButton();
}

// =============================================================
// CAMERA
// =============================================================
function updateCamera() {
  camera.x = clamp(player.x - Math.floor(CONFIG.VIEW_W / 2), 0, CONFIG.MAP_W - CONFIG.VIEW_W);
  camera.y = clamp(player.y - Math.floor(CONFIG.VIEW_H / 2), 0, CONFIG.MAP_H - CONFIG.VIEW_H);
  camera.rx = camera.x;
  camera.ry = camera.y;
}

// =============================================================
// DUNGEON CACHE
// =============================================================
function buildMapCache() {
  const mapW = CONFIG.MAP_W * CONFIG.TILE_SIZE;
  const mapH = CONFIG.MAP_H * CONFIG.TILE_SIZE;
  ensureCaches();
  mapCache.width = mapW;
  mapCache.height = mapH;
  const c = mapCache.getContext("2d");
  c.clearRect(0, 0, mapW, mapH);
  dungeon.lightSources = Array.from({ length: CONFIG.MAP_H }, () => Array(CONFIG.MAP_W).fill(false));

  for (let my = 0; my < CONFIG.MAP_H; my++) {
    for (let mx = 0; mx < CONFIG.MAP_W; mx++) {
      const x = mx * CONFIG.TILE_SIZE, y = my * CONFIG.TILE_SIZE;
      if (dungeon.map[my][mx] === CONFIG.TILE_WALL) drawCachedWallTile(c, x, y, mx, my);
      else {
        drawCachedFloorTile(c, x, y, mx, my);
        drawCachedFloorDecor(c, x, y, mx, my);
        dungeon.lightSources[my][mx] = Math.abs((mx * 23 + my * 19) % 17) === 8 && hasAdjacentWall(mx, my);
      }
    }
  }
}

function hasAdjacentWall(mx, my) {
  return dungeon.map[my - 1]?.[mx] === TILE_WALL ||
    dungeon.map[my + 1]?.[mx] === TILE_WALL ||
    dungeon.map[my]?.[mx - 1] === TILE_WALL ||
    dungeon.map[my]?.[mx + 1] === TILE_WALL;
}

function drawCachedWallTile(c, x, y, mx, my) {
  const TILE = CONFIG.TILE_SIZE;
  const openBelow = dungeon.map[my + 1] && dungeon.map[my + 1][mx] !== CONFIG.TILE_WALL;
  const openLeft = dungeon.map[my] && dungeon.map[my][mx - 1] !== CONFIG.TILE_WALL;
  const openRight = dungeon.map[my] && dungeon.map[my][mx + 1] !== CONFIG.TILE_WALL;
  const variant = Math.abs((mx * 17 + my * 31) % 4);
  c.fillStyle = COLORS.wallDark; c.fillRect(x, y, TILE, TILE);
  c.fillStyle = variant % 2 ? COLORS.wallMid : "#202047";
  c.fillRect(x + 1, y + 2, TILE - 2, TILE - 4);
  c.fillStyle = COLORS.wallHi; c.fillRect(x + 1, y + 2, TILE - 2, 3);
  c.fillStyle = "#12122b"; c.fillRect(x + 1, y + TILE - 5, TILE - 2, 3);
  c.fillStyle = "#34346d"; c.fillRect(x + 4, y + 8, 7, 1); c.fillRect(x + 14, y + 14, 6, 1);
  if (variant === 1) {
    c.fillStyle = COLORS.wallEdge; c.fillRect(x + 5, y + 6, 2, 2); c.fillRect(x + 16, y + 11, 3, 1);
  }
  if (variant === 2) {
    c.fillStyle = "#161631"; c.fillRect(x + 8, y + 6, 1, 10); c.fillRect(x + 9, y + 15, 5, 1);
  }
  if (openBelow) {
    c.fillStyle = "#0b0b1c"; c.fillRect(x, y + TILE - 4, TILE, 4);
    c.fillStyle = "#6969b7"; c.fillRect(x, y + TILE - 5, TILE, 1);
  }
  if (openLeft) { c.fillStyle = "#101027"; c.fillRect(x, y + 4, 2, TILE - 7); }
  if (openRight) { c.fillStyle = "#30306b"; c.fillRect(x + TILE - 2, y + 4, 1, TILE - 7); }
  if (gfxPresent === "ps1") {
    c.fillStyle = "#141430"; c.fillRect(x, y + 3, 2, TILE - 3);
    c.fillStyle = "#4a4a94"; c.fillRect(x + TILE - 2, y + 3, 1, TILE - 4);
    c.fillStyle = "rgba(8,8,24,0.5)"; c.fillRect(x + 3, y + 1, TILE - 6, 1);
  }
}

function drawCachedFloorTile(c, x, y, mx, my) {
  const TILE = CONFIG.TILE_SIZE;
  c.fillStyle = COLORS.floorDark; c.fillRect(x, y, TILE, TILE);
  c.fillStyle = (mx + my) % 2 ? COLORS.floorMid : "#28284e";
  c.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
  c.fillStyle = "rgba(255, 255, 255, 0.035)"; c.fillRect(x + 2, y + 2, TILE - 4, 1);
  c.fillStyle = "rgba(0, 0, 0, 0.22)"; c.fillRect(x + 2, y + TILE - 3, TILE - 4, 1);
  c.fillStyle = COLORS.floorHi;
  if ((mx * 11 + my * 5) % 4 === 0) c.fillRect(x + 4, y + 15, 8, 1);
  if ((mx * 3 + my * 13) % 6 === 0) c.fillRect(x + 16, y + 5, 3, 3);
  if (my > 0 && dungeon.map[my - 1][mx] === CONFIG.TILE_WALL) {
    c.fillStyle = "rgba(0,0,0,0.5)"; c.fillRect(x, y, TILE, 6);
  }
}

function drawCachedFloorDecor(c, x, y, mx, my) {
  const code = Math.abs((mx * 23 + my * 19) % 17);
  if (code === 0) {
    c.fillStyle = "#17172f"; c.fillRect(x + 6, y + 6, 2, 1); c.fillRect(x + 16, y + 14, 2, 2);
    c.fillStyle = "#55558e"; c.fillRect(x + 7, y + 5, 1, 1); c.fillRect(x + 17, y + 13, 1, 1);
  }
  if (code === 4) {
    c.fillStyle = "#111126"; c.fillRect(x + 5, y + 7, 7, 1); c.fillRect(x + 11, y + 8, 1, 5); c.fillRect(x + 12, y + 12, 5, 1);
    c.fillStyle = "#54548a"; c.fillRect(x + 5, y + 6, 4, 1);
  }
  if (code === 8 && hasAdjacentWall(mx, my)) {
    c.fillStyle = "rgba(255, 157, 79, 0.22)"; c.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
    c.fillStyle = COLORS.orange; c.fillRect(x + 11, y + 6, 3, 7);
    c.fillStyle = COLORS.gold; c.fillRect(x + 10, y + 4, 5, 4);
  }
  if (code === 12) {
    c.fillStyle = COLORS.purple; c.fillRect(x + 7, y + 7, 2, 8); c.fillRect(x + 7, y + 7, 7, 2); c.fillRect(x + 13, y + 9, 2, 5);
  }
}

function seedMotesFallback() {
  seedMotes();
}

// =============================================================
// SELECT CLASS / MENUS
// =============================================================
function selectClass(classKey) {
  selectedClassKey = classKey;
  document.querySelectorAll(".classCard").forEach(card => {
    const isSelected = card.dataset.class === classKey;
    card.classList.toggle("selected", isSelected);
    card.setAttribute("aria-selected", isSelected);
    card.setAttribute("aria-pressed", isSelected);
  });
  const data = CLASS_DATA[classKey];
  classDetails.innerHTML = `
    <div class="classDetailTitle">${data.name} · ${data.title}</div>
    <div class="classDetailStats">PV ${data.maxHp} · ATK ${data.atk} · DEF ${data.def} · MAG ${data.mag} · CRIT ${Math.round(data.crit * 100)}%</div>
    <div class="classDetailSkill">${data.special}: ${data.specialDesc}</div>
  `;
  startJourneyBtn.classList.remove("hidden");
  playSfx("select");
}

function showMenuView(view) {
  menuHomeView.classList.toggle("hidden", view !== "home");
  introCinematicView.classList.toggle("hidden", view !== "intro");
  characterSelectView.classList.toggle("hidden", view !== "class");
  optionsView.classList.toggle("hidden", view !== "options");
  if (view === "home") {
    selectedClassKey = null;
    startJourneyBtn.classList.add("hidden");
    classDetails.innerHTML = `
      <div class="classDetailTitle">Selecione uma classe</div>
      <div class="classDetailSkill">Toque em um herói para ver atributos e habilidade antes de iniciar.</div>
    `;
    document.querySelectorAll(".classCard").forEach(card => {
      card.classList.remove("selected");
      card.removeAttribute("aria-selected");
      card.setAttribute("aria-pressed", "false");
    });
  }
  updateMetaRecords();
  updateContinueButton();
}

function startIntroCinematic() {
  showMenuView("intro");
  introText.textContent = "";
  clearInterval(introTimer);
  let i = 0;
  introTimer = setInterval(() => {
    introText.textContent = INTRO_TEXT.slice(0, i);
    if (i % 26 === 0) playSfx("ominous");
    i++;
    if (i > INTRO_TEXT.length) clearInterval(introTimer);
  }, 28);
}

function finishIntroCinematic() {
  clearInterval(introTimer);
  introText.textContent = INTRO_TEXT;
  showMenuView("class");
}

// =============================================================
// START / RESTART
// =============================================================
function startGame(classKey) {
  unlockAudio();
  playSfx("select");
  const data = CLASS_DATA[classKey];

  LoadingScreen.show();
  LoadingScreen.setProgress(30);

  setTimeout(() => {
    setSeedFloor(1);
    resetSeedForFloor();
    dungeon = generateDungeon();
    enemies = [];
    items = [];
    runStats = { kills: 0, chests: 0, shrines: 0, traps: 0, relics: 0 };
    bossDefeated = false;
    currentFloor = 1;
    currentEnemy = null;
    gameState = "explore";
    stateBeforePause = "explore";
    startMusic({ floor: currentFloor });
    menuOverlay.classList.add("hidden");
    pauseOverlay.classList.add("hidden");
    LoadingScreen.setProgress(60);

    const startRoom = dungeon.rooms[0];
    const exitRoom = dungeon.rooms[dungeon.rooms.length - 1];

    player = createPlayer(classKey, data, startRoom);
    exitTile = { x: exitRoom.cx, y: exitRoom.cy };
    dungeon.map[exitTile.y][exitTile.x] = CONFIG.TILE_EXIT;
    LoadingScreen.setProgress(80);

    ensureCaches();
    spawnEnemiesAndItems(dungeon, enemies, items, player, exitTile, currentFloor, runStats, meta);
    buildMapCache();
    seedMotesFallback();
    updateCamera();
    revealFog(dungeon, player.x, player.y, CONFIG.FOG_RADIUS);
    computeDijkstraMap(dungeon, player.x, player.y);
    logLines = [];
    addLog(`${data.name} entrou na Cripta do Núcleo Rubro.`, "gold");
    addLog(`Andar ${currentFloor}/${CONFIG.FINAL_FLOOR}: encontre a escada para descer.`);
    showToast(`${data.name} escolhido!`);
    updateUI();
    saveCurrentRun();
    LoadingScreen.setProgress(100);
    setTimeout(() => LoadingScreen.hide(), 200);
  }, 100);
}

function restartToMenu() {
  gameState = "menu";
  stateBeforePause = "explore";
  pauseOverlay.classList.add("hidden");
  menuOverlay.classList.remove("hidden");
  showMenuView("home");
  logLines = [];
  addLog(`Escolha uma classe. Vitórias: ${meta.wins}, melhor nível: ${meta.bestLevel}.`);
  updateUI();
}

// =============================================================
// PAUSE
// =============================================================
function openPauseMenu() {
  if (!player || (gameState !== "explore" && gameState !== "combat")) return;
  stateBeforePause = gameState;
  if (blockWindow) { blockWindow = false; pendingDmg = 0; updateUI(); }
  if (commandMenuOpen) closeCommandMenu();
  gameState = "paused";
  flushCurrentRunSave();
  pauseOverlay.classList.remove("hidden");
  refreshPauseMenu();
  playSfx("select");
  updateUI();
}

function closePauseMenu() {
  if (gameState !== "paused") return;
  gameState = stateBeforePause;
  pauseOverlay.classList.add("hidden");
  playSfx("select");
  updateUI();
}

function refreshPauseMenu() {
  if (!player) return;
  const defeated = floorKills;
  const total = floorEnemySpawned || enemies.length || 1;
  pauseHero.textContent = `${player.className} Nv.${player.level}`;
  pauseProgress.textContent = `Andar ${currentFloor}/${FINAL_FLOOR} · ${defeated}/${total} inimigos`;
  pauseHp.textContent = `${player.hp}/${player.maxHp} PV`;
  let relicLines = '<span class="purple">Nenhum equipamento na run</span>';
  if (player.relicNames.length) {
    relicLines = "";
    for (let i = 0; i < player.relicNames.length; i++) {
      const name = player.relicNames[i];
      if (i > 0) relicLines += "<br>";
      relicLines += `<span class="gold">• ${name}</span> <span class="blue">(${RELIC_EFFECTS[name] || "efeito ativo"})</span>`;
    }
  }
  pauseItems.innerHTML = `<b>Bolsa de Consumíveis</b><br><span class="green">${player.potions} poções</span><br><span class="gold">${player.gold} ouro</span><br><b>Equipamentos Ativos</b><br>${relicLines}<br><b>Time de Monstros</b><br><span class="purple">${player.monsters.length ? player.monsters.map(m => `${m.name} Nv.${m.level} (${m.hp}/${m.maxHp})`).join("<br>") : "Nenhum capturado ainda"}</span> · <span class="blue">${player.captureCrystals} cristais</span>`;
  pauseSoundBtn.textContent = getSoundEnabled() ? "SOM: LIGADO" : "SOM: DESLIGADO";
  const pauseCombatBtn = document.getElementById("pauseCombatBtn");
  if (pauseCombatBtn) pauseCombatBtn.textContent = `COMBATE: ${getCombatModeName()}`;
}

function runWhenState(state, fn, delay = 0) {
  setTimeout(() => {
    if (gameState === "paused") { runWhenState(state, fn, 90); return; }
    if (gameState === state) fn();
  }, delay);
}

// =============================================================
// EXPLORATION
// =============================================================
function tryMove(dx, dy) {
  if (gameState !== "explore" || !player || inputFrozen) return;
  const now = performance.now();
  if (now - lastMoveAt < CONFIG.MOVE_COOLDOWN_MS) return;
  lastMoveAt = now;

  player.dir = dx < 0 ? "left" : dx > 0 ? "right" : dy < 0 ? "up" : "down";
  const nx = player.x + dx, ny = player.y + dy;

  if (!isWalkable(dungeon, nx, ny)) {
    addLog("A parede fria devolve seu passo.");
    shake = 5;
    playSfx("bump");
    return;
  }

  const enemy = occupiedByEnemy(nx, ny);
  if (enemy) { beginCombat(enemy); return; }

  player.x = nx; player.y = ny;
  player.movePulse = 9;
  player.steps++;
  revealFog(dungeon, player.x, player.y, CONFIG.FOG_RADIUS);
  computeDijkstraMap(dungeon, player.x, player.y);
  spawnEffect("dust", sxFor(player.x) - dx * 14, syFor(player.y) - dy * 12 + 7, "", "#9c90c9", { life: CONFIG.EFFECT_LIFE_DUST_1, vx: -dx * 0.25, vy: -0.2, size: 2 });
  spawnEffect("dust", sxFor(player.x) - dx * 12 + rand(-3, 3), syFor(player.y) - dy * 12 + 8, "", "#665f95", { life: CONFIG.EFFECT_LIFE_DUST_2, vx: rand(-4, 4) / 10, vy: -0.12, size: 1 });
  if (dungeon.map[player.y]?.[player.x] === CONFIG.TILE_EXIT) {
    spawnEffect("spark", sxFor(player.x) + rand(-6, 6), syFor(player.y) + rand(-6, 6), "", COLORS.gold, { life: 14, vx: rand(-3, 3) / 10, vy: -0.3, size: 1 });
  }
  playSfx("step");

  const item = itemAt(nx, ny);
  if (item) {
    if (item.type === "mentor") { startMentorDialog(item); return; }
    if (item.type === "shop") { openShopDialog(item); return; }
    if (item.type === "event") { startEventDialog(item); return; }
    resolveItem(item);
  }

  if (nx === exitTile.x && ny === exitTile.y) {
    if (currentFloor < CONFIG.FINAL_FLOOR) { descendFloor(); return; }
    if (bossDefeated) {
      if (endlessMode) {
        addLog("A cripta se aprofunda além do andar final... Modo Infinito!", "gold");
        descendFloor();
      } else {
        winGame();
      }
      return;
    }
    addLog("Uma força rubra bloqueia a saída. Derrote o chefão!", "red");
  }

  updateEnemyPatrols();

  if (chance(CONFIG.WILD_AMBUSH_CHANCE_BASE + currentFloor * CONFIG.WILD_AMBUSH_CHANCE_PER_FLOOR) && player.steps > CONFIG.WILD_AMBUSH_MIN_STEPS) {
    triggerWildAmbush();
  }

  updateCamera();
  updateUI();
}

// =============================================================
// =============================================================
// GAMEPAD API
// =============================================================
function pollGamepad() {
  const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of gamepads) {
    if (!gp) continue;
    if (gameState !== "explore" && gameState !== "combat" && gameState !== "paused") return;
    const [lx, ly] = [gp.axes[0] || 0, gp.axes[1] || 0];
    if (Math.abs(lx) > 0.5 || Math.abs(ly) > 0.5) {
      if (gameState === "explore" && !inputFrozen) {
        tryMove(lx > 0.5 ? 1 : lx < -0.5 ? -1 : 0, ly > 0.5 ? 1 : ly < -0.5 ? -1 : 0);
        gamepadRepeatDelay = CONFIG.GAMEPAD_REPEAT_DELAY;
      }
    }
    for (let b = 0; b < gp.buttons.length; b++) {
      const pressed = gp.buttons[b].pressed;
      const wasPressed = lastGamepadButtons[b] || false;
      if (pressed && !wasPressed) {
        if (b === 0) actionA();
        if (b === 1) usePotionOrSpecial();
        if (b === 9) {
          if (gameState === "paused") closePauseMenu();
          else openPauseMenu();
        }
      }
      lastGamepadButtons[b] = pressed;
    }
  }
}

let gamepadRepeatDelay = 0;

// =============================================================
// ONE-HANDED MODE
// =============================================================
function toggleOneHandedMode() {
  oneHandedMode = !oneHandedMode;
  document.getElementById("controls").classList.toggle("oneHanded", oneHandedMode);
  addLog(oneHandedMode ? "Modo uma mão ativado." : "Modo uma mão desativado.");
  playSfx("select");
  saveSettings();
}

function toggleEndlessMode() {
  endlessMode = !endlessMode;
  addLog(endlessMode ? "Modo Infinito ativado: após o chefão você continua descendo." : "Modo Infinito desativado.");
  playSfx("select");
  saveSettings();
  refreshMenuText();
}

function getGfxPresentName() {
  return gfxPresent === "ps1" ? "PS1" : "2D";
}

function toggleGfxPresent() {
  gfxPresent = gfxPresent === "ps1" ? "2d" : "ps1";
  addLog(gfxPresent === "ps1"
    ? "Visual PS1 ativado: scanlines, dither, granulado, paredes 2.5D e piso em perspectiva."
    : "Visual: 2D clássico.");
  playSfx("select");
  saveSettings();
  refreshMenuText();
if (dungeon && typeof buildMapCache === "function") buildMapCache();
}

// =============================================================
// ACCESSIBILITY SETTINGS
// =============================================================
const COLOR_BLIND_ORDER = ["off", "deuteranopia", "protanopia", "tritanopia"];
const UI_SCALE_ORDER = ["normal", "large", "xl"];
const DIFFICULTY_ORDER = ["normal", "easy", "story"];

function getColorBlindName() {
  return { off: "PADRÃO", deuteranopia: "DEUTERANOPIA", protanopia: "PROTANOPIA", tritanopia: "TRITANOPIA" }[colorBlindMode] || "PADRÃO";
}

function getUiScaleName() {
  return { normal: "NORMAL", large: "GRANDE", xl: "EXTRA GRANDE" }[uiScale] || "NORMAL";
}

function getDifficultyName() {
  return { normal: "NORMAL", easy: "FÁCIL", story: "HISTÓRIA" }[difficulty] || "NORMAL";
}

function applyAccessibilitySettings() {
  applyAccessibilityPalette(colorBlindMode, highContrast);
  document.documentElement.classList.toggle("hc", highContrast);
  document.documentElement.classList.toggle("reduce-flash", reduceFlash);
  document.documentElement.classList.remove("ui-normal", "ui-large", "ui-xl");
  document.documentElement.classList.add(`ui-${uiScale}`);
  document.documentElement.classList.remove("diff-normal", "diff-easy", "diff-story");
  document.documentElement.classList.add(`diff-${difficulty}`);
  saveSettings();
  refreshMenuText();
  updateUI();
}

function toggleColorBlindMode() {
  const idx = (COLOR_BLIND_ORDER.indexOf(colorBlindMode) + 1) % COLOR_BLIND_ORDER.length;
  colorBlindMode = COLOR_BLIND_ORDER[idx];
  const names = { off: "Cores padrão", deuteranopia: "Paleta para deuteranopia", protanopia: "Paleta para protanopia", tritanopia: "Paleta para tritanopia" };
  addLog(`${names[colorBlindMode]} aplicada.`, "purple");
  playSfx("select");
  applyAccessibilitySettings();
}

function toggleHighContrast() {
  highContrast = !highContrast;
  addLog(highContrast ? "Alto contraste ativado." : "Alto contraste desativado.");
  playSfx("select");
  applyAccessibilitySettings();
}

function toggleReduceFlash() {
  reduceFlash = !reduceFlash;
  addLog(reduceFlash ? "Redução de flashes ativada." : "Redução de flashes desativada.");
  playSfx("select");
  applyAccessibilitySettings();
}

function toggleUiScale() {
  const idx = (UI_SCALE_ORDER.indexOf(uiScale) + 1) % UI_SCALE_ORDER.length;
  uiScale = UI_SCALE_ORDER[idx];
  addLog(`Tamanho da interface: ${getUiScaleName()}.`, "blue");
  playSfx("select");
  applyAccessibilitySettings();
}

function toggleDifficulty() {
  const idx = (DIFFICULTY_ORDER.indexOf(difficulty) + 1) % DIFFICULTY_ORDER.length;
  difficulty = DIFFICULTY_ORDER[idx];
  const desc = {
    normal: "Dificuldade padrão.",
    easy: "Fácil: dano recebido reduzido, +1 poção e +15 ouro iniciais.",
    story: "História: muito menos dano, +2 poções e +30 ouro iniciais."
  };
  addLog(`Dificuldade: ${getDifficultyName()}. ${desc[difficulty]}`, "blue");
  playSfx("select");
  applyAccessibilitySettings();
}

function getDifficultyDamageMult() {
  if (difficulty === "easy") return CONFIG.DIFF_EASY_DMG_MULT;
  if (difficulty === "story") return CONFIG.DIFF_STORY_DMG_MULT;
  return 1;
}

function getDifficultyBonusPotions() {
  if (difficulty === "easy") return CONFIG.DIFF_EASY_BONUS_POTIONS;
  if (difficulty === "story") return CONFIG.DIFF_STORY_BONUS_POTIONS;
  return 0;
}

function getDifficultyStartGold() {
  if (difficulty === "easy") return CONFIG.DIFF_EASY_BONUS_START_GOLD;
  if (difficulty === "story") return CONFIG.DIFF_STORY_BONUS_START_GOLD;
  return 0;
}

function effectiveIncomingDamage(dmg) {
  const mult = getDifficultyDamageMult();
  if (mult >= 1) return dmg;
  return Math.max(1, Math.round(dmg * mult));
}

function getCombatModeName() {
  return combatMode === "turn" ? "TURNOS (ATB)" : "AÇÃO (NO MAPA)";
}

function toggleCombatMode() {
  combatMode = combatMode === "action" ? "turn" : "action";
  if (combatMode === "turn") {
    addLog("Combate por TURNOS ativado. A: abrir comandos · B: bloquear/timbre.");
  } else {
    addLog("Combate em AÇÃO direto na Dungeon. A: atacar · B: esquivar/poção.");
  }
  if (gameState === "combat" && currentEnemy) {
    if (combatMode === "turn") {
      resetAtbState();
      playerAtbReady = false;
      enemyAtbPending = false;
      showToast("COMBATE POR TURNOS!", 1000);
      if (typeof initActionState === "function") initActionState();
      addLog("Turno de ATAQUE — toque A duas vezes no ritmo do ponto doce!", "#6cc");
    } else {
      resetAtbState();
      showToast("COMBATE NO MAPA!", 1000);
      if (typeof initActionState === "function") initActionState();
    }
  }
  playSfx("select");
  saveSettings();
  refreshMenuText();
  refreshPauseMenu();
}

function resetAtbState() {
  if (atbEnemyFallbackTimer) { clearTimeout(atbEnemyFallbackTimer); atbEnemyFallbackTimer = null; }
  atbPlayer = combatMode === "turn" ? CONFIG.ATB_START_PLAYER : 0;
  atbEnemy = combatMode === "turn" ? CONFIG.ATB_START_ENEMY : 0;
  playerAtbReady = false;
  enemyAtbPending = false;
  commandMenuOpen = false;
  commandMenuIndex = 0;
  commandMenuMode = "main";
  if (currentEnemy && !currentEnemy.nextIntent) currentEnemy.nextIntent = rollEnemyIntent();
  const el = document.getElementById("commandMenu");
  if (el) el.classList.add("hidden");
}

function scheduleEnemyTurn() {
  if (gameState !== "combat" || !currentEnemy) return;
  if (combatMode === "action") return;
  if (combatMode === "turn") {
    atbEnemy = 0;
    enemyAtbPending = true;
    currentEnemy.nextIntent = rollEnemyIntent();
    if (atbEnemyFallbackTimer) clearTimeout(atbEnemyFallbackTimer);
    atbEnemyFallbackTimer = setTimeout(() => {
      atbEnemyFallbackTimer = null;
      if (gameState === "combat" && currentEnemy && enemyAtbPending) {
        enemyAtbPending = false;
        atbEnemy = 0;
        enemyTurn();
      }
    }, CONFIG.ATB_ENEMY_FALLBACK_MS);
    return;
  }
  enemyTurn();
}

function getEnemyAtbSpeed() {
  if (!currentEnemy) return CONFIG.ATB_FILL_ENEMY;
  const k = currentEnemy.kind;
  const mults = {
    slime: 0.85,
    bat: 1.35,
    goblin: 1.1,
    armor: 0.95,
    specter: 1.3,
    treant: 0.7,
    golem: 0.65,
    lich: 1.05,
    wraith: 1.2,
    boss: 1.15
  };
  let mult = mults[k] || 1;
  if (currentEnemy.affix === "swift") mult *= 1.3;
  return CONFIG.ATB_FILL_ENEMY * mult;
}

function updateAtbCombat() {
  if (!currentEnemy || player.hp <= 0) return;
  if (enemyAtbPending) {
    atbEnemy = Math.min(CONFIG.ATB_MAX, atbEnemy + getEnemyAtbSpeed());
    if (atbEnemy >= CONFIG.ATB_MAX) {
      atbEnemy = 0;
      enemyAtbPending = false;
      enemyTurn();
    }
    return;
  }
if (playerAtbReady) {
    if (currentEnemy && !currentEnemy.nextIntent) currentEnemy.nextIntent = rollEnemyIntent();
    if (!commandMenuOpen && !inputFrozen && !blockWindow && !attackTimingActive) openCommandMenu();
    return;
  }
  if (inTurn || blockWindow || attackTimingActive || inputFrozen) return;
  atbPlayer = Math.min(CONFIG.ATB_MAX, atbPlayer + CONFIG.ATB_FILL_PLAYER);
  if (atbPlayer >= CONFIG.ATB_MAX) {
    atbPlayer = 0;
    playerAtbReady = true;
    openCommandMenu();
  }
}

const COMMAND_LIST = ["attack", "skill", "guard", "item", "switch", "capture"];

function openCommandMenu() {
  if (gameState !== "combat" || !currentEnemy || !playerAtbReady || inputFrozen) return;
  commandMenuOpen = true;
  commandMenuIndex = 0;
  commandMenuMode = "main";
  inputFrozen = true;
  const el = document.getElementById("commandMenu");
  if (el) el.classList.remove("hidden");
  refreshCommandMenu();
  playSfx("select");
  updateUI();
}

function closeCommandMenu() {
  commandMenuOpen = false;
  inputFrozen = false;
  const el = document.getElementById("commandMenu");
  if (el) el.classList.add("hidden");
}

function refreshCommandMenu() {
  if (commandMenuMode === "switch") {
    refreshCommandRoster();
    return;
  }
  const buttons = document.querySelectorAll("#commandMenu .cmdBtn");
  buttons.forEach((btn, i) => {
    btn.classList.toggle("selected", i === commandMenuIndex);
    const cmd = btn.dataset.cmd;
    let disabled = false;
    if (cmd === "skill") {
      disabled = player.specialCd > 0 || player.stamina < CONFIG.SPECIAL_STAMINA_COST;
      btn.textContent = player.specialCd > 0 ? `${player.special}: CD ${player.specialCd}` : `${player.special}`;
    } else if (cmd === "guard") {
      btn.textContent = `DEFENDER (${Math.round((1 - CONFIG.GUARDING_DAMAGE_MULT) * 100)}% absorvido)`;
    } else if (cmd === "item") {
      disabled = player.potions <= 0 || player.hp >= player.maxHp;
      btn.textContent = player.potions <= 0 ? "SEM POÇÕES" : `POÇÃO x${player.potions}`;
    } else if (cmd === "switch") {
      disabled = getSwitchableCount() < 1;
      btn.textContent = `TROCAR (${getSwitchableCount()})`;
    } else if (cmd === "capture") {
      disabled = player.captureCrystals <= 0 || !canCaptureEnemy();
      btn.textContent = player.captureCrystals <= 0 ? "SEM CRISTAL" : `CAPTURAR x${player.captureCrystals}`;
    } else {
      disabled = player.stamina < CONFIG.ATTACK_STAMINA_COST;
      btn.textContent = `ATAÇAR (${player.stamina}/${player.maxStamina} fôlego)`;
    }
    btn.disabled = disabled;
  });
}

function getSwitchableCount() {
  if (!player || !player.monsters) return 0;
  let count = 0;
  for (let i = 0; i < player.monsters.length; i++) {
    if (player.activeSlot !== i + 1 && player.monsters[i].hp > 0) count++;
  }
  return count;
}

function canCaptureEnemy() {
  return !!currentEnemy && !currentEnemy.boss && !currentEnemy.miniboss && player.monsters.length < CONFIG.TEAM_MAX;
}

function refreshCommandRoster() {
  const roster = document.getElementById("commandRoster");
  if (!roster) return;
  roster.innerHTML = "";
  const slots = [];
  slots.push({ slotIdx: 0, label: `⚔ ${player.className} (${player.hp}/${player.maxHp} PV)` });
  player.monsters.forEach((m, i) => {
    slots.push({ slotIdx: i + 1, label: `${m.hp > 0 ? "◆" : "✖"} ${m.name} Nv.${m.level} (${m.hp}/${m.maxHp} PV)` });
  });
  slots.forEach((s, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cmdBtn" + (i === commandMenuIndex ? " selected" : "");
    btn.textContent = s.label;
    btn.disabled = s.slotIdx === player.activeSlot || (s.slotIdx > 0 && player.monsters[s.slotIdx - 1].hp <= 0);
    btn.dataset.slot = String(s.slotIdx);
    btn.addEventListener("click", ev => {
      ev.preventDefault();
      commandMenuIndex = i;
      confirmRosterSelection(i);
    });
    roster.appendChild(btn);
  });
}

function confirmRosterSelection(idx) {
  if (commandMenuMode !== "switch" || !commandMenuOpen) return;
  const slotIdx = getRosterSlotAt(idx);
  if (slotIdx === null) return;
  const isMonster = slotIdx > 0;
  if (isMonster && player.monsters[slotIdx - 1].hp <= 0) {
    addLog("Este monstro está desmaiado.", "muted");
    playSfx("bump");
    return;
  }
  if (slotIdx === player.activeSlot) return;
  closeCommandMenu();
  playerAtbReady = false;
  switchToSlot(slotIdx);
  inTurn = true;
  scheduleEnemyTurn();
  updateUI();
}

function getRosterSlotAt(idx) {
  const slots = [0];
  for (let i = 0; i < player.monsters.length; i++) slots.push(i + 1);
  const s = slots[idx];
  return s === undefined ? null : s;
}

function commandMenuMove(dir) {
  if (!commandMenuOpen) return;
  let count = COMMAND_LIST.length;
  if (commandMenuMode === "switch") count = Math.max(1, 1 + player.monsters.length);
  if (dir === "up") commandMenuIndex = (commandMenuIndex + count - 1) % count;
  else if (dir === "down") commandMenuIndex = (commandMenuIndex + 1) % count;
  else if (dir === "left") commandMenuIndex = Math.max(0, commandMenuIndex - 1);
  else if (dir === "right") commandMenuIndex = Math.min(count - 1, commandMenuIndex + 1);
  playSfx("select");
  refreshCommandMenu();
}

function confirmCommand(idx) {
  if (!commandMenuOpen) return;
  if (commandMenuMode === "switch") { confirmRosterSelection(idx); return; }
  const cmd = COMMAND_LIST[idx];
  const btn = document.querySelector(`#commandMenu .cmdBtn[data-cmd="${cmd}"]`);
  if (btn && btn.disabled) {
    addLog("Comando indisponível agora.", "muted");
    playSfx("bump");
    return;
  }
  closeCommandMenu();
  playerAtbReady = false;
  if (cmd === "attack") {
    if (player.stamina < CONFIG.ATTACK_STAMINA_COST) {
      addLog("Você está exausto e recua. O inimigo avança!", "muted");
      inTurn = true;
      scheduleEnemyTurn();
      updateUI();
      return;
    }
    playerAttack(false);
  } else if (cmd === "skill") {
    playerAttack(true);
  } else if (cmd === "guard") {
    playerGuard();
  } else if (cmd === "item") {
    usePotion(true);
  } else if (cmd === "switch") {
    commandMenuMode = "switch";
    commandMenuIndex = 0;
    openCommandMenuRoster();
  } else if (cmd === "capture") {
    tryCapture();
  }
}

function openCommandMenuRoster() {
  commandMenuOpen = true;
  inputFrozen = true;
  const el = document.getElementById("commandMenu");
  if (el) el.classList.remove("hidden");
  const main = document.getElementById("commandMain");
  const roster = document.getElementById("commandRoster");
  const title = document.getElementById("commandTitle");
  const hint = document.getElementById("commandHint");
  if (main) main.classList.add("hidden");
  if (roster) roster.classList.remove("hidden");
  if (title) title.textContent = "TROCAR";
  if (hint) hint.textContent = "B volta · A troca e gasta a vez";
  refreshCommandRoster();
  playSfx("select");
}

function cancelCommandMenu() {
  if (!commandMenuOpen) return;
  if (commandMenuMode === "switch") {
    commandMenuMode = "main";
    commandMenuIndex = 0;
    const main = document.getElementById("commandMain");
    const roster = document.getElementById("commandRoster");
    const title = document.getElementById("commandTitle");
    const hint = document.getElementById("commandHint");
    if (main) main.classList.remove("hidden");
    if (roster) roster.classList.add("hidden");
    if (title) title.textContent = "AÇÃO";
    if (hint) hint.textContent = "D-PAD escolhe · A confirma · B passa a vez";
    refreshCommandMenu();
    playSfx("select");
    return;
  }
  closeCommandMenu();
  playerAtbReady = false;
  atbPlayer = 0;
  inTurn = true;
  addLog("Você hesita e perde a iniciativa...", "muted");
  scheduleEnemyTurn();
  updateUI();
}

// =============================================================
// MONSTER TEAM (switch / faint / capture)
// =============================================================
function switchToSlot(slotIdx) {
  if (!player || slotIdx === player.activeSlot) return;
  if (slotIdx === 0) {
    if (player.activeSlot > 0) {
      const m = player.monsters[player.activeSlot - 1];
      if (m) readPlayerToMonster(m, player);
      restoreChampion(player, player.championSnapshot);
      player.championSnapshot = null;
      player.activeSlot = 0;
      addLog(`${player.className} volta ao combate!`, "gold");
      playSfx("select");
      showToast("HERÓI NA ARENA!", CONFIG.TOAST_SHORT_MS);
    }
    return;
  }
  const m = player.monsters[slotIdx - 1];
  if (!m) return;
  if (player.activeSlot === 0) {
    player.championSnapshot = snapshotChampion(player);
  } else {
    const cur = player.monsters[player.activeSlot - 1];
    if (cur) readPlayerToMonster(cur, player);
  }
  applyMonsterToPlayer(player, m);
  player.activeSlot = slotIdx;
  addLog(`${m.name} entra no combate!`, "purple");
  if (!switchTutorialShown) {
    switchTutorialShown = true;
    addLog("Dica: trocar de lutador custa a vez — use para proteger o herói quando ele estiver com poucos PV.", "cyan");
  }
  playSfx("rune");
  showToast(`${m.name.toUpperCase()}!`, CONFIG.TOAST_SHORT_MS);
  burst(sxFor(player.x), syFor(player.y), m.color, CONFIG.LOOT_PARTICLE_COUNT, "spark");
}

function handlePlayerDown() {
  if (player.hp > 0) return false;
  if (player.activeSlot > 0) {
    const m = player.monsters[player.activeSlot - 1];
    if (m) { readPlayerToMonster(m, player); m.hp = 0; m.alive = false; }
    restoreChampion(player, player.championSnapshot);
    player.championSnapshot = null;
    player.activeSlot = 0;
    if (player.hp <= 0) return true;
    addLog(`${m.name} desmaiou! ${player.className} assume o combate.`, "gold");
    showToast("MONSTRO DESMAIOU!", CONFIG.TOAST_SHORT_MS);
    updateUI();
    return false;
  }
  return true;
}

function tryCapture() {
  if (!currentEnemy || gameState !== "combat") return;
  if (currentEnemy.boss || currentEnemy.miniboss) {
    addLog("Seres do Núcleo não podem ser capturados.", "red");
    playSfx("bump");
    playerAtbReady = true;
    openCommandMenu();
    return;
  }
  if (player.monsters.length >= CONFIG.TEAM_MAX) {
    addLog("Seu time está cheio (máximo de 4).", "red");
    playSfx("bump");
    playerAtbReady = true;
    openCommandMenu();
    return;
  }
  if (player.captureCrystals <= 0) {
    addLog("Sem cristais de captura.", "red");
    if (!captureTutorialShown) {
      captureTutorialShown = true;
      addLog("Dica: inimigos fracos podem ser capturados (TROCAR > CAPTURAR). Cristais aparecem em baús e mercadores!", "cyan");
    }
    playSfx("bump");
    playerAtbReady = true;
    openCommandMenu();
    return;
  }
  player.captureCrystals--;
  if (!captureTutorialShown) {
    captureTutorialShown = true;
    addLog("Dica: capture o inimigo quando ele estiver com poucos PV para ter maior chance de sucesso!", "cyan");
  }
  addLog("Você ergue o cristal de captura...", "blue");
  burst(sxFor(currentEnemy.x), syFor(currentEnemy.y), COLORS.blue, 12, "spark");
  playSfx("rune");
  shake = 5;
if (captureSuccess(currentEnemy.hp, currentEnemy.maxHp)) {
    const m = createMonsterFromEnemy(currentEnemy);
    player.monsters.push(m);
    const metaNow = loadMeta();
    metaNow.monstersCaptured = (metaNow.monstersCaptured || 0) + 1;
    saveMeta(metaNow);
    addLog(`${currentEnemy.name} foi capturado e se juntou ao seu time!`, "purple");
    showToast("CAPTURADO!", CONFIG.TOAST_MS);
    checkAchievements();
    runWhenState("combat", endCombatVictory, CONFIG.COMBAT_AFTER_BLOCK_DELAY_MS);
  } else {
    addLog(`O cristal estilhaça sem efeito. ${currentEnemy.name} resiste!`, "red");
    showToast("FALHOU!", CONFIG.TOAST_SHORT_MS);
    inTurn = true;
    scheduleEnemyTurn();
  }
  updateUI();
}

// =============================================================
// ACTION MODE (MODO AÇÃO)
// =============================================================
function getActionArenaRect() {
  const p = CONFIG.ACTION_ARENA_PAD;
  return { x: p, y: p, w: CONFIG.CANVAS_W - p * 2, h: CONFIG.CANVAS_H - p * 2 };
}

function getEnemyActionProfile() {
  const k = currentEnemy ? currentEnemy.kind : "slime";
  const profiles = {
    slime: { speed: 0.95, windup: 36, range: 30, ranged: false, cdMult: 1.0, move: "chase" },
    bat: { speed: 1.75, windup: 24, range: 34, ranged: false, cdMult: 0.75, move: "flank" },
    goblin: { speed: 1.25, windup: 30, range: 34, ranged: true, cdMult: 0.9, move: "kite" },
    armor: { speed: 0.95, windup: 44, range: 36, ranged: false, cdMult: 1.0, move: "chase" },
    specter: { speed: 1.4, windup: 28, range: 90, ranged: true, cdMult: 0.85, move: "flank" },
    treant: { speed: 0.65, windup: 52, range: 42, ranged: false, cdMult: 1.25, move: "chase" },
    golem: { speed: 0.55, windup: 60, range: 40, ranged: false, cdMult: 1.3, move: "chase" },
    lich: { speed: 0.9, windup: 44, range: 100, ranged: true, cdMult: 1.1, move: "kite" },
    wraith: { speed: 1.3, windup: 32, range: 80, ranged: true, cdMult: 0.8, move: "flank" },
    boss: { speed: 1.1, windup: 36, range: 40, ranged: false, cdMult: 0.9, move: "chase" }
  };
  let p = profiles[k] || profiles.slime;
  if (currentEnemy && currentEnemy.affix === "swift") p = { ...p, speed: p.speed * 1.3, cdMult: p.cdMult * 0.8 };
  if (currentEnemy && currentEnemy.affix === "wild") p = { ...p, speed: p.speed * 1.2 };
  const st = actionState;
  if (st && st.enraged) p = { ...p, speed: p.speed * CONFIG.ACTION_ENRAGE_SPEED_MULT, cdMult: p.cdMult * CONFIG.ACTION_ENRAGE_CD_MULT };
  return p;
}

function updateEnrageState() {
  const st = actionState;
  if (!st || !currentEnemy || currentEnemy.boss) return;
  const shouldEnrage = currentEnemy.hp > 0 && currentEnemy.hp <= currentEnemy.maxHp * CONFIG.ACTION_ENRAGE_HP_RATIO;
  if (shouldEnrage && !st.enraged) {
    st.enraged = true;
    spawnFloatingText(st.ex, st.ey - 22, "FÚRIA!", COLORS.red, 1.5);
    burst(st.ex, st.ey, COLORS.red, 12, "spark");
    flashOf(COLORS.red, 5);
    playSfx("ominous");
    hapticHeavy();
    addLog(`${currentEnemy.name} enfurece-se!`, "red");
  }
}

function actionEnemyAttackCd() {
  const base = CONFIG.ACTION_ENEMY_ATTACK_CD;
  if (!currentEnemy) return base;
  const mult = getEnemyActionProfile().cdMult;
  if (currentEnemy.boss) {
    return currentEnemy.phase2 ? Math.max(18, Math.round(base * 0.62 * mult)) : Math.max(24, Math.round(base * 0.85 * mult));
  }
  return Math.max(18, Math.round(base * mult));
}

function initActionState() {
  const r = getActionArenaRect();
  const s = CONFIG.SPRITE_SCALE;
  actionState = {
    px: r.x + 40,
    py: r.y + r.h - 24,
    facing: "right",
    atkCd: 0,
    atkAnim: 0,
    dashCd: 0,
    dashTicks: 0,
    dashDirX: 0,
    dashDirY: 0,
    iframes: 0,
    ex: r.x + r.w - 40,
    ey: r.y + 24,
    eFacing: "left",
    eWindup: 0,
    eAttackCd: actionEnemyAttackCd(),
    eStagger: 0,
    eHit: 0,
    eScale: Math.max(s, Math.round(Math.min(1.5, 0.6 + currentEnemy ? currentEnemy.boss ? 0.6 : currentEnemy.level * 0.02 : 0.2) * 3)),
    spawnX: r.x + 40,
    spawnY: r.y + r.h - 24,
    comboStep: 0,
    comboWindow: 0,
    enraged: false,
    telegraph: null,
    eRecoil: 0,
  };
  actionMoveDir = null;
}

function clampActionX(v) {
  const r = getActionArenaRect();
  return clamp(v, r.x + 12, r.x + r.w - 12);
}
function clampActionY(v) {
  const r = getActionArenaRect();
  return clamp(v, r.y + 12, r.y + r.h - 12);
}

function getActionMoveDir() {
  let dx = 0, dy = 0;
  if (actionMoveDir === "up") dy = -1;
  else if (actionMoveDir === "down") dy = 1;
  else if (actionMoveDir === "left") dx = -1;
  else if (actionMoveDir === "right") dx = 1;
  for (const k of actionHeldKeys) {
    if (k === "w" || k === "arrowup") dy -= 1;
    else if (k === "s" || k === "arrowdown") dy += 1;
    else if (k === "a" || k === "arrowleft") dx -= 1;
    else if (k === "d" || k === "arrowright") dx += 1;
  }
  if (dx === 0 && dy === 0) return null;
  const len = Math.hypot(dx, dy);
  return { x: dx / len, y: dy / len };
}

function tickActionStatuses() {
  if (actionStatusTimer > 0) { actionStatusTimer--; return; }
  actionStatusTimer = CONFIG.ACTION_STATUS_TICK_FRAMES;
  if (currentEnemy && currentEnemy.hp > 0) {
    const res = processStatusTurn(currentEnemy);
    if (res && res.dmg) {
      spawnFloatingText(actionState.ex, actionState.ey - 18, `-${res.dmg}`, res.type === "bleed" ? COLORS.red : COLORS.orange);
      burst(actionState.ex, actionState.ey, res.type === "bleed" ? COLORS.red : COLORS.orange, 5, "spark");
      playSfx("hurt");
      if (currentEnemy.hp <= 0) { endCombatVictory(); return; }
      updateUI();
    }
  }
  if (player.hp > 0) {
    const res = processStatusTurn(player);
    if (res && res.dmg) {
      spawnFloatingText(actionState.px, actionState.py - 18, `-${res.dmg}`, res.type === "bleed" ? COLORS.red : COLORS.orange);
      playSfx("hurt");
      hapticLight();
      if (player.hp <= 0) {
        if (handlePlayerDown()) { gameOver(); return; }
        updateActionAfterSwap();
      }
      updateUI();
    }
  }
}

function updateActionCombat() {
  if (!currentEnemy || player.hp <= 0 || gameState !== "combat" || combatMode !== "action") return;
  if (!actionState) initActionState();
  tickActionStatuses();
  updateEnrageState();
  const st = actionState;
  if (st.atkCd > 0) st.atkCd--;
  if (st.atkAnim > 0) st.atkAnim--;
  if (st.dashCd > 0) st.dashCd--;
  if (st.iframes > 0) st.iframes--;
  if (st.comboWindow > 0) { st.comboWindow--; if (st.comboWindow <= 0) st.comboStep = 0; }
  const stunTurns = player.statusEffects?.stun?.turns || 0;
  if (stunTurns > 0) {
    if (st.dashTicks > 0) { st.dashTicks = 0; st.iframes = 0; }
    return;
  }
if (st.dashTicks > 0) {
    st.dashTicks--;
    st.px = clampActionX(st.px + st.dashDirX * CONFIG.ACTION_DASH_SPEED);
    st.py = clampActionY(st.py + st.dashDirY * CONFIG.ACTION_DASH_SPEED);
    if (st.dashTicks % 2 === 0) spawnEffectDirect("ghost", st.px, st.py, "", COLORS.gold, 10, 0, 0, CONFIG.SPRITE_SCALE, 0);
  } else {
    const dir = getActionMoveDir();
    if (dir) {
      st.px = clampActionX(st.px + dir.x * CONFIG.ACTION_PLAYER_SPEED);
      st.py = clampActionY(st.py + dir.y * CONFIG.ACTION_PLAYER_SPEED);
      if (Math.abs(dir.x) > Math.abs(dir.y)) st.facing = dir.x > 0 ? "right" : "left";
      else st.facing = dir.y > 0 ? "down" : "up";
    }
  }
  updateActionEnemy();
}

function updateActionEnemy() {
  const st = actionState;
  if (!currentEnemy) return;
  const profile = getEnemyActionProfile();
  if (st.eRecoil > 0) {
    // Recuo defensivo após combo: afasta-se do jogador por alguns ticks.
    st.eRecoil--;
    const dR = Math.hypot(st.px - st.ex, st.ey - st.py);
    if (dR > 1) {
      const nx = (st.px - st.ex) / dR, ny = (st.py - st.ey) / dR;
      st.ex = clampActionX(st.ex - nx * CONFIG.ACTION_ENEMY_SPEED * profile.speed * 1.4);
      st.ey = clampActionY(st.ey - ny * CONFIG.ACTION_ENEMY_SPEED * profile.speed * 1.4);
    }
    return;
  }
  if (st.eStagger > 0) { st.eStagger--; return; }
  if (st.eHit > 0) st.eHit--;
  if (st.eWindup > 0) {
    st.eWindup--;
    if (st.telegraph) { st.telegraph.life--; if (st.telegraph.life <= 0) st.telegraph = null; }
    if (st.eWindup <= 0) {
      st.eWindup = 0;
      st.telegraph = null;
      const d = Math.hypot(st.ex - st.px, st.ey - st.py);
      if (profile.ranged) {
        actionFireBolt();
      } else if (d <= CONFIG.ACTION_ENEMY_RANGE + 14) {
        if (actionEnemySpecial()) { st.eAttackCd = actionEnemyAttackCd(); return; }
        let dmg = attackRoll(currentEnemy.atk, player.def);
        if (st.iframes > 0) {
          const perfect = st.dashTicks > 0 || st.iframes >= CONFIG.ACTION_PERFECT_DODGE_IFRAMES_BONUS;
          if (perfect) {
            player.momentum = Math.min(CONFIG.MOMENTUM_MAX, player.momentum + CONFIG.ACTION_PERFECT_DODGE_REWARD);
            slowMoTicks = Math.max(slowMoTicks, CONFIG.ACTION_PERFECT_DODGE_SLOWMO_TICKS);
            addStatus(currentEnemy, "vulnerable", 2);
            spawnFloatingText(st.px, st.py - 30, "ESQUIVA PERFEITA!", COLORS.gold, 1.5);
            spawnFloatingText(st.px, st.py - 46, `+${CONFIG.ACTION_PERFECT_DODGE_REWARD} MOM`, COLORS.gold);
            playSfx("crit");
            hapticMedium();
            flashOf(COLORS.gold, 4);
            addLog("ESQUIVA PERFEITA! O inimigo fica vulnerável!", "gold");
          } else {
            player.momentum = Math.min(CONFIG.MOMENTUM_MAX, player.momentum + CONFIG.ACTION_EV_DODGE_REWARD);
            spawnFloatingText(st.px, st.py - 18, "ESQUIVA!", COLORS.gold);
            spawnFloatingText(st.px, st.py - 34, `+${CONFIG.ACTION_EV_DODGE_REWARD} MOM`, COLORS.gold);
            playSfx("step");
          }
          updateUI();
        } else {
          if (player.dodgeChance > 0 && chance(player.dodgeChance)) {
            player.momentum = Math.min(CONFIG.MOMENTUM_MAX, player.momentum + CONFIG.ACTION_EV_DODGE_REWARD);
            spawnFloatingText(st.px, st.py - 18, "ESQUIVA!", COLORS.gold);
            spawnFloatingText(st.px, st.py - 34, `+${CONFIG.ACTION_EV_DODGE_REWARD} MOM`, COLORS.gold);
            addLog(`${currentEnemy.name} erra por pouco — Presságio!`, "gold");
            playSfx("step");
            updateUI();
            return;
          }
          dmg = effectiveIncomingDamage(dmg);
player.hp = Math.max(0, player.hp - dmg);
          juiceHitsTaken++;
          spawnFloatingText(st.px, st.py - 18, `-${dmg}`, COLORS.red);
          burst(st.px, st.py, COLORS.red, 8, "spark");
          playSfx("hurt");
          hapticHeavy();
          shakeFrom(st.ex, st.ey, st.px, st.py, 6);
          flashOf(COLORS.red, 4);
          hitStop(dmg >= 8 ? CONFIG.HIT_STOP_HEAVY : CONFIG.HIT_STOP_LIGHT);
          addLog(`${currentEnemy.name} acerta você com ${dmg} de dano!`, "red");
          if (currentEnemy.affix === "venomous") {
            addStatus(player, "bleed", 3, venomBleedPower(currentEnemy.level));
            addLog("O ferimento SANGRA!", "red");
          }
          if (player.combo > 0) {
            player.combo = 0;
            player.comboMult = 0;
            spawnFloatingText(st.px, st.py - 32, "COMBO QUEBRADO", COLORS.orange);
          }
          player.momentum = Math.min(CONFIG.MOMENTUM_MAX, player.momentum + CONFIG.MOMENTUM_GAIN_HIT);
          updateUI();
          if (player.hp <= 0) {
            if (handlePlayerDown()) {
              gameOver();
              return;
            }
            updateActionAfterSwap();
            return;
          }
        }
      }
      st.eAttackCd = actionEnemyAttackCd();
    }
    return;
  }
  if (st.eAttackCd > 0) { st.eAttackCd--; return; }
  const d = Math.hypot(st.ex - st.px, st.ey - st.py);
  if (profile.ranged) {
    const keepDist = CONFIG.ACTION_ENEMY_RANGE + 40;
    if (d > profile.range + 20) {
      const nx = (st.px - st.ex) / d, ny = (st.py - st.ey) / d;
      st.ex = clampActionX(st.ex + nx * CONFIG.ACTION_ENEMY_SPEED * profile.speed);
      st.ey = clampActionY(st.ey + ny * CONFIG.ACTION_ENEMY_SPEED * profile.speed);
      if (Math.abs(nx) > Math.abs(ny)) st.eFacing = nx > 0 ? "right" : "left";
      else st.eFacing = ny > 0 ? "down" : "up";
    } else if (d < keepDist * 0.55) {
      const nx = (st.px - st.ex) / d, ny = (st.py - st.ey) / d;
      st.ex = clampActionX(st.ex - nx * CONFIG.ACTION_ENEMY_SPEED * profile.speed);
      st.ey = clampActionY(st.ey - ny * CONFIG.ACTION_ENEMY_SPEED * profile.speed);
      if (Math.abs(nx) > Math.abs(ny)) st.eFacing = nx > 0 ? "left" : "right";
      else st.eFacing = ny > 0 ? "up" : "down";
    } else {
      if (profile.move === "flank" && tick % 3 === 0) {
        // Espectro/Wraith circulam o jogador: movimento perpendicular.
        const nx = (st.px - st.ex) / d, ny = (st.py - st.ey) / d;
        const px2 = -ny, py2 = nx;
        const sid = st.eFacing === "left" ? -1 : 1;
        st.ex = clampActionX(st.ex + px2 * sid * CONFIG.ACTION_ENEMY_SPEED * profile.speed);
        st.ey = clampActionY(st.ey + py2 * sid * CONFIG.ACTION_ENEMY_SPEED * profile.speed);
      }
      st.eWindup = Math.max(18, Math.round(profile.windup));
      st.telegraph = { kind: "ranged", life: st.eWindup };
      spawnEffect("spark", st.ex, st.ey - 20, "", COLORS.orange, { life: 10, vx: 0, vy: -0.1, size: 2 });
      playSfx("ominous");
    }
    return;
  }
  if (d > profile.range) {
    const nx = (st.px - st.ex) / d, ny = (st.py - st.ey) / d;
    if (profile.move === "flank" && tick % 3 === 0) {
      // Inimigos que flanqueiam: zig-zag perpendicular enquanto se aproximam.
      const px2 = -ny, py2 = nx;
      const sid = st.eFacing === "left" ? -1 : 1;
      st.ex = clampActionX(st.ex + nx * CONFIG.ACTION_ENEMY_SPEED * profile.speed * 0.7 + px2 * sid * CONFIG.ACTION_ENEMY_SPEED * profile.speed * 0.5);
      st.ey = clampActionY(st.ey + ny * CONFIG.ACTION_ENEMY_SPEED * profile.speed * 0.7 + py2 * sid * CONFIG.ACTION_ENEMY_SPEED * profile.speed * 0.5);
    } else {
      st.ex = clampActionX(st.ex + nx * CONFIG.ACTION_ENEMY_SPEED * profile.speed);
      st.ey = clampActionY(st.ey + ny * CONFIG.ACTION_ENEMY_SPEED * profile.speed);
    }
    if (Math.abs(nx) > Math.abs(ny)) st.eFacing = nx > 0 ? "right" : "left";
    else st.eFacing = ny > 0 ? "down" : "up";
  } else {
    st.eWindup = Math.max(18, Math.round(profile.windup));
    st.telegraph = { kind: "melee", life: st.eWindup };
    spawnEffect("spark", st.ex, st.ey - 20, "", COLORS.orange, { life: 10, vx: 0, vy: -0.1, size: 2 });
    playSfx("ominous");
  }
}

function actionFireBolt() {
  const st = actionState;
  if (!st || !currentEnemy) return;
  const dx = st.px - st.ex, dy = st.py - st.ey;
  const len = Math.hypot(dx, dy) || 1;
  const speed = 4.2;
  actionBolts.push({
    x: st.ex, y: st.ey,
    vx: (dx / len) * speed,
    vy: (dy / len) * speed,
    dmg: attackRoll(currentEnemy.atk, player.def, { atkMult: 0.85, variance: 1, roundAtk: true }),
    life: 80,
    color: currentEnemy.color
  });
  spawnEffect("spark", st.ex, st.ey - 20, "", COLORS.orange, { life: 8, vx: 0, vy: 0, size: 2 });
  playSfx("clash");
  st.eAttackCd = actionEnemyAttackCd();
}

function actionEnemySpecial() {
  if (!currentEnemy || player.hp <= 0) return false;
  const kind = currentEnemy.kind;
  const st = actionState;
  const stx = st.px, sty = st.py;
  if (kind === "wraith" && chance(0.25)) {
    const drain = attackRoll(currentEnemy.atk, player.def, { atkMult: 0.7, variance: 2 });
    player.hp = Math.max(0, player.hp - drain);
    const heal = Math.min(currentEnemy.maxHp - currentEnemy.hp, drain);
    currentEnemy.hp += heal;
    spawnFloatingText(stx, sty - 18, `-${drain}`, COLORS.purple);
    burst(stx, sty, COLORS.purple, 10, "spark");
    playSfx("hurt");
    addLog(`${currentEnemy.name} drena energia! -${drain} PV, cura ${heal}.`, "purple");
    updateUI();
    return true;
  }
  if (kind === "golem" && chance(0.2)) {
    const stomp = attackRoll(currentEnemy.atk, player.def, { atkMult: 1.3, variance: 0 });
    player.hp = Math.max(0, player.hp - stomp);
    spawnFloatingText(stx, sty - 18, `-${stomp}`, COLORS.orange);
    burst(stx, sty, COLORS.orange, 18, "spark");
    shake = 8; flash = 6; playSfx("boom");
    addLog(`${currentEnemy.name} golpeia o chão! Onda de choque: -${stomp}.`, "orange");
    updateUI();
    return true;
  }
  if (kind === "specter" && chance(0.3)) {
    currentEnemy.dodgeNext = true;
    spawnFloatingText(sxFor(currentEnemy.x), syFor(currentEnemy.y) - 20, "FASE", COLORS.purple);
    burst(sxFor(currentEnemy.x), syFor(currentEnemy.y), COLORS.purple, 12, "spark");
    playSfx("ominous");
    addLog(`${currentEnemy.name} torna-se espectral!`, "purple");
    return true;
  }
  if (kind === "bat" && chance(0.2)) {
    addStatus(player, "stun", 1);
    spawnFloatingText(stx, sty - 18, "ATORDOADO", COLORS.gold);
    burst(stx, sty, COLORS.gold, 10, "spark");
    playSfx("ominous");
    addLog(`${currentEnemy.name} solta um grito sônico!`, "gold");
    updateUI();
    return true;
  }
  return false;
}

function updateActionBolts() {
  const st = actionState;
  for (let i = actionBolts.length - 1; i >= 0; i--) {
    const b = actionBolts[i];
    b.x += b.vx;
    b.y += b.vy;
    b.life--;
    if (b.life <= 0 || b.x < 0 || b.x > CONFIG.CANVAS_W || b.y < 0 || b.y > CONFIG.CANVAS_H) {
      actionBolts.splice(i, 1);
      continue;
    }
    if (st && player.hp > 0) {
      const hitDist = Math.hypot(b.x - st.px, b.y - st.py);
      if (hitDist < 16) {
        if (st.iframes > 0) {
          player.momentum = Math.min(CONFIG.MOMENTUM_MAX, player.momentum + CONFIG.ACTION_EV_DODGE_REWARD);
          spawnFloatingText(st.px, st.py - 18, "ESQUIVA!", COLORS.gold);
          playSfx("step");
        } else if (player.dodgeChance > 0 && chance(player.dodgeChance)) {
          spawnFloatingText(st.px, st.py - 18, "ESQUIVA!", COLORS.gold);
          addLog("O projétil passa raspando — Presságio!", "gold");
          playSfx("step");
        } else {
          b.dmg = effectiveIncomingDamage(b.dmg);
          player.hp = Math.max(0, player.hp - b.dmg);
          spawnFloatingText(st.px, st.py - 18, `-${b.dmg}`, COLORS.red);
          burst(st.px, st.py, COLORS.red, 8, "spark");
          playSfx("hurt");
          hapticHeavy();
          shakeFrom(st.ex, st.ey, st.px, st.py, 5);
          flashOf(COLORS.orange, 3);
          addLog(`Um projétil acerta você! -${b.dmg}`, "red");
          updateUI();
          if (player.hp <= 0) {
            if (handlePlayerDown()) {
              gameOver();
              return;
            }
            updateActionAfterSwap();
          }
        }
        actionBolts.splice(i, 1);
      }
    }
  }
}

function updateActionAfterSwap() {
  if (!actionState) return;
  actionState.px = actionState.spawnX;
  actionState.py = actionState.spawnY;
  actionState.iframes = CONFIG.ACTION_DASH_IFRAMES + 10;
  actionState.dashTicks = 0;
}

function actionPlayerAttack() {
  if (gameState !== "combat" || combatMode !== "action" || !currentEnemy) return;
  const st = actionState;
  if (!st) return;
  if (st.atkCd > 0 || st.dashTicks > 0) return;
  // Momentum cheio: habilidade especial (se pronta) ou SURTO.
  if (player.momentum >= CONFIG.MOMENTUM_MAX) {
    if (player.specialCd <= 0) { actionSpecialAttack(); return; }
    actionSurge();
    return;
  }
  const step = st.comboWindow > 0 ? Math.min(CONFIG.ACTION_COMBO_STEPS - 1, st.comboStep + 1) : 0;
  st.comboStep = step;
  st.comboWindow = CONFIG.ACTION_COMBO_WINDOW_TICKS;
  st.atkCd = CONFIG.ACTION_ATK_COOLDOWN;
  st.atkAnim = CONFIG.ACTION_COMBO_ATK_ANIM[step] || 10;
  playSfx("clash");
  const d = Math.hypot(st.ex - st.px, st.ey - st.py);
  if (d <= CONFIG.ACTION_ATK_RANGE) {
    if (Math.abs(st.ex - st.px) > Math.abs(st.ey - st.py)) st.facing = st.ex > st.px ? "right" : "left";
    else st.facing = st.ey > st.py ? "down" : "up";
    const lunge = CONFIG.ACTION_ATK_LUNGE;
    st.px = clampActionX(st.px + (st.facing === "right" ? lunge : st.facing === "left" ? -lunge : 0));
    st.py = clampActionY(st.py + (st.facing === "down" ? lunge : st.facing === "up" ? -lunge : 0));
    let dmg = attackRoll(player.atk, currentEnemy.def);
    const critical = chance(player.crit || 0.05);
    if (critical) dmg = applyCrit(dmg, 1, CONFIG.NORMAL_CRIT_MULT);
    dmg = Math.floor(dmg * (CONFIG.ACTION_COMBO_DMG_MULT[step] || 1));
    const aElem = elementMultiplier(getPlayerElement(), currentEnemy);
    if (aElem !== 1) dmg = Math.max(1, Math.floor(dmg * aElem));
    if (currentEnemy.dodgeNext) {
      currentEnemy.dodgeNext = false;
      spawnFloatingText(sxFor(currentEnemy.x), syFor(currentEnemy.y) - 18, "ESQUIVA!", COLORS.purple);
      burst(sxFor(currentEnemy.x), syFor(currentEnemy.y), COLORS.purple, 8, "spark");
      playSfx("step");
      addLog(`${currentEnemy.name} esquiva do golpe!`, "purple");
      return;
    }
    applyActionHit(dmg, { critical, type: step === CONFIG.ACTION_COMBO_STEPS - 1 ? "finisher" : "normal", comboStep: step });
  } else {
    if (Math.abs(st.ex - st.px) > Math.abs(st.ey - st.py)) st.facing = st.ex > st.px ? "right" : "left";
    else st.facing = st.ey > st.py ? "down" : "up";
  }
}

function applyActionHit(dmg, opts = {}) {
  const st = actionState;
  if (!st || !currentEnemy) return false;
  const critical = !!opts.critical;
  const type = opts.type || "normal";
  const comboStep = opts.comboStep ?? 0;
  const isFinisher = type === "finisher";
  let comboOnThisHit = false;
  if (!opts.noCombo && player.combo < CONFIG.COMBO_MAX) {
    player.combo++;
    player.comboMult = player.combo * CONFIG.COMBO_DMG_PER_STACK;
    comboOnThisHit = true;
  }
  // Reação defensiva: o inimigo recua após um finisher encadeado, abrindo espaço.
  if (isFinisher) {
    st.eRecoil = Math.max(st.eRecoil || 0, 24);
    const ang2 = Math.atan2(st.ey - st.py, st.ex - st.px);
    st.ex = clampActionX(st.ex + Math.cos(ang2) * 6);
    st.ey = clampActionY(st.ey + Math.sin(ang2) * 6);
  }
  player.momentum = Math.min(CONFIG.MOMENTUM_MAX, player.momentum + CONFIG.MOMENTUM_GAIN_ATTACK + (critical ? CONFIG.MOMENTUM_GAIN_CRIT : 0) + (comboOnThisHit ? CONFIG.MOMENTUM_GAIN_HIT : 0));
  if (currentEnemy.statusEffects?.vulnerable) dmg = Math.floor(dmg * CONFIG.VULNERABLE_BONUS_MULT);
  currentEnemy.hp = Math.max(0, currentEnemy.hp - dmg);
  currentEnemy.hitPulse = 10;
  st.eStagger = Math.max(st.eStagger, CONFIG.ACTION_ENEMY_STAGGER_TICKS);
  st.eHit = 10;
  if (currentEnemy.hp > 0) {
    const kb = type === "special" ? 14 : (CONFIG.ACTION_COMBO_KNOCKBACK[comboStep] || 9);
    const ang = Math.atan2(st.ey - st.py, st.ex - st.px);
    st.ex = clampActionX(st.ex + Math.cos(ang) * kb);
    st.ey = clampActionY(st.ey + Math.sin(ang) * kb);
  }
  if (st.eWindup > 0) { st.eWindup = 0; st.eAttackCd = Math.max(st.eAttackCd, 20); }
  const color = critical ? COLORS.gold : (isFinisher ? COLORS.orange : COLORS.red);
  spawnFloatingText(st.ex, st.ey - 18, `-${dmg}`, color, critical ? 1.7 : (isFinisher ? 1.5 : 1.2));
  burst(st.ex, st.ey, color, CONFIG.NORMAL_HIT_PARTICLE_COUNT + (isFinisher ? 6 : 0), "spark");
  if (critical) spawnEffect("cross", st.ex, st.ey, "", COLORS.gold, { life: 8, size: 8 });
  if (isFinisher) {
    spawnEffect("cross", st.ex, st.ey, "", COLORS.orange, { life: 10, size: 9 });
    burst(st.ex, st.ey, COLORS.orange, 10, "spark");
    flashOf(COLORS.orange, 5);
    hitStop(CONFIG.HIT_STOP_MEDIUM);
  }
  if (type === "special") {
    burst(st.ex, st.ey, COLORS.blue, CONFIG.SPECIAL_PARTICLE_COUNT, "spark");
    spawnEffect("vapor", st.ex, st.ey - 6, "", COLORS.purple, { life: 20, size: 4 });
    flashOf(COLORS.blue, 6);
  }
  if (critical && !reducedMotion) { freezeFrames = CONFIG.FREEZE_FRAMES_CRIT; hapticCrit(); }
  else if (isFinisher && !reducedMotion) { freezeFrames = CONFIG.FREEZE_FRAMES_HEAVY_HIT; hapticMedium(); }
  else hapticLight();
  playSfx(currentEnemy.boss ? "bossHit" : (critical ? "crit" : (isFinisher ? "boom" : "hit")), { pitch: rand(-1, 1) * 0.5 });
  flashOf(critical ? COLORS.gold : COLORS.red, critical ? 5 : 3);
  shakeFrom(st.px, st.py, st.ex, st.ey, critical ? 7 : (isFinisher ? 6 : 4));
  addLog(`${critical ? "Acerto crítico! " : ""}${opts.log || ""}${currentEnemy.name} sofre ${dmg}.${isFinisher ? " Golpe final!" : ""}`, critical ? "gold" : (isFinisher ? "orange" : "muted"));
  if (comboOnThisHit && player.combo > 1) spawnFloatingText(st.ex, st.ey - 26, `COMBO x${player.combo}`, COLORS.purple, 1.4);
  if (isFinisher) spawnFloatingText(st.ex, st.ey - 34, "FINAL!", COLORS.orange, 1.4);
  if (player.combo > 1) player.comboResetTs = performance.now();
  updateUI();
  if (currentEnemy.hp <= 0) {
    endCombatVictory();
    return true;
  }
  return true;
}

function actionSurge() {
  if (gameState !== "combat" || combatMode !== "action" || !currentEnemy) return;
  const st = actionState;
  if (!st || st.atkCd > 0 || st.dashTicks > 0) return;
  const d = Math.hypot(st.ex - st.px, st.ey - st.py);
  if (d > CONFIG.ACTION_ATK_RANGE + 12) {
    addLog("Muito longe para o SURTO! Aproxime-se.", "muted");
    showToast("FORA DE ALCANCE");
    return;
  }
  st.atkCd = CONFIG.ACTION_ATK_COOLDOWN + 8;
  st.atkAnim = 12;
  if (Math.abs(st.ex - st.px) > Math.abs(st.ey - st.py)) st.facing = st.ex > st.px ? "right" : "left";
  else st.facing = st.ey > st.py ? "down" : "up";
  let dmg = attackRoll(player.atk, currentEnemy.def, { variance: 4, min: 2 });
  dmg = Math.floor(dmg * CONFIG.ACTION_SURGE_DMG_MULT);
  player.momentum = 0;
  playSfx("boom");
  triggerSurgeScreenFx();
  burst(st.ex, st.ey, COLORS.gold, 18, "spark");
  burst(st.px, st.py, COLORS.gold, 10, "spark");
  spawnFloatingText(st.ex, st.ey - 30, "SURTO!", COLORS.gold, 1.5);
  if (!reducedMotion) freezeFrames = CONFIG.FREEZE_FRAMES_CRIT;
  shake = 7;
  addLog("SURTO! Um golpe devastador de pura energia!", "gold");
  applyActionHit(dmg, { critical: true, type: "surge", noCombo: true, log: "Energia pura explode! " });
}

function actionSpecialAttack() {
  if (gameState !== "combat" || combatMode !== "action" || !currentEnemy) return;
  if (player.specialCd > 0) return;
  const st = actionState;
  if (!st || st.atkCd > 0 || st.dashTicks > 0) return;
  const d = Math.hypot(st.ex - st.px, st.ey - st.py);
  if (d > CONFIG.ACTION_ATK_RANGE + 24) {
    addLog("Muito longe para a habilidade especial! Aproxime-se.", "muted");
    showToast("FORA DE ALCANCE");
    return;
  }
  st.atkCd = CONFIG.ACTION_ATK_COOLDOWN + 8;
  st.atkAnim = 12;
  if (Math.abs(st.ex - st.px) > Math.abs(st.ey - st.py)) st.facing = st.ex > st.px ? "right" : "left";
  else st.facing = st.ey > st.py ? "down" : "up";
  playSfx("hit");
  let dmg = 0, critical = false, message = player.special || "Habilidade";
  const specStats = { classKey: player.classKey, atk: player.atk, mag: player.mag, level: player.level, def: currentEnemy.def, skillAtkMult: player.skillAtkMult || 1.3 };
  if (player.activeSlot > 0) {
    dmg = specialDamage({ ...specStats, monsterSkill: true });
    if (player.skillHealRatio > 0) {
      const heal = Math.min(player.maxHp - player.hp, Math.floor(dmg * player.skillHealRatio));
      player.hp += heal;
      addLog(`Você recupera ${heal} PV.`, "green");
      spawnFloatingText(st.px, st.py - 24, `+${heal}`, COLORS.green);
    }
  } else if (player.classKey === "warrior") {
    dmg = specialDamage(specStats);
    message = "Guarda de Ferro!";
    if (chance(CONFIG.IRON_GUARD_STUN_CHANCE)) addStatus(currentEnemy, "stun", 1);
  } else if (player.classKey === "rogue") {
    critical = chance(CONFIG.ROGUE_SPECIAL_CRIT_CHANCE);
    dmg = specialDamage(specStats);
    if (critical) dmg = applyCrit(dmg, 1, CONFIG.ROGUE_SPECIAL_CRIT_MULT);
    message = "Punhal Sombrio!";
    addStatus(currentEnemy, "bleed", 3, rogueBleedPower(player.level));
  } else if (player.classKey === "mage") {
    dmg = specialDamage(specStats);
    message = "Raio Arcano!";
    addStatus(currentEnemy, "burn", 2, mageBurnPower(player.mag));
  } else if (player.classKey === "beastmaster") {
    dmg = specialDamage(specStats);
    const beastDmg = summonDamage(player.level);
    dmg += beastDmg;
    message = `Chamado da Selva! Seu lobo ataca por ${beastDmg}!`;
    if (chance(CONFIG.BEAST_BLEED_CHANCE)) addStatus(currentEnemy, "bleed", 2, beastBleedPower(player.level));
  } else if (player.classKey === "witch") {
    dmg = specialDamage(specStats);
    message = "Olho do Caos!";
    addStatus(currentEnemy, "burn", 3, witchBurnPower(player.mag));
    player.hp = Math.min(player.maxHp, player.hp + Math.floor(dmg * CONFIG.WITCH_HEAL_RATIO));
    addLog(`Você recupera ${Math.floor(dmg * CONFIG.WITCH_HEAL_RATIO)} PV pelo sacrifício.`, "green");
  }
  player.specialCd = player.specialMaxCd;
  player.momentum = 0;
  spawnFloatingText(st.ex, st.ey - 30, message, COLORS.blue, 1.4);
  playSfx("boom");
  applyActionHit(dmg, { critical, type: "special", noCombo: true, log: `${message} ` });
}

function actionSecondary() {
  if (gameState !== "combat" || combatMode !== "action") return;
  const st = actionState;
  if (!st) return;
  if (player.hp <= Math.floor(player.maxHp * CONFIG.POTION_AUTO_HP_RATIO) && player.potions > 0) {
    usePotion(false);
    return;
  }
  actionDodge();
}

function actionDodge() {
  if (gameState !== "combat" || combatMode !== "action") return;
  const st = actionState;
  if (!st || st.dashCd > 0 || st.dashTicks > 0 || player.hp <= 0) return;
  const dir = getActionMoveDir();
  if (dir) {
    st.dashDirX = dir.x;
    st.dashDirY = dir.y;
  } else {
    st.dashDirX = st.facing === "left" ? -1 : st.facing === "right" ? 1 : 0;
    st.dashDirY = st.facing === "up" ? -1 : st.facing === "down" ? 1 : 0;
    if (!st.dashDirX && !st.dashDirY) st.dashDirX = 1;
  }
  st.dashTicks = CONFIG.ACTION_DASH_TICKS;
  st.dashCd = CONFIG.ACTION_DASH_COOLDOWN;
  st.iframes = CONFIG.ACTION_DASH_IFRAMES;
  playSfx("step");
  hapticLight();
  burst(st.px, st.py, COLORS.gold, 6, "spark");
  spawnEffect("dust", st.px, st.py + 6, "", "#665f95", { life: 14, vx: -st.dashDirX * 0.2, vy: -0.1, size: 2 });
}

function drawActionArena(ctx) {
  const r = getActionArenaRect();
  const W = CONFIG.CANVAS_W, H = CONFIG.CANVAS_H;
  // Combate acontece DENTRO da Dungeon: o mapa continua visível ao redor.
  if (dungeon) {
    drawDungeonView();
    drawItems(ctx, items, camera.rx, camera.ry, tick);
    drawExit();
    drawHoverHighlight();
  }
  // leve escurecimento para destacar a luta sem esconder o andar
  ctx.fillStyle = "rgba(8, 5, 20, 0.30)";
  ctx.fillRect(0, 0, W, H);
  // clareira de combate translúcida sobre o piso
  ctx.save();
  ctx.globalAlpha = 0.72;
  drawActionArenaFloor(ctx, r);
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = COLORS.gold;
  ctx.lineWidth = 2;
  ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  ctx.strokeStyle = "rgba(255, 212, 92, 0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6);

  drawActionEnemySprite(ctx, tick);
  drawActionTelegraph(ctx, tick);
  drawActionHero(ctx, tick);
  drawActionBolts(ctx);
  drawActionCombatHud(ctx);
  drawEffectsOnCanvas();
  drawMinimap();

  if (gameState === "win") drawEndBanner("VITÓRIA", COLORS.green);
  if (gameState === "gameover") drawEndBanner("FIM", COLORS.red);
}

function drawActionArenaFloor(ctx, r) {
  const rows = 12;
  const yTop = r.y, yBot = r.y + r.h;
  const step = (yBot - yTop) / rows;
  for (let i = 0; i < rows; i++) {
    const t = i / rows;
    const tt = 1 - t;
    const y0 = yTop + i * step;
    const wMul = 0.3 + 0.7 * tt * tt;
    const wCur = r.w * wMul;
    const x0 = r.x + (r.w - wCur) / 2;
    ctx.fillStyle = (i % 2) ? "#1a0e2b" : "#1e1130";
    ctx.fillRect(x0, y0, wCur, step + 0.5);
    ctx.fillStyle = (i % 2) ? "#241539" : "#150a24";
    ctx.fillRect(x0 + 1, y0 + 1, wCur - 2, 1);
  }
  const grad = ctx.createLinearGradient(0, yTop, 0, yTop + r.h * 0.5);
  grad.addColorStop(0, `rgba(26, 10, 42, ${GFX.arenaFogStart + 0.3})`);
  grad.addColorStop(1, "rgba(26, 10, 42, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(r.x - 3, yTop, r.w + 6, r.h * 0.5);
}

function drawActionTelegraph(ctx, tick) {
  const st = actionState;
  if (!st || !currentEnemy || !st.telegraph || reducedMotion) return;
  const t = st.telegraph;
  const alpha = CONFIG.ACTION_TELEGRAPH_ARC_ALPHA * (0.5 + 0.5 * Math.sin(tick / CONFIG.ACTION_TELEGRAPH_ARC_PULSE));
  const d = Math.hypot(st.px - st.ex, st.ey - st.ey) || 1;
  const ang = Math.atan2(st.py - st.ey, st.px - st.ex);
  if (t.kind === "melee") {
    // Zona de alcance melee: arco frontal no chão na direção do jogador.
    ctx.save();
    ctx.translate(st.ex, st.ey);
    ctx.rotate(ang);
    ctx.fillStyle = `rgba(255, 120, 40, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, CONFIG.ACTION_ENEMY_RANGE + 14, -0.9, 0.9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  } else {
    // Zona ranged: retículo no jogador indicando o alvo do disparo.
    ctx.save();
    ctx.translate(st.px, st.py);
    ctx.strokeStyle = `rgba(255, 120, 40, ${alpha + 0.1})`;
    ctx.lineWidth = 1;
    const r = 14 + Math.sin(tick / 4) * 2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = `rgba(255, 120, 40, ${alpha})`;
    ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();
  }
}

function drawActionEnemySprite(ctx, tick) {
  const st = actionState;
  if (!currentEnemy) return;
  const x = st.ex, y = st.ey;
  const hitJolt = currentEnemy.hitPulse > 0 ? Math.sin(currentEnemy.hitPulse * CONFIG.HIT_PULSE_MULT) * CONFIG.HIT_JOLT_HEIGHT : 0;
  const drawY = y + hitJolt;
  const s = st.eScale;
  if (st.eWindup > 0) {
    const pulse = (st.eWindup % 6) < 3;
    if (pulse) {
      ctx.fillStyle = COLORS.orange;
      ctx.font = `bold ${Math.round(s * 12)}px monospace`;
      ctx.textAlign = "center";
      ctx.fillText("!", x, y - 26 - Math.floor((CONFIG.ACTION_ENEMY_WINDUP - st.eWindup) / 4));
    }
  }
  const glowColor = st.enraged ? COLORS.red : (currentEnemy.boss ? COLORS.red : currentEnemy.color);
  const glowAlpha = st.enraged ? 0.42 : (currentEnemy.boss ? 0.32 : 0.18);
  drawEntityGlow(ctx, x, y, glowColor, glowAlpha, tick);
  if (st.enraged && (tick % 4) < 2) {
    ctx.globalAlpha = 0.7;
  }
  if (st.eHit > 0 && (st.eHit % 2 === 0)) {
    ctx.globalAlpha = 0.6;
  }
  if (currentEnemy.boss) drawSpriteBoss(ctx, x - 6 * s, drawY - 4 * s, s, tick);
  else drawSpriteByKind(ctx, currentEnemy, x, drawY, s, currentEnemy.color, tick);
  ctx.globalAlpha = 1;
  const hx = x - 26, hy = y - 24;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(hx - 1, hy - 1, 54, 7);
  ctx.fillStyle = "#3a0d1c";
  ctx.fillRect(hx, hy, 52, 5);
  ctx.fillStyle = COLORS.red;
  ctx.fillRect(hx, hy, Math.max(0, Math.round(52 * Math.max(0, currentEnemy.hp / currentEnemy.maxHp))), 5);
  drawPixelText(ctx, currentEnemy.name, x, y - 34, COLORS.text, 1);
}

function drawActionHero(ctx, tick) {
  const st = actionState;
  if (!st || player.hp <= 0) return;
  if (st.iframes > 0 && (st.iframes % 4) < 2) ctx.globalAlpha = 0.5;
  const s = CONFIG.SPRITE_SCALE;
  const x = st.px, y = st.py;
  const bob = Math.sin(tick / 8) > 0 ? 0 : 1;
  const c = (player.classKey === "warrior" && "#ff5a5a") || (player.classKey === "rogue" && "#5ca8ff") || (player.classKey === "mage" && "#b86cff") || (player.classKey === "beastmaster" && "#69e081") || (player.classKey === "witch" && "#ff8fa3") || "#ffd45c";
  drawShadow(ctx, x - 4 * s, y, s);
  const lunge = st.atkAnim > 0 ? 2 * s : 0;
  const offX = st.facing === "left" ? -lunge : st.facing === "right" ? lunge : 0;
  const offY = st.facing === "up" ? -lunge : st.facing === "down" ? lunge : 0;
  px(ctx, x + 3 * s + offX, y + (2 + bob) * s, 6, 6, c, s);
  px(ctx, x + 4 * s + offX, y + (1 + bob) * s, 4, 2, "#f7d9a0", s);
  if (st.facing === "right") { px(ctx, x + 8 * s + offX, y + (2 + bob) * s, 1, 1, COLORS.black, s); }
  else if (st.facing === "left") { px(ctx, x + 4 * s + offX, y + (2 + bob) * s, 1, 1, COLORS.black, s); }
  else { px(ctx, x + 6 * s + offX, y + (2 + bob) * s, 2, 1, COLORS.black, s); }
if (st.atkAnim > 0) {
    const isFin = st.comboStep >= CONFIG.ACTION_COMBO_STEPS - 1;
    const wl = isFin ? 6 : 4;
    const wx = x + (st.facing === "left" ? -2 : st.facing === "right" ? 10 : 6) * s + offX;
    const wy = y + (3 + bob) * s + offY;
    px(ctx, wx, wy, wl, 1, isFin ? COLORS.orange : COLORS.gold, s);
    px(ctx, wx + (st.facing === "left" ? -1 : 1) * s, wy - s, 1, 2, "#fff3c9", s);
  }
  ctx.globalAlpha = 1;
  const hx = x - 26, hy = y - 24;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(hx - 1, hy - 1, 54, 7);
  ctx.fillStyle = "#0d2a1a";
  ctx.fillRect(hx, hy, 52, 5);
  ctx.fillStyle = COLORS.green;
  ctx.fillRect(hx, hy, Math.max(0, Math.round(52 * Math.max(0, player.hp / player.maxHp))), 5);
  const fighterName = getActiveFighterName();
  drawPixelText(ctx, fighterName, x, y - 34, COLORS.text, 1);
}

function drawActionBolts(ctx) {
  for (const b of actionBolts) {
    const alpha = clamp(b.life / 20, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = b.color || COLORS.orange;
    ctx.fillRect(b.x - 4, b.y - 2, 9, 4);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(b.x - 2, b.y - 1, 5, 2);
    ctx.fillStyle = "rgba(255, 160, 80, 0.5)";
    ctx.fillRect(b.x - 8, b.y - 4, 17, 8);
    ctx.globalAlpha = 1;
  }
}

function drawActionCombatHud(ctx) {
  const st = actionState;
  const r = getActionArenaRect();
  const bx = r.x, by = r.y - 10;
  const atkReady = st && st.atkCd <= 0;
  const dashReady = st && st.dashCd <= 0;
  const barW = 46;
  ctx.fillStyle = atkReady ? COLORS.gold : "rgba(80,80,120,0.6)";
  ctx.fillRect(bx, by, barW, 6);
  if (!atkReady) {
    ctx.fillStyle = COLORS.gold;
    ctx.fillRect(bx, by, Math.round(barW * (1 - st.atkCd / CONFIG.ACTION_ATK_COOLDOWN)), 6);
  }
  drawPixelText(ctx, "ATK", bx + barW + 4, by, atkReady ? COLORS.gold : "#77779b", 1);
  ctx.fillStyle = dashReady ? "#5ca8ff" : "rgba(80,80,120,0.6)";
  ctx.fillRect(bx + barW + 24, by, barW, 6);
  if (!dashReady) {
    ctx.fillStyle = "#5ca8ff";
    ctx.fillRect(bx + barW + 24, by, Math.round(barW * (1 - st.dashCd / CONFIG.ACTION_DASH_COOLDOWN)), 6);
  }
drawPixelText(ctx, "ESQ", bx + barW * 2 + 28, by, dashReady ? "#5ca8ff" : "#77779b", 1);
  // Pips de combo: mostra quantos golpes você encadeou (step 0-2 de 3)
  if (st && st.comboStep > 0) {
    const px0 = bx + barW + 46;
    for (let i = 0; i < CONFIG.ACTION_COMBO_STEPS; i++) {
      ctx.fillStyle = i <= st.comboStep ? (i === CONFIG.ACTION_COMBO_STEPS - 1 ? COLORS.orange : COLORS.gold) : "rgba(80,80,120,0.6)";
      ctx.fillRect(px0 + i * 6, by + 1, 4, 4);
    }
  }
  drawPixelText(ctx, "A: ATACAR   B: ESQUIVAR", Math.floor(CONFIG.CANVAS_W / 2), CONFIG.CANVAS_H - 8, COLORS.text, 1);
  const pct = Math.min(1, player.momentum ? player.momentum / CONFIG.MOMENTUM_MAX : 0);
  if (pct >= 1) {
    const label = player.specialCd <= 0 ? "ESPECIAL PRONTA! (A)" : "SURTO PRONTO! (A)";
    drawPixelText(ctx, label, r.x + r.w - 86, by, COLORS.gold, 1);
  }
  if (player.hp <= Math.floor(player.maxHp * CONFIG.POTION_AUTO_HP_RATIO) && player.potions > 0) {
    drawPixelText(ctx, "POÇÃO PRONTA! (B)", r.x + 6, by, COLORS.green, 1);
  }
}

// =============================================================
// HAPTIC FEEDBACK
// =============================================================
function hapticLight() { vibrate(CONFIG.VIBRATE_LIGHT); }
function hapticMedium() { vibrate(CONFIG.VIBRATE_MEDIUM); }
function hapticHeavy() { vibrate(CONFIG.VIBRATE_HEAVY_PATTERN); }
function hapticCrit() { vibrate(CONFIG.VIBRATE_CRIT_PATTERN); }
function hapticBoss() { vibrate(CONFIG.VIBRATE_BOSS_PATTERN); }

// =============================================================
// CLICK-TO-MOVE PATHFINDING
// =============================================================
function findPathBFS(fromX, fromY, toX, toY) {
  return findPathBFSGrid(MAP_W, MAP_H, fromX, fromY, toX, toY, (x, y) => occupiedByEnemy(x, y) || !isWalkable(dungeon, x, y));
}

function followMovePath() {
  if (gameState !== "explore" || !player || inputFrozen || !movePath.length) return;
  const target = movePath[0];
  const dx = target.x - player.x, dy = target.y - player.y;
  if (Math.abs(dx) + Math.abs(dy) !== 1) { movePath = []; return; }
  if (occupiedByEnemy(target.x, target.y)) {
    tryMove(dx, dy);
    movePath = [];
    return;
  }
  tryMove(dx, dy);
  if (gameState === "explore") {
    movePath.shift();
    if (movePath.length) {
      const next = movePath[0];
      const ndx = next.x - player.x, ndy = next.y - player.y;
      if (Math.abs(ndx) + Math.abs(ndy) !== 1) movePath = [];
    }
  } else {
    movePath = [];
  }
}

function setMouseFollowPath() {
  if (!mouseHoldTarget || gameState !== "explore" || !player || inputFrozen) return;
  const now = performance.now();
  if (now - mouseHoldStart < CONFIG.MOUSE_HOLD_MS) return;
  if (now - lastMousePathAt < CONFIG.MOUSE_PATH_RECOMPUTE_MS) return;
  lastMousePathAt = now;
  const tx = mouseHoldTarget.x, ty = mouseHoldTarget.y;
  if (tx === player.x && ty === player.y) { movePath = []; return; }
  if (tx < 0 || tx >= CONFIG.MAP_W || ty < 0 || ty >= CONFIG.MAP_H || !isDiscovered(dungeon, tx, ty)) return;
  const targetEnemy = occupiedByEnemy(tx, ty);
  if (!isWalkable(dungeon, tx, ty) && !targetEnemy) return;
  const blocked = (x, y) => {
    if (x === tx && y === ty) return false;
    return occupiedByEnemy(x, y) || !isWalkable(dungeon, x, y);
  };
  const path = findPathBFSGrid(MAP_W, MAP_H, player.x, player.y, tx, ty, blocked);
  if (path && path.length) movePath = path;
}

function requestClickMove(worldX, worldY) {
  if (gameState !== "explore" || !player || inputFrozen) return false;
  if (worldX < 0 || worldX >= CONFIG.MAP_W || worldY < 0 || worldY >= CONFIG.MAP_H) return false;
  if (worldX === player.x && worldY === player.y) { movePath = []; return true; }
  if (!isDiscovered(dungeon, worldX, worldY)) return false;
  const targetEnemy = occupiedByEnemy(worldX, worldY);
  if (targetEnemy) {
    const blocked = (x, y) => {
      if (x === worldX && y === worldY) return false;
      return occupiedByEnemy(x, y) || !isWalkable(dungeon, x, y);
    };
    const path = findPathBFSGrid(MAP_W, MAP_H, player.x, player.y, worldX, worldY, blocked);
    if (path && path.length) { movePath = path; return true; }
    return false;
  }
  if (!isWalkable(dungeon, worldX, worldY)) return false;
  const path = findPathBFS(player.x, player.y, worldX, worldY);
  if (path && path.length) { movePath = path; return true; }
  return false;
}

function updateTooltip() {
  const aBtn = document.querySelector(".actBtn[data-action='a']");
  const bBtn = document.querySelector(".actBtn[data-action='b']");
  if (gameState === "explore") {
    const item = dungeon.map[player.y]?.[player.x] === TILE_EXIT ? "⛩️" : itemAt(player.x, player.y);
    let aTip = "Interagir (Z)";
    let bTip = "Poção (X)";
    if (item && typeof item === "object") {
      if (item.type === "chest") aTip = "Abrir baú";
      else if (item.type === "potion") aTip = "Pegar poção";
      else if (item.type === "shrine") aTip = "Rezar no altar";
      else if (item.type === "mentor") aTip = "Falar com mentor";
      else if (item.type === "shop") aTip = "Falar com mercador";
      else if (item.type === "event") aTip = "Investigar evento";
      else if (item.type === "trap") aTip = "Desarmar armadilha";
      else if (item.type === "relic") aTip = "Pegar relíquia";
    }
    if (player.hp < player.maxHp && player.potions > 0) bTip = `Poção (${player.potions} usos)`;
    else if (player.potions <= 0) bTip = "Sem poções";
    aBtn?.setAttribute("title", aTip);
    bBtn?.setAttribute("title", bTip);
  } else if (gameState === "combat") {
    aBtn?.setAttribute("title", "Atacar inimigo");
    bBtn?.setAttribute("title", "Usar poção / Habilidade");
  }
}

// Matriz de ocupação das patrulhas reutilizada entre chamadas (evita alocar
// 42×42 a cada passo do jogador).
const patrolOccupied = Array.from({ length: CONFIG.MAP_H }, () => Array(CONFIG.MAP_W).fill(false));

function updateEnemyPatrols() {
  for (let y = 0; y < CONFIG.MAP_H; y++) patrolOccupied[y].fill(false);
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.alive) patrolOccupied[e.y][e.x] = true;
  }
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e.alive || e.boss || e.wild) continue;
    const dist = distance(e, player);
    if (dist > CONFIG.ENEMY_PATROL_DIST) continue;
    if (dist <= CONFIG.ENEMY_ALERT_DIST) e.alert = true;
    if (!e.alert || dist <= 1 || dist > CONFIG.ENEMY_PATROL_MAX_DIST) continue;
    patrolOccupied[e.y][e.x] = false;
    const next = nextStepFromDijkstra(dungeon, e, patrolOccupied);
    if (next >= 0) {
      e.x = next % CONFIG.MAP_W;
      e.y = Math.floor(next / CONFIG.MAP_W);
      e.stepPulse = 8;
    }
    patrolOccupied[e.y][e.x] = true;
  }
}

function descendFloor() {
  currentFloor++;
  const nextFloor = currentFloor;
  gameState = "floorTransition";
  floorTransition = { floor: nextFloor, message: FLOOR_MESSAGES[nextFloor] || "A cripta muda de forma...", timer: CONFIG.FLOOR_TRANSITION_TICKS, fadeAlpha: 1 };
  playSfx("descend");
  cinemaFloorSweep = CONFIG.FLOOR_TRANSITION_TICKS;
  cinemaFloorScale = CONFIG.CINEMA_FLOOR_SCALE_IN;
  setCinemaLetterbox(1);
  setTimeout(() => {
    setCinemaLetterbox(0);
    finishDescendFloor(nextFloor);
  }, CONFIG.FLOOR_TRANSITION_DELAY_MS);
}

function finishDescendFloor(nextFloor) {
  currentFloor = nextFloor;
  setSeedFloor(currentFloor);
  resetSeedForFloor();
  LoadingScreen.show();
  LoadingScreen.setProgress(30);

  setTimeout(() => {
    dungeon = generateDungeon();
    enemies = [];
    items = [];
    bossDefeated = false;
    currentEnemy = null;
    gameState = "explore";
    floorTransition = null;
    LoadingScreen.setProgress(50);

    const startRoom = dungeon.rooms[0];
    const exitRoom = dungeon.rooms[dungeon.rooms.length - 1];
    player.x = startRoom.cx; player.y = startRoom.cy;
    player.rx = player.x; player.ry = player.y;
    player.movePulse = 0;
    player.specialCd = Math.max(0, player.specialCd - 1);
    if (player.floorHpBonus) {
      player.maxHp += player.floorHpBonus;
      player.hp = Math.min(player.maxHp, player.hp + player.floorHpBonus);
      addLog(`O Selo do Selvagem fortalece você: +${player.floorHpBonus} PV Máx.`, "green");
    }

    exitTile = { x: exitRoom.cx, y: exitRoom.cy };
    dungeon.map[exitTile.y][exitTile.x] = CONFIG.TILE_EXIT;
    LoadingScreen.setProgress(70);

    ensureCaches();
    spawnEnemiesAndItems(dungeon, enemies, items, player, exitTile, currentFloor, runStats, meta);
    buildMapCache();
    seedMotesFallback();
    updateCamera();
    addLog(`Você desceu ao Andar ${currentFloor}/${CONFIG.FINAL_FLOOR}.`, "gold");
    addLog(currentFloor === CONFIG.FINAL_FLOOR ? "O Guardião Rubro aguarda perto da saída." : "A masmorra se reorganiza em silêncio.");
    showToast(`ANDAR ${currentFloor}`);
    burst(sxFor(player.x), syFor(player.y), COLORS.gold, CONFIG.LOOT_PARTICLE_COUNT_BIG, "spark");
    updateUI();
    saveCurrentRun();
    LoadingScreen.setProgress(100);
    setTimeout(() => { LoadingScreen.hide(); ScreenEffects.fadeOut(250); }, 200);
  }, 100);
}

function resolveItem(item) {
  item.used = true;
  const itemIdx = items.indexOf(item);
  if (itemIdx >= 0) items.splice(itemIdx, 1);
  releaseItem(item);
  const x = sxFor(player.x), y = syFor(player.y);

  if (item.type === "potion") {
    player.potions++;
    addLog("Você encontrou uma Poção de Cura!", "green");
    showToast("+1 Poção");
    spawnFloatingText(x, y, "+POÇÃO", COLORS.green);
    burst(x, y, COLORS.green, CONFIG.LOOT_PARTICLE_COUNT, "spark");
    playSfx("potion");
    vibrate(CONFIG.VIBRATE_LIGHT);
    saveCurrentRun();
    return;
  }

  if (item.type === "chest") {
    runStats.chests++;
    meta.chests = (meta.chests || 0) + 1;
    saveMeta(meta);
    playSfx("chest");
    const roll = rand(1, 3);
    if (roll === 1) {
      player.potions += 2;
      addLog("Baú antigo: duas poções intactas.", "green");
      showToast("+2 Poções");
    } else if (roll === 2) {
      const leveled = gainXp(player, CONFIG.XP_CHEST_BASE + player.level * CONFIG.XP_CHEST_PER_LEVEL);
      addLog("Baú antigo: inscrições concedem experiência.", "blue");
      if (leveled) {
        showToast(`LEVEL UP! ${player.level}`);
        burst(x, y, COLORS.gold, CONFIG.LEVEL_UP_PARTICLE_COUNT, "spark");
        playSfx("level");
      }
      tryOpenTalentDialog();
    } else {
      const relic = pickRelic(player);
      runStats.relics++;
      meta.relicsFound = (meta.relicsFound || 0) + 1;
      saveMeta(meta);
      addLog(`Relíquia obtida: ${relic.name}.`, "gold");
      showToast(relic.name);
      playSfx("relic");
    }
    burst(x, y, COLORS.gold, CONFIG.LOOT_PARTICLE_COUNT_BIG, "spark");
    vibrate([CONFIG.VIBRATE_LIGHT, 30, CONFIG.VIBRATE_LIGHT]);
    saveCurrentRun();
    return;
  }

  if (item.type === "shrine") {
    runStats.shrines++;
    const cost = Math.max(CONFIG.SHRINE_HP_COST_MIN, Math.floor(player.maxHp * CONFIG.SHRINE_HP_COST_RATIO));
    player.hp = Math.max(1, player.hp - cost);
    player.atk++;
    player.mag++;
    player.specialCd = 0;
    addLog(`Altar rubro: -${cost} PV, +poder e habilidade pronta.`, "purple");
    showToast("PACTO DO ALTAR");
    burst(x, y, COLORS.purple, CONFIG.LOOT_PARTICLE_COUNT_BIG, "spark");
    playSfx("shrine");
    vibrate([30, 25, 30]);
    saveCurrentRun();
    return;
  }

if (item.type === "trap") {
    runStats.traps++;
    if (player.wingedBoots) {
      addLog("Suas Botas Aladas deslizam sobre as lâminas da armadilha!", "green");
      showToast("BOTAS ALADAS");
      spawnEffect("spark", x, y, "", COLORS.gold, { life: CONFIG.EFFECT_LIFE_SPARK_MIN, size: 2 });
      burst(x, y, COLORS.gold, CONFIG.LOOT_PARTICLE_COUNT, "spark");
      playSfx("shrine");
      saveCurrentRun();
      return;
    }
    const dmg = effectiveIncomingDamage(trapDamage(player.def));
    player.hp = Math.max(1, player.hp - dmg);
    player.hitPulse = 12;
    addLog(`Armadilha de lâminas! Você sofreu ${dmg}.`, "red");
    showToast("ARMADILHA!");
    spawnEffect("slash", x, y, "", COLORS.red, { life: CONFIG.EFFECT_LIFE_SPARK_MIN, size: 2 });
    burst(x, y, COLORS.red, CONFIG.LOOT_PARTICLE_COUNT, "spark");
    shake = 8;
    playSfx("trap");
    vibrate(CONFIG.VIBRATE_MEDIUM);
    saveCurrentRun();
  }
}

function startMentorDialog(item) {
  if (!item || item.used) return;
  item.used = true;
  const mentorIdx = items.indexOf(item);
  if (mentorIdx >= 0) items.splice(mentorIdx, 1);
  releaseItem(item);
  mentorDialog = { text: MENTOR_TEXT, timer: CONFIG.MENTOR_DIALOG_TICKS };
  gameState = "bossIntro";
  inputFrozen = true;
  playSfx("ominous");
  showToast("ALMA PERDIDA", CONFIG.TOAST_VERY_SHORT_MS);
  setTimeout(finishMentorDialog, CONFIG.MENTOR_DIALOG_TIMEOUT_MS);
}

function finishMentorDialog() {
  if (!mentorDialog || !player) return;
  player.potions++;
  const x = sxFor(player.x), y = syFor(player.y);
  burst(x, y, COLORS.green, 16, "heal");
  spawnFloatingText(x, y, "+1 POÇÃO", COLORS.green);
  playSfx("potion");
  mentorDialog = null;
  inputFrozen = false;
  gameState = "explore";
  addLog("A Alma Perdida entregou uma poção e se dissipou.", "blue");
  updateUI();
  saveCurrentRun();
}

// =============================================================
// EVENTS (Encontros aleatórios)
// =============================================================
function startEventDialog(item) {
  if (!item || item.used) return;
  item.used = true;
  const evtIdx = items.indexOf(item);
  if (evtIdx >= 0) items.splice(evtIdx, 1);
  releaseItem(item);
  const def = EVENT_TYPES[item.eventIdx] || EVENT_TYPES[0];
  const opts = EVENT_OPTIONS[def.id];
  eventDialog = { eventId: def.id, chosen: false, selected: 0 };
  gameState = "bossIntro";
  inputFrozen = true;
  playSfx("ominous");
  showToast(def.name, CONFIG.TOAST_VERY_SHORT_MS);
  updateUI();
}

function chooseEventChoice(idx) {
  if (!eventDialog || gameState !== "bossIntro") return;
  const def = EVENT_TYPES.find(e => e.id === eventDialog.eventId);
  const opts = EVENT_OPTIONS[def.id];
  if (!opts || !opts.choices[idx]) return;
  const cho = opts.choices[idx];
  if (cho.effect === "leave") { closeEventDialog(); return; }
  const x = sxFor(player.x), y = syFor(player.y);
  const state = { gold: player.gold, hp: player.hp, maxHp: player.maxHp, atk: player.atk, mag: player.mag, def: player.def, level: player.level, potions: player.potions };
  const { state: next, outcome } = resolveEventChoice(cho.effect, state, cho.value);
  player.gold = next.gold; player.hp = next.hp; player.maxHp = next.maxHp;
  player.atk = next.atk; player.mag = next.mag; player.def = next.def; player.potions = next.potions;
  const INSUFFICIENT_MSG = {
    gold_cost: "Você não tem ouro suficiente. Ele se afasta decepcionado.",
    gold_blessing: "O ouro escorre por seus dedos..., mas nada acontece.",
    gamble_gold: "Sem ouro para apostar. O jogador bufa.",
    gamble_hp: "Sua vida é frágil demais para apostar.",
    sacrifice_hp: "O altar exige mais vida do que você tem.",
    sacrifice_gold: "O altar ignora seu ouro insuficiente.",
    pay_lock: "Sem ouro suficiente para o cofre."
  };
  const grantRelic = (burstCount) => {
    const relic = pickRelic(player);
    runStats.relics++; meta.relicsFound = (meta.relicsFound || 0) + 1; saveMeta(meta);
    if (burstCount) burst(x, y, COLORS.purple, burstCount, "spark");
    showToast(relic.name);
    return relic;
  };
  switch (outcome.type) {
    case "insufficient":
      addLog(INSUFFICIENT_MSG[cho.effect] || "Nada acontece.", "red");
      break;
    case "gold_cost_paid":
      addLog("O mercador agradece e oferece uma poção balsâmica.", "green");
      burst(x, y, COLORS.green, 14, "heal");
      showToast("MERCADOR AGRADECIDO");
      break;
    case "rob": {
      const got = outcome.amount;
      meta.runGold = (meta.runGold || 0) + got;
      saveMeta(meta);
      addLog(`Você rouba ${got} de ouro do mercador ferido.`, "gold");
      burst(x, y, COLORS.gold, 10, "spark");
      showToast(`+${got} OURO`);
      break;
    }
    case "power":
      if (cho.effect === "fountain_drink") {
        addLog("A água corre em suas veias como energia viva: +ATK, +MAG, +4 PV máx.", "purple");
        burst(x, y, COLORS.blue, 16, "spark");
        showToast("FORÇA DA FONTE");
      } else {
        addLog("A poça concede poder: +ATK, +MAG, +3 PV máx.", "purple");
        burst(x, y, COLORS.purple, 16, "spark");
        showToast("PODER DA POÇA");
      }
      break;
    case "damage": {
      const dmg = effectiveIncomingDamage(outcome.amount);
      player.hp = Math.max(1, player.hp - dmg);
      const msg = cho.effect === "fountain_drink"
        ? `A fonte morde de volta! -${dmg} PV.`
        : cho.effect === "force_lock"
          ? "Uma lâmina dispara do cofre! -" + dmg + " PV."
          : `A poça drena sua vitalidade! -${dmg} PV.`;
      addLog(msg, "red");
      burst(x, y, COLORS.red, 12, "spark");
      if (cho.effect === "fountain_drink") showToast("A FONTE SEDE");
      else if (cho.effect === "risk_power") showToast("A POÇA SEDE!");
      break;
    }
    case "gold_blessing_paid":
      addLog("A bênção se solidifica em seu sangue: +ATK, +MAG.", "purple");
      burst(x, y, COLORS.purple, 16, "spark");
      break;
    case "xp": {
      const leveled = gainXp(player, outcome.amount);
      addLog("A memória conceda experiência antiga.", "blue");
      if (leveled) { showToast(`LEVEL UP! ${player.level}`); burst(x, y, COLORS.gold, 22, "spark"); playSfx("level"); }
      break;
    }
    case "heal":
      addLog(`A reza sela suas feridas: +${outcome.amount} PV.`, "green");
      burst(x, y, COLORS.green, 16, "heal");
      break;
    case "gamble_win": {
      meta.runGold = (meta.runGold || 0) + outcome.amount;
      saveMeta(meta);
      addLog("OS dados: vitória! Seu ouro dobra!", "gold");
      showToast("VITÓRIA NO DADO!");
      burst(x, y, COLORS.gold, 12, "spark");
      break;
    }
    case "gamble_lose":
      addLog("Os dados caem contra você. Ouro perdido.", "red");
      showToast("DERROTA NO DADO");
      burst(x, y, COLORS.gold, 12, "spark");
      break;
    case "gamble_hp_win": {
      const relic = grantRelic(0);
      addLog(`O destino concede: ${relic.name}!`, "gold");
      burst(x, y, COLORS.purple, 14, "spark");
      break;
    }
    case "gamble_hp_lose":
      addLog("A aposta falha. Você entregou sua vida por nada.", "red");
      burst(x, y, COLORS.purple, 14, "spark");
      break;
    case "relic": {
      const relic = grantRelic(cho.effect === "sacrifice_hp" ? 18 : 0);
      if (cho.effect === "sacrifice_hp") addLog(`O altar devora ${outcome.hpCost} PV e entrega: ${relic.name}!`, "gold");
      else if (cho.effect === "sacrifice_gold") addLog(`O altar absorve ${outcome.goldCost} ouro e entrega: ${relic.name}!`, "gold");
      else if (cho.effect === "force_lock") addLog(`A fechadura cede! Relíquia: ${relic.name}.`, "gold");
      else addLog(`O cofre se abre: ${relic.name}!`, "gold");
      break;
    }
    case "potion":
      addLog("Você enche um frasco com a água cintilante: +1 poção.", "green");
      burst(x, y, COLORS.green, 14, "heal");
      showToast("+1 POÇÃO");
      break;
    case "stats":
      if (cho.effect === "bone_upgrade") {
        addLog("O Ferreiro dos Ossos afia sua lâmina: +2 ATK.", "purple");
        showToast("+2 ATK");
      } else {
        addLog("O Ferreiro dos Ossos reforça sua armadura: +2 DEF.", "purple");
        showToast("+2 DEF");
      }
      burst(x, y, COLORS.purple, 16, "spark");
      playSfx("level");
      break;
  }
  updateUI();
  saveCurrentRun();
  eventDialog = null;
  inputFrozen = false;
  gameState = "explore";
  tryOpenTalentDialog();
}

function closeEventDialog() {
  if (!eventDialog || !player) return;
  eventDialog = null;
  inputFrozen = false;
  gameState = "explore";
  updateUI();
  saveCurrentRun();
}

// =============================================================
// SHOP (Mercador)
// =============================================================
function openShopDialog(item) {
  if (!item || item.used) return;
  item.used = true;
  const shopIdx = items.indexOf(item);
  if (shopIdx >= 0) items.splice(shopIdx, 1);
  releaseItem(item);
  const offerings = buildShopOfferings(player.relicNames || [], currentFloor);
  shopDialog = { offerings, selected: 0, timer: CONFIG.MENTOR_DIALOG_TICKS };
  gameState = "bossIntro";
  inputFrozen = true;
  playSfx("chest");
  showToast("MERCADOR", CONFIG.TOAST_SHORT_MS);
}

function closeShopDialog() {
  if (!shopDialog || !player) return;
  shopDialog = null;
  inputFrozen = false;
  gameState = "explore";
  addLog("O mercador acena e desaparece na escuridão.", "blue");
  updateUI();
  saveCurrentRun();
}

function buyShopItem() {
  if (!shopDialog || !player) return;
  const offer = shopDialog.offerings[shopDialog.selected];
  if (!offer) return;
  if (player.gold < offer.cost) {
    addLog("Ouro insuficiente para comprar isso.", "red");
    playSfx("bump");
    return;
  }
  player.gold -= offer.cost;
  const x = sxFor(player.x), y = syFor(player.y);
  if (offer.kind === "potion") {
    player.potions++;
    burst(x, y, COLORS.green, 14, "heal");
    spawnFloatingText(x, y, "+1 POÇÃO", COLORS.green);
    playSfx("potion");
    addLog("Comprado: Poção de Cura.", "green");
  } else if (offer.kind === "crystal") {
    player.captureCrystals++;
    burst(x, y, COLORS.blue, 14, "spark");
    spawnFloatingText(x, y, "+1 CRISTAL", COLORS.blue);
    playSfx("rune");
    addLog("Comprado: Cristal de Captura.", "blue");
  } else {
    const relic = RELIC_POOL.find(r => r.name === offer.name);
    if (relic) {
      relic.apply(player);
      player.relicNames.push(relic.name);
      runStats.relics++;
      burst(x, y, COLORS.gold, CONFIG.LOOT_PARTICLE_COUNT, "spark");
      spawnFloatingText(x, y, relic.name, COLORS.gold);
      playSfx("relic");
      addLog(`Comprado: relíquia ${relic.name}.`, "gold");
    }
  }
  shopDialog.offerings.splice(shopDialog.selected, 1);
  shopDialog.selected = Math.min(shopDialog.selected, Math.max(0, shopDialog.offerings.length - 1));
  if (shopDialog.offerings.length === 0) closeShopDialog();
  else updateUI();
  saveCurrentRun();
}

function triggerWildAmbush() {
  const wildSpotCandidates = [];
  for (let d = 0; d < 4; d++) {
    const x = player.x + DIR_X[d], y = player.y + DIR_Y[d];
    if (isWalkable(dungeon, x, y) && isDiscovered(dungeon, x, y) && !occupiedByEnemy(x, y) && !itemAt(x, y)) {
      wildSpotCandidates.push(y * CONFIG.MAP_W + x);
    }
  }
  if (!wildSpotCandidates.length) return;
  const spotKey = wildSpotCandidates[rand(0, wildSpotCandidates.length - 1)];
  const spotX = spotKey % CONFIG.MAP_W, spotY = Math.floor(spotKey / CONFIG.MAP_W);
  const wild = makeWildEnemy(currentFloor, player.level);
  wild.x = spotX; wild.y = spotY;
  wild.wild = true;
  enemies.push(wild);
  floorEnemySpawned++;
  const sx = sxFor(spotX), sy = syFor(spotY);
  burst(sx, sy, COLORS.purple, CONFIG.LOOT_PARTICLE_COUNT_BIG, "spark");
  spawnEffect("dust", sx - 8, sy + 6, "", "#2b1747", { life: CONFIG.EFFECT_LIFE_DUST_WILD, vx: -0.3, vy: -0.2, size: 4 });
  spawnEffect("dust", sx + 6, sy + 8, "", "#522c78", { life: CONFIG.EFFECT_LIFE_DUST_WILD, vx: 0.3, vy: -0.25, size: 4 });
  playSfx("ominous");
  inputFrozen = true;
  setTimeout(() => {
    inputFrozen = false;
    beginCombat(wild, true);
  }, CONFIG.WILD_AMBUSH_DELAY_MS);
}

// =============================================================
// COMBAT
// =============================================================
function computeEnemySynergy() {
  if (!currentEnemy) return;
  if (currentEnemy.boss) { currentEnemy.synergy = { allies: [], auraAtk: 0, auraDef: 0, regen: 0 }; return; }
  currentEnemy.synergy = computeSynergy(enemies, currentEnemy);
  if (currentEnemy.synergy.allies.length > 0) {
    const names = currentEnemy.synergy.allies.map(a => a.name).join(", ");
    currentEnemy.def = (currentEnemy.def || 0) + currentEnemy.synergy.auraDef;
    addLog(`${names} apoiam ${currentEnemy.name}! Ataque todos melhor!`, "purple");
    showToast("SINERGIA!", CONFIG.TOAST_MS);
  }
}

function beginCombat(enemy, wild = false) {
  currentEnemy = enemy;
  currentEnemy.statusEffects = currentEnemy.statusEffects || {};
  currentEnemy.wild = wild || currentEnemy.wild;
  player.maxStamina = player.maxStamina || CONFIG.PLAYER_STAMINA_MAX;
  player.stamina = player.maxStamina;
  player.activeSlot = 0;
  player.championSnapshot = null;
  computeEnemySynergy();
  resetAtbState();
  initActionState();
if (enemy.boss) {
    gameState = "bossIntro";
    bossIntroTimer = CONFIG.BOSS_INTRO_TICKS;
    flash = 10; shake = 11;
    playSfx("boom");
    triggerBossIntroCinema();
    addLog("O Guardião Rubro desperta.", "red");
    updateUI();
    setTimeout(() => {
      if (gameState !== "bossIntro") return;
      gameState = "combat";
      inputFrozen = false;
      startMusic({ bossCombat: true, floor: currentFloor });
      inTurn = false;
      player.guarding = false;
      player.specialCd = Math.max(0, player.specialCd - 1);
      addLog(combatMode === "turn" ? "A: Atacar  |  B: Bloquear/Poção" : "A: Atacar  |  B: Esquivar/Poção");
      showToast("CHEFÃO!", CONFIG.TOAST_MS);
      updateUI();
    }, CONFIG.BOSS_TRANSITION_MS);
    return;
  }
  gameState = "combatTransition";
  inputFrozen = true;
  playSfx("clash");
  flash = 12;
  updateUI();
  setTimeout(() => {
    if (gameState !== "combatTransition") return;
    gameState = "combat";
    inputFrozen = false;
    startMusic({ floor: currentFloor, isCombat: true });
    inTurn = false;
    player.guarding = false;
    player.specialCd = Math.max(0, player.specialCd - 1);
    addLog(`${enemy.name} surgiu!`, "purple");
    addLog(combatMode === "turn" ? "A: Atacar  |  B: Bloquear/Poção" : "A: Atacar  |  B: Esquivar/Poção");
    showToast("COMBATE!", CONFIG.TOAST_MS);
    if (combatMode === "action" && !actionTutorialShown) {
      actionTutorialShown = true;
      addLog("Dica: mova-se com WASD/Setas, A ataca, B esquiva (dá i-frames). Alguns inimigos atacam de longe!", "cyan");
    }
    if (combatMode === "turn" && !combatTutorialShown) {
      combatTutorialShown = true;
      addLog("Dica: A abre o menu de ações. Toque A de novo no momento certo do PONTO DOCE para mais dano — ou DEFENDA para absorver o golpe inimigo.", "cyan");
    }
    updateUI();
    if (currentEnemy.affix === "wild") {
      addLog("O oponente é selvagem e avança primeiro!", "red");
      inTurn = true;
      scheduleEnemyTurn();
    }
  }, CONFIG.COMBAT_TRANSITION_MS);
}

function playerAttack(useSpecial = false) {
  if (gameState !== "combat" || !currentEnemy) return;

  // If a timing window is already open, treat this press as the swing trigger.
  if (attackTimingActive && !useSpecial) {
    commitAttackSwing(false);
    return;
  }

  if (inTurn) return;

  if (useSpecial && player.specialCd > 0) {
    addLog(`Habilidade recarregando: ${player.specialCd} turno(s).`, "blue");
    showToast("RECARREGANDO");
    return;
  }
  if (useSpecial && player.stamina < CONFIG.SPECIAL_STAMINA_COST) {
    addLog("Stamina insuficiente para a habilidade especial!", "red");
    showToast("SEM STAMINA");
    return;
  }
  if (!useSpecial && player.stamina < CONFIG.ATTACK_STAMINA_COST) {
    addLog("Você está exausto e recua para recuperar o fôlego. O inimigo avança!", "muted");
    showToast("EXAUSTO", CONFIG.TOAST_SHORT_MS);
    inTurn = true;
    player.guarding = false;
    updateUI();
    scheduleEnemyTurn();
    return;
  }

  inTurn = true;
  player.guarding = false;

  // Basic attacks open a short timing window (minigame) instead of resolving instantly.
  if (!useSpecial) {
    player.stamina = Math.max(0, player.stamina - CONFIG.ATTACK_STAMINA_COST);
    attackTimingActive = true;
    attackTimingStartTs = performance.now();
    attackTimingResolved = false;
    addLog("Prepare o golpe: toque A de novo no momento certo do ponto doce!", "cyan");
    showToast("PONTO DOCE!", CONFIG.TOAST_SHORT_MS);
    updateUI();
    setTimeout(() => {
      if (attackTimingActive && !attackTimingResolved && gameState === "combat" && currentEnemy) {
        attackTimingActive = false;
        attackTimingResolved = true;
        commitAttackSwing(false, (performance.now() - attackTimingStartTs) / CONFIG.ATTACK_TIMING_WINDOW_MS);
      }
    }, CONFIG.ATTACK_TIMING_WINDOW_MS + 80);
    return;
  }

  player.stamina = Math.max(0, player.stamina - CONFIG.SPECIAL_STAMINA_COST);
  commitAttackSwing(true);
}

function commitAttackSwing(useSpecial, timingFrac = -1) {
  if (gameState !== "combat" || !currentEnemy) return;
  const timing = attackTimingActive && !attackTimingResolved && timingFrac < 0 ? (performance.now() - attackTimingStartTs) / CONFIG.ATTACK_TIMING_WINDOW_MS : timingFrac;
  if (attackTimingActive) {
    attackTimingActive = false;
    attackTimingResolved = true;
  }
  let perfect = false, good = false;
  if (useSpecial) {
    // no timing for specials
  } else {
    const frac = clamp(timing, 0, 1);
    const dist = Math.abs(frac - 0.5);
    perfect = dist < CONFIG.ATTACK_TIMING_SWEET_FRACTION;
    good = !perfect && dist < CONFIG.ATTACK_TIMING_SWEET_FRACTION * 2;
  }

  // TIMING COMBO: perfect timing chains grow a multiplier; misses reset it.
  if (!useSpecial) {
    if (perfect) {
      player.timingCombo = Math.min(CONFIG.TURN_TIMING_COMBO_MAX, (player.timingCombo || 0) + 1);
      player.timingComboMult = player.timingCombo * CONFIG.TURN_TIMING_COMBO_DMG_PER_STACK;
      player.stamina = Math.min(player.maxStamina, player.stamina + CONFIG.STAMINA_PERFECT_BLOCK_BONUS);
    } else if (!good && CONFIG.TURN_TIMING_COMBO_RESET_ON_MISS) {
      player.timingCombo = 0;
      player.timingComboMult = 0;
    }
  }

  player.attackPulse = CONFIG.LUNGE_ANIM_TICKS;
  player.lungePulse = 1;

  const statusResult = processStatusTurn(player);
  if (statusResult) {
    if (statusResult.dmg) {
      addLog(`Você ${statusResult.type === "bleed" ? "sangra" : "queima"} e perde ${statusResult.dmg} PV.`, "red");
      spawnFloatingText(sxFor(player.x), syFor(player.y), `-${statusResult.dmg}`, statusResult.type === "bleed" ? COLORS.red : COLORS.orange);
      burst(sxFor(player.x), syFor(player.y), statusResult.type === "bleed" ? COLORS.red : COLORS.orange, 5, "spark");
    }
    if (statusResult.skipTurn || statusResult.type === "stun") {
      addLog("Você está atordoado e perde o turno.", "gold");
      showToast("ATORDOADO", CONFIG.TOAST_SHORT_MS);
      scheduleEnemyTurn();
      return;
    }
  }

  let dmg = 0, message = "", critical = false;
  const specStats = { classKey: player.classKey, atk: player.atk, mag: player.mag, level: player.level, def: currentEnemy.def, skillAtkMult: player.skillAtkMult || 1.3 };

  if (useSpecial) {
    player.specialCd = player.specialMaxCd;
    if (player.activeSlot > 0) {
      dmg = specialDamage({ ...specStats, monsterSkill: true });
      message = `${player.special}! ${currentEnemy.name} é atingido!`;
      if (player.skillHealRatio > 0) {
        const heal = Math.min(player.maxHp - player.hp, Math.floor(dmg * player.skillHealRatio));
        player.hp += heal;
        message += ` Você recupera ${heal} PV.`;
      }
} else if (player.classKey === "warrior") {
      player.guarding = true;
      player.ironGuardThorn = 1;
      dmg = specialDamage(specStats);
      message = "Guarda de Ferro! Você ergue o escudo e contra-ataca.";
      if (chance(CONFIG.IRON_GUARD_STUN_CHANCE)) { addStatus(currentEnemy, "stun", 1); message += " O inimigo ficou atordoado."; }
    } else if (player.classKey === "rogue") {
      critical = chance(CONFIG.ROGUE_SPECIAL_CRIT_CHANCE);
      dmg = specialDamage(specStats);
      if (critical) dmg = applyCrit(dmg, 1, CONFIG.ROGUE_SPECIAL_CRIT_MULT);
      message = critical ? "Punhal Sombrio! Acerto crítico nas costelas da sombra!" : "Punhal Sombrio! O inimigo quase escapou.";
      addStatus(currentEnemy, "bleed", 3, rogueBleedPower(player.level));
    } else if (player.classKey === "mage") {
      dmg = specialDamage(specStats);
      message = "Raio Arcano! A masmorra acende em azul impossível.";
      addStatus(currentEnemy, "burn", 2, mageBurnPower(player.mag));
    } else if (player.classKey === "beastmaster") {
      dmg = specialDamage(specStats);
      const beastDmg = summonDamage(player.level);
      message = `Chamado da Selva! Seu lobo espectral ataca por ${beastDmg} e você golpeia por ${dmg}!`;
      dmg += beastDmg;
      if (chance(CONFIG.BEAST_BLEED_CHANCE)) { addStatus(currentEnemy, "bleed", 2, beastBleedPower(player.level)); message += " O inimigo sangra."; }
    } else if (player.classKey === "witch") {
      dmg = specialDamage(specStats);
      message = "Olho do Caos! Chamas roxas consomem o inimigo!";
      addStatus(currentEnemy, "burn", 3, witchBurnPower(player.mag));
      player.hp = Math.min(player.maxHp, player.hp + Math.floor(dmg * CONFIG.WITCH_HEAL_RATIO));
      message += ` Você recupera ${Math.floor(dmg * CONFIG.WITCH_HEAL_RATIO)} PV pelo sacrifício.`;
    }
  } else {
    critical = chance(player.crit);
    dmg = attackRoll(player.atk, currentEnemy.def, { variance: 4, defDiv: 1 });
    if (perfect) {
      dmg = Math.floor(dmg * CONFIG.ATTACK_TIMING_PERFECT_MULT);
      critical = true;
      message = "PONTO DOCE! Golpe perfeito no ritmo do combate!";
    } else if (good) {
      dmg = Math.floor(dmg * CONFIG.ATTACK_TIMING_GOOD_MULT);
      message = "Bom timing!";
      if (critical) dmg = applyCrit(dmg, 1, CONFIG.NORMAL_CRIT_MULT);
    } else {
      if (critical) dmg = applyCrit(dmg, 1, CONFIG.NORMAL_CRIT_MULT);
      message = critical ? "Ataque crítico!" : "Você ataca.";
    }
    if (critical && player.classKey === "rogue") addStatus(currentEnemy, "bleed", 3, rogueBleedPower(player.level));
  }

  const burstActive = player.momentum >= CONFIG.MOMENTUM_MAX;
  let comboOnThisHit = false;
  if (!useSpecial && gameState === "combat" && !currentEnemy.dodgeNext) {
    if (player.combo < CONFIG.COMBO_MAX) {
      player.combo++;
      player.comboMult = player.combo * CONFIG.COMBO_DMG_PER_STACK;
      comboOnThisHit = true;
    }
    player.momentum = Math.min(CONFIG.MOMENTUM_MAX, player.momentum + CONFIG.MOMENTUM_GAIN_ATTACK + (perfect ? CONFIG.MOMENTUM_GAIN_PERFECT : 0) + (critical ? CONFIG.MOMENTUM_GAIN_CRIT : 0) + (comboOnThisHit ? CONFIG.MOMENTUM_GAIN_HIT : 0));
  } else if (useSpecial) {
    player.momentum = Math.min(CONFIG.MOMENTUM_MAX, player.momentum + CONFIG.MOMENTUM_GAIN_ATTACK);
  }
if (burstActive) {
    dmg = Math.floor(dmg * CONFIG.BURST_DMG_MULT);
    critical = true;
    player.momentum = 0;
    message = "SURTO! Um golpe devastador de pura energia!";
    triggerSurgeScreenFx();
  }

  // ELEMENTAL AFFINITY: weakness amplifies, resistance reduces.
  const elemMult = elementMultiplier(getPlayerElement(), currentEnemy);
  if (elemMult !== 1) {
    dmg = Math.max(1, Math.floor(dmg * elemMult));
    const elemName = (ELEMENT_AFFINITY[getPlayerElement()] || {}).name || "";
    message += elemMult > 1 ? ` ${elemName} é devastador aqui!` : ` ${elemName} parece inofensivo...`;
  }

  // STAGGER: basic and special hits build the enemy's stagger meter.
  if (currentEnemy.hp > 0 && !currentEnemy.dodgeNext) {
    currentEnemy.stagger = (currentEnemy.stagger || 0) + (perfect || critical ? CONFIG.STAGGER_STACKS_PER_HIT * 1.5 : CONFIG.STAGGER_STACKS_PER_HIT);
    if (currentEnemy.stagger >= CONFIG.STAGGER_STACKS_TO_BREAK) {
      currentEnemy.stagger = 0;
      addStatus(currentEnemy, "vulnerable", 2);
      addLog(`${currentEnemy.name} cambaleia e fica VULNERÁVEL!`, "gold");
      spawnFloatingText(sxFor(currentEnemy.x), syFor(currentEnemy.y), "VULNERÁVEL!", COLORS.gold);
      burst(sxFor(currentEnemy.x), syFor(currentEnemy.y), COLORS.gold, 12, "spark");
      playSfx("boom");
    }
  }

  if (currentEnemy.dodgeNext) {
    currentEnemy.dodgeNext = false;
    addLog(`${currentEnemy.name} é etéreo e seu ataque atravessa o vazio!`, "purple");
    spawnFloatingText(sxFor(currentEnemy.x), syFor(currentEnemy.y), "EVADIU", COLORS.purple);
    burst(sxFor(currentEnemy.x), syFor(currentEnemy.y), COLORS.purple, 8, "spark");
    playSfx("ominous");
    runWhenState("combat", () => {
      if (currentEnemy.hp <= 0) endCombatVictory();
      else scheduleEnemyTurn();
    }, CONFIG.COMBAT_AFTER_BLOCK_DELAY_MS);
    return;
  }

  // VULNERABLE: amplified damage while the enemy is staggered-open.
  if (currentEnemy.statusEffects?.vulnerable) {
    dmg = Math.floor(dmg * CONFIG.VULNERABLE_BONUS_MULT);
    message += " Golpe ampliado pela brecha!";
  }

  if (player.comboMult > 0) dmg = Math.floor(dmg * (1 + player.comboMult));
  if (player.timingComboMult > 0) {
    dmg = Math.floor(dmg * (1 + player.timingComboMult));
    message += ` Encadeado x${player.timingCombo}!`;
  }
  currentEnemy.hp = Math.max(0, currentEnemy.hp - dmg);
  currentEnemy.hitPulse = 12;
  addLog(`${message} ${currentEnemy.name} sofreu ${dmg}.`, critical ? "gold" : "");
  const hitX = sxFor(currentEnemy.x), hitY = syFor(currentEnemy.y);
  const effectType = useSpecial && player.classKey === "mage" ? "bolt" : "slash";
  const runeBlade = hasRelic("Lâmina Rúnica") && effectType === "slash";
  spawnFloatingText(hitX, hitY, `-${dmg}`, critical ? COLORS.gold : COLORS.white, critical ? 1.7 : 1.2);
  if (comboOnThisHit && player.combo > 1) spawnFloatingText(hitX, hitY - 14, `COMBO x${player.combo}`, COLORS.purple, 1.4);
  spawnEffect(effectType, hitX, hitY, "", runeBlade ? COLORS.blue : (critical ? COLORS.gold : COLORS.white), { life: CONFIG.EFFECT_LIFE_SPARK_MIN, size: runeBlade ? 4 : (critical ? 3 : 2), rot: { up: 1.57, down: -1.57, left: 3.14, right: 0 }[player.dir] || 0 });
burst(hitX, hitY, runeBlade ? COLORS.gold : (critical ? COLORS.gold : COLORS.red), runeBlade ? CONFIG.SPECIAL_PARTICLE_COUNT : (critical ? CONFIG.CRIT_PARTICLE_COUNT : CONFIG.NORMAL_HIT_PARTICLE_COUNT), "spark");
  flashOf(runeBlade ? COLORS.blue : (critical ? COLORS.gold : COLORS.red), runeBlade ? 6 : 5);
  shakeFrom(sxFor(player.x), syFor(player.y), hitX, hitY, critical ? 8 : 4);
  if (critical && !reducedMotion) freezeFrames = CONFIG.FREEZE_FRAMES_CRIT;
  playSfx(runeBlade ? "rune" : (currentEnemy.boss ? "bossHit" : (critical ? "crit" : "hit")), { pitch: rand(-1, 1) * 0.5 });
  vibrate(critical ? CONFIG.VIBRATE_CRIT_PATTERN : CONFIG.VIBRATE_LIGHT);

  runWhenState("combat", () => {
    if (currentEnemy.hp <= 0) endCombatVictory();
    else {
      maybeTriggerBossPhase2();
      scheduleEnemyTurn();
    }
  }, CONFIG.COMBAT_AFTER_BLOCK_DELAY_MS);
}

function usePotionOrSpecial() {
  if (gameState === "combatTransition") return;
  if (gameState === "combat") {
    if (combatMode === "action") { actionSecondary(); return; }
    if (commandMenuOpen) { cancelCommandMenu(); return; }
    if (combatMode === "turn") {
      if (playerAtbReady && !inputFrozen && !blockWindow) { openCommandMenu(); return; }
      if (player.hp <= Math.floor(player.maxHp * CONFIG.POTION_AUTO_HP_RATIO) && player.potions > 0) usePotion(true);
      else playerAttack(true);
    } else {
      if (player.hp <= Math.floor(player.maxHp * CONFIG.POTION_AUTO_HP_RATIO) && player.potions > 0) usePotion(true);
      else playerAttack(true);
    }
  } else if (gameState === "explore") {
    usePotion(false);
  } else if (gameState === "paused") {
    closePauseMenu();
  } else if (gameState === "bossIntro" && shopDialog) {
    closeShopDialog();
  } else if (gameState === "bossIntro" && eventDialog) {
    chooseEventChoice(2);
  } else if (gameState === "bossIntro" && talentDialog) {
    closeTalentDialog();
  } else if (gameState === "win" || gameState === "gameover") {
    restartToMenu();
  }
}

function maybeTriggerBossPhase2() {
  if (!currentEnemy || !currentEnemy.boss || currentEnemy.phase2) return;
  if (currentEnemy.hp <= 0 || currentEnemy.hp > Math.floor(currentEnemy.maxHp / 2)) return;
currentEnemy.phase2 = true;
  currentEnemy.name = "Guardião Rubro, Forma Real";
  currentEnemy.maxHp = Math.max(currentEnemy.maxHp, Math.round(currentEnemy.maxHp * 1.15));
  currentEnemy.hp = currentEnemy.maxHp;
  currentEnemy.atk = Math.round(currentEnemy.atk * CONFIG.BOSS_PHASE2_ATK_MULT);
  currentEnemy.def = Math.round(currentEnemy.def * CONFIG.BOSS_PHASE2_DEF_MULT);
  currentEnemy.phase2 = true;
  const x = sxFor(currentEnemy.x), y = syFor(currentEnemy.y);
  burst(x, y, COLORS.red, 30, "spark");
  shake = 16; flash = 12;
  playSfx("boom");
  spawnFloatingText(x, y, "FASE 2", COLORS.red);
  addLog("O Guardião rasga sua armadura de pedra. A forma real se ergue, mais veloz e cruel!", "red");
  showToast("GUARDIÃO DESPERTA!", CONFIG.BOSS_DEFEATED_TOAST_MS);
  startMusic({ bossCombat: true, floor: currentFloor });
  updateUI();
}

function usePotion(consumesTurn) {
  if (!player || player.potions <= 0) {
    addLog("Nenhuma poção restante.", "red");
    return;
  }
  if (player.hp >= player.maxHp) {
    addLog("Sua vida já está cheia.");
    return;
  }
  player.potions--;
  const heal = Math.min(player.maxHp - player.hp, CONFIG.POTION_HEAL_BASE + player.level * CONFIG.POTION_HEAL_PER_LEVEL);
  player.hp += heal;
  addLog(`Você bebeu uma poção e recuperou ${heal} PV.`, "green");
  if (!potionTutorialShown) {
    potionTutorialShown = true;
    addLog("Dica: poções também curam fora do combate — pressione B (X no teclado) quando estiver ferido.", "cyan");
  }
  showToast(`+${heal} PV`);
  spawnFloatingText(sxFor(player.x), syFor(player.y), `+${heal}`, COLORS.green);
  burst(sxFor(player.x), syFor(player.y), COLORS.green, CONFIG.LOOT_PARTICLE_COUNT, "heal");
  playSfx("potion");
  updateUI();
  saveCurrentRun();
  if (consumesTurn && gameState === "combat" && !inTurn) {
    blockWindow = false;
    pendingDmg = 0;
    inTurn = true;
    scheduleEnemyTurn();
  }
}

function playerGuard() {
  if (gameState !== "combat" || !currentEnemy) return;
  player.guarding = true;
  player.stamina = Math.min(player.maxStamina, player.stamina + 1);
  addLog("Você assume postura defensiva. O dano do próximo golpe será reduzido.", "gold");
  playSfx("block");
  inTurn = true;
  scheduleEnemyTurn();
  updateUI();
}

function applyPendingDamage(blocked, blockMilliseconds) {
  if (!currentEnemy || gameState !== "combat") return;
  attackTimingActive = false;
  attackTimingResolved = true;
  blockWindow = false;
  let dmg = pendingDmg;
  pendingDmg = 0;
  if (!blocked && player.dodgeChance > 0 && chance(player.dodgeChance)) {
    player.momentum = Math.min(CONFIG.MOMENTUM_MAX, player.momentum + CONFIG.MOMENTUM_GAIN_BLOCK);
    addLog(`${currentEnemy.name} ataca, mas você desvia por pura intuição — Presságio!`, "gold");
    spawnFloatingText(sxFor(player.x), syFor(player.y), "ESQUIVA!", COLORS.gold);
    playSfx("step");
    player.guarding = false;
    updateUI();
    return;
  }
if (blocked) {
    const perfect = blockMilliseconds != null && blockMilliseconds < CONFIG.RIPOSTE_WINDOW_FRACTION;
    player.stamina = Math.min(player.maxStamina, player.stamina + CONFIG.STAMINA_REGEN_PER_TURN + (perfect ? CONFIG.STAMINA_PERFECT_BLOCK_BONUS : 0));
    dmg = guardedDamage(dmg, false, true); // divisor aplicado a todo golpe bloqueado
    player.momentum = Math.min(CONFIG.MOMENTUM_MAX, player.momentum + (perfect ? CONFIG.MOMENTUM_GAIN_PERFECT : CONFIG.MOMENTUM_GAIN_BLOCK));
    playSfx("block");
    if (perfect) {
      addLog("RIPOSTE! Defesa perfeita e contra-ataque cristalino!", "gold");
      showToast("RIPOSTE!", CONFIG.TOAST_SHORT_MS);
      spawnEffect("spark", sxFor(player.x), syFor(player.y), "", COLORS.gold, { life: 18, size: 3 });
      burst(sxFor(player.x), syFor(player.y), COLORS.gold, CONFIG.SPECIAL_PARTICLE_COUNT, "spark");
      if (currentEnemy) {
        const rip = attackRoll(player.atk, currentEnemy.def, { atkMult: CONFIG.RIPOSTE_POWER, variance: 0 });
        currentEnemy.hp = Math.max(0, currentEnemy.hp - rip);
        currentEnemy.hitPulse = 8;
        spawnFloatingText(sxFor(currentEnemy.x), syFor(currentEnemy.y), `-${rip}`, COLORS.gold);
        addLog(`O contra-ataque atinge ${currentEnemy.name} por ${rip}.`, "gold");
        if (currentEnemy.hp <= 0) {
          runWhenState("combat", endCombatVictory, CONFIG.COMBAT_AFTER_BLOCK_DELAY_MS);
          player.guarding = false;
          updateUI();
          return;
        }
      }
    } else {
      addLog("Defesa Perfeita! Dano reduzido pela metade.", "gold");
    }
    showToast(perfect ? "RIPOSTE!" : "DEFESA PERFEITA!", CONFIG.TOAST_SHORT_MS);
    burst(sxFor(player.x), syFor(player.y), COLORS.blue, CONFIG.LOOT_PARTICLE_COUNT, "spark");
    spawnEffect("spark", sxFor(player.x), syFor(player.y), "", COLORS.blue, { life: 16, size: 2 });
}
  dmg = effectiveIncomingDamage(dmg);
  player.hp = Math.max(0, player.hp - dmg);
  if (!blocked) {
    player.combo = 0;
    player.comboMult = 0;
    player.timingCombo = 0;
    player.timingComboMult = 0;
    addLog("O dano interrompeu seu ritmo! Combo perdido.", "muted");
  }
  if (currentEnemy && currentEnemy.affix === "venomous" && !blocked) {
    addStatus(player, "bleed", 3, venomBleedPower(currentEnemy.level));
    addLog(`${currentEnemy.name} envenena a lâmina! Você está sangrando.`, "red");
  }
player.hitPulse = blocked ? 6 : 10;
  addLog(`${currentEnemy.name} atacou. Você sofreu ${dmg}.`, dmg >= 10 ? "red" : "");
  spawnFloatingText(sxFor(player.x), syFor(player.y), `-${dmg}`, COLORS.red);
  spawnEffect("slash", sxFor(player.x), syFor(player.y), "", COLORS.red, { life: 16, size: 2 });
  if (!blocked) burst(sxFor(player.x), syFor(player.y), COLORS.red, 7, "spark");
  shakeFrom(sxFor(currentEnemy.x), syFor(currentEnemy.y), sxFor(player.x), syFor(player.y), blocked ? 3 : 7);
  flashOf(blocked ? COLORS.blue : COLORS.red, blocked ? 3 : 5);
  if (dmg >= 10 && !reducedMotion) freezeFrames = blocked ? CONFIG.FREEZE_FRAMES_BLOCK : CONFIG.FREEZE_FRAMES_HEAVY_HIT;
  if (!blocked) playSfx("hurt");
  vibrate(dmg >= 10 ? [40, 30, 40] : CONFIG.VIBRATE_MEDIUM);
if ((player.thornShield > 0 || player.ironGuardThorn > 0) && currentEnemy) {
    const reflect = Math.max(1, Math.floor(player.def * CONFIG.THORN_REFLECT_RATIO));
    currentEnemy.hp = Math.max(0, currentEnemy.hp - reflect);
    currentEnemy.hitPulse = 8;
    addLog(`Espinhos de ferro refletem ${reflect}.`, "blue");
    spawnFloatingText(sxFor(currentEnemy.x), syFor(currentEnemy.y), `-${reflect}`, COLORS.blue);
    if (player.ironGuardThorn > 0) player.ironGuardThorn = 0;
  }
  player.guarding = false;
  updateUI();

  if (currentEnemy && currentEnemy.hp <= 0) {
    runWhenState("combat", endCombatVictory, CONFIG.COMBAT_AFTER_ENEMY_TURN_DELAY_MS);
  } else if (player.hp <= 0) {
    if (handlePlayerDown()) {
      runWhenState("combat", gameOver, CONFIG.COMBAT_AFTER_GAMEOVER_DELAY_MS);
    } else {
      inTurn = false;
      if (player.specialCd > 0) player.specialCd--;
      regeneratePlayerStamina();
      addLog("Seu turno.");
      updateUI();
    }
  } else {
    runWhenState("combat", () => {
      inTurn = false;
      if (player.specialCd > 0) player.specialCd--;
      regeneratePlayerStamina();
      addLog("Seu turno.");
      updateUI();
    }, CONFIG.COMBAT_AFTER_ENEMY_TURN_DELAY_MS);
  }
}

function regeneratePlayerStamina() {
  if (!player) return;
  const before = player.stamina;
  player.stamina = Math.min(player.maxStamina, player.stamina + CONFIG.STAMINA_REGEN_PER_TURN);
  if (before === 0 && player.stamina > 0) {
    addLog("Stamina recuperada: você pode atacar de novo!", "green");
  }
}

function doBossPattern() {
  const boss = currentEnemy;
  if (!boss) return;
  const x = sxFor(player.x), y = syFor(player.y);
  const ex = sxFor(boss.x), ey = syFor(boss.y);

  // Golpe carregado: descarrega a fúria acumulada no turno anterior.
  if (boss.intent) {
    const charged = boss.intent;
    boss.intent = null;
    boss.telegraphCooldown = 2;
    addLog(`${boss.name} descarrega sua fúria rubra!`, "red");
    showToast("FÚRIA!", CONFIG.TOAST_MS);
    burst(ex, ey, COLORS.orange, 14, "spark");
    playSfx("boom");
    if (boss.phase2) {
      const dmg = effectiveIncomingDamage(attackRoll(charged.power, player.def, { atkMult: 0.7, variance: 0, roundAtk: true }));
      player.hp = Math.max(0, player.hp - dmg);
      player.hitPulse = 10;
      addStatus(player, "burn", 2, Math.max(2, Math.floor(player.maxHp * CONFIG.BOSS_BURN_POWER_RATIO)));
      addLog(`Rajada ardente! -${dmg} PV e você QUEIMA.`, "red");
      spawnFloatingText(x, y, `-${dmg}`, COLORS.orange);
      burst(x, y, COLORS.orange, 18, "spark");
      shake = 10;
      finishEnemyTurn();
      return;
    }
    openBlockWindow(charged.power, `${boss.name} investe com o machado colossal! Defenda-se apertando A!`);
    return;
  }

  const p = bossPatternIndex(boss.bossPattern, boss.phase2);
  boss.bossPattern = (boss.bossPattern || 0) + 1;

  if (!boss.phase2) {
    if (p === 0) {
      boss.intent = { power: attackRoll(boss.atk, 0, { atkMult: CONFIG.TELEGRAPH_POWER_MULT, variance: 0, roundAtk: true }) };
      addLog(`${boss.name} ergue o machado, concentrando energia rubra...`, "orange");
      showToast("PREPARAÇÃO!", CONFIG.TOAST_MS);
      burst(ex, ey, COLORS.orange, 8, "spark");
      playSfx("ominous");
      finishEnemyTurn();
    } else if (p === 1) {
const drain = effectiveIncomingDamage(attackRoll(boss.atk, player.def, { atkMult: 0.8, variance: 3 }));
      player.hp = Math.max(0, player.hp - drain);
      player.hitPulse = 10;
      const heal = Math.min(boss.maxHp - boss.hp, drain);
      boss.hp += heal;
      addLog(`${boss.name} drena sua energia vital! -${drain} PV e se cura ${heal}.`, "red");
      spawnFloatingText(x, y, `-${drain}`, COLORS.red);
      spawnFloatingText(ex, ey - 8, `+${heal}`, COLORS.green);
      burst(x, y, COLORS.red, 10, "spark");
      playSfx("hurt");
      finishEnemyTurn();
    } else {
      const dmg = attackRoll(boss.atk, player.def, { variance: 4, defDiv: 1 });
      openBlockWindow(dmg, `${boss.name} desfere uma rajada de golpes! Defenda-se apertando A!`);
    }
    return;
  }

  // FASE 2 — mais cruel e imprevisível.
  if (p === 0) {
    const dmg = effectiveIncomingDamage(attackRoll(boss.atk, player.def, { atkMult: 0.9, variance: 0, defDiv: 1 }));
    player.hp = Math.max(0, player.hp - dmg);
    player.hitPulse = 10;
    addStatus(player, "burn", 2, Math.max(2, Math.floor(player.maxHp * CONFIG.BOSS_BURN_POWER_RATIO)));
    addLog(`${boss.name} coça o ar em chamas rubras! -${dmg} PV e você QUEIMA.`, "red");
    spawnFloatingText(x, y, `-${dmg}`, COLORS.orange);
    burst(x, y, COLORS.orange, 18, "spark");
    shake = 10; playSfx("boom");
    finishEnemyTurn();
  } else if (p === 1) {
    addStatus(player, "stun", 1);
    addLog(`${boss.name} solta um grito que estilhaça pedra! Você está atordoado.`, "gold");
    showToast("ATORDOADO", CONFIG.TOAST_SHORT_MS);
    burst(x, y, COLORS.gold, 12, "spark");
    playSfx("ominous");
    finishEnemyTurn();
  } else if (p === 2) {
    if (player.momentum > 0 || player.combo > 0) {
      player.momentum = 0;
      player.combo = 0;
      player.comboMult = 0;
      addLog(`${boss.name} pulsa com energia rubra e anula seu Momentum e Combo!`, "purple");
      spawnFloatingText(x, y, "MOMENTUM ZERADO", COLORS.purple);
    } else {
      const dmg = effectiveIncomingDamage(attackRoll(boss.atk, player.def, { atkMult: 0.7, variance: 0, defDiv: 1 }));
      player.hp = Math.max(0, player.hp - dmg);
      player.hitPulse = 10;
      addLog(`${boss.name} avança sem aviso! -${dmg} PV.`, "red");
      spawnFloatingText(x, y, `-${dmg}`, COLORS.red);
    }
    burst(x, y, COLORS.purple, 14, "spark");
    playSfx("ominous");
    finishEnemyTurn();
  } else {
    const drain = attackRoll(boss.atk, player.def, { atkMult: 0.8, variance: 3 });
    player.hp = Math.max(0, player.hp - drain);
    player.hitPulse = 10;
    const heal = Math.min(boss.maxHp - boss.hp, drain);
    boss.hp += heal;
    addLog(`${boss.name} drena sua energia vital! -${drain} PV e se cura ${heal}.`, "red");
    spawnFloatingText(x, y, `-${drain}`, COLORS.red);
    spawnFloatingText(ex, ey - 8, `+${heal}`, COLORS.green);
    burst(x, y, COLORS.red, 10, "spark");
    playSfx("hurt");
    finishEnemyTurn();
  }
}

function rollEnemyIntent() {
  if (!currentEnemy) return null;
  const INTENT_UI = {
    unleash: ["GOLPE CARREGADO", COLORS.red],
    charge: ["CARREGAR", COLORS.orange],
    drain: ["DRENAR", COLORS.red],
    attack: ["ATACAR", COLORS.red],
    fire: ["RAJADA", COLORS.orange],
    stun: ["GRITO", COLORS.gold],
    purge: ["PULSAR", COLORS.purple],
    assist: ["APOIO ALIADO", COLORS.purple],
    special: ["HABILIDADE", COLORS.gold]
  };
  const action = decideEnemyAction(currentEnemy);
  const [label, color] = INTENT_UI[action];
  return { type: action, label, color };
}

function enemyTurn() {
  if (!currentEnemy || gameState !== "combat") return;

  if (currentEnemy.stagger > 0) {
    currentEnemy.stagger = Math.max(0, currentEnemy.stagger - CONFIG.STAGGER_RECOVERY_PER_TURN);
  }
  if (currentEnemy.telegraphCooldown > 0) currentEnemy.telegraphCooldown--;

  const statusResult = processStatusTurn(currentEnemy);
  if (statusResult) {
    if (statusResult.dmg) {
      addLog(`${currentEnemy.name} ${statusResult.type === "bleed" ? "sangra" : "queima"} e perde ${statusResult.dmg} PV.`, "red");
      spawnFloatingText(sxFor(currentEnemy.x), syFor(currentEnemy.y), `-${statusResult.dmg}`, statusResult.type === "bleed" ? COLORS.red : COLORS.orange);
      burst(sxFor(currentEnemy.x), syFor(currentEnemy.y), statusResult.type === "bleed" ? COLORS.red : COLORS.orange, 5, "spark");
    }
    if (currentEnemy.hp <= 0) {
      runWhenState("combat", endCombatVictory, CONFIG.COMBAT_AFTER_ENEMY_TURN_DELAY_MS);
      return;
    }
    if (statusResult.skipTurn || statusResult.type === "stun") {
      currentEnemy.intent = null;
      currentEnemy.telegraphCooldown = 2;
      addLog(`${currentEnemy.name} está atordoado e perde o turno.`, "gold");
      showToast("ATORDOADO", CONFIG.TOAST_SHORT_MS);
      runWhenState("combat", () => {
        inTurn = false;
        if (player.specialCd > 0) player.specialCd--;
        regeneratePlayerStamina();
        addLog("Seu turno.");
        updateUI();
      }, CONFIG.COMBAT_AFTER_STUN_DELAY_MS);
      return;
    }
  }

  if (currentEnemy.hp <= 0) { endCombatVictory(); return; }

  // Boss: padrões de ataque em rotação própria.
  if (currentEnemy.boss) {
    doBossPattern();
    return;
  }

  // Elite affix: regeneration + synergy aura regen
  const synergy = currentEnemy.synergy && currentEnemy.synergy.allies.length > 0 ? currentEnemy.synergy : null;
  if (synergy && synergy.regen > 0 && currentEnemy.hp < currentEnemy.maxHp) {
    const regen = Math.max(1, Math.round(currentEnemy.maxHp * synergy.regen));
    currentEnemy.hp = Math.min(currentEnemy.maxHp, currentEnemy.hp + regen);
    addLog(`O aliado de ${currentEnemy.name} o regenera em ${regen} PV.`, "green");
    spawnFloatingText(sxFor(currentEnemy.x), syFor(currentEnemy.y), `+${regen}`, COLORS.green);
  }
  if (currentEnemy.affix === "regenerating" && currentEnemy.hp < currentEnemy.maxHp) {
    const regen = Math.max(1, Math.round(currentEnemy.maxHp * CONFIG.REGENERATING_HEAL_RATIO));
    currentEnemy.hp = Math.min(currentEnemy.maxHp, currentEnemy.hp + regen);
    addLog(`${currentEnemy.name} regenera ${regen} PV.`, "green");
    spawnFloatingText(sxFor(currentEnemy.x), syFor(currentEnemy.y), `+${regen}`, COLORS.green);
  }

// Synergy assist: an ally can support the engaged enemy instead of the normal attack.
  const intent = currentEnemy.nextIntent || rollEnemyIntent();
  currentEnemy.nextIntent = null;
  if (intent.type === "assist" && synergy) {
    const ally = synergy.allies[rand(0, synergy.allies.length - 1)];
    const assistHeal = Math.max(1, Math.round(currentEnemy.maxHp * CONFIG.SYNERGY_ASSIST_HEAL_RATIO));
    currentEnemy.hp = Math.min(currentEnemy.maxHp, currentEnemy.hp + assistHeal);
    currentEnemy.intent = null;
    currentEnemy.telegraphCooldown = 0;
    addLog(`${ally.name} apoia o aliado e cura ${assistHeal} PV!`, "purple");
    showToast("APOIO!", CONFIG.TOAST_SHORT_MS);
    spawnFloatingText(sxFor(currentEnemy.x), syFor(currentEnemy.y), `+${assistHeal}`, COLORS.purple);
    burst(sxFor(currentEnemy.x), syFor(currentEnemy.y), COLORS.purple, 8, "spark");
    playSfx("heal");
    updateUI();
    runWhenState("combat", () => {
      inTurn = false;
      if (player.specialCd > 0) player.specialCd--;
      regeneratePlayerStamina();
      addLog("Seu turno.");
      updateUI();
    }, CONFIG.COMBAT_AFTER_ENEMY_TURN_DELAY_MS);
    return;
  }

if (intent.type === "special" && doEnemySpecial()) return;

  // Telegraph: if the enemy charged last turn, the big hit lands now.
  if (intent.type === "unleash" && currentEnemy.intent) {
    const charged = currentEnemy.intent;
    currentEnemy.intent = null;
    currentEnemy.telegraphCooldown = 2;
    addLog(`${currentEnemy.name} descarrega seu golpe carregado!`, "red");
    showToast("GOLPE CARREGADO!", CONFIG.TOAST_MS);
    burst(sxFor(currentEnemy.x), syFor(currentEnemy.y), COLORS.orange, 10, "spark");
    openBlockWindow(charged.power, `${currentEnemy.name} ataca com fúria!`);
    return;
  }

  // Or the enemy winds up, giving you a free turn to react.
  if (intent.type === "charge" && currentEnemy.telegraphCooldown === 0) {
    currentEnemy.intent = { power: attackRoll(currentEnemy.atk, 0, { atkMult: CONFIG.TELEGRAPH_POWER_MULT, variance: 0, roundAtk: true }) };
    addLog(`${currentEnemy.name} se prepara para um golpe devastador...`, "orange");
    showToast("PREPARAÇÃO!", CONFIG.TOAST_MS);
    burst(sxFor(currentEnemy.x), syFor(currentEnemy.y), COLORS.orange, 6, "spark");
    playSfx("ominous");
    updateUI();
    runWhenState("combat", () => {
      inTurn = false;
      if (player.specialCd > 0) player.specialCd--;
      regeneratePlayerStamina();
      addLog("Seu turno! O inimigo está carregando um ataque.", "cyan");
      updateUI();
    }, CONFIG.COMBAT_AFTER_ENEMY_TURN_DELAY_MS);
    return;
  }

  let dmg = attackRoll(currentEnemy.atk, player.def, { variance: 4, defDiv: 1, min: synergy ? synergy.auraAtk : 0 });
  dmg = guardedDamage(dmg, player.guarding, false);
  const critChance = chance(CONFIG.ENEMY_CRIT_CHANCE) || (currentEnemy.affix === "eldritch" && chance(CONFIG.ELITE_CRIT_EXTRA_CHANCE));
  if (critChance && !player.guarding) dmg = applyCrit(dmg, 1, CONFIG.ENEMY_CRIT_MULT);
  openBlockWindow(dmg, `${currentEnemy.name} prepara um golpe! Defenda-se apertando A!`);
}

function openBlockWindow(dmg, logText) {
  pendingDmg = dmg;
  if (player.blockChance > 0 && chance(player.blockChance)) {
    blockWindow = false;
    addLog("O Elmo do Guardião absorve o golpe por você!", "gold");
    showToast("BLOQUEIO!", CONFIG.TOAST_SHORT_MS);
    applyPendingDamage(true);
    return;
  }
  blockWindow = true;
  blockStartTs = performance.now();
  addLog(logText, "gold");
  updateUI();
  showToast("DEFENDA-SE!", CONFIG.TOAST_DEFEND_MS);
  if (!blockTutorialShown) {
    blockTutorialShown = true;
    addLog("Dica: defender (A) no começo da janela rende um RIPOSTE!", "cyan");
  }
  setTimeout(() => {
    if (blockWindow) {
      blockWindow = false;
      applyPendingDamage(false);
    }
  }, CONFIG.BLOCK_WINDOW_MS);
}

function doEnemySpecial() {
  const kind = currentEnemy.kind;
  const x = sxFor(player.x), y = syFor(player.y);

  if (kind === "bat") {
    addStatus(player, "stun", 1);
    addLog(`${currentEnemy.name} solta um grito sônico! Você está atordoado.`, "gold");
    showToast("ATORDOADO", 700);
    burst(x, y, COLORS.gold, 10, "spark");
    playSfx("ominous");
    finishEnemyTurn();
    return true;
  }
  if (kind === "goblin" && player.potions > 0) {
    player.potions--;
    addLog(`${currentEnemy.name} roubou uma poção da sua bolsa!`, "red");
    showToast("POÇÃO ROUBADA!", 700);
    burst(x, y, COLORS.red, 8, "spark");
    playSfx("trap");
    finishEnemyTurn();
    return true;
  }
  if (kind === "armor") {
    const bash = attackRoll(currentEnemy.atk, player.def, { atkMult: 1.4, variance: 0, defDiv: 1 });
    player.hp = Math.max(0, player.hp - bash);
    player.hitPulse = 12;
    addLog(`${currentEnemy.name} golpeia com o escudo! -${bash} PV.`, "red");
    spawnFloatingText(x, y, `-${bash}`, COLORS.red);
    burst(x, y, COLORS.orange, 12, "spark");
    shake = 10; playSfx("boom");
    finishEnemyTurn();
    return true;
  }
  if (kind === "specter") {
    currentEnemy.dodgeNext = true;
    addLog(`${currentEnemy.name} fica espectral e desaparece da sua mira.`, "purple");
    spawnFloatingText(sxFor(currentEnemy.x), syFor(currentEnemy.y), "FASE", COLORS.purple);
    burst(sxFor(currentEnemy.x), syFor(currentEnemy.y), COLORS.purple, 14, "spark");
    playSfx("ominous");
    finishEnemyTurn();
    return true;
  }
  if (kind === "golem") {
    const stomp = attackRoll(currentEnemy.atk, player.def, { atkMult: 1.3, variance: 0 });
    player.hp = Math.max(0, player.hp - stomp);
    player.hitPulse = 14;
    addLog(`${currentEnemy.name} bate o pé no chão! Onda de choque: -${stomp} PV.`, "red");
    spawnFloatingText(x, y, `-${stomp}`, COLORS.orange);
    burst(x, y, COLORS.orange, 18, "spark");
    shake = 12; flash = 8; playSfx("boom");
    finishEnemyTurn();
    return true;
  }
  if (kind === "wraith") {
    const drain = attackRoll(currentEnemy.atk, player.def, { atkMult: 0.8, variance: 3 });
    player.hp = Math.max(0, player.hp - drain);
    player.hitPulse = 10;
    const heal = Math.min(currentEnemy.maxHp - currentEnemy.hp, drain);
    currentEnemy.hp += heal;
    addLog(`${currentEnemy.name} drena sua energia! -${drain} PV e se cura ${heal}.`, "red");
    spawnFloatingText(x, y, `-${drain}`, COLORS.red);
    spawnFloatingText(sxFor(currentEnemy.x), syFor(currentEnemy.y) - 8, `+${heal}`, COLORS.green);
    burst(x, y, COLORS.purple, 10, "spark");
    playSfx("hurt");
    finishEnemyTurn();
    return true;
  }
  return false;
}

function finishEnemyTurn() {
  player.guarding = false;
  updateUI();
  if (currentEnemy && currentEnemy.hp <= 0) {
    runWhenState("combat", endCombatVictory, CONFIG.COMBAT_AFTER_ENEMY_TURN_DELAY_MS);
  } else if (player.hp <= 0) {
    if (handlePlayerDown()) {
      runWhenState("combat", gameOver, CONFIG.COMBAT_AFTER_GAMEOVER_DELAY_MS);
    } else {
      inTurn = false;
      if (player.specialCd > 0) player.specialCd--;
      regeneratePlayerStamina();
      addLog("Seu turno.");
      updateUI();
    }
  } else {
    runWhenState("combat", () => {
      inTurn = false;
      if (player.specialCd > 0) player.specialCd--;
      regeneratePlayerStamina();
      addLog("Seu turno.");
      updateUI();
    }, CONFIG.COMBAT_AFTER_ENEMY_TURN_DELAY_MS);
  }
}

function endCombatVictory() {
const defeated = currentEnemy;
  const defeatedName = defeated.name;
  const defeatedBoss = !!defeated.boss;
  const defeatedAffix = defeated.affix;
  const defeatedXp = defeated.xp;
  defeated.alive = false;
  triggerKillSlowMo();
  if (defeated.boss) triggerBossDeathCinema();
  playSfx("victory", { pitch: defeated.boss ? -1 : 0 });
  if (defeated.boss) bossDefeated = true;
  runStats.kills++;
  floorKills++;
meta.kills = (meta.kills || 0) + 1;
  if (defeated.boss) meta.bossDefeated = true;
  if (defeatedAffix) meta.elitesKilled = (meta.elitesKilled || 0) + 1;
  saveMeta(meta);
  checkAchievements();
  blockWindow = false;
  pendingDmg = 0;

  const defeatedIdx = enemies.indexOf(defeated);
  if (defeatedIdx >= 0) enemies.splice(defeatedIdx, 1);
  releaseEnemy(defeated);

  gameState = "explore";
  currentEnemy = null;
  inTurn = false;
  resetAtbState();

  if (player.activeSlot > 0) {
    const m = player.monsters[player.activeSlot - 1];
    if (m) readPlayerToMonster(m, player);
    restoreChampion(player, player.championSnapshot);
    player.championSnapshot = null;
    player.activeSlot = 0;
  }
  for (const m of player.monsters || []) gainMonsterXp(m, defeatedXp);

  addLog(`${defeatedName} foi derrotado!`, defeatedBoss ? "gold" : "green");
  if (player.killHeal && !defeatedBoss) {
    const heal = Math.min(player.maxHp - player.hp, player.killHeal);
    player.hp += heal;
    if (heal > 0) {
      spawnFloatingText(sxFor(player.x), syFor(player.y), `+${heal}`, COLORS.green);
      addLog(`A Lágrima da Cripta cura ${heal} PV.`, "green");
    }
  }
const goldDrop = (defeatedBoss ? 30 + (currentFloor - 1) * 5 : 3 + Math.floor(defeatedXp / 3) + Math.floor((currentFloor - 1) * 1.5));
  player.gold += goldDrop;
  if (goldDrop > 0) {
    meta.runGold = (meta.runGold || 0) + goldDrop;
    saveMeta(meta);
    spawnFloatingText(sxFor(player.x), syFor(player.y) - 8, `+${goldDrop}`, COLORS.gold);
    addLog(`Você ganhou ${goldDrop} ouro.`, "gold");
  }
  const leveled = gainXp(player, defeatedXp);
  if (leveled) {
    showToast(`LEVEL UP! ${player.level}`);
    burst(sxFor(player.x), syFor(player.y), COLORS.gold, CONFIG.LEVEL_UP_PARTICLE_COUNT, "spark");
    playSfx("level");
  }
  addLog(`Você recebeu ${defeatedXp} XP.`, "blue");
  tryOpenTalentDialog();

  if (defeatedBoss) {
    addLog("O selo rubro caiu. A saída está aberta!", "gold");
    showToast("CHEFÃO DERROTADO!", CONFIG.BOSS_DEFEATED_TOAST_MS);
  }

  stopMusic();
  startMusic({ floor: currentFloor });
  updateUI();
  saveCurrentRun();
}

function gameOver() {
  blockWindow = false;
  pendingDmg = 0;
  resetAtbState();
  gameState = "gameover";
  meta.bestLevel = Math.max(meta.bestLevel, player ? player.level : 1);
  saveMeta(meta);
  checkAchievements();
  if (difficulty === "normal") clearRun();
  else {
    // Modo assistido: preserva o save para permitir continuar a expedição.
    flushCurrentRunSave();
    addLog("A cripta poupa sua lembrança — você pode continuar no menu.", "green");
  }
  playSfx("death");
  addLog("Você tombou na escuridão da cripta...", "red");
  addLog(`Run: ${runStats.kills} abates, ${runStats.relics} relíquias, ${runStats.chests} baús.`);
  showToast("FIM DE JOGO", 2000);
  stopMusic();
  updateUI();
}

function winGame() {
  gameState = "win";
  meta.wins++;
  meta.bestLevel = Math.max(meta.bestLevel, player.level);
  saveMeta(meta);
  checkAchievements();
  clearRun();
  addLog("A saída se abre. A cripta respira pela última vez.", "gold");
  addLog(`Vitória #${meta.wins}! ${runStats.kills} abates, ${runStats.relics} relíquias.`, "green");
  showToast("VITÓRIA!", 2200);
  playSfx("win");
  stopMusic();
  updateUI();
}

// =============================================================
// UI
// =============================================================
function updateUI() {
  if (!player) {
    const emptyHtml = `
      <div class="hudStat"><span class="hudLabel">Classe <em>--</em></span><strong>Selecione</strong></div>
      <div class="hudStat"><span class="hudLabel">PV <em>--</em></span><span class="hudBar"><i style="--fill:0%;--bar:var(--green)"></i></span></div>
      <div class="hudStat"><span class="hudLabel">XP <em>--</em></span><span class="hudBar"><i style="--fill:0%;--bar:var(--blue)"></i></span></div>
      <div class="hudStat"><span class="hudLabel">Bolsa <em>--</em></span><strong>Poções</strong></div>
    `;
    if (lastStatsHtml !== emptyHtml) { statsEl.innerHTML = emptyHtml; lastStatsHtml = emptyHtml; }
    aLabel.textContent = "OK";
    bLabel.textContent = "VOLTAR";
    pauseBtn.style.visibility = "hidden";
    return;
  }

  const hpFill = `${Math.max(0, Math.floor((player.hp / player.maxHp) * 100))}%`;
  const xpFill = `${Math.max(0, Math.floor((player.xp / player.nextXp) * 100))}%`;
  const enemyFill = currentEnemy ? `${Math.max(0, Math.floor((currentEnemy.hp / currentEnemy.maxHp) * 100))}%` : "0%";
  const skillText = player.specialCd > 0 ? `CD ${player.specialCd}` : "PRONTA";
  const momPct = Math.min(1, player.momentum ? player.momentum / CONFIG.MOMENTUM_MAX : 0);
  const comboTag = player.combo >= 2 ? ` · COMBO x${player.combo}` : "";
  const statsHtml = `
    <div class="hudStat"><span class="hudLabel">Classe <em>Nv.${player.level}</em></span><strong>${player.className}</strong></div>
    <div class="hudStat"><span class="hudLabel">PV <em>${player.hp}/${player.maxHp}</em></span><span class="hudBar"><i style="--fill:${hpFill};--bar:var(--green)"></i></span></div>
    <div class="hudStat"><span class="hudLabel">Andar ${currentFloor}/${FINAL_FLOOR} <em>XP ${player.xp}/${player.nextXp}</em></span><span class="hudBar"><i style="--fill:${xpFill};--bar:var(--blue)"></i></span></div>
    <div class="hudStat"><span class="hudLabel">${currentEnemy ? "Inimigo" : "Bolsa"} <em>${currentEnemy ? `${currentEnemy.hp}/${currentEnemy.maxHp}` : `${player.potions}`}</em></span>${currentEnemy ? `<span class="hudBar"><i style="--fill:${enemyFill};--bar:var(--red)"></i></span>` : `<strong>${player.potions} poções · ${player.gold} ouro · ${player.relicNames.length} rel.</strong>`}</div>
    <div class="hudStat hudMomentum ${momPct >= 1 ? "momentumFull" : ""}"><span class="hudLabel">Momentum ${comboTag} <em>${Math.floor(momPct * 100)}%</em></span><span class="hudBar"><i style="--fill:${Math.floor(momPct * 100)}%;--bar:var(--gold)"></i></span></div>
    ${gameState === "combat" && combatMode === "turn" ? `<div class="hudStat"><span class="hudLabel">Fôlego <em>${player.stamina}/${player.maxStamina}</em></span><span class="hudBar"><i style="--fill:${Math.floor((player.stamina / player.maxStamina) * 100)}%;--bar:var(--blue)"></i></span></div>` : ""}
  `;
  if (lastStatsHtml !== statsHtml) { statsEl.innerHTML = statsHtml; lastStatsHtml = statsHtml; }

  const aBtn = aLabel.parentElement;
  const bBtnEl = bLabel.parentElement;
  if (gameState === "combat") {
if (combatMode === "action") {
      const canPotion = player.hp <= Math.floor(player.maxHp * CONFIG.POTION_AUTO_HP_RATIO) && player.potions > 0;
      aLabel.textContent = player.momentum >= CONFIG.MOMENTUM_MAX ? (player.specialCd <= 0 ? "ESPECIAL" : "SURTO") : "ATAQUE";
      aBtn.classList.remove("blockActive");
      bLabel.textContent = canPotion ? "POÇÃO" : "ESQUIVA";
      bBtnEl.classList.remove("cdActive");
    } else if (blockWindow) {
      aLabel.textContent = "DEFENDER!";
      aBtn.classList.add("blockActive");
      bLabel.textContent = player.hp <= Math.floor(player.maxHp * CONFIG.POTION_AUTO_HP_RATIO) && player.potions > 0 ? "POÇÃO" : skillText;
    } else {
      aLabel.textContent = "ATK";
      aBtn.classList.remove("blockActive");
      bLabel.textContent = player.hp <= Math.floor(player.maxHp * CONFIG.POTION_AUTO_HP_RATIO) && player.potions > 0 ? "POÇÃO" : skillText;
      const bOnCd = player.specialCd > 0 && bLabel.textContent !== "POÇÃO";
      bBtnEl.classList.toggle("cdActive", bOnCd);
    }
  } else {
    aBtn.classList.remove("blockActive");
    bBtnEl.classList.remove("cdActive");
    if (gameState === "explore") { aLabel.textContent = "VER"; bLabel.textContent = "POÇÃO"; }
    else if (gameState === "paused") { aLabel.textContent = "OK"; bLabel.textContent = "FECHAR"; }
    else { aLabel.textContent = "OK"; bLabel.textContent = "MENU"; }
  }
  pauseBtn.style.visibility = (gameState === "explore" || gameState === "combat" || gameState === "paused") ? "visible" : "hidden";
}

function actionA() {
  if (gameState === "combatTransition") return;
  if (gameState === "combat") {
    if (combatMode === "action") { actionPlayerAttack(); return; }
    if (commandMenuOpen) { confirmCommand(commandMenuIndex); return; }
    if (blockWindow) { blockWindow = false; applyPendingDamage(true, performance.now() - blockStartTs); return; }
    playerAttack(false);
  } else if (gameState === "bossIntro" && mentorDialog) finishMentorDialog();
  else if (gameState === "bossIntro" && shopDialog) buyShopItem();
  else if (gameState === "bossIntro" && eventDialog) chooseEventChoice(eventDialog.selected);
  else if (gameState === "bossIntro" && talentDialog) chooseTalent(talentDialog.selected);
  else if (gameState === "explore") inspectAhead();
  else if (gameState === "paused") closePauseMenu();
  else if (gameState === "win" || gameState === "gameover") restartToMenu();
}

function inspectAhead() {
  if (!player) return;
  const dir = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[player.dir];
  const tx = player.x + dir[0], ty = player.y + dir[1];
  const enemy = occupiedByEnemy(tx, ty);
  const item = itemAt(tx, ty);

  if (enemy) addLog(`À frente: ${enemy.name}.`);
  else if (item) {
    if (item.type === "mentor") { startMentorDialog(item); return; }
    if (item.type === "shop") { addLog("À frente: um mercador errante espera compradores.", "gold"); return; }
    if (item.type === "event") { startEventDialog(item); return; }
    const labels = { potion: "uma poção cintila", chest: "um baú selado espera", shrine: "um altar pulsa", trap: "o piso parece suspeito" };
    addLog(`À frente: ${labels[item.type] || "algo estranho"}.`, item.type === "trap" ? "red" : item.type === "shrine" ? "purple" : "green");
  } else if (!isWalkable(dungeon, tx, ty)) addLog(LORE_FRAGMENTS[rand(0, LORE_FRAGMENTS.length - 1)], "purple");
  else if (tx === exitTile.x && ty === exitTile.y) {
    if (currentFloor < FINAL_FLOOR) addLog("Uma escada desce para o próximo andar.", "gold");
    else addLog(bossDefeated ? "A saída está aberta." : "A saída pulsa com um selo rubro.");
  } else addLog(LORE_FRAGMENTS[rand(0, LORE_FRAGMENTS.length - 1)], "purple");
}

// =============================================================
// RENDERING
// =============================================================
function updateFixedStep() {
  if (freezeFrames > 0) { freezeFrames--; return; }
  tick++;
  setTick(tick);
  camera.rx += (camera.x - camera.rx) * CONFIG.CAMERA_FOLLOW_SPEED;
  camera.ry += (camera.y - camera.ry) * CONFIG.CAMERA_FOLLOW_SPEED;
  if (player) {
    const follow = CONFIG.PLAYER_FOLLOW_SPEED;
    player.rx += (player.x - player.rx) * follow;
    player.ry += (player.y - player.ry) * follow;
    if (player.movePulse > 0) player.movePulse = Math.max(0, player.movePulse - 1);
    if (player.hitPulse > 0) player.hitPulse = Math.max(0, player.hitPulse - 1);
    if (player.attackPulse > 0) player.attackPulse = Math.max(0, player.attackPulse - 1);
  }
  if (gameState === "explore" && !inputFrozen) followMovePath();
  if (mouseHeld && gameState === "explore" && !inputFrozen) setMouseFollowPath();
  pollGamepad();
  if (gameState === "combat" && combatMode === "turn" && currentEnemy) updateAtbCombat();
  else if (gameState === "combat" && combatMode === "action" && currentEnemy) updateActionCombat();
  if (gameState === "combat" && combatMode === "action") updateActionBolts();
  if (tick % CONFIG.TOOLTIP_UPDATE_INTERVAL === 0) updateTooltip();
  if (floorTransition && floorTransition.fadeAlpha != null) {
    floorTransition.fadeAlpha = Math.max(0, floorTransition.fadeAlpha - CONFIG.FLOOR_TRANSITION_FADE_STEP);
  }
  if (bossIntroTimer > 0) bossIntroTimer = Math.max(0, bossIntroTimer - 1);
  for (const e of enemies) {
    if (e.hitPulse) e.hitPulse = Math.max(0, e.hitPulse - 1);
    if (e.stepPulse) e.stepPulse = Math.max(0, e.stepPulse - 1);
  }
updateMotes();
  if (slowMoTicks > 0) slowMoTicks--;
  if (shake > 0) { shake *= CONFIG.SHAKE_DAMPING; if (shake < CONFIG.SHAKE_MIN) shake = 0; }
  if (zoomPulse > 0) zoomPulse = Math.max(0, zoomPulse - CONFIG.ZOOM_PULSE_MAX / CONFIG.ZOOM_PULSE_TICKS);
  if (cinemaLetterbox !== cinemaLetterboxTarget) {
    const step = 1 / CONFIG.CINEMA_LETTERBOX_TICKS;
    cinemaLetterbox += cinemaLetterbox < cinemaLetterboxTarget ? step : -step;
    if (Math.abs(cinemaLetterbox - cinemaLetterboxTarget) < step) cinemaLetterbox = cinemaLetterboxTarget;
  }
  if (cinemaBossZoom !== 0) {
    cinemaBossZoom += (0 - cinemaBossZoom) / CONFIG.CINEMA_BOSS_ZOOM_TICKS;
    if (Math.abs(cinemaBossZoom) < 0.001) cinemaBossZoom = 0;
  }
  if (cinemaBossTremor > 0) cinemaBossTremor = Math.max(0, cinemaBossTremor - 1);
  if (cinemaSurgeFx > 0) cinemaSurgeFx = Math.max(0, cinemaSurgeFx - 1);
  if (cinemaSurgeScanline > 0) cinemaSurgeScanline = Math.max(0, cinemaSurgeScanline - 0.02);
  if (cinemaFloorSweep > 0) cinemaFloorSweep = Math.max(0, cinemaFloorSweep - 1);
  if (cinemaFloorScale > 0) cinemaFloorScale = Math.max(0, cinemaFloorScale - 0.008);
if (!reducedMotion && !reduceFlash) {
    if (flash > 0) flash = Math.max(0, flash - 1);
  } else if (reduceFlash) {
    flash = 0;
    if (shake > 0) shake = Math.max(0, shake - 1);
  }
  if (!reducedMotion) {
    if (tick % CONFIG.STATUS_PARTICLE_INTERVAL === 0) {
      spawnStatusParticles(player, camera.rx, camera.ry);
      for (const e of enemies) {
        if (e.alive && isDiscovered(dungeon, e.x, e.y)) spawnStatusParticles(e, camera.rx, camera.ry);
      }
    }
  }
  updateEffects();
  if (swipeTrail && swipeTrail.life > 0) swipeTrail.life--;
}

function draw() {
  try {
  if (!ctx || !CONFIG.CANVAS_W || !CONFIG.CANVAS_H) return;
  ctx.save();
  ctx.clearRect(0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);
  ctx.fillStyle = COLORS.void;
  ctx.fillRect(0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);

  if (!reducedMotion && !reduceFlash && shake > 0) {
    const sx = rand(-1, 1) * shake + (shakeDirX || 0) * shake * 0.6;
    const sy = rand(-1, 1) * shake + (shakeDirY || 0) * shake * 0.6;
    ctx.translate(Math.round(sx), Math.round(sy));
  }
  frameJitter();
  if (!reducedMotion && !reduceFlash && (zoomPulse > 0 || cinemaBossZoom !== 0)) {
    const cx = CONFIG.CANVAS_W / 2, cy = CONFIG.CANVAS_H / 2;
    const z = 1 + zoomPulse + cinemaBossZoom;
    ctx.translate(cx, cy);
    ctx.scale(z, z);
    ctx.translate(-cx, -cy);
  }

  if (gameState === "floorTransition" && floorTransition) {
    drawFloorTransition();
  } else if (gameState === "menu" || !player || !dungeon) {
    drawTitleBackdrop();
  } else if (gameState === "combat" && combatMode === "action" && currentEnemy && actionState) {
    drawActionArena(ctx);
  } else {
    drawDungeonView();
    drawItems(ctx, items, camera.rx, camera.ry, tick);
    drawExit();
    drawEnemiesOnMap();
    drawPlayer(ctx, player, camera.rx, camera.ry, tick);
    drawEffectsOnCanvas();
    drawAtmosphere();
drawAmbientMotes();
    if (!reducedMotion) drawTorchFlicker();
    drawHoverHighlight();
    drawMinimap();
    drawSwipeTrail();

    if (gameState === "combat" && currentEnemy) drawCombatPanel(ctx, currentEnemy, tick);
    if (gameState === "combat" && combatMode === "turn" && currentEnemy) drawAtbBars(ctx);
    if (gameState === "bossIntro") {
      if (mentorDialog) drawMentorDialogCanvas();
      else if (shopDialog) drawShopDialogCanvas();
      else if (eventDialog) drawEventDialogCanvas();
      else if (talentDialog) drawTalentDialogCanvas();
      else if (currentEnemy) drawBossIntro();
    }
    if (gameState === "win") drawEndBanner("VITÓRIA", COLORS.green);
    if (gameState === "gameover") drawEndBanner("FIM", COLORS.red);
  }

if (!reducedMotion && !reduceFlash && flash > 0) {
    ctx.globalAlpha = Math.min(1, flash / 12);
    ctx.fillStyle = flashColor || "#ffffff";
    ctx.fillRect(0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);
    ctx.globalAlpha = 1;
  }

  // Cinematic letterbox bars.
  if (cinemaLetterbox > 0) {
    const barH = Math.round(CONFIG.CANVAS_H * CONFIG.CINEMA_LETTERBOX_RATIO * cinemaLetterbox);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, CONFIG.CANVAS_W, barH);
    ctx.fillRect(0, CONFIG.CANVAS_H - barH, CONFIG.CANVAS_W, barH);
  }

  // Momentum surge shockwave ring.
  if (cinemaSurgeFx > 0) {
    const frac = 1 - cinemaSurgeFx / CONFIG.CINEMA_SURGE_SHOCKWAVE_TICKS;
    const r = frac * Math.max(CONFIG.CANVAS_W, CONFIG.CANVAS_H) * 0.6;
    ctx.strokeStyle = `rgba(255, 212, 92, ${(1 - frac) * 0.8})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(CONFIG.CANVAS_W / 2, CONFIG.CANVAS_H / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Low-HP tension vignette (explore + combat).
  if (player && player.maxHp > 0 && player.hp / player.maxHp <= CONFIG.CINEMA_LOWHP_RATIO && gameState !== "menu" && gameState !== "win" && gameState !== "gameover") {
    const pulse = 0.6 + 0.4 * Math.sin(tick / 10);
    const grad = ctx.createRadialGradient(CONFIG.CANVAS_W / 2, CONFIG.CANVAS_H / 2, Math.min(CONFIG.CANVAS_W, CONFIG.CANVAS_H) * 0.28, CONFIG.CANVAS_W / 2, CONFIG.CANVAS_H / 2, Math.max(CONFIG.CANVAS_W, CONFIG.CANVAS_H) * 0.75);
    grad.addColorStop(0, "rgba(200, 20, 40, 0)");
    grad.addColorStop(1, `rgba(200, 20, 40, ${CONFIG.CINEMA_LOWHP_VIGNETTE_ALPHA * pulse})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);
  }

  ctx.restore();
  drawPostProcess();
  } catch (e) {
    if (typeof addLog === "function") addLog(`Erro: ${e.message}`, "red");
  }
}

function drawTitleBackdrop() {
  const TILE = CONFIG.TITLE_BACKDROP_TILE;
  for (let y = 0; y < CONFIG.CANVAS_H; y += TILE) {
    for (let x = 0; x < CONFIG.CANVAS_W; x += TILE) {
      ctx.fillStyle = (x / TILE + y / TILE) % 2 ? "#11112b" : "#17173a";
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = "#24245b";
      ctx.fillRect(x + CONFIG.TITLE_BACKDROP_DECOR_X1, y + CONFIG.TITLE_BACKDROP_DECOR_Y1, 2, 2);
      ctx.fillRect(x + CONFIG.TITLE_BACKDROP_DECOR_X2, y + CONFIG.TITLE_BACKDROP_DECOR_Y2, 2, 2);
    }
  }
  drawSpriteBoss(ctx, ux(CONFIG.TITLE_BOSS_X), uy(CONFIG.TITLE_BOSS_Y), CONFIG.TITLE_BOSS_SCALE, tick);
  drawPixelText(ctx, "DUNGEON", ux(CONFIG.TITLE_TEXT_X), uy(CONFIG.TITLE_TEXT_Y), COLORS.gold, CONFIG.TITLE_TEXT_SCALE);
  drawPixelText(ctx, "16-BIT", ux(CONFIG.TITLE_SUB_X), uy(CONFIG.TITLE_SUB_Y), COLORS.purple, CONFIG.TITLE_TEXT_SCALE);
  drawPixelText(ctx, `VITÓRIAS ${meta.wins}  MELHOR NV ${meta.bestLevel}`, ux(CONFIG.TITLE_STATS_X), uy(CONFIG.TITLE_STATS_Y), COLORS.text, 1);
}

function drawFloorTransition() {
  ctx.fillStyle = COLORS.void;
  ctx.fillRect(0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);
  const pulse = Math.sin(tick / CONFIG.FLOOR_TRANSITION_PULSE_DIVISOR) * CONFIG.FLOOR_TRANSITION_PULSE_VAR;
  ctx.fillStyle = `rgba(255, 212, 92, ${CONFIG.FLOOR_TRANSITION_PULSE_ALPHA + pulse})`;
  ctx.fillRect(0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);

  // Sweeping cinematic light bars.
  if (cinemaFloorSweep > 0 && !reducedMotion) {
    const sweepProgress = 1 - cinemaFloorSweep / CONFIG.FLOOR_TRANSITION_TICKS;
    const sw = CONFIG.CINEMA_FLOOR_SWEEP_WIDTH;
    const y = sweepProgress * (CONFIG.CANVAS_H + sw * 2) - sw;
    const grad = ctx.createLinearGradient(0, y - sw, 0, y + sw);
    grad.addColorStop(0, "rgba(255, 212, 92, 0)");
    grad.addColorStop(0.5, `rgba(255, 224, 130, ${CONFIG.CINEMA_FLOOR_SWEEP_ALPHA})`);
    grad.addColorStop(1, "rgba(255, 212, 92, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, y - sw, CONFIG.CANVAS_W, sw * 2);
  }

  // Cinematic scale-in on the floor number.
  const scale = 1 + cinemaFloorScale;
  const tx = ux(CONFIG.FLOOR_TRANSITION_TEXT_X), ty = uy(CONFIG.FLOOR_TRANSITION_TEXT_Y);
  ctx.save();
  ctx.translate(tx, ty);
  ctx.scale(scale, scale);
  drawPixelText(ctx, `ANDAR ${floorTransition.floor}`, 0, 0, COLORS.gold, CONFIG.FLOOR_TRANSITION_TEXT_SCALE);
  ctx.restore();
  drawWrappedPixelText(ctx, floorTransition.message, ux(CONFIG.FLOOR_TRANSITION_MSG_X), uy(CONFIG.FLOOR_TRANSITION_MSG_Y), CONFIG.CANVAS_W - ux(CONFIG.FLOOR_TRANSITION_MSG_W_OFFSET), COLORS.text, 1);
  if (floorTransition.fadeAlpha > 0.01) {
    ctx.globalAlpha = floorTransition.fadeAlpha;
    ctx.fillStyle = COLORS.void;
    ctx.fillRect(0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);
    ctx.globalAlpha = 1;
  }
}

function drawBossIntro() {
  ctx.fillStyle = `rgba(120, 0, 20, ${CONFIG.BOSS_INTRO_BG_ALPHA})`;
  ctx.fillRect(0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);
  // Red cinematic vignette pulsing.
  if (!reducedMotion) {
    const vPulse = CONFIG.CINEMA_BOSS_VIGNETTE_ALPHA * (0.6 + 0.4 * Math.sin(tick / 6));
    const vGrad = ctx.createRadialGradient(CONFIG.CANVAS_W / 2, CONFIG.CANVAS_H / 2, 30, CONFIG.CANVAS_W / 2, CONFIG.CANVAS_H / 2, CONFIG.CANVAS_W * 0.7);
    vGrad.addColorStop(0, "rgba(120, 0, 20, 0)");
    vGrad.addColorStop(1, `rgba(120, 0, 20, ${vPulse})`);
    ctx.fillStyle = vGrad;
    ctx.fillRect(0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);
  }
  const boxX = ux(CONFIG.BOSS_INTRO_BOX_X), boxY = uy(CONFIG.BOSS_INTRO_BOX_Y), boxW = CONFIG.CANVAS_W - ux(CONFIG.BOSS_INTRO_BOX_W_OFFSET), boxH = uy(CONFIG.BOSS_INTRO_BOX_H);
  ctx.fillStyle = `rgba(5, 5, 16, ${CONFIG.BOSS_INTRO_BOX_BG_ALPHA})`;
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = COLORS.red;
  ctx.lineWidth = CONFIG.BOSS_INTRO_BOX_BORDER_WIDTH;
  ctx.strokeRect(boxX + CONFIG.BOSS_INTRO_BOX_BORDER_OFFSET, boxY + CONFIG.BOSS_INTRO_BOX_BORDER_OFFSET, boxW - 2, boxH - 2);
  // Text tremor while the boss is announced.
  const tremorX = (cinemaBossTremor > 0 && !reducedMotion) ? rand(-1, 1) : 0;
  const tremorY = (cinemaBossTremor > 0 && !reducedMotion) ? rand(-1, 1) : 0;
  drawWrappedPixelText(ctx, "GUARDIÃO: Tolos... Sua carne alimentará o Núcleo por mais um século!", boxX + ux(CONFIG.BOSS_INTRO_TEXT_X) + tremorX, boxY + uy(CONFIG.BOSS_INTRO_TEXT_Y) + tremorY, boxW - 20, COLORS.red, 1);
  // Boss silhouette behind the box.
  if (currentEnemy) {
    drawEntityGlow(ctx, CONFIG.CANVAS_W / 2, CONFIG.CANVAS_H - 30, COLORS.red, 0.4, tick);
    drawSpriteByKind(ctx, currentEnemy, CONFIG.CANVAS_W / 2, CONFIG.CANVAS_H - 22, 5, currentEnemy.color, tick);
  }
}

function drawMentorDialogCanvas() {
  ctx.fillStyle = `rgba(10, 18, 42, ${CONFIG.MENTOR_DIALOG_BG_ALPHA})`;
  ctx.fillRect(0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);
  const boxX = ux(CONFIG.MENTOR_DIALOG_BOX_X), boxY = uy(CONFIG.MENTOR_DIALOG_BOX_Y), boxW = CONFIG.CANVAS_W - ux(CONFIG.MENTOR_DIALOG_BOX_W_OFFSET), boxH = uy(CONFIG.MENTOR_DIALOG_BOX_H);
  ctx.fillStyle = `rgba(5, 10, 24, ${CONFIG.MENTOR_DIALOG_BOX_BG_ALPHA})`;
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = COLORS.blue;
  ctx.lineWidth = CONFIG.MENTOR_DIALOG_BOX_BORDER_WIDTH;
  ctx.strokeRect(boxX + CONFIG.MENTOR_DIALOG_BOX_BORDER_OFFSET, boxY + CONFIG.MENTOR_DIALOG_BOX_BORDER_OFFSET, boxW - 2, boxH - 2);
  drawPixelText(ctx, "ALMA PERDIDA", boxX + ux(CONFIG.MENTOR_DIALOG_TITLE_X), boxY + uy(CONFIG.MENTOR_DIALOG_TITLE_Y), COLORS.blue, 1);
  const body = mentorDialog.text.replace(/^ALMA PERDIDA:\s*/, "");
  drawWrappedUiText(ctx, body, boxX + ux(CONFIG.MENTOR_DIALOG_BODY_X), boxY + uy(CONFIG.MENTOR_DIALOG_BODY_Y), boxW - 20, COLORS.text, CONFIG.MENTOR_DIALOG_BODY_SIZE, CONFIG.MENTOR_DIALOG_BODY_LINE_H);
  if (Math.floor(tick / CONFIG.MENTOR_DIALOG_PROMPT_DIVISOR) % 2 === 0) drawPixelText(ctx, "A: CONTINUAR", boxX + boxW - ux(CONFIG.MENTOR_DIALOG_PROMPT_X_OFFSET), boxY + boxH - uy(CONFIG.MENTOR_DIALOG_PROMPT_Y_OFFSET), COLORS.gold, 1);
}

function drawShopDialogCanvas() {
  ctx.fillStyle = `rgba(10, 18, 42, ${CONFIG.MENTOR_DIALOG_BG_ALPHA})`;
  ctx.fillRect(0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);
  const boxX = ux(CONFIG.MENTOR_DIALOG_BOX_X), boxY = uy(CONFIG.MENTOR_DIALOG_BOX_Y), boxW = CONFIG.CANVAS_W - ux(CONFIG.MENTOR_DIALOG_BOX_W_OFFSET), boxH = uy(CONFIG.MENTOR_DIALOG_BOX_H);
  ctx.fillStyle = `rgba(5, 10, 24, ${CONFIG.MENTOR_DIALOG_BOX_BG_ALPHA})`;
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = COLORS.gold;
  ctx.lineWidth = CONFIG.MENTOR_DIALOG_BOX_BORDER_WIDTH;
  ctx.strokeRect(boxX + CONFIG.MENTOR_DIALOG_BOX_BORDER_OFFSET, boxY + CONFIG.MENTOR_DIALOG_BOX_BORDER_OFFSET, boxW - 2, boxH - 2);
  drawPixelText(ctx, "MERCADOR", boxX + CONFIG.MENTOR_DIALOG_TITLE_X, boxY + CONFIG.MENTOR_DIALOG_TITLE_Y, COLORS.gold, 2);
  drawPixelText(ctx, `OURO: ${player ? player.gold : 0}`, boxX + 10, boxY + 20, COLORS.gold, 1.6);
  let yy = boxY + CONFIG.MENTOR_DIALOG_BODY_Y;
  const itemScale = 2;
  const itemH = Math.round(CONFIG.MENTOR_DIALOG_BODY_LINE_H * 1.5);
  if (!shopDialog.offerings.length) {
    drawWrappedUiText(ctx, "Nada mais à venda.", boxX + CONFIG.MENTOR_DIALOG_BODY_X, yy, boxW - 20, COLORS.muted, CONFIG.MENTOR_DIALOG_BODY_SIZE, CONFIG.MENTOR_DIALOG_BODY_LINE_H);
  } else {
    shopDialog.offerings.forEach((o, i) => {
      const selected = i === shopDialog.selected;
      const color = selected ? COLORS.gold : COLORS.text;
      drawPixelText(ctx, `${selected ? "▶" : " "} ${o.name}`, boxX + CONFIG.MENTOR_DIALOG_BODY_X, yy, color, itemScale);
      drawPixelText(ctx, `${o.cost} ouro`, boxX + CONFIG.MENTOR_DIALOG_BODY_X + 44, yy + 18, COLORS.yellow, 1.4);
      yy += itemH;
    });
  }
  if (Math.floor(tick / CONFIG.MENTOR_DIALOG_PROMPT_DIVISOR) % 2 === 0) drawPixelText(ctx, "A: COMPRAR  B: SAIR", boxX + boxW - CONFIG.MENTOR_DIALOG_PROMPT_X_OFFSET - 30, boxY + boxH - CONFIG.MENTOR_DIALOG_PROMPT_Y_OFFSET, COLORS.blue, 1.6);
}

function drawEventDialogCanvas() {
  ctx.fillStyle = `rgba(24, 8, 20, 0.86)`;
  ctx.fillRect(0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);
  const def = EVENT_TYPES.find(e => e.id === eventDialog.eventId);
  const opts = EVENT_OPTIONS[def.id];
  const boxX = ux(CONFIG.MENTOR_DIALOG_BOX_X), boxY = uy(CONFIG.MENTOR_DIALOG_BOX_Y), boxW = CONFIG.CANVAS_W - ux(CONFIG.MENTOR_DIALOG_BOX_W_OFFSET), boxH = uy(CONFIG.MENTOR_DIALOG_BOX_H);
  ctx.fillStyle = `rgba(24, 8, 16, 0.92)`;
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = COLORS.purple;
  ctx.lineWidth = CONFIG.MENTOR_DIALOG_BOX_BORDER_WIDTH;
  ctx.strokeRect(boxX + CONFIG.MENTOR_DIALOG_BOX_BORDER_OFFSET, boxY + CONFIG.MENTOR_DIALOG_BOX_BORDER_OFFSET, boxW - 2, boxH - 2);
  drawPixelText(ctx, opts.title.toUpperCase(), boxX + CONFIG.MENTOR_DIALOG_TITLE_X, boxY + CONFIG.MENTOR_DIALOG_TITLE_Y, COLORS.purple, 1);
  drawWrappedUiText(ctx, opts.text, boxX + CONFIG.MENTOR_DIALOG_BODY_X, boxY + CONFIG.MENTOR_DIALOG_BODY_Y, boxW - 20, COLORS.text, CONFIG.MENTOR_DIALOG_BODY_SIZE, CONFIG.MENTOR_DIALOG_BODY_LINE_H);
  let yy = boxY + CONFIG.MENTOR_DIALOG_BODY_Y + 70;
  opts.choices.forEach((c, i) => {
    const selected = i === eventDialog.selected;
    drawPixelText(ctx, `${selected ? "▶" : " "} ${c.label}${c.reward ? "  [" + c.reward + "]" : ""}`, boxX + CONFIG.MENTOR_DIALOG_BODY_X, yy, selected ? COLORS.gold : COLORS.text, 1);
    yy += CONFIG.MENTOR_DIALOG_BODY_LINE_H + 4;
  });
  if (Math.floor(tick / CONFIG.MENTOR_DIALOG_PROMPT_DIVISOR) % 2 === 0) drawPixelText(ctx, "A: ESCOLHER  B: SAIR", boxX + boxW - CONFIG.MENTOR_DIALOG_PROMPT_X_OFFSET, boxY + boxH - CONFIG.MENTOR_DIALOG_PROMPT_Y_OFFSET, COLORS.blue, 1);
}

function drawTalentDialogCanvas() {
  ctx.fillStyle = `rgba(16, 10, 30, 0.88)`;
  ctx.fillRect(0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);
  const boxX = ux(CONFIG.MENTOR_DIALOG_BOX_X), boxY = uy(CONFIG.MENTOR_DIALOG_BOX_Y), boxW = CONFIG.CANVAS_W - ux(CONFIG.MENTOR_DIALOG_BOX_W_OFFSET), boxH = uy(CONFIG.MENTOR_DIALOG_BOX_H);
  ctx.fillStyle = `rgba(14, 8, 26, 0.94)`;
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = COLORS.gold;
  ctx.lineWidth = CONFIG.MENTOR_DIALOG_BOX_BORDER_WIDTH;
  ctx.strokeRect(boxX + CONFIG.MENTOR_DIALOG_BOX_BORDER_OFFSET, boxY + CONFIG.MENTOR_DIALOG_BOX_BORDER_OFFSET, boxW - 2, boxH - 2);
  drawPixelText(ctx, "ESCOLHA UM TALENTO", boxX + CONFIG.MENTOR_DIALOG_TITLE_X, boxY + CONFIG.MENTOR_DIALOG_TITLE_Y, COLORS.gold, 1);
  drawWrappedUiText(ctx, "O Núcleo sussurra segredos ao seu sangue. Fortaleça-se.", boxX + CONFIG.MENTOR_DIALOG_BODY_X, boxY + CONFIG.MENTOR_DIALOG_BODY_Y, boxW - 20, COLORS.muted, CONFIG.MENTOR_DIALOG_BODY_SIZE, CONFIG.MENTOR_DIALOG_BODY_LINE_H);
  let yy = boxY + CONFIG.MENTOR_DIALOG_BODY_Y + 40;
  talentDialog.choices.forEach((t, i) => {
    const selected = i === talentDialog.selected;
    const color = selected ? COLORS.gold : COLORS.text;
    drawPixelText(ctx, `${selected ? "▶" : " "} ${t.name}`, boxX + CONFIG.MENTOR_DIALOG_BODY_X, yy, color, 1);
    drawPixelText(ctx, `   ${t.desc}`, boxX + CONFIG.MENTOR_DIALOG_BODY_X, yy + 10, COLORS.muted, 1);
    yy += 30;
  });
  if (Math.floor(tick / CONFIG.MENTOR_DIALOG_PROMPT_DIVISOR) % 2 === 0) drawPixelText(ctx, "A: ESCOLHER  B: ADIAR", boxX + boxW - CONFIG.MENTOR_DIALOG_PROMPT_X_OFFSET, boxY + boxH - CONFIG.MENTOR_DIALOG_PROMPT_Y_OFFSET, COLORS.blue, 1);
}

function drawDungeonView() {
  if (!mapCache) buildMapCache();
  const srcX = camera.rx * CONFIG.TILE_SIZE, srcY = camera.ry * CONFIG.TILE_SIZE;
  ctx.drawImage(mapCache, srcX, srcY, CONFIG.CANVAS_W, CONFIG.CANVAS_H, 0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);
  ctx.fillStyle = COLORS.void;
  for (let sy = 0; sy < CONFIG.VIEW_H; sy++) {
    for (let sx = 0; sx < CONFIG.VIEW_W; sx++) {
      const mx = camera.x + sx, my = camera.y + sy;
      if (!isDiscovered(dungeon, mx, my)) ctx.fillRect(sx * CONFIG.TILE_SIZE, sy * CONFIG.TILE_SIZE, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
    }
  }
  drawPlayerLightAura();
}

function drawPlayerLightAura() {
  if (!player || gameState === "floorTransition") return;
  if (!playerLightAuraCache) ensureCaches();
  const px2 = (player.rx - camera.rx) * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
  const py2 = (player.ry - camera.ry) * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
  const size = CONFIG.LIGHT_AURA_CACHE_SIZE;
  ctx.drawImage(playerLightAuraCache, Math.round(px2 - size / 2), Math.round(py2 - size / 2));
}

function drawTorchFlicker() {
  if (!player || gameState === "floorTransition") return;
  const baseX = Math.round((player.rx - camera.rx) * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2 - CONFIG.TORCH_OFFSET_CENTER_X);
  const baseY = Math.round((player.ry - camera.ry) * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2 - CONFIG.TORCH_OFFSET_CENTER_Y);
  for (let i = 0; i < CONFIG.TORCH_COUNT; i++) {
    const tx = baseX + rand(CONFIG.TORCH_X_RANGE[0], CONFIG.TORCH_X_RANGE[1]);
    const ty = baseY + rand(CONFIG.TORCH_Y_RANGE[0], CONFIG.TORCH_Y_RANGE[1]);
    if (tx < 0 || ty < 0 || tx > CONFIG.CANVAS_W || ty > CONFIG.CANVAS_H) continue;
    const mx = Math.round((tx + camera.rx * CONFIG.TILE_SIZE) / CONFIG.TILE_SIZE);
    const my = Math.round((ty + camera.ry * CONFIG.TILE_SIZE) / CONFIG.TILE_SIZE);
    if (mx < 0 || mx >= CONFIG.MAP_W || my < 0 || my >= CONFIG.MAP_H) continue;
    if (dungeon.map[my]?.[mx] !== CONFIG.TILE_FLOOR || !isDiscovered(dungeon, mx, my)) continue;
    const flicker = Math.sin(tick * CONFIG.LIGHT_AURA_FLICKER_1 + i * CONFIG.LIGHT_AURA_PULSE_PHASE) * CONFIG.LIGHT_AURA_FLICKER_1 + CONFIG.LIGHT_AURA_FLICKER_2;
    ctx.globalAlpha = flicker * CONFIG.LIGHT_AURA_FLICKER_ALPHA;
    ctx.fillStyle = COLORS.gold;
    ctx.fillRect(tx, ty, 3, CONFIG.LIGHT_AURA_FLICKER_HEIGHT_BASE + Math.sin(tick * CONFIG.LIGHT_AURA_PULSE_TICK_MULT_2 + i) * CONFIG.LIGHT_AURA_FLICKER_HEIGHT_VAR);
    ctx.fillStyle = COLORS.orange;
    ctx.fillRect(tx + 1, ty + CONFIG.LIGHT_AURA_FLICKER_TOP_Y, 1, CONFIG.LIGHT_AURA_FLICKER_TOP_HEIGHT);
    ctx.globalAlpha = 1;
  }
}

function drawExit() {
  if (!exitTile) return;
  if (!isDiscovered(dungeon, exitTile.x, exitTile.y)) return;
  const sx = (exitTile.x - camera.rx) * CONFIG.TILE_SIZE;
  const sy = (exitTile.y - camera.ry) * CONFIG.TILE_SIZE;
  if (sx < -CONFIG.TILE_SIZE || sy < -CONFIG.TILE_SIZE || sx > CONFIG.CANVAS_W || sy > CONFIG.CANVAS_H) return;

  ctx.fillStyle = COLORS.floorDark;
  ctx.fillRect(sx, sy, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
  ctx.fillStyle = (exitTile.x + exitTile.y) % 2 ? COLORS.floorMid : "#28284e";
  ctx.fillRect(sx + 1, sy + 1, CONFIG.TILE_SIZE - 2, CONFIG.TILE_SIZE - 2);
  ctx.fillStyle = "rgba(255, 255, 255, 0.035)";
  ctx.fillRect(sx + 2, sy + 2, CONFIG.TILE_SIZE - 4, 1);
  ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
  ctx.fillRect(sx + 2, sy + CONFIG.TILE_SIZE - 3, CONFIG.TILE_SIZE - 4, 1);

  const pulse = Math.sin(tick / CONFIG.EXIT_PULSE_DIVISOR);
  ctx.globalAlpha = CONFIG.EXIT_ALPHA;
  ctx.fillStyle = bossDefeated ? "rgba(105, 224, 129, 0.35)" : "rgba(255, 90, 90, 0.38)";
  ctx.fillRect(sx + 1, sy + 1, CONFIG.TILE_SIZE - 2, CONFIG.TILE_SIZE - 2);
  ctx.globalAlpha = 1;
  ctx.fillStyle = COLORS.black;
  ctx.fillRect(sx + 4, sy + 5, 16, 16);
  ctx.fillStyle = bossDefeated ? COLORS.green : COLORS.red;
  ctx.fillRect(sx + 5, sy + 5, 14, 14);
  ctx.fillStyle = COLORS.gold;
  ctx.fillRect(sx + 8, sy + 2 + pulse, 8, 4);
  ctx.fillRect(sx + 9, sy + 10, 6, 8);
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(sx + 11, sy + 12, 3, 3);
  ctx.fillStyle = bossDefeated ? COLORS.white : COLORS.purple;
  ctx.fillRect(sx + 3, sy + 3, 2, 2);
  ctx.fillRect(sx + 19, sy + 18, 2, 2);
}

function drawEnemiesOnMap() {
  for (const e of enemies) {
    if (!e.alive || !isDiscovered(dungeon, e.x, e.y)) continue;
    drawEntityOnMap(ctx, e, camera.rx, camera.ry, tick);
  }
}

function drawEffectsOnCanvas() {
  const effects = getEffects();
  for (const effect of effects) {
    if (effect.x < -20 || effect.x > CONFIG.CANVAS_W + 20 || effect.y < -20 || effect.y > CONFIG.CANVAS_H + 20) continue;
    const alpha = clamp(effect.life / effect.maxLife, 0, 1);
    ctx.globalAlpha = alpha;
if (effect.type === "text") {
      const baseScale = effect.size || 1;
      const age = 1 - alpha;
      const pop = age < 0.2 ? 1 + (0.2 - age) * 2.5 : 1;
      const scale = baseScale * pop;
      drawPixelText(ctx, effect.text, effect.x - effect.text.length * 4 * baseScale * 0.5, effect.y - 16, effect.color, scale);
    } else if (effect.type === "spark") {
      ctx.fillStyle = effect.color;
      ctx.fillRect(effect.x, effect.y, effect.size + 1, effect.size + 1);
      ctx.globalAlpha = alpha * 0.45;
      ctx.fillRect(effect.x - effect.vx * 2, effect.y - effect.vy * 2, effect.size, effect.size);
} else if (effect.type === "heal") {
      ctx.fillStyle = effect.color;
      ctx.fillRect(effect.x - effect.size, effect.y, effect.size * 2 + 1, 1);
      ctx.fillRect(effect.x, effect.y - effect.size, 1, effect.size * 2 + 1);
    } else if (effect.type === "cross") {
      const s = (effect.size || 2) * alpha;
      ctx.fillStyle = effect.color;
      ctx.fillRect(effect.x - s - 2, effect.y - 1, s + 2, 3);
      ctx.fillRect(effect.x + 1, effect.y - 1, s + 2, 3);
      ctx.fillRect(effect.x - 1, effect.y - s - 2, 3, s + 2);
      ctx.fillRect(effect.x - 1, effect.y + 1, 3, s + 2);
      ctx.fillStyle = COLORS.white;
      ctx.fillRect(effect.x - 1, effect.y - 1, 3, 3);
    } else if (effect.type === "vapor") {
      const p = 1 - alpha;
      ctx.fillStyle = effect.color;
      ctx.globalAlpha = alpha * 0.5;
      ctx.fillRect(effect.x - effect.size * (0.5 + p), effect.y - p * 8, effect.size * 2, effect.size);
      ctx.fillRect(effect.x - effect.size * (0.3 + p), effect.y - p * 8 + effect.size, effect.size, effect.size);
    } else if (effect.type === "dust") {
      ctx.fillStyle = effect.color;
      ctx.fillRect(effect.x, effect.y, effect.size * 2, effect.size);
    } else if (effect.type === "slash") {
      const p = 1 - alpha;
      ctx.save();
      ctx.translate(effect.x, effect.y);
      ctx.rotate(effect.rot || 0);
      ctx.fillStyle = effect.color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(-effect.size, -8, effect.size * 2 + 8, 3);
      ctx.fillRect(-effect.size + 3, -4, effect.size * 2, 3);
      ctx.globalAlpha = alpha * 0.5;
      ctx.fillStyle = COLORS.white;
      ctx.fillRect(-effect.size, -6, effect.size * 2 + 8, 2);
      ctx.restore();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = effect.color;
      ctx.fillRect(effect.x - 12 + p * 10, effect.y - 9 + p * 3, 20, effect.size * 0.5);
      ctx.fillRect(effect.x - 6 + p * 8, effect.y - 5 + p * 3, 16, effect.size * 0.5);
      ctx.globalAlpha = alpha * 0.45;
      ctx.fillStyle = COLORS.white;
      ctx.fillRect(effect.x - 8 + p * 8, effect.y - 7 + p * 3, 14, 1);
} else if (effect.type === "bolt") {
      ctx.fillStyle = COLORS.blue;
      ctx.fillRect(effect.x - 13, effect.y - 10, 7, 2);
      ctx.fillRect(effect.x - 6, effect.y - 6, 12, 2);
      ctx.fillStyle = COLORS.white;
      ctx.fillRect(effect.x - 2, effect.y - 7, 9, 1);
    } else if (effect.type === "ghost") {
      const gs = effect.size || CONFIG.SPRITE_SCALE;
      ctx.fillStyle = "rgba(255, 212, 92, " + (0.3 * alpha) + ")";
      px(ctx, effect.x + 3 * gs, effect.y + 2 * gs, 6, 6, "#ffd45c", gs);
      px(ctx, effect.x + 4 * gs, effect.y + 1 * gs, 4, 2, "#f7d9a0", gs);
    }
    ctx.globalAlpha = 1;
  }
}

function drawAmbientMotes() {
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const motes = getMotes();
  for (const mote of motes) {
    const alpha = 0.09 + Math.sin((tick + mote.phase) / CONFIG.MOTE_CYCLE_DIVISOR_ALPHA) * 0.04;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = mote.phase % 3 === 0 ? COLORS.gold : "#8f8fd1";
    ctx.fillRect(Math.round(mote.x), Math.round(mote.y), mote.r, mote.r);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  drawEmbers();
}

function drawEmbers() {
  if (reducedMotion) return;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const embers = getEmbers();
  for (const e of embers) {
    const a = Math.min(0.55, Math.max(0.05, e.life / e.maxLife));
    ctx.globalAlpha = a;
    ctx.fillStyle = e.life % 3 === 0 ? "#ffb347" : "#ff8a3c";
    ctx.fillRect(Math.round(e.x), Math.round(e.y), e.r, e.r);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawHoverHighlight() {
  if (!hoveredTile || gameState !== "explore") return;
  const screenX = (hoveredTile.x - camera.rx) * CONFIG.TILE_SIZE;
  const screenY = (hoveredTile.y - camera.ry) * CONFIG.TILE_SIZE;
  if (screenX + CONFIG.TILE_SIZE < 0 || screenX > CONFIG.CANVAS_W || screenY + CONFIG.TILE_SIZE < 0 || screenY > CONFIG.CANVAS_H) return;
  ctx.save();
  ctx.globalAlpha = CONFIG.HOVER_ALPHA_BASE + Math.sin(tick * CONFIG.HOVER_ALPHA_DIVISOR) * CONFIG.HOVER_ALPHA_VAR;
  ctx.fillStyle = "#fff";
  ctx.fillRect(screenX, screenY, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
  ctx.restore();
}

function drawAtmosphere() {
  const px = (player.x - camera.rx) * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
  const py = (player.y - camera.ry) * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
  const grad = ctx.createRadialGradient(px, py, CONFIG.ATMOSPHERE_VIGNETTE_INNER, px, py, CONFIG.ATMOSPHERE_VIGNETTE_MID);
  grad.addColorStop(0, "rgba(0, 0, 0, 0)");
  grad.addColorStop(CONFIG.ATMOSPHERE_VIGNETTE_MID_RATIO, `rgba(0, 0, 0, ${CONFIG.ATMOSPHERE_VIGNETTE_MID_ALPHA})`);
  grad.addColorStop(1, `rgba(0, 0, 0, ${CONFIG.ATMOSPHERE_VIGNETTE_OUTER_ALPHA})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);
  drawVisibleLightSources();
  if (bossDefeated) return;
  const pulse = CONFIG.ATMOSPHERE_RUBRO_PULSE_BASE + Math.sin(tick / CONFIG.ATMOSPHERE_RUBRO_PULSE_DIVISOR) * CONFIG.ATMOSPHERE_RUBRO_PULSE_VAR;
  ctx.fillStyle = `rgba(255, 48, 76, ${pulse})`;
  ctx.fillRect(0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);
}

function drawVisibleLightSources() {
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let sy = 0; sy < CONFIG.VIEW_H; sy++) {
    for (let sx = 0; sx < CONFIG.VIEW_W; sx++) {
      const mx = camera.x + sx, my = camera.y + sy;
      if (dungeon.map[my]?.[mx] === CONFIG.TILE_WALL || !isDiscovered(dungeon, mx, my)) continue;
      if (!dungeon.lightSources?.[my]?.[mx]) continue;
      const x = sx * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2, y = sy * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
      const pulse = CONFIG.LIGHT_AURA_PULSE_BASE + Math.sin((tick + mx * 7 + my * 3) / CONFIG.LIGHT_AURA_PULSE_DIVISOR) * CONFIG.LIGHT_AURA_PULSE_VAR;
      ctx.globalAlpha = pulse;
      ctx.drawImage(lightGradientCache, x - CONFIG.LIGHT_GRADIENT_CENTER, y - CONFIG.LIGHT_GRADIENT_CENTER);
    }
  }
  ctx.restore();
}

function drawMinimap() {
  const mw = CONFIG.MINIMAP_SIZE, mh = CONFIG.MINIMAP_SIZE;
  const x0 = CONFIG.CANVAS_W - mw - CONFIG.MINIMAP_OFFSET, y0 = CONFIG.CANVAS_H - mh - CONFIG.MINIMAP_OFFSET;
  ctx.globalAlpha = CONFIG.MINIMAP_BG_ALPHA;
  ctx.fillStyle = "#050510";
  ctx.fillRect(x0 - 3, y0 - 3, mw + 6, mh + 6);
  ctx.strokeStyle = COLORS.wallHi;
  ctx.strokeRect(x0 - 3, y0 - 3, mw + 6, mh + 6);
  for (let y = 0; y < CONFIG.MAP_H; y++) {
    for (let x = 0; x < CONFIG.MAP_W; x++) {
      if (dungeon.map[y][x] !== CONFIG.TILE_WALL && isDiscovered(dungeon, x, y)) {
        ctx.fillStyle = dungeon.map[y][x] === CONFIG.TILE_EXIT ? COLORS.gold : "#45457d";
        ctx.fillRect(x0 + Math.floor(x * CONFIG.MINIMAP_SCALE), y0 + Math.floor(y * CONFIG.MINIMAP_SCALE), 1, 1);
      }
    }
  }
  for (const e of enemies) {
    if (e.alive && isDiscovered(dungeon, e.x, e.y)) {
      ctx.fillStyle = e.boss ? COLORS.red : e.miniboss ? COLORS.gold : "#ff5a5a";
      ctx.fillRect(x0 + Math.floor(e.x * CONFIG.MINIMAP_SCALE), y0 + Math.floor(e.y * CONFIG.MINIMAP_SCALE), 1, 1);
    }
  }
  ctx.fillStyle = COLORS.green;
  ctx.fillRect(x0 + Math.floor(player.x * CONFIG.MINIMAP_SCALE) - 1, y0 + Math.floor(player.y * CONFIG.MINIMAP_SCALE) - 1, 3, 3);
  ctx.globalAlpha = 1;
}

function drawSwipeTrail() {
  if (!swipeTrail || swipeTrail.life <= 0) return;
  const alpha = Math.min(1, swipeTrail.life / CONFIG.SWIPE_TRAIL_LIFE);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = COLORS.gold;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(swipeTrail.x1, swipeTrail.y1);
  ctx.lineTo(swipeTrail.x2, swipeTrail.y2);
  ctx.stroke();
  const angle = Math.atan2(swipeTrail.y2 - swipeTrail.y1, swipeTrail.x2 - swipeTrail.x1);
  ctx.fillStyle = COLORS.gold;
  ctx.beginPath();
  ctx.moveTo(swipeTrail.x2, swipeTrail.y2);
  ctx.lineTo(swipeTrail.x2 - 8 * Math.cos(angle - 0.5), swipeTrail.y2 - 8 * Math.sin(angle - 0.5));
  ctx.lineTo(swipeTrail.x2 - 8 * Math.cos(angle + 0.5), swipeTrail.y2 - 8 * Math.sin(angle + 0.5));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawEndBanner(text, color) {
  ctx.fillStyle = `rgba(5, 5, 16, ${CONFIG.END_BANNER_BG_ALPHA})`;
  ctx.fillRect(0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);
  ctx.fillStyle = "#151536";
  ctx.fillRect(CONFIG.END_BANNER_BOX_X, CONFIG.END_BANNER_BOX_Y, CONFIG.CANVAS_W - CONFIG.END_BANNER_BOX_W_OFFSET, CONFIG.END_BANNER_BOX_H);
  ctx.strokeStyle = color;
  ctx.lineWidth = CONFIG.END_BANNER_BORDER_WIDTH;
  ctx.strokeRect(CONFIG.END_BANNER_BORDER_X, CONFIG.END_BANNER_BORDER_Y, CONFIG.CANVAS_W - CONFIG.END_BANNER_BORDER_W_OFFSET, CONFIG.END_BANNER_BORDER_H);
  drawPixelText(ctx, text, CONFIG.END_BANNER_TEXT_X, CONFIG.END_BANNER_TEXT_Y, color, CONFIG.END_BANNER_TEXT_SCALE);
  const stats = player ? `${player.className} Nv.${player.level}` : "—";
  const floor = currentFloor || 1;
  const gold = player ? player.gold : 0;
  const record = `ANDAR ${floor}/${FINAL_FLOOR} · ABATES ${runStats.kills} · BAÚS ${runStats.chests} · RELÍQUIAS ${runStats.relics} · OURO ${gold}`;
  const trail = `${stats} · SELOS ${meta.wins} · CONQUISTAS ${achievementSummary()}`;
  drawPixelText(ctx, record, CONFIG.END_BANNER_TEXT_X - 30, CONFIG.END_BANNER_TEXT_Y + 24, COLORS.white, 1);
  drawPixelText(ctx, trail, CONFIG.END_BANNER_TEXT_X - 30, CONFIG.END_BANNER_TEXT_Y + 38, COLORS.muted || COLORS.text, 1);
  drawPixelText(ctx, "B: MENU", CONFIG.END_BANNER_PROMPT_X, CONFIG.END_BANNER_PROMPT_Y, COLORS.text, 1);
}

// =============================================================
// SCREEN EFFECTS
// =============================================================
const ScreenEffects = {
  fadeOverlay: null,

  init() {
    this.fadeOverlay = document.getElementById("fadeOverlay");
  },

  fadeIn(duration = 400) {
    if (!this.fadeOverlay) return Promise.resolve();
    this.fadeOverlay.classList.add("active");
    this.fadeOverlay.style.transitionDuration = `${duration}ms`;
    return new Promise(resolve => {
      setTimeout(resolve, duration);
    });
  },

  fadeOut(duration = 400) {
    if (!this.fadeOverlay) return Promise.resolve();
    this.fadeOverlay.style.transitionDuration = `${duration}ms`;
    this.fadeOverlay.classList.remove("active");
    return new Promise(resolve => {
      setTimeout(resolve, duration);
    });
  },

  flash(color = COLORS.white, duration = 150) {
    if (reduceFlash) return;
    if (!this.fadeOverlay) return;
    this.fadeOverlay.style.background = color;
    this.fadeOverlay.classList.add("active");
    this.fadeOverlay.style.transitionDuration = `${duration}ms`;
    setTimeout(() => {
      this.fadeOverlay.style.background = "#050510";
      this.fadeOverlay.classList.remove("active");
    }, duration);
  }
};

// =============================================================
// LOADING SCREEN
// =============================================================
const LoadingScreen = {
  overlay: null,
  barFill: null,

  init() {
    this.overlay = document.getElementById("loadingOverlay");
    this.barFill = document.getElementById("loadingBarFill");
  },

  show() {
    if (this.overlay) {
      this.overlay.classList.add("active");
      this.setProgress(0);
    }
  },

  hide() {
    if (this.overlay) {
      this.overlay.classList.remove("active");
    }
  },

  setProgress(percent) {
    if (this.barFill) {
      this.barFill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    }
  }
};

// =============================================================
// MISC
// =============================================================
function resizeCanvasDisplay() {
  const wrap = document.getElementById("screenWrap");
  const rect = wrap.getBoundingClientRect();
  const aspect = canvas.width / canvas.height;
  let width = rect.width, height = rect.height;
  if (width / height > aspect) width = height * aspect;
  else height = width / aspect;
  canvas.style.width = `${Math.floor(width)}px`;
  canvas.style.height = `${Math.floor(height)}px`;
}

function canvasPointToWorld(clientX, clientY, useSmoothCamera = false) {
  if (!player || !dungeon) return null;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const cx = (clientX - rect.left) / rect.width;
  const cy = (clientY - rect.top) / rect.height;
  if (cx < 0 || cy < 0 || cx > 1 || cy > 1) return null;
  const tileX = clamp(Math.floor(cx * CONFIG.VIEW_W), 0, CONFIG.VIEW_W - 1);
  const tileY = clamp(Math.floor(cy * CONFIG.VIEW_H), 0, CONFIG.VIEW_H - 1);
  const baseX = useSmoothCamera ? Math.round(camera.rx) : camera.x;
  const baseY = useSmoothCamera ? Math.round(camera.ry) : camera.y;
  return { x: tileX + baseX, y: tileY + baseY };
}

// =============================================================
// INPUT
// =============================================================
function bindButtonPress(selector, handler) {
  document.querySelectorAll(selector).forEach(btn => {
    const activePointers = new Map();
    const press = ev => {
      ev.preventDefault();
      if (activePointers.has(ev.pointerId)) return;
      unlockAudio();
      btn.setPointerCapture?.(ev.pointerId);
      btn.classList.add("pressed");
      handler(btn.dataset);
      let repeatTimer = null;
      if (btn.classList.contains("padBtn")) repeatTimer = setInterval(() => handler(btn.dataset), CONFIG.DPAD_REPEAT_MS);
      activePointers.set(ev.pointerId, repeatTimer);
    };
    const release = ev => {
      const repeatTimer = activePointers.get(ev.pointerId);
      if (repeatTimer === undefined) return;
      clearInterval(repeatTimer);
      activePointers.delete(ev.pointerId);
      try { btn.releasePointerCapture?.(ev.pointerId); } catch (e) {
        if (typeof addLog === "function") addLog(`Erro no botão: ${e.message}`, "red");
      }
      if (activePointers.size === 0) btn.classList.remove("pressed");
    };
    btn.addEventListener("pointerdown", press);
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointercancel", release);
    btn.addEventListener("lostpointercapture", release);
  });
}

function directionFromDpad(ev) {
  const dpad = document.getElementById("dpad");
  const rect = dpad.getBoundingClientRect();
  const x = ev.clientX - rect.left - rect.width / 2;
  const y = ev.clientY - rect.top - rect.height / 2;
  if (Math.abs(x) > Math.abs(y)) return x > 0 ? "right" : "left";
  return y > 0 ? "down" : "up";
}

function moveByDir(dir) {
  if (commandMenuOpen && gameState === "combat") {
    commandMenuMove(dir);
    return;
  }
  if (shopDialog && gameState === "bossIntro") {
    if (dir === "up" && shopDialog.offerings.length) shopDialog.selected = (shopDialog.selected + shopDialog.offerings.length - 1) % shopDialog.offerings.length;
    if (dir === "down" && shopDialog.offerings.length) shopDialog.selected = (shopDialog.selected + 1) % shopDialog.offerings.length;
    playSfx("select");
    return;
  }
  if (eventDialog && gameState === "bossIntro") {
    const ev = EVENT_OPTIONS[eventDialog.eventId];
    if (ev && ev.choices.length) {
      if (dir === "up") eventDialog.selected = (eventDialog.selected + ev.choices.length - 1) % ev.choices.length;
      if (dir === "down") eventDialog.selected = (eventDialog.selected + 1) % ev.choices.length;
    }
    playSfx("select");
    return;
  }
  if (talentDialog && gameState === "bossIntro") {
    if (dir === "up") talentDialog.selected = (talentDialog.selected + talentDialog.choices.length - 1) % talentDialog.choices.length;
    if (dir === "down") talentDialog.selected = (talentDialog.selected + 1) % talentDialog.choices.length;
    playSfx("select");
    return;
  }
  if (gameState === "combat" && combatMode === "action") {
    actionMoveDir = dir;
    return;
  }
  const moves = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const [dx, dy] = moves[dir];
  tryMove(dx, dy);
}

function bindDpad() {
  const dpad = document.getElementById("dpad");
  const activePointers = new Map();
    const press = ev => {
      ev.preventDefault();
      if (activePointers.has(ev.pointerId)) return;
      unlockAudio();
      dpad.setPointerCapture?.(ev.pointerId);
      const timer = setInterval(() => {
        const data = activePointers.get(ev.pointerId);
        if (!data) return;
        moveByDir(directionFromDpad(data.ev));
      }, CONFIG.DPAD_REPEAT_MS);
      activePointers.set(ev.pointerId, { ev: { clientX: ev.clientX, clientY: ev.clientY }, timer });
      updateDpadDirection(activePointers.get(ev.pointerId).ev);
    };
  const move = ev => {
    const data = activePointers.get(ev.pointerId);
    if (!data) return;
    data.ev = { clientX: ev.clientX, clientY: ev.clientY };
    updateDpadDirection(data.ev);
  };
    const release = ev => {
      const data = activePointers.get(ev.pointerId);
      if (!data) return;
      clearInterval(data.timer);
      activePointers.delete(ev.pointerId);
      try { dpad.releasePointerCapture?.(ev.pointerId); } catch (e) {
        if (typeof addLog === "function") addLog(`Erro no dpad: ${e.message}`, "red");
      }
      if (activePointers.size === 0) {
        dpad.querySelectorAll(".pressed").forEach(btn => btn.classList.remove("pressed"));
        actionMoveDir = null;
      }
    };
  function updateDpadDirection(evData) {
    const dir = directionFromDpad(evData);
    moveByDir(dir);
    dpad.querySelectorAll(".pressed").forEach(btn => btn.classList.remove("pressed"));
    const target = dpad.querySelector(`[data-dir="${dir}"]`);
    if (target) target.classList.add("pressed");
  }
  dpad.addEventListener("pointerdown", press);
  dpad.addEventListener("pointermove", move);
  dpad.addEventListener("pointerup", release);
  dpad.addEventListener("pointercancel", release);
  dpad.addEventListener("lostpointercapture", release);
  dpad.addEventListener("contextmenu", ev => ev.preventDefault());
  dpad.addEventListener("selectstart", ev => ev.preventDefault());
}

// =============================================================
// BOOT
// =============================================================
function boot() {
  loadSettings();
  applyAccessibilitySettings();
  document.getElementById("controls").classList.toggle("oneHanded", oneHandedMode);
  refreshMenuText();
  LoadingScreen.init();
  ScreenEffects.init();
  LoadingScreen.show();
  LoadingScreen.setProgress(20);

  addLog("Escolha uma classe para entrar na cripta.");
  updateContinueButton();
  updateMetaRecords();
  showMenuView("home");
  updateUI();
  reflowAdaptiveViewport();
  LoadingScreen.setProgress(60);

  // Sound button
  soundBtn.addEventListener("click", ev => {
    ev.preventDefault();
    setSoundEnabled(!getSoundEnabled());
    soundBtn.textContent = getSoundEnabled() ? "♪" : "×";
    soundBtn.setAttribute("aria-label", getSoundEnabled() ? "Som ligado" : "Som desligado");
    menuSoundBtn.textContent = getSoundEnabled() ? "SOM: LIGADO" : "SOM: DESLIGADO";
    pauseSoundBtn.textContent = getSoundEnabled() ? "SOM: LIGADO" : "SOM: DESLIGADO";
    refreshMenuText();
    if (!getSoundEnabled()) stopMusic();
    else { unlockAudio(); playSfx("select"); }
  });

  // Menu navigation
  menuPlayBtn.addEventListener("click", ev => { ev.preventDefault(); startIntroCinematic(); });
  introAdvanceBtn.addEventListener("click", ev => { ev.preventDefault(); finishIntroCinematic(); });
  menuOptionsBtn.addEventListener("click", ev => { ev.preventDefault(); showMenuView("options"); });
  renderSlotList();
  backToMenuFromClassBtn.addEventListener("click", ev => { ev.preventDefault(); showMenuView("home"); });
  backToMenuFromOptionsBtn.addEventListener("click", ev => { ev.preventDefault(); showMenuView("home"); });
  document.getElementById("menuExportBtn").addEventListener("click", ev => {
    ev.preventDefault();
    const meta = loadMeta();
    const slot = meta.activeSlot ?? 0;
    handleSlotAction(slot, "export");
  });
  document.getElementById("menuImportBtn").addEventListener("click", ev => {
    ev.preventDefault();
    promptImportSlot();
  });
  const slotListEl = document.getElementById("slotList");
  slotListEl.addEventListener("click", ev => {
    const t = ev.target.closest("button");
    if (!t) return;
    const key = Object.keys(t.dataset).find(k => k.startsWith("slot") && t.dataset[k] !== undefined);
    if (!key) return;
    const action = key.slice(5).toLowerCase();
    const slotIndex = parseInt(t.dataset[key], 10);
    if (action === "load") { ev.preventDefault(); handleSlotAction(slotIndex, "load"); }
    else if (action === "export") { ev.preventDefault(); handleSlotAction(slotIndex, "export"); }
    else if (action === "delete") { ev.preventDefault(); if (confirm("Apagar este save?")) handleSlotAction(slotIndex, "delete"); }
  });
  menuSoundBtn.addEventListener("click", ev => {
    ev.preventDefault();
    setSoundEnabled(!getSoundEnabled());
    soundBtn.textContent = getSoundEnabled() ? "♪" : "×";
    refreshMenuText();
  });

  menuOneHandBtn.addEventListener("click", ev => {
    ev.preventDefault();
    toggleOneHandedMode();
    refreshMenuText();
  });

  // Language selector
  const langBtn = document.getElementById("menuLangBtn");
  langBtn.addEventListener("click", ev => {
    ev.preventDefault();
    const locales = getLocales();
    const cur = getLocale();
    const idx = (locales.indexOf(cur) + 1) % locales.length;
    setLocale(locales[idx]);
    langBtn.textContent = `${t("LANGUAGE")} ${t("LANG_NAME")}`;
    showToast(t("LANG_NAME"), 500);
  });

  // Volume sliders
  const musicSlider = document.getElementById("musicVolSlider");
  const sfxSlider = document.getElementById("sfxVolSlider");
  musicSlider.value = Math.round(musicVolume * 100);
  sfxSlider.value = Math.round(sfxVolume * 100);
  musicSlider.addEventListener("input", ev => {
    const v = parseInt(ev.target.value) / 100;
    setMusicVolume(v);
  });
  sfxSlider.addEventListener("input", ev => {
    const v = parseInt(ev.target.value) / 100;
    setSfxVolume(v);
  });

  // Seed input
  const seedInput = document.getElementById("seedInput");
  if (seedInput) {
    if (getGameSeed()) seedInput.value = getGameSeed();
    seedInput.addEventListener("change", ev => { setGameSeed(ev.target.value); saveSettings(); });
  }

  // Endless mode toggle
  const menuEndlessBtn = document.getElementById("menuEndlessBtn");
  if (menuEndlessBtn) {
    menuEndlessBtn.addEventListener("click", ev => {
      ev.preventDefault();
      unlockAudio();
      toggleEndlessMode();
    });
  }

  // Combat mode toggle
  const menuCombatBtn = document.getElementById("menuCombatBtn");
  if (menuCombatBtn) {
    menuCombatBtn.addEventListener("click", ev => {
      ev.preventDefault();
      unlockAudio();
      toggleCombatMode();
    });
  }

  // Graphics present toggle (PS1 / 2D)
  const menuGfxBtn = document.getElementById("menuGfxBtn");
  if (menuGfxBtn) {
    menuGfxBtn.addEventListener("click", ev => {
      ev.preventDefault();
      unlockAudio();
      toggleGfxPresent();
    });
  }

  // Accessibility toggles
  const menuColorBtn = document.getElementById("menuColorBtn");
  if (menuColorBtn) menuColorBtn.addEventListener("click", ev => { ev.preventDefault(); unlockAudio(); toggleColorBlindMode(); });
  const menuContrastBtn = document.getElementById("menuContrastBtn");
  if (menuContrastBtn) menuContrastBtn.addEventListener("click", ev => { ev.preventDefault(); unlockAudio(); toggleHighContrast(); });
  const menuFlashBtn = document.getElementById("menuFlashBtn");
  if (menuFlashBtn) menuFlashBtn.addEventListener("click", ev => { ev.preventDefault(); unlockAudio(); toggleReduceFlash(); });
  const menuUIBtn = document.getElementById("menuUIBtn");
  if (menuUIBtn) menuUIBtn.addEventListener("click", ev => { ev.preventDefault(); unlockAudio(); toggleUiScale(); });
  const menuDifficultyBtn = document.getElementById("menuDifficultyBtn");
  if (menuDifficultyBtn) menuDifficultyBtn.addEventListener("click", ev => { ev.preventDefault(); unlockAudio(); toggleDifficulty(); });

  // Class selection
  document.querySelectorAll(".menuBtn[data-class]").forEach(btn => {
    btn.addEventListener("click", () => selectClass(btn.dataset.class));
  });
  startJourneyBtn.addEventListener("click", ev => { ev.preventDefault(); if (selectedClassKey) startGame(selectedClassKey); });

  // Continue / save
  continueBtn.addEventListener("click", ev => {
    ev.preventDefault();
    unlockAudio();
    // Check if multiple saves exist - show slot picker
    const slots = [];
    for (let i = 0; i < MAX_SLOTS; i++) {
      const info = getSlotInfo(i);
      if (info.exists) slots.push(info);
    }
    if (slots.length > 1) {
      const msg = slots.map((s, i) => `Slot ${i + 1}: ${s.playerName} · Andar ${s.floor}`).join(" | ");
      addLog(`Saves disponíveis: ${msg}`, "gold");
      addLog("Abrindo save mais recente...");
    }
    loadSave();
  });

  // Pause
  pauseBtn.addEventListener("click", ev => {
    ev.preventDefault();
    if (gameState === "paused") closePauseMenu();
    else openPauseMenu();
  });
  resumeBtn.addEventListener("click", closePauseMenu);

  pauseSaveBtn.addEventListener("click", ev => {
    ev.preventDefault();
    if (writeCurrentRun({ player, dungeon, enemies, items, currentFloor, exitTile, bossDefeated, runStats, logLines, gameState })) {
      addLog("Jogo salvo.", "green");
      showToast("SALVO!", 800);
      playSfx("select");
    } else {
      addLog("Falha ao salvar.", "red");
    }
  });

  restartBtn.addEventListener("click", ev => { ev.preventDefault(); restartToMenu(); });
  pauseSoundBtn.addEventListener("click", ev => {
    ev.preventDefault();
    setSoundEnabled(!getSoundEnabled());
    soundBtn.textContent = getSoundEnabled() ? "♪" : "×";
    refreshMenuText();
    refreshPauseMenu();
  });

  const pauseCombatBtn = document.getElementById("pauseCombatBtn");
  if (pauseCombatBtn) {
    pauseCombatBtn.addEventListener("click", ev => {
      ev.preventDefault();
      toggleCombatMode();
    });
  }

  // Command menu buttons
  document.querySelectorAll("#commandMenu .cmdBtn").forEach(btn => {
    btn.addEventListener("click", ev => {
      ev.preventDefault();
      const idx = COMMAND_LIST.indexOf(btn.dataset.cmd);
      commandMenuIndex = Math.max(0, idx);
      confirmCommand(commandMenuIndex);
    });
  });

  // Action buttons
  bindButtonPress(".actBtn", data => {
    if (data.action === "a") actionA();
    if (data.action === "b") usePotionOrSpecial();
  });

  // Dpad
  bindDpad();

  // Prevent context/select on controls
  document.getElementById("controls").addEventListener("contextmenu", ev => ev.preventDefault());
  document.getElementById("controls").addEventListener("selectstart", ev => ev.preventDefault());

  // Keyboard
  const held = new Set();
  window.addEventListener("keydown", ev => {
    unlockAudio();
    if (ev.key === "Escape") {
      if (gameState === "paused") closePauseMenu();
      else openPauseMenu();
      return;
    }
    if (ev.repeat && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d"].includes(ev.key)) return;
    held.add(ev.key.toLowerCase());
    actionHeldKeys.add(ev.key.toLowerCase());
    if (["arrowup", "w"].includes(ev.key.toLowerCase())) moveByDir("up");
    if (["arrowdown", "s"].includes(ev.key.toLowerCase())) moveByDir("down");
    if (["arrowleft", "a"].includes(ev.key.toLowerCase())) moveByDir("left");
    if (["arrowright", "d"].includes(ev.key.toLowerCase())) moveByDir("right");
    if (["z", "enter"].includes(ev.key.toLowerCase())) actionA();
    if (["x", " "].includes(ev.key.toLowerCase())) usePotionOrSpecial();
  });
  window.addEventListener("keyup", ev => {
    held.delete(ev.key.toLowerCase());
    actionHeldKeys.delete(ev.key.toLowerCase());
  });

  // Touch on canvas
  const touchStartData = {};
  canvas.addEventListener("pointerdown", ev => {
    unlockAudio();
    touchStartData.x = ev.clientX;
    touchStartData.y = ev.clientY;
    touchStartData.time = performance.now();
    touchStartData.isPrimary = ev.button === 0;
    touchStartData.button = ev.button;
    if (ev.pointerType === "mouse" && ev.button === 0 && gameState === "explore" && player) {
      mouseHeld = true;
      mouseHoldStart = performance.now();
      lastMousePathAt = 0;
      const pt = canvasPointToWorld(ev.clientX, ev.clientY, true);
      if (pt) {
        mouseHoldTarget = { x: pt.x, y: pt.y };
        setMouseFollowPath();
      }
    }
  });
  canvas.addEventListener("pointermove", ev => {
    hoveredTile = null;
    if (gameState === "explore" && dungeon) {
      const point = canvasPointToWorld(ev.clientX, ev.clientY, true);
      if (point && point.x >= 0 && point.x < CONFIG.MAP_W && point.y >= 0 && point.y < CONFIG.MAP_H && isDiscovered(dungeon, point.x, point.y)) {
        hoveredTile = point;
      }
    }
    if (mouseHeld && ev.pointerType === "mouse") {
      const pt = canvasPointToWorld(ev.clientX, ev.clientY, true);
      if (pt) {
        mouseHoldTarget = { x: pt.x, y: pt.y };
        setMouseFollowPath();
      }
      return;
    }
    if (touchStartData.x == null) return;
    const now = performance.now();
    if (now - touchStartData.time < CONFIG.SWIPE_DELAY_MS) return;
    const dx = ev.clientX - touchStartData.x, dy = ev.clientY - touchStartData.y;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (Math.max(ax, ay) > CONFIG.SWIPE_THRESHOLD) {
      const wrap = document.getElementById("screenWrap");
      const rect = wrap.getBoundingClientRect();
      swipeTrail = {
        x1: (touchStartData.x - rect.left) / rect.width * CONFIG.CANVAS_W,
        y1: (touchStartData.y - rect.top) / rect.height * CONFIG.CANVAS_H,
        x2: (ev.clientX - rect.left) / rect.width * CONFIG.CANVAS_W,
        y2: (ev.clientY - rect.top) / rect.height * CONFIG.CANVAS_H,
        life: CONFIG.SWIPE_TRAIL_LIFE
      };
    }
  });
  canvas.addEventListener("pointerup", ev => {
    const heldMs = performance.now() - (touchStartData.time || 0);
    const wasMouseHold = mouseHeld && ev.pointerType === "mouse" && heldMs >= CONFIG.MOUSE_HOLD_MS;
    mouseHeld = false;
    mouseHoldTarget = null;
    if (touchStartData.x == null) return;
    const dx = ev.clientX - touchStartData.x, dy = ev.clientY - touchStartData.y;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    const now = performance.now();
    const wasTap = Math.max(ax, ay) < CONFIG.SWIPE_THRESHOLD;
    const wasRightClick = touchStartData.button === 2;
    const doubleTap = wasTap && (now - (lastTap || 0)) < CONFIG.DOUBLE_TAP_MS && (now - touchStartData.time) < CONFIG.DOUBLE_TAP_MAX_MS;
    lastTap = wasTap ? now : lastTap;
    touchStartData.x = null;
    if (wasRightClick) {
      usePotionOrSpecial();
      return;
    }
    if (wasMouseHold) return;
    if (doubleTap && player && player.potions > 0 && player.hp < player.maxHp &&
        (gameState === "explore" || (gameState === "combat" && combatMode === "action"))) {
      usePotion(false);
      return;
    }
    if (wasTap) {
      const point = canvasPointToWorld(ev.clientX, ev.clientY, true);
      if (gameState === "explore" && player && point && requestClickMove(point.x, point.y)) return;
      actionA();
      return;
    }
    if (ax > ay) tryMove(dx > 0 ? 1 : -1, 0);
    else tryMove(0, dy > 0 ? 1 : -1);
  });
  canvas.addEventListener("pointerleave", ev => {
    hoveredTile = null;
    touchStartData.x = null;
    mouseHeld = false;
    mouseHoldTarget = null;
  });
  canvas.addEventListener("contextmenu", ev => ev.preventDefault());

  // Resize
  window.addEventListener("resize", () => reflowAdaptiveViewport(), { passive: true });
  window.addEventListener("orientationchange", () => setTimeout(reflowAdaptiveViewport, CONFIG.RESIZE_ORIENTATION_DELAY_MS), { passive: true });

  // visualViewport API for mobile keyboard handling
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => {
      const shell = document.getElementById("gameShell");
      if (shell) {
        shell.style.height = `${window.visualViewport.height}px`;
        shell.style.maxHeight = `${window.visualViewport.height}px`;
      }
      reflowAdaptiveViewport();
    }, { passive: true });
  }

  // Visibility
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && getSoundEnabled() && getAudioCtx && getAudioCtx() && getAudioCtx().state !== "running") {
      getAudioCtx().resume().then(() => startMusic({ floor: currentFloor || 0 })).catch(() => {});
    }
    if (document.visibilityState === "hidden") {
      lastFrameAt = 0;
      fixedAccumulator = 0;
      flushCurrentRunSave();
    }
  });
  window.addEventListener("pagehide", flushCurrentRunSave);

  // Game loop
  LoadingScreen.setProgress(100);
  setTimeout(() => {
    LoadingScreen.hide();
    requestAnimationFrame(loop);
  }, 300);
}

function loop(timestamp) {
if (!lastFrameAt) lastFrameAt = timestamp;
  const dtMs = Math.min(100, Math.max(0, timestamp - lastFrameAt));
  lastFrameAt = timestamp;
  const timeScale = slowMoTicks > 0 ? CONFIG.SLOW_MO_FACTOR : 1;
  fixedAccumulator += dtMs * timeScale;
  const fixedStepMs = 1000 / CONFIG.FIXED_STEP_FPS;
  let guard = 0;
  while (fixedAccumulator >= fixedStepMs && guard++ < CONFIG.MAX_FIXED_STEPS_PER_FRAME) {
    updateFixedStep();
    fixedAccumulator -= fixedStepMs;
  }
  if (toastTimer > 0) {
    toastTimer -= dtMs;
    if (toastTimer <= 0) toastEl.style.display = "none";
  }
  draw();
  requestAnimationFrame(loop);
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  boot();
  if (!window.__GAME__) {
    Object.defineProperty(window, "__GAME__", {
      configurable: true,
      get: () => ({
        px: player ? player.x : null,
        py: player ? player.y : null,
        state: gameState,
        combatMode,
        enemyName: currentEnemy ? currentEnemy.name : null,
        enemyHp: currentEnemy ? currentEnemy.hp : null,
        enemyMaxHp: currentEnemy ? currentEnemy.maxHp : null,
        actionBolts: actionBolts.length,
        blockWindow,
        playerAtbReady,
        playerStamina: player ? player.stamina : null,
        guarding: player ? !!player.guarding : false,
        specialCd: player ? player.specialCd : null,
        juice: { slowMoTicks, zoomPulse, freezeFrames, flash, shake, hitsTaken: juiceHitsTaken },
        cinema: { letterbox: cinemaLetterbox, bossZoom: cinemaBossZoom, tremor: cinemaBossTremor, floorSweep: cinemaFloorSweep, floorScale: cinemaFloorScale, surgeFx: cinemaSurgeFx, surgeScanline: cinemaSurgeScanline },
        comboStep: actionState ? actionState.comboStep : 0,
        enemyState: actionState ? { enraged: actionState.enraged, telegraph: actionState.telegraph ? actionState.telegraph.kind : null, windup: actionState.eWindup } : null,
        turnInfo: currentEnemy ? {
          nextIntent: (currentEnemy.nextIntent && currentEnemy.nextIntent.label) || (currentEnemy.intent ? "GOLPE CARREGADO" : null),
          intentType: (currentEnemy.nextIntent && currentEnemy.nextIntent.type) || (currentEnemy.intent ? "unleash" : null),
          element: currentEnemy.element,
          elementWeak: currentEnemy.elementWeak,
          elementResist: currentEnemy.elementResist,
          playerElement: getPlayerElement(),
          timingCombo: player ? player.timingCombo : 0,
          timingComboMult: player ? player.timingComboMult : 0,
          stamina: player ? player.stamina : null
        } : null,
        balance: player ? {
          level: player.level,
          maxHp: player.maxHp,
          atk: player.atk,
          def: player.def,
          mag: player.mag,
          crit: player.crit,
          gold: player.gold,
          xp: player.xp,
          nextXp: player.nextXp
        } : null,
        scaling: { floorPerFloor: CONFIG.FLOOR_SCALE_PER_FLOOR, bossPerFloor: CONFIG.BOSS_SCALE_PER_FLOOR, enemyDefPerFloor: CONFIG.ENEMY_DEF_SCALE_PER_FLOOR },
        debugBalanceConstants: () => ({
          guardingMult: CONFIG.GUARDING_DAMAGE_MULT,
          perfectDivisor: CONFIG.PERFECT_BLOCK_DIVISOR,
          critMult: CONFIG.NORMAL_CRIT_MULT,
          weakMult: CONFIG.ELEMENT_WEAK_MULT,
          resistMult: CONFIG.ELEMENT_RESIST_MULT,
          surgeMult: CONFIG.ACTION_SURGE_DMG_MULT,
          burstMult: CONFIG.BURST_DMG_MULT,
          phase2AtkMult: CONFIG.BOSS_PHASE2_ATK_MULT,
          phase2DefMult: CONFIG.BOSS_PHASE2_DEF_MULT,
          captureBase: CONFIG.CAPTURE_BASE_CHANCE
        }),
        accessibility: { colorBlindMode, highContrast, reduceFlash, uiScale, difficulty, dmgMult: getDifficultyDamageMult(), bonusPotions: getDifficultyBonusPotions(), startGold: getDifficultyStartGold(), potions: player ? player.potions : null },
        debugSetDifficulty: (mode) => { difficulty = ["normal", "easy", "story"].includes(mode) ? mode : "normal"; applyAccessibilitySettings(); return { difficulty, dmgMult: getDifficultyDamageMult(), potions: player ? player.potions : null }; },
        debugSetAccessibility: (patch) => {
          if (patch && ["off", "deuteranopia", "protanopia", "tritanopia"].includes(patch.colorBlindMode)) colorBlindMode = patch.colorBlindMode;
          if (patch && typeof patch.highContrast === "boolean") highContrast = patch.highContrast;
          if (patch && typeof patch.reduceFlash === "boolean") reduceFlash = patch.reduceFlash;
          if (patch && ["normal", "large", "xl"].includes(patch.uiScale)) uiScale = patch.uiScale;
          applyAccessibilitySettings();
          return { colorBlindMode, highContrast, reduceFlash, uiScale };
        },
        debugForceCombat: (kind = "goblin", mode = combatMode) => {
          if (gameState !== "explore" || !player) return "not-explore";
          const base = ENEMY_TYPES.find(e => e.kind === kind) || ENEMY_TYPES[0];
          const enemy = acquireEnemy();
          Object.assign(enemy, {
            ...base,
            x: player.x + 1, y: player.y,
            maxHp: base.hp, hp: base.hp,
            atk: base.atk, def: base.def, xp: base.xp,
            alive: true, alert: false, statusEffects: {}, level: 1
          });
          assignEnemyElement(enemy);
          enemies.push(enemy);
          if (mode === "turn") combatMode = "turn";
          else combatMode = "action";
          beginCombat(enemy);
          return "ok";
        },
        debugKillEnemy: () => {
          if (!currentEnemy || gameState !== "combat") return "not-combat";
          currentEnemy.hp = 0;
          endCombatVictory();
          return "ok";
        },
        debugCloseDialogs: () => {
          if (talentDialog) closeTalentDialog();
          if (shopDialog) closeShopDialog();
          if (eventDialog) closeEventDialog();
          if (mentorDialog) { mentorDialog = null; inputFrozen = false; gameState = "explore"; updateUI(); }
          return "ok";
        },
        debugForcePlayerHit: () => {
          if (gameState !== "combat" || combatMode !== "action" || !currentEnemy || !actionState) return "not-combat";
          const st = actionState;
          st.ex = st.px + 1;
          st.ey = st.py;
          st.eWindup = 1;
          return "ok";
        },
        debugPlayerAttack: () => {
          if (gameState !== "combat" || combatMode !== "action" || !currentEnemy || !actionState) return "not-combat";
          const st = actionState;
          st.ex = st.px + 2;
          st.ey = st.py;
          actionPlayerAttack();
          return { step: st.comboStep, freezeFrames };
        },
        debugForcePerfectDodge: () => {
          if (gameState !== "combat" || combatMode !== "action" || !currentEnemy || !actionState) return "not-combat";
          const st = actionState;
          st.ex = st.px + 1;
          st.ey = st.py;
          st.dashTicks = CONFIG.ACTION_DASH_TICKS;
          st.iframes = CONFIG.ACTION_DASH_IFRAMES;
          st.eWindup = 1;
          return "ok";
        },
        debugSetEnemyHpRatio: (ratio) => {
          if (gameState !== "combat" || !currentEnemy) return "not-combat";
          currentEnemy.hp = Math.max(1, Math.round(currentEnemy.maxHp * ratio));
          return currentEnemy.hp;
        },
        debugForceEnemyWindup: () => {
          if (gameState !== "combat" || combatMode !== "action" || !currentEnemy || !actionState) return "not-combat";
          const st = actionState;
          st.ex = st.px + 1;
          st.ey = st.py;
          const profile = getEnemyActionProfile();
          st.eWindup = Math.max(18, Math.round(profile.windup));
          st.telegraph = { kind: profile.ranged ? "ranged" : "melee", life: st.eWindup };
          return st.telegraph.kind;
        },
        debugTurnAttack: (timingFrac = 0.5) => {
          if (gameState !== "combat" || combatMode !== "turn" || !currentEnemy) return "not-combat";
          if (playerAtbReady && !inTurn) {
            playerAttack(false);
            commitAttackSwing(false, timingFrac);
            return { timingCombo: player.timingCombo, timingComboMult: player.timingComboMult, stamina: player.stamina, enemyHp: currentEnemy.hp };
          }
          if (!playerAtbReady && !inTurn) {
            playerAtbReady = true;
            openCommandMenu();
            return "ready";
          }
          return "waiting";
        },
        debugCinema: (which) => {
          if (which === "bossIntro") { triggerBossIntroCinema(); return "ok"; }
          if (which === "bossDeath") { triggerBossDeathCinema(); return "ok"; }
          if (which === "surge") { triggerSurgeScreenFx(); return "ok"; }
          if (which === "letterbox") { setCinemaLetterbox(1); return "ok"; }
          if (which === "sweep") { cinemaFloorSweep = CONFIG.FLOOR_TRANSITION_TICKS; cinemaFloorScale = CONFIG.CINEMA_FLOOR_SCALE_IN; return "ok"; }
          return "unknown";
        },
        debugSpawnScaledEnemy: (kind = "goblin", floor = 5) => {
          if (gameState !== "explore" || !player) return "not-explore";
          const base = ENEMY_TYPES.find(e => e.kind === kind) || ENEMY_TYPES[0];
          const enemy = acquireEnemy();
          const scale = CONFIG.FLOOR_SCALE_BASE + (floor - 1) * CONFIG.FLOOR_SCALE_PER_FLOOR;
          const defScale = Math.floor((floor - 1) * CONFIG.ENEMY_DEF_SCALE_PER_FLOOR);
          Object.assign(enemy, {
            ...base,
            x: player.x + 1, y: player.y,
            maxHp: Math.round(base.hp * scale), hp: Math.round(base.hp * scale),
            atk: Math.round(base.atk * scale), def: base.def + defScale, xp: Math.round(base.xp * scale),
            alive: true, alert: false, statusEffects: {}, level: 1
          });
          assignEnemyElement(enemy);
          enemies.push(enemy);
          combatMode = "turn";
          beginCombat(enemy);
          return { maxHp: enemy.maxHp, atk: enemy.atk, def: enemy.def, xp: enemy.xp, scale };
        }
      })
    });
  }
}

