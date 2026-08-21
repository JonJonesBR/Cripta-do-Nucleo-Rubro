// Pool de talentos (escolhas de level-up) + seleção pura.
// Fonte única: game.ts rola as escolhas via rollTalentChoices e aplica a apply().

import { CONFIG } from "./config";

export type PlayerLike = {
  def?: number;
  atk?: number;
  maxHp?: number;
  hp?: number;
  mag?: number;
  crit?: number;
  gold?: number;
  potions?: number;
  killHeal?: number;
  specialMaxCd?: number;
  dodgeChance?: number;
};

export type Talent = {
  name: string;
  desc: string;
  apply: (p: PlayerLike) => void;
};

export type Rng = () => number;

export const TALENT_POOL: Talent[] = [
  { name: "Muralha", desc: "+3 DEF", apply: p => { p.def = (p.def || 0) + 3; } },
  { name: "Mãos Firmes", desc: "+2 ATK", apply: p => { p.atk = (p.atk || 0) + 2; } },
  { name: "Sangue Rubro", desc: "+12 PV máx", apply: p => { p.maxHp = (p.maxHp || 0) + 12; p.hp = (p.hp || 0) + 12; } },
  { name: "Afinidade Arcanística", desc: "+3 MAG", apply: p => { p.mag = (p.mag || 0) + 3; } },
  { name: "Olhos do Caçador", desc: "+4% crítico", apply: p => { p.crit = Math.min(CONFIG.MAX_CRIT, (p.crit || 0) + 0.04); } },
  { name: "Saqueador", desc: "+20 ouro", apply: p => { p.gold = (p.gold || 0) + 20; } },
  { name: "Alquimista", desc: "+1 poção", apply: p => { p.potions = (p.potions || 0) + 1; } },
  { name: "Vitalidade", desc: "+1 killHeal", apply: p => { p.killHeal = (p.killHeal || 0) + 1; } },
  { name: "Mente Viva", desc: "Habilidades +1 turno mais rápido", apply: p => { p.specialMaxCd = Math.max(1, (p.specialMaxCd || 4) - 1); } },
  { name: "Presságio", desc: "+15% chance de esquiva", apply: p => { p.dodgeChance = Math.min(0.5, (p.dodgeChance || 0) + 0.15); } }
];

// Seleciona até 3 talentos ainda não escolhidos (fonte única da rolagem).
export function rollTalentChoices(chosenTalents: string[] = [], rng: Rng = Math.random): Talent[] {
  const pool = TALENT_POOL.filter(t => !chosenTalents.includes(t.name));
  const choices: Talent[] = [];
  while (choices.length < 3 && pool.length) {
    const idx = Math.floor(rng() * pool.length);
    choices.push(pool.splice(idx, 1)[0]);
  }
  return choices;
}
