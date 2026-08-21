export const ENEMY_TYPES = [
  { name: "Lodo Azul", hp: 16, atk: 5, def: 1, xp: 8, color: "#5ca8ff", kind: "slime", minFloor: 1 },
  { name: "Morcego Runeiro", hp: 14, atk: 6, def: 1, xp: 9, color: "#b86cff", kind: "bat", minFloor: 1 },
  { name: "Lodo Ácido", hp: 20, atk: 6, def: 1, xp: 13, color: "#8fe388", kind: "slime", minFloor: 2 },
  { name: "Goblin de Cobre", hp: 21, atk: 7, def: 2, xp: 12, color: "#69e081", kind: "goblin", minFloor: 2 },
  { name: "Cavaleiro Oco", hp: 28, atk: 8, def: 3, xp: 18, color: "#d7d7ff", kind: "armor", minFloor: 2 },
  { name: "Espectro", hp: 18, atk: 8, def: 0, xp: 16, color: "#c084fc", kind: "specter", minFloor: 3 },
  { name: "Escorpião Rubro", hp: 22, atk: 8, def: 2, xp: 15, color: "#ff9d7a", kind: "slime", minFloor: 3 },
  { name: "Sentinelha de Bronze", hp: 30, atk: 8, def: 5, xp: 19, color: "#a5b4fc", kind: "armor", minFloor: 3 },
  { name: "Treante Sombrio", hp: 32, atk: 6, def: 6, xp: 20, color: "#4ade80", kind: "treant", minFloor: 3 },
  { name: "Arqueiro Sombrio", hp: 24, atk: 8, def: 2, xp: 18, color: "#5eead4", kind: "goblin", minFloor: 3 },
  { name: "Cavaleiro Rubro", hp: 34, atk: 9, def: 4, xp: 23, color: "#ff9d7a", kind: "armor", minFloor: 4 },
  { name: "Golem de Runa", hp: 36, atk: 10, def: 5, xp: 24, color: "#fbbf24", kind: "golem", minFloor: 4 },
  { name: "Lich Esquecido", hp: 28, atk: 11, def: 2, xp: 28, color: "#a78bfa", kind: "lich", minFloor: 4 },
  { name: "Ceifador Ancião", hp: 30, atk: 11, def: 3, xp: 26, color: "#d8b4fe", kind: "wraith", minFloor: 4 },
  { name: "Golem de Alma", hp: 44, atk: 11, def: 6, xp: 32, color: "#ff8fa3", kind: "golem", minFloor: 5 },
  { name: "Espectro Rubro", hp: 24, atk: 11, def: 2, xp: 22, color: "#ff6b6b", kind: "wraith", minFloor: 5 },
  { name: "Heraldo do Vazio", hp: 38, atk: 13, def: 3, xp: 36, color: "#f0abfc", kind: "lich", minFloor: 5 },
  { name: "Arcanjo Quebrado", hp: 34, atk: 12, def: 3, xp: 34, color: "#f5d0ff", kind: "lich", minFloor: 5 }
];

export const BOSS = {
  name: "Guardião Rubro", hp: 78, atk: 11, def: 4, xp: 50,
  color: "#ff5a5a", kind: "boss", boss: true
};

export const MINIBOSSES = [
  { name: "Sentinel do Núcleo", hp: 46, atk: 9, def: 4, xp: 30, color: "#ffb45a", kind: "armor", floor: 3, scaleOffset: 0.25 },
  { name: "Arauto da Fenda", hp: 52, atk: 11, def: 5, xp: 42, color: "#d946ef", kind: "wraith", floor: 5, scaleOffset: 0.35 }
];

export const ELITE_AFFIXES = [
  { id: "armored", name: "Blindado", color: "#8fd0ff", hpMult: 1.4, atkMult: 1, defBonus: 3, desc: "+40% PV, def+3, resiste ataques" },
  { id: "wild", name: "Selvagem", color: "#ff8a5c", hpMult: 1.1, atkMult: 1.4, desc: "ATK+40%, ataca primeiro" },
  { id: "regenerating", name: "Regenerativo", color: "#7ce08a", hpMult: 1.25, atkMult: 1.1, desc: "Recupera PV lentamente" },
  { id: "eldritch", name: "Eldritch", color: "#c08cff", hpMult: 1.3, atkMult: 1.2, defBonus: 2, desc: "Def+2, chance de crítica" },
  { id: "swift", name: "Veloz", color: "#ffe45c", hpMult: 1.1, atkMult: 1.15, desc: "Ataca com mais frequência" },
  { id: "venomous", name: "Venéfico", color: "#7cfca4", hpMult: 1.25, atkMult: 1.15, desc: "Lâminas envenenadas causam sangramento" }
];

export const ELEMENT_AFFINITY = {
  physical: { name: "Físico", color: "#c8c8d8", icon: "⚔" },
  fire: { name: "Fogo", color: "#ff8a3c", icon: "▲" },
  ice: { name: "Gelo", color: "#8fd0ff", icon: "❄" },
  arcane: { name: "Arcano", color: "#7c9cff", icon: "✦" },
  chaos: { name: "Caos", color: "#c084fc", icon: "✧" }
};

export const ENEMY_ELEMENT_BY_KIND = {
  slime: { element: "physical", weak: "ice", resist: "physical" },
  bat: { element: "chaos", weak: "arcane", resist: "physical" },
  goblin: { element: "physical", weak: "arcane", resist: "ice" },
  armor: { element: "physical", weak: "fire", resist: "physical" },
  specter: { element: "chaos", weak: "arcane", resist: "chaos" },
  treant: { element: "ice", weak: "fire", resist: "physical" },
  golem: { element: "physical", weak: "chaos", resist: "ice" },
  lich: { element: "chaos", weak: "arcane", resist: "fire" },
  wraith: { element: "chaos", weak: "arcane", resist: "physical" },
  boss: { element: "chaos", weak: "arcane", resist: "fire" }
};
