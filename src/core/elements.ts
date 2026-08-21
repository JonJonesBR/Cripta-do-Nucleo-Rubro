// Sistema de elementos e afixos de elite — lógica pura (fonte única).
// game.ts importa daqui; as regras de fraqueza/resistência e os multiplicadores
// de afixos não se duplicam mais nos dois modos de combate.

import { CONFIG } from "../data/config";
import { ELITE_AFFIXES, ENEMY_ELEMENT_BY_KIND } from "../data/enemies";

export type Rng = () => number;

// Elemento do jogador por classe (fonte única — usado pelos 2 modos de combate).
export function playerElementForClass(classKey?: string): string {
  if (classKey === "mage") return "arcane";
  if (classKey === "witch") return "chaos";
  if (classKey === "warrior") return "fire";
  if (classKey === "rogue") return "ice";
  return "physical";
}

export type ElementalTarget = {
  elementWeak?: string;
  elementResist?: string;
};

// Multiplicador de elemento: fraqueza amplifica (1.5x), resistência reduz (0.7x).
export function elementMultiplier(attackElement: string, target: ElementalTarget | null | undefined) {
  if (!target) return 1;
  if (target.elementWeak && target.elementWeak === attackElement) return CONFIG.ELEMENT_WEAK_MULT;
  if (target.elementResist && target.elementResist === attackElement) return CONFIG.ELEMENT_RESIST_MULT;
  return 1;
}

export type EnemyLike = {
  kind?: string;
  element?: string;
  elementWeak?: string;
  elementResist?: string;
};

// Perfil elemental por tipo de inimigo; kind desconhecido cai no perfil físico.
export function assignEnemyElement(enemy: EnemyLike) {
  const prof = ENEMY_ELEMENT_BY_KIND[enemy.kind || ""] || { element: "physical", weak: "arcane", resist: "chaos" };
  enemy.element = prof.element;
  enemy.elementWeak = prof.weak;
  enemy.elementResist = prof.resist;
  return enemy;
}

export type AffixableEnemy = EnemyLike & {
  name: string;
  maxHp: number;
  hp: number;
  def: number;
  atk: number;
  color: string;
  affix?: string;
  eliteBaseName?: string;
};

// Aplica um afixo de elite aleatório: nome, multiplicadores de PV/ATK, bônus de defesa e cor.
export function applyEliteAffix(enemy: AffixableEnemy, rng: Rng = Math.random) {
  const affix = ELITE_AFFIXES[Math.floor(rng() * ELITE_AFFIXES.length)];
  enemy.affix = affix.id;
  enemy.eliteBaseName = enemy.name;
  enemy.name = enemy.name + " [" + affix.name + "]";
  enemy.maxHp = Math.round(enemy.maxHp * affix.hpMult);
  enemy.hp = enemy.maxHp;
  enemy.def += (affix.defBonus || 0);
  enemy.atk = Math.round(enemy.atk * (affix.atkMult || 1));
  enemy.color = affix.color;
  return enemy;
}
