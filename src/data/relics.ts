export const RELIC_EFFECTS = {
  "Coração de Brasa": "+8 PV Máx",
  "Lâmina Rúnica": "+2 ATK",
  "Olho de Vidro": "+8% Crítico",
  "Manto Cinzento": "+2 DEF",
  "Ampulheta Arcana": "Habilidade recarrega mais rápido",
  "Fragmento Rubro": "+3 PV Máx",
  "Luva de Espinhos": "Reflete 3 de dano ao atacante",
  "Elmo do Guardião": "+10% bloqueio de dano",
  "Botas Aladas": "Move-se sobre poças (resiste a armadilhas)",
  "Colar de Ónix": "+4 PV Máx e +1 DEF",
  "Adaga de Prata": "+1 ATK e +4% Crítico",
  "Foco Arcano": "+4 MAG",
  "Lágrima da Cripta": "Recupera 6 PV ao derrotar um inimigo",
  "Selo do Selvagem": "+1 PV Máx por andar descido",
  "Colar do Ferreiro": "+2 ATK e +1 DEF",
  "Gema do Núcleo": "+5 MAG e habilidade mais rápida",
  "Manto da Penumbra": "+4 PV Máx e +2 DEF"
};

export const RELIC_POOL = [
  { name: "Coração de Brasa", apply: (p) => { p.maxHp += 8; p.hp += 8; } },
  { name: "Lâmina Rúnica", apply: (p) => { p.atk += 2; } },
  { name: "Olho de Vidro", apply: (p) => { p.crit = Math.min(0.55, p.crit + 0.08); } },
  { name: "Manto Cinzento", apply: (p) => { p.def += 2; } },
  { name: "Ampulheta Arcana", apply: (p) => { p.specialMaxCd = 2; } },
  { name: "Luva de Espinhos", apply: (p) => { p.thornShield += 3; } },
  { name: "Elmo do Guardião", apply: (p) => { p.blockChance = (p.blockChance || 0) + 0.1; } },
  { name: "Botas Aladas", apply: (p) => { p.wingedBoots = true; } },
  { name: "Colar de Ónix", apply: (p) => { p.maxHp += 4; p.hp += 4; p.def += 1; } },
  { name: "Adaga de Prata", apply: (p) => { p.atk += 1; p.crit = Math.min(0.55, p.crit + 0.04); } },
  { name: "Foco Arcano", apply: (p) => { p.mag = (p.mag || 0) + 4; } },
  { name: "Lágrima da Cripta", apply: (p) => { p.killHeal = (p.killHeal || 0) + 6; } },
  { name: "Selo do Selvagem", apply: (p) => { p.floorHpBonus = (p.floorHpBonus || 0) + 1; } },
  { name: "Colar do Ferreiro", apply: (p) => { p.atk += 2; p.def += 1; } },
  { name: "Gema do Núcleo", apply: (p) => { p.mag = (p.mag || 0) + 5; p.specialMaxCd = Math.max(1, (p.specialMaxCd || 4) - 1); } },
  { name: "Manto da Penumbra", apply: (p) => { p.maxHp += 4; p.hp += 4; p.def += 2; } }
];
