# Plano de Melhorias — Cripta do Núcleo Rubro (Rodada 6: Polimento Gráfico, Sprites e Animações 16-Bit Vivas)

> **Meta da Rodada:** Elevar os gráficos, sprites e animações do jogo para o patamar de excelência **9.7 a 9.8 / 10**, trazendo animações ricas para as 5 classes de heróis, ciclos de movimento e ataques estendidos, animações orgânicas procedurais para todos os monstros, o Chefe Guardião Rubro e elementos do cenário da masmorra.
>
> **Estado:** ✅ Concluído com Sucesso (Gates A e B aprovados, 128 testes unitários e 28 specs E2E passando).

---

## 1. Zonas Proibidas e Regras de Segurança

1. **`legacy/`:** Jamais alterar arquivos nesta pasta (código histórico).
2. **Sem substituição cega por regex em massa em `src/game.ts`:** Edições devem ser cirúrgicas e verificadas a cada passo com `npx tsc --noEmit` e `npx vitest run tests`.
3. **Distribuição single-file intacta:** Manter total compatibilidade do jogo gerado com protocolo `file://` (sem dependência de assets remotos ou CDNs externos).
4. **Sem quebra de save:** O sistema de save e migração deve permanecer compatível com slots existentes.
5. **Sem quebra da acessibilidade:** Paletas de daltonismo, alto contraste e redução de flash devem ser preservadas em qualquer novo efeito visual.

---

## 2. Fases de Execução da Rodada 6

### Fase A — Sprites Vivos & Ciclo de Animação dos Heróis (Alvo: 9.7 / 10)
- **A1. Sistema de Direcionamento com Espelhamento Horizontal:**
  - Todas as 5 classes (`warrior`, `rogue`, `mage`, `beastmaster`, `witch`) suportam espelhamento horizontal ao virar para a esquerda (`facing === "left"`), mantendo a postura de combate e armas sempre voltadas para o alvo.
- **A2. Ciclo de Passos e Caminhada de 4 Fases:**
  - Pés e pernas alternados durante o movimento no mapa (`movePulse > 0`) e no combate de ação, trazendo ritmo e vida 16-bit autêntica aos passos do herói.
- **A3. Animações de Ataque e Golpe Estendido por Classe:**
  - Guerreiro projeta a espada em estocada/swing com rastro luminoso e faíscas douradas.
  - Ladino desfere estocada dupla rápida com suas adagas.
  - Mago inclina o cajado e projeta fagulhas arcanas na gema da ponta.
  - Mestre das Feras projeta sua lança de osso e garras afiadas.
  - Bruxa ergue sua varinha mística com motes mágicos violeta orbitais.
- **A4. Damage Flash Retrô Arcade:**
  - Ao receber dano (`hitPulse > 0`), a silhueta do herói pisca em branco puro nos frames de impacto, fornecendo feedback tátil e visual visceral.
- **A5. Sprite Completo da Classe no Combate de Ação (`drawActionHero`):**
  - Substituição definitiva do antigo quadrado colorido simples pelo sprite 16-bit completo e detalhado da classe, incluindo armas, trajes, postura e animação de passos.

### Fase B — Animações Orgânicas e Expressivas dos Monstros & Chefe (Alvo: 9.8 / 10)
- **B1. Física Elástica de Squash & Stretch nos Slimes:**
  - Deformação senoidal que preserva o volume da geleia (estica na subida, achata no pouso), núcleo gelatinoso translúcido, brilho especular e olhos expressivos que piscam.
- **B2. Ciclo de Voo e Bater de Asas dos Morcegos (3 Fases):**
  - Fases de asas elevadas, asas planando e asas dobradas para baixo com oscilação suave de altitude e presas pontiagudas.
- **B3. Expressividade dos Monstros da Cripta:**
  - Goblins: orelhas pontudas pulsantes, olhos âmbar que piscam e adaga com reluzir periódico.
  - Armaduras Vivas: chamas espectrais azuis/douradas oscilando na fenda do elmo e brasão no peitoral.
  - Espectros & Wraiths: cauda etérea com ondulação senoidal fluida de 3 camadas e transparência viva.
  - Golems: runas de magma pulsantes no peito de pedra e manchas de musgo nos ombros.
  - Treants: ramagem de folhas verdes ondulando com o vento e olhos de madeira antiga.
  - Liches: levitação mística, crânio coroado de ouro e orbe de almas necróticas orbitando a mão esquelética.
- **B4. Majestade do Guardião Rubro (Chefe):**
  - Chifres recurvados com pontas de ouro, olhos de fogo demoníaco, manto carmesim esvoaçante e o Núcleo Rubro pulsando no centro do peito em ritmo cardíaco acelerado quando enfurecido (Fase 2).

### Fase C — Adereços de Masmorra, Iluminação Viva & Cenário (Alvo: 9.7 / 10)
- **C1. Escadaria de Saída da Cripta em Perspectiva 3D (`drawExit`):**
  - Degraus de pedra com profundidade tridimensional, arco de portal rúnico e partículas etéreas ascendentes anunciando a descida ao próximo andar.
- **C2. Baús e Altares Refinados:**
  - Baús com corpo de mogno nobre, cantoneiras de ferro rebitadas e estrela de brilho estelar dourado cintilando na fechadura.
  - Santuários com cristal de diamante flutuante e 3 orbes mágicos em órbita tridimensional.
  - Armadilhas de piso com dentes de espinhos de aço reluzentes.
  - Poções com elixir vermelho borbulhante e rolha de cortiça.

---

## 3. Critérios de Aceite
- `npm run check` (typecheck + 128 testes unitários) passa 100% verde sem regressões.
- Playwright E2E (`npm run test:e2e`) com specs passando em navegador real.
- Pacote autônomo offline gerado: `release/CRIPTA DO NÚCLEO RUBRO (jogo único).html` (259 kB).
