# Plano de Melhorias — Cripta do Núcleo Rubro (Rodada 3: Elevação UX/UI, Jogabilidade, Gráficos e Diversão)

> **Meta da Rodada:** Elevar todos os eixos do jogo (UX, UI, Jogabilidade, Diversão, Gráficos) do patamar atual (~6.9 - 7.2) para notas de excelência entre **9.0 e 9.5 / 10** (90 a 95 / 100), com verificações rigorosas, testes automatizados e anti-regressão.
>
> **Estado:** 🚀 Em Execução (Fase 0 concluída; Fases de Implementação ativas).

---

## 1. Zonas Proibidas e Regras de Segurança

1. **`legacy/`:** Jamais alterar arquivos nesta pasta (código histórico).
2. **Sem substituição cega por regex em massa em `src/game.ts`:** Edições devem ser cirúrgicas e verificadas a cada passo com `npx tsc --noEmit` e `npx vitest run tests`.
3. **Distribuição single-file intacta:** Manter total compatibilidade do jogo gerado com protocolo `file://` (sem dependência de assets remotos ou CDNs externos).
4. **Sem quebra de save:** O sistema de save e migração deve permanecer compatível com slots existentes.
5. **Sem quebra da acessibilidade:** Paletas de daltonismo, alto contraste e redução de flash devem ser preservadas em qualquer novo efeito visual.

---

## 2. Fases de Execução da Rodada

### Fase A — UX & Controles Responsivos (Alvo: 9.2 / 10)
- **A1. Deadzone e suavização do D-Pad virtual:**
  - Adicionar deadzone neutra de 18px no centro do D-Pad para impedir passos involuntários ao tocar levemente fora do centro.
  - Ajustar repeat delay para evitar overstepping em armadilhas.
  - Suportar ângulo de vetor/movimentação diagonal no modo ação para controles touch.
- **A2. Cancelamento seguro do menu de comandos:**
  - Em `cancelCommandMenu`, fechar o menu sem penalizar o jogador com perda de turno ou dano grátis (`playerAtbReady` permanece ativo).
- **A3. Interação contextual prioritária no botão A:**
  - Se o jogador estiver sobre um item/baú/altar/escada (`itemAt(player.x, player.y)`), a ação imediata é interagir com o piso atual antes de inspecionar a célula à frente.

### Fase B — UI, Layout & Hierarquia Visual (Alvo: 9.4 / 10)
- **B1. Centralização dinâmica do Painel de Combate:**
  - Centralizar `drawCombatPanel` dinamicamente com base em `CONFIG.CANVAS_W` (`boxX = Math.round((CANVAS_W - boxW) / 2)`), eliminando o desalinhamento e buracos vazios em telas widescreen e tablets.
- **B2. Indicadores e HUD de Batalha integrados:**
  - Melhorar visibilidade das barras de vida e fôlego no Canvas com molduras e contraste 16-bit.
  - Sincronizar badges de status e fraquezas elementais com tipografia nítida e legível.
- **B3. Responsividade em telas pequenas:**
  - Permitir scroll suave com `overflow-y: auto` e `max-height: 92dvh` nos modais para nunca truncar botões em telas pequenas ou celulares em paisagem/splitscreen.

### Fase C — Jogabilidade, Diversão & Game Feel (Alvo: 9.5 / 10)
- **C1. Janela de bloqueio e contra-ataque acessível:**
  - Aumentar `BLOCK_WINDOW_MS` para 480ms em `src/data/config.ts` (compensando latência touch do navegador móvel) e afinar `RIPOSTE_WINDOW_FRACTION` para 0.35.
  - Adicionar telegrafia sonora/visual sutil (brilho e som de clique metálico) antes do ataque inimigo.
- **C2. Decaimento suave de combo:**
  - Substituir o reset instantâneo de combo (`player.combo = 0`) por decaimento de 1 stack em danos normais, preservando a recompensa do jogador e a fluidez do ritmo de batalha.
- **C3. Arcos de corte (slashing arcs) e impacto:**
  - Substituir a linha reta de 1px por arcos de lâmina curvos dinâmicos no ataque (`drawActionHero`), com brilho e faíscas direcionais.

### Fase D — Gráficos, Estética 16-bit & Áudio Chiptune (Alvo: 9.3 / 10)
- **D1. Silhueta e Outlines nos sprites de personagens e monstros:**
  - Adicionar contorno escuro de 1px nos sprites procedurais dos heróis e monstros, destacando-os com nitidez contra qualquer azulejo do piso.
- **D2. Iluminação de tocha radial pulsante:**
  - Aprimorar o efeito de tocha para projetar um brilho radial suave dourado ao redor do herói e das paredes, criando atmosfera autêntica de masmorra retrô.
- **D3. Trilha sonora com canal de percussão procedural:**
  - Enriquecer o sintetizador Web Audio adicionando um canal rítmico leve (noise drum/hi-hat simulado com ruído branco filtrado) nos compassos da exploração e da luta contra chefes.

---

## 3. Critérios de Aceite
- `npm run check` (typecheck + 114 testes unitários) passa 100% verde sem regressões.
- Build de produção (`npm run build`) e single-file (`npm run single`) gerados com sucesso.
- Subagente crítico avalia e valida notas ≥ 9.0 em todos os 4 pilares.
