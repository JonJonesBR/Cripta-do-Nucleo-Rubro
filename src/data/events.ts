export const EVENT_TYPES = [
  { id: "wounded_merchant", name: "Mercador Ferido", desc: "Um mercador moribundo oferece ouro por ajuda — ou tenta roubar sua bolsa." },
  { id: "cursed_pool", name: "Poça Amaldiçoada", desc: "Águas negras sussurram promessas de poder." },
  { id: "memory_shrine", name: "Memória do Núcleo", desc: "Um eco do passado se projeta diante de você." },
  { id: "gambler", name: "Jogador de Ossos", desc: "Um apostador esquelético desafia seu destino aos dados." },
  { id: "ancient_altar", name: "Altar Esquecido", desc: "Um altar cinzento pede um sacrifício de vida ou de ouro." },
  { id: "locked_armory", name: "Arsenal Trancado", desc: "Um cofre de guerra aguarda a chave certa — ou uma mão forte." },
  { id: "whispering_fountain", name: "Fonte Sussurrante", desc: "Águas límpidas murmuram segredos antigos entre as pedras." },
  { id: "bone_smith", name: "Ferreiro dos Ossos", desc: "Uma ferraria de ossos range ao calor de uma forja espectral." }
];

export const EVENT_OPTIONS = {
  wounded_merchant: {
    title: "O Mercador Ferido",
    text: "Ferimentos profundos, olhos esperançosos. Ele estende a mão: 'Ajude-me e eu recompenso. Ou pague-me e eu sigo meu caminho.'",
    choices: [
      { label: "Dar 10 ouro (Ajuda)", effect: "gold_cost", value: 10, reward: "Pode curar +1 relíquia" },
      { label: "Sacar punhal (B)", effect: "rob", reward: "Rouba ouro dele" },
      { label: "Ignorar (Sair)", effect: "leave" }
    ]
  },
  cursed_pool: {
    title: "A Poça Amaldiçoada",
    text: "A superfície escura reflete um rosto que não é o seu. Mergulhar pode conceder poder... ou consumir sua vida.",
    choices: [
      { label: "Mergulhar (A)", effect: "risk_power", reward: "Sorte: +poder. Azar: perde PV" },
      { label: "Dar 15 ouro (B)", effect: "gold_blessing", value: 15, reward: "Bênção garantida" },
      { label: "Recuar (Sair)", effect: "leave" }
    ]
  },
  memory_shrine: {
    title: "Memória do Núcleo",
    text: "Uma imagem fantasmagórica mostra uma batalha antiga. Um herói caído oferece sua experiência a quem escutar.",
    choices: [
      { label: "Escutar (A)", effect: "xp_boost", reward: "+Experiência" },
      { label: "Rezar (B)", effect: "heal", reward: "Restaura PV" },
      { label: "Seguir (Sair)", effect: "leave" }
    ]
  },
  gambler: {
    title: "O Jogador de Ossos",
    text: "Dois dados de marfim rolam entre falanges secas. 'Aposta tua vida ou tua bolsa, mortal.'",
    choices: [
      { label: "Apostar 20 ouro (A)", effect: "gamble_gold", value: 20, reward: "Dobra o ouro ou perde tudo" },
      { label: "Apostar PV (B)", effect: "gamble_hp", value: 10, reward: "Alto risco: pode ganhar relíquia" },
      { label: "Negar (Sair)", effect: "leave" }
    ]
  },
  ancient_altar: {
    title: "Altar Esquecido",
    text: "Uma pedra cinzenta pulsa com inscrições antigas. O sacrifício pede sangue ou ouro para liberar um artefato.",
    choices: [
      { label: "Sacrificar 10 PV (A)", effect: "sacrifice_hp", value: 10, reward: "Relíquia rara" },
      { label: "Sacrificar 30 ouro (B)", effect: "sacrifice_gold", value: 30, reward: "Relíquia" },
      { label: "Ir embora (Sair)", effect: "leave" }
    ]
  },
  locked_armory: {
    title: "Arsenal Trancado",
    text: "Um cofre de guerra enferrujado. Dentro há equipamento valioso, mas o mecanismo é traiçoeiro.",
    choices: [
      { label: "Forçar a fechadura (A)", effect: "force_lock", reward: "Risco: dano ou ouro" },
      { label: "Pagar 25 ouro (B)", effect: "pay_lock", value: 25, reward: "Recompensa garantida" },
      { label: "Deixar para lá (Sair)", effect: "leave" }
    ]
  },
  whispering_fountain: {
    title: "Fonte Sussurrante",
    text: "A água transparente pulsa em um ritmo vivo. Algo dentro dela sussurra seu nome e promete força.",
    choices: [
      { label: "Beber da fonte (A)", effect: "fountain_drink", reward: "Sorte: +poder. Azar: perde PV" },
      { label: "Encher um frasco (B)", effect: "fountain_bottle", reward: "Ganha uma poção" },
      { label: "Sair (Sair)", effect: "leave" }
    ]
  },
  bone_smith: {
    title: "Ferreiro dos Ossos",
    text: "Entre bigornas de vértebras e martelos de marfim, um ferreiro espectral trabalha sem descanso. Ele aponta para seu equipamento.",
    choices: [
      { label: "Aprimorar arma (A)", effect: "bone_upgrade", reward: "+2 ATK" },
      { label: "Forjar armadura (B)", effect: "bone_armor", reward: "+2 DEF" },
      { label: "Recusar (Sair)", effect: "leave" }
    ]
  }
};
