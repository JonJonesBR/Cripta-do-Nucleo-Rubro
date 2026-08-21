// IA de inimigos — decisões de ação, rotação de padrões do chefe e auras de
// sinergia. Fonte única: game.ts aplica as decisões (FX/logs/dano).

import { CONFIG } from "../data/config";

export type Rng = () => number;

export type EnemyAction =
  | "unleash" // descarrega o golpe carregado no turno anterior
  | "charge"  // carrega (telegraph) um golpe poderoso
  | "drain"   // drena PV do jogador
  | "attack"  // ataque comum (janela de defesa)
  | "fire"    // rajada (fase 2 do chefe)
  | "stun"    // grito atordoante (fase 2)
  | "purge"   // anula momentum/combo (fase 2)
  | "assist"  // aliado apoia com cura
  | "special"; // habilidade especial do tipo

export type AiEnemy = {
  intent?: unknown;
  boss?: boolean;
  phase2?: boolean;
  bossPattern?: number;
  kind?: string;
  synergy?: { allies: unknown[] };
  telegraphCooldown?: number;
};

// Tipos de inimigo com habilidade especial (roster fixo do jogo).
export const ENEMY_SPECIAL_KINDS = ["bat", "goblin", "armor", "specter", "golem", "wraith"];

// Índice do próximo padrão do chefe (rotação por fase; fase 2 tem 4 padrões).
export function bossPatternIndex(pattern: number | undefined, phase2: boolean): number {
  return (pattern || 0) % (phase2 ? 4 : 3);
}

// Decisão de ação do inimigo: prioridade unleash > padrão do chefe > sinergia >
// habilidade especial > telegraph > ataque comum.
export function decideEnemyAction(enemy: AiEnemy, rng: Rng = Math.random): EnemyAction {
  if (enemy.intent) return "unleash";
  if (enemy.boss) {
    const p = bossPatternIndex(enemy.bossPattern, !!enemy.phase2);
    if (!enemy.phase2) {
      if (p === 0) return "charge";
      if (p === 1) return "drain";
      return "attack";
    }
    if (p === 0) return "fire";
    if (p === 1) return "stun";
    if (p === 2) return "purge";
    return "drain";
  }
  const hasAllies = !!enemy.synergy && enemy.synergy.allies.length > 0;
  if (hasAllies && rng() < CONFIG.SYNERGY_ASSIST_CHANCE) return "assist";
  if (ENEMY_SPECIAL_KINDS.includes(enemy.kind || "") && rng() < CONFIG.ENEMY_SPECIAL_CHANCE) return "special";
  if (enemy.telegraphCooldown === 0 && rng() < CONFIG.TELEGRAPH_CHANCE) return "charge";
  return "attack";
}

export type SynergyEnemy = { x: number; y: number; kind?: string; alive?: boolean };

export type Synergy = { allies: SynergyEnemy[]; auraAtk: number; auraDef: number; regen: number };

// Auras de sinergia: aliados vivos dentro do alcance (distância Chebyshev) somam
// ataque (qualquer aliado), defesa (golem), regeneração (treant) ou ataque+1 (lich).
export function computeSynergy(enemies: SynergyEnemy[], self: SynergyEnemy): Synergy {
  const result: Synergy = { allies: [], auraAtk: 0, auraDef: 0, regen: 0 };
  for (const e of enemies) {
    if (e === self || !e.alive) continue;
    const dist = Math.max(Math.abs(e.x - self.x), Math.abs(e.y - self.y));
    if (dist > CONFIG.SYNERGY_RANGE) continue;
    result.allies.push(e);
    if (e.kind === "treant") result.regen += CONFIG.SYNERGY_AURA_REGEN;
    else if (e.kind === "golem") result.auraDef += CONFIG.SYNERGY_AURA_DEF + 1;
    else if (e.kind === "lich") result.auraAtk += CONFIG.SYNERGY_AURA_ATK + 1;
    else result.auraAtk += CONFIG.SYNERGY_AURA_ATK;
  }
  return result;
}
