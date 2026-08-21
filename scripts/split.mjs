// Splits the legacy single-file build into a Vite project layout.
//   index.html        -> full document shell + original body
//   src/style.css     -> extracted <style> block
//   src/game.raw.ts   -> extracted <script> content (reference, unmodified)
//   src/game.ts       -> script + module surgery (imports, extracted blocks removed)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// AVISO: src/ é a fonte da verdade atual. Este script regenera o projeto a partir
// do HTML legado arquivado em legacy/ — use apenas para recuperar o estado original.
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const LEGACY = join(ROOT, "legacy", "CRIPTA DO NÚCLEO RUBRO (REPAGINADA v8).html");

const html = readFileSync(LEGACY, "utf8");

const cssMatch = html.match(/<style>([\s\S]*?)<\/style>/);
if (!cssMatch) throw new Error("No <style> block found");

const headEnd = html.indexOf("</head>");
const bodyStart = html.indexOf("<body>");
const scriptStart = html.indexOf("<script>");
if (headEnd < 0 || bodyStart < 0 || scriptStart < 0) {
  throw new Error("Could not locate document markers");
}
const scriptEnd = html.indexOf("</script>", scriptStart);
if (scriptEnd < 0) throw new Error("Could not locate </script>");

const css = cssMatch[1];
const bodyHtml = html.slice(bodyStart, scriptStart);
const js = html.slice(scriptStart + "<script>".length, scriptEnd).trim();

for (const dir of ["src", "src/data", "src/core", "tests", "scripts", "public"]) {
  mkdirSync(join(ROOT, dir), { recursive: true });
}

writeFileSync(join(ROOT, "src", "style.css"), css, "utf8");
writeFileSync(join(ROOT, "src", "game.raw.ts"), js, "utf8");

const head = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
  <title>Dungeon 16-bit: Cripta do Núcleo Rubro</title>
  <meta name="theme-color" content="#080816" />
</head>
`;
const tail = `  <script type="module" src="/src/main.ts"></script>
</body>
</html>
`;

writeFileSync(join(ROOT, "index.html"), head + bodyHtml.trim() + "\n" + tail, "utf8");

// ---------------------------------------------------------------------------
// game.ts surgery
// ---------------------------------------------------------------------------
const IMPORTS = `import { COLORS } from "./data/colors";
import {
  CONFIG, TILE, SPRITE_SCALE, MAP_W, MAP_H, VIEW_W, VIEW_H, FINAL_FLOOR,
  TILE_WALL, TILE_FLOOR, TILE_EXIT, DIR_X, DIR_Y
} from "./data/config";
import { CLASS_DATA } from "./data/classes";
import { ENEMY_TYPES, BOSS, ELITE_AFFIXES } from "./data/enemies";
import { RELIC_EFFECTS, RELIC_POOL } from "./data/relics";
import { EVENT_TYPES, EVENT_OPTIONS } from "./data/events";
import { INTRO_TEXT, LORE_FRAGMENTS, FLOOR_MESSAGES, MENTOR_TEXT } from "./data/lore";
import { ACHIEVEMENTS } from "./data/achievements";
import { STRINGS } from "./data/strings";
import {
  rand, chance, hashSeed, mulberry32, seedRand, seedChance, setGameSeed,
  getGameSeed, setSeedFloor, resetSeedForFloor, clamp, key, distance
} from "./core/rng";
import { checksum, migrateRun } from "./core/save";
import { findPathBFSGrid } from "./core/pathfinding";
import { physicalDamage, magicDamage, applyCrit, guardedDamage } from "./core/combat";

`;

function removeByMarkers(source, startMarker, endMarker, label) {
  const s = source.indexOf(startMarker);
  if (s < 0) throw new Error(`start marker not found: ${label}`);
  const e = source.indexOf(endMarker, s);
  if (e < 0) throw new Error(`end marker not found: ${label}`);
  return source.slice(0, s) + source.slice(e + endMarker.length);
}

function replaceOnce(source, target, replacement, label) {
  const i = source.indexOf(target);
  if (i < 0) throw new Error(`replace target not found: ${label}`);
  return source.slice(0, i) + replacement + source.slice(i + target.length);
}

function buildGameTs(js) {
  let code = js;

  // 1. Remove the contiguous data-constants region (COLORS ... CONFIG).
  code = removeByMarkers(
    code,
    "const COLORS = {",
    "  LOG_LINE_FADE_Y: 6,\n};",
    "data-region"
  );

  // 2. Remove the RNG helpers (now in core/rng.ts).
  code = removeByMarkers(
    code,
    "const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;",
    "const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);",
    "rng-helpers"
  );

  // 3. Remove checksum + migrateRun (now in core/save.ts).
  code = removeByMarkers(code, "function checksum(data) {", "  return (hash >>> 0).toString(16);\n}", "checksum");
  code = removeByMarkers(code, "function migrateRun(run) {", "  return run;\n}", "migrateRun");

  // 4. Remove ACHIEVEMENTS (now in data/achievements.ts).
  code = removeByMarkers(
    code,
    "const ACHIEVEMENTS = [",
    '  { id: "victor", name: "Vencedor", desc: "Complete a cripta" }\n];',
    "achievements"
  );

  // 5. Remove STRINGS (now in data/strings.ts).
  code = removeByMarkers(
    code,
    "const STRINGS = {",
    '    ROLE_WITCH: "Chaotic magic"\n  }\n};',
    "strings"
  );

  // 6. findPathBFS -> thin wrapper around pure BFS.
  code = replaceOnce(
    code,
    "function findPathBFS(fromX, fromY, toX, toY) {",
    "function findPathBFS(fromX, fromY, toX, toY) {\n  return findPathBFSGrid(MAP_W, MAP_H, fromX, fromY, toX, toY, (x, y) => occupiedByEnemy(x, y) || !isWalkable(dungeon, x, y));\n}\n\nfunction findPathBFSLegacy(fromX, fromY, toX, toY) {",
    "findPathBFS-head"
  );

  // 7. Targeted refactors for seed state moved to core/rng.ts.
  code = replaceOnce(
    code,
    "      locale: currentLocale,\n      gameSeed,\n      gfxPresent",
    "      locale: currentLocale,\n      gameSeed: getGameSeed(),\n      gfxPresent",
    "saveSettings-seed"
  );
  code = replaceOnce(
    code,
    '    if (typeof s.gameSeed === "string") { gameSeed = s.gameSeed; seedRngCache = null; }',
    '    if (typeof s.gameSeed === "string") { setGameSeed(s.gameSeed); }',
    "loadSettings-seed"
  );
  code = replaceOnce(
    code,
    "    if (gameSeed) seedInput.value = gameSeed;",
    "    if (getGameSeed()) seedInput.value = getGameSeed();",
    "boot-seed-input"
  );
  code = replaceOnce(
    code,
    "    resetSeedForFloor();\n    dungeon = generateDungeon();",
    "    setSeedFloor(1);\n    resetSeedForFloor();\n    dungeon = generateDungeon();",
    "startGame-seed-floor"
  );
  code = replaceOnce(
    code,
    "  currentFloor = nextFloor;\n  resetSeedForFloor();",
    "  currentFloor = nextFloor;\n  setSeedFloor(currentFloor);\n  resetSeedForFloor();",
    "finishDescend-seed-floor"
  );

  // 8. Guard boot so the module can be imported in non-DOM contexts.
  code = code.trimEnd();
  code = replaceOnce(
    code,
    "boot();",
    'if (typeof document !== "undefined" && typeof window !== "undefined") {\n  boot();\n}',
    "boot-call"
  );

  return IMPORTS + code + "\n";
}

writeFileSync(join(ROOT, "src", "game.ts"), buildGameTs(js), "utf8");

console.log("split ok: index.html, src/style.css, src/game.ts (+ src/game.raw.ts reference)");
