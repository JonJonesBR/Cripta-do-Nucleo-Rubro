export const CLASS_DATA = {
  warrior: {
    name: "Guerreiro", title: "Tanque", maxHp: 46, atk: 9, def: 5, mag: 1,
    crit: 0.08, special: "Guarda de Ferro", specialDesc: "Reduz dano recebido em 50% por 2 turnos"
  },
  rogue: {
    name: "Ladino", title: "Crítico", maxHp: 34, atk: 8, def: 3, mag: 1,
    crit: 0.22, special: "Punhal Sombrio", specialDesc: "Aplica Sangramento (+4 por 2 turnos)"
  },
  mage: {
    name: "Mago", title: "Dano Mágico", maxHp: 30, atk: 6, def: 3, mag: 11,
    crit: 0.06, special: "Raio Arcano", specialDesc: "Ignora defesa e causa dano mágico"
  },
  beastmaster: {
    name: "Domador", title: "Selvagem", maxHp: 40, atk: 7, def: 4, mag: 3,
    crit: 0.12, special: "Chamado da Selva", specialDesc: "Invoca fera que ataca o inimigo"
  },
  witch: {
    name: "Bruxa", title: "Maldição", maxHp: 32, atk: 5, def: 3, mag: 13,
    crit: 0.09, special: "Olho do Caos", specialDesc: "Aplica Queimadura (+5) e atordoa 1 turno"
  }
};
