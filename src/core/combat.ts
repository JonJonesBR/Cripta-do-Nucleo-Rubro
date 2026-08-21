// Pure combat formulas (no DOM/state dependency). `rng` is injectable for tests.
// Fonte única das fórmulas de dano do jogo — game.ts importa daqui, nunca duplica.

import { CONFIG } from "../data/config";

export type Rng = () => number;

export type AttackRollOpts = {
  /** damage uniforme extra de 0..variance (default 2) */
  variance?: number;
  /** soma fixa à base antes do rolamento (default 0) */
  min?: number;
  /** divisor da defesa (default 2) */
  defDiv?: number;
  /** multiplicador do ataque (default 1) */
  atkMult?: number;
  /** arredonda a base em vez de truncar (default false) */
  roundAtk?: boolean;
  /** resultado mínimo (default 1) */
  floor?: number;
};

// Rolamento de golpe físico genérico:
//   max(floor, round/floor(atk*atkMult + min) + rand(0..variance) - floor(def/defDiv))
// Cobre todas as variantes do jogo: defesa inteira (defDiv 1), meia (2), mágica (3),
// ataques com multiplicador (atkMult), faixa deslocada (min) e dano mínimo próprio.
export function attackRoll(atk, def, opts: AttackRollOpts = {}, rng: Rng = Math.random) {
  const { variance = 2, min = 0, defDiv = 2, atkMult = 1, roundAtk = false, floor: floorMin = 1 } = opts;
  const base = atk * atkMult + min;
  const scaled = roundAtk ? Math.round(base) : Math.floor(base);
  return Math.max(floorMin, scaled + Math.floor(rng() * (variance + 1)) - Math.floor(def / defDiv));
}

// Golpe físico padrão: atk + [0..variance] - floor(def/2), mínimo 1.
export function physicalDamage(atk, def, variance = 2, rng: Rng = Math.random) {
  return attackRoll(atk, def, { variance }, rng);
}

// Golpe mágico que ignora a maior parte da defesa.
export function magicDamage(mag, def = 0, variance = 2, rng: Rng = Math.random) {
  return Math.max(1, mag + Math.floor(rng() * (variance + 1)) - Math.floor(def / 3));
}

// Aplica o multiplicador de crítico quando o rolamento passa.
export function applyCrit(baseDamage, critChance, mult, rng: Rng = Math.random) {
  return rng() < critChance ? Math.floor(baseDamage * mult) : baseDamage;
}

// Dano de armadilhas de piso: TRAP_DMG_MIN..TRAP_DMG_MAX reduzido pela defesa, mínimo após defesa.
export function trapDamage(def, rng: Rng = Math.random) {
  const base = CONFIG.TRAP_DMG_MIN + Math.floor(rng() * (CONFIG.TRAP_DMG_MAX - CONFIG.TRAP_DMG_MIN + 1));
  return Math.max(CONFIG.TRAP_DMG_MIN_AFTER_DEF, base - Math.floor(def / CONFIG.TRAP_DEF_DIVISOR));
}

// Dano final após defesa: guard aplica GUARDING_DAMAGE_MULT; bloqueio divide por
// PERFECT_BLOCK_DIVISOR. Cumulativos — no jogo o divisor é aplicado a todo golpe
// bloqueado e o mult a todo golpe com postura defensiva ativa.
export function guardedDamage(raw, blocking, perfect) {
  let d = raw;
  if (blocking) d = Math.max(1, Math.floor(d * CONFIG.GUARDING_DAMAGE_MULT));
  if (perfect) d = Math.max(1, Math.floor(d / CONFIG.PERFECT_BLOCK_DIVISOR));
  return d;
}

// XP necessário para ir de `level` a `level + 1` (curva do jogo).
export function xpForLevel(level) {
  let next = CONFIG.LEVEL_1_XP;
  for (let i = 1; i < level; i++) {
    next = Math.floor(next * CONFIG.XP_GROWTH_MULT + CONFIG.XP_GROWTH_ADD);
  }
  return next;
}

export type SpecialStats = {
  classKey: string;
  atk: number;
  mag: number;
  level: number;
  def: number;
  /** monstro capturado com skill própria (player.activeSlot > 0) */
  monsterSkill?: boolean;
  skillAtkMult?: number;
};

// Dano das habilidades especiais por classe — fonte única usada pelos dois modos
// de combate (ação e turnos). Aplica as fórmulas históricas de cada classe.
export function specialDamage(stats: SpecialStats, rng: Rng = Math.random) {
  const { classKey, atk, mag, level, def, monsterSkill = false, skillAtkMult = 1.3 } = stats;
  if (monsterSkill) {
    // Skill do monstro ativo: round(atk*mult + level*0.8) - floor(def/2), mínimo 2.
    return attackRoll(atk, def, { atkMult: skillAtkMult, min: level * 0.8, variance: 0, roundAtk: true, floor: 2 }, rng);
  }
  switch (classKey) {
    case "warrior": // floor(atk*0.7) - floor(def/2), mínimo 1.
      return attackRoll(atk, def, { atkMult: 0.7, variance: 0 }, rng);
    case "rogue": // atk + rand(2,5) - def (defesa inteira), mínimo 1.
      return attackRoll(atk, def, { variance: 3, min: 2, defDiv: 1 }, rng);
    case "mage": // mag + rand(5,10) + level*2 - floor(def/2), mínimo 3.
      return attackRoll(mag, def, { variance: 5, min: 5 + level * 2, floor: 3 }, rng);
    case "beastmaster": // atk + rand(1,3) + floor(level/2) - def, mínimo 2.
      return attackRoll(atk, def, { variance: 2, min: 1 + Math.floor(level / 2), defDiv: 1, floor: 2 }, rng);
    case "witch": // mag + rand(3,7) + floor(level*1.2) - floor(def/3), mínimo 2.
      return attackRoll(mag, def, { variance: 4, min: 3 + Math.floor(level * 1.2), defDiv: 3, floor: 2 }, rng);
    default:
      // Classe desconhecida (salvaguarda): mesmo formato do monstro.
      return attackRoll(atk, def, { atkMult: skillAtkMult, min: level * 0.8, variance: 0, roundAtk: true, floor: 2 }, rng);
  }
}

// Dano do companheiro do Domador: rand(BEAST_DAMAGE_MIN..MAX) + floor(level*0.8), mínimo 2.
export function summonDamage(level, rng: Rng = Math.random) {
  const base = CONFIG.BEAST_DAMAGE_MIN + Math.floor(rng() * (CONFIG.BEAST_DAMAGE_MAX - CONFIG.BEAST_DAMAGE_MIN + 1));
  return Math.max(2, base + Math.floor(level * 0.8));
}
