// Regras de captura, geração de monstro selvagem e transferência de equipe.
// Fonte única: game.ts aplica as funções sobre o estado global.

import { CONFIG } from "../data/config";
import { ENEMY_TYPES } from "../data/enemies";

export type Rng = () => number;

export type FighterState = {
  className: string;
  classKey: string;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  mag: number;
  crit: number;
  stamina: number;
  maxStamina: number;
  special: string;
  specialCd: number;
  specialMaxCd: number;
  statusEffects: Record<string, unknown>;
  skillAtkMult?: number;
  skillHealRatio?: number;
  guarding?: boolean;
};

export type MonsterState = {
  name: string;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  mag: number;
  crit: number;
  skill: string;
  skillCd: number;
  skillAtkMult?: number;
  skillHealRatio?: number;
  statusEffects: Record<string, unknown>;
};

export type ChampionSnapshot = Omit<FighterState, "skillAtkMult" | "skillHealRatio" | "guarding">;

// Chance de captura: base + bônus por PV faltante (quanto mais ferido, maior a chance).
export function captureChance(hp: number, maxHp: number): number {
  const ratio = Math.min(1, Math.max(0, hp / maxHp));
  return CONFIG.CAPTURE_BASE_CHANCE + (1 - ratio) * CONFIG.CAPTURE_HP_RATIO_BONUS;
}

export function captureSuccess(hp: number, maxHp: number, rng: Rng = Math.random): boolean {
  return rng() < captureChance(hp, maxHp);
}

// Inimigo selvagem escalado por andar e nível do jogador (fonte única do scaling).
export function makeWildEnemy(currentFloor: number, playerLevel: number, rng: Rng = Math.random) {
  const floorPool = ENEMY_TYPES.filter(e => e.minFloor <= currentFloor);
  const base = floorPool[Math.floor(rng() * floorPool.length)];
  const floorBonus = currentFloor - 1;
  const bonus = Math.max(0, playerLevel - 1) + floorBonus;
  return {
    ...base,
    x: 0, y: 0,
    maxHp: base.hp + bonus * 5,
    hp: base.hp + bonus * 5,
    atk: base.atk + bonus,
    def: base.def + Math.floor(bonus / 2),
    xp: base.xp + bonus * 4,
    alive: true,
    wild: true,
    statusEffects: {}
  };
}

// Snapshot do campeão (usado ao trocar para um monstro; restaurado ao voltar).
export function snapshotChampion(player: FighterState): ChampionSnapshot {
  return {
    className: player.className,
    hp: player.hp, maxHp: player.maxHp,
    atk: player.atk, def: player.def, mag: player.mag, crit: player.crit,
    stamina: player.stamina, maxStamina: player.maxStamina,
    special: player.special, specialCd: player.specialCd, specialMaxCd: player.specialMaxCd,
    classKey: player.classKey, statusEffects: player.statusEffects
  };
}

// Restaura o campeão a partir do snapshot; retorna false se não houver snapshot.
export function restoreChampion(player: FighterState, snapshot: ChampionSnapshot | null | undefined): boolean {
  if (!snapshot) return false;
  player.className = snapshot.className;
  player.hp = snapshot.hp; player.maxHp = snapshot.maxHp;
  player.atk = snapshot.atk; player.def = snapshot.def; player.mag = snapshot.mag; player.crit = snapshot.crit;
  player.stamina = snapshot.stamina; player.maxStamina = snapshot.maxStamina;
  player.special = snapshot.special; player.specialCd = snapshot.specialCd; player.specialMaxCd = snapshot.specialMaxCd;
  player.classKey = snapshot.classKey;
  player.statusEffects = snapshot.statusEffects;
  // limpa campos exclusivos de monstro deixados por applyMonsterToPlayer
  player.skillAtkMult = undefined;
  player.skillHealRatio = undefined;
  player.guarding = false;
  return true;
}

// Aplica o estado do monstro ao jogador (troca para o lutador da equipe).
export function applyMonsterToPlayer(player: FighterState, m: MonsterState) {
  player.className = m.name;
  player.hp = m.hp; player.maxHp = m.maxHp;
  player.atk = m.atk; player.def = m.def; player.mag = m.mag; player.crit = m.crit;
  player.stamina = 3; player.maxStamina = 3;
  player.special = m.skill; player.specialCd = m.skillCd; player.specialMaxCd = CONFIG.MONSTER_SKILL_CD;
  player.skillAtkMult = m.skillAtkMult || 1.3;
  player.skillHealRatio = m.skillHealRatio || 0;
  player.statusEffects = m.statusEffects || {};
  player.guarding = false;
}

// Devolve o estado do jogador (lutador ativo) para o monstro da equipe.
export function readPlayerToMonster(m: MonsterState, player: FighterState) {
  m.hp = player.hp; m.maxHp = player.maxHp;
  m.atk = player.atk; m.def = player.def; m.mag = player.mag; m.crit = player.crit;
  m.skillCd = player.specialCd;
  m.statusEffects = player.statusEffects;
}
