# Plano de Melhorias — Cripta do Núcleo Rubro (Rodada 5: Loop de Jogabilidade, Tática de Combate e Exploração)

> **Meta da Rodada:** Elevar a jogabilidade e o loop principal de jogo (combate turnos, combate de ação e exploração da masmorra) para o patamar de excelência **9.6 a 9.7 / 10**, refinando a responsividade tática, timing de combate e agência do jogador na masmorra.
>
> **Estado:** ✅ Concluído com Sucesso (Gates A e B aprovados, 124 testes unitários e 28 specs E2E passando).

---

## 1. Zonas Proibidas e Regras de Segurança

1. **`legacy/`:** Jamais alterar arquivos nesta pasta (código histórico).
2. **Sem substituição cega por regex em massa em `src/game.ts`:** Edições devem ser cirúrgicas e verificadas a cada passo com `npx tsc --noEmit` e `npx vitest run tests`.
3. **Distribuição single-file intacta:** Manter total compatibilidade do jogo gerado com protocolo `file://` (sem dependência de assets remotos ou CDNs externos).
4. **Sem quebra de save:** O sistema de save e migração deve permanecer compatível com slots existentes.
5. **Sem quebra da acessibilidade:** Paletas de daltonismo, alto contraste e redução de flash devem ser preservadas em qualquer novo efeito visual.

---

## 2. Fases de Execução da Rodada 5

### Fase A — Estratégia & Furtividade na Masmorra (Alvo: 9.6 / 10)
- **A1. Sistema de Emboscada e Vantagem de Iniciativa:**
  - Jogador que avança em direção a um monstro desatento (`!enemy.alert`) recebe Iniciativa de Emboscada imediata.
  - No Modo Turnos: início imediato com ATB cheio (`playerAtbReady = true`), +25 Momentum e menu aberto antes de qualquer ação do monstro.
  - No Modo Ação: monstro inicia atordoado (`eStagger = 50`) e vulnerável por 2 segundos, conferindo grande vantagem tática.
- **A2. Desarme Tático de Armadilhas via Interação Contextual:**
  - O botão contextual passa a exibir `DESARMAR` ao encarar uma armadilha adjacente.
  - Ladinos possuem 100% de maestria no desarme; demais classes contam com 75% de sucesso.
  - Neutralização concede +12 XP e +5 de ouro das peças reaproveitadas. Em caso de falha, dano é reduzido pela metade pelo reflexo rápido.

### Fase B — Game Feel, Combate de Ação & Flash Counter (Alvo: 9.7 / 10)
- **B1. Contra-Ataque Relâmpago (Flash Counter):**
  - Esquivas perfeitas no modo de ação ativam uma janela de contra-ataque de 30 ticks (`counterWindow`).
  - O botão A ganha destaque e label `CONTRA-ATK!`.
  - Golpear nessa janela projeta o herói com lunge em alta velocidade até o inimigo, desferindo corte dourado cruzado em X com 1.75x de dano crítico, sfx dedicado de parry e câmera lenta.
- **B2. Janela de Encadeamento de Combo Suavizada:**
  - `ACTION_COMBO_WINDOW_TICKS` ajustado para 30 ticks (500ms), eliminando descarte acidental de sequências de golpes por jitter de hardware ou latência touch.

### Fase C — Feedback de Combate por Turnos & Áudio Chiptune (Alvo: 9.6 / 10)
- **C1. Telegrafia de Bloqueio e Áudio Metálico de Parry:**
  - Som procedural de alta ressonância sintetizado em Web Audio (`playSfx("parry")`) em 880Hz / 1320Hz / 1760Hz.
  - Abertura da janela de guarda projeta fagulhas de telegrafia douradas e chime de aviso.
  - Acerto na janela de Riposte dispara `parry`, efeito de zoom-pulse e câmera lenta satisfatória.
- **C2. Indicador de Vantagem Elemental em Tempo Real no Painel:**
  - Exibe badges contextuais `(+50%!)` em dourado quando o elemento ativo do jogador explora a fraqueza do monstro, ou `(-30%)` em caso de resistência.

---

## 3. Critérios de Aceite
- `npm run check` (typecheck + 124 testes unitários) passa 100% verde sem regressões.
- Playwright E2E (`npm run test:e2e`) com 28 specs passando em navegador real.
- Pacote autônomo offline gerado: `release/CRIPTA DO NÚCLEO RUBRO (jogo único).html` (253 kB).
