# Histórico de Progresso do Plano de Melhorias — Cripta do Núcleo Rubro

Este documento registra todo o histórico de execuções, refinamentos e auditorias realizadas no projeto.

---

## Rodadas Anteriores Concluídas

### Rodada 1 (2026-08-21): Reestruturação Arquitetural e Desacoplamento
- **Fase 1 — Controle de versão:** Inicialização do repositório Git (branch `main`), baseline fixada (`773a718`), arquivamento de legado em `legacy/`, pipeline de build e verificação (`npm run check`).
- **Fase 2 — Documentação:** Criação do `README.md`, padronização da geração de artefato único autônomo em `release/` (`singlefile.mjs`).
- **Fase 3 — Unificação de fórmulas:** Migração e centralização das fórmulas de dano (`physicalDamage`, `magicDamage`, `attackRoll`, `specialDamage`, `trapDamage`) em `src/core/combat.ts`. Eliminação de drifts e duplicações em `game.ts` + 13 testes dourados.
- **Fase 4 — Extração incremental do monólito:**
  - 4a: `core/dungeon.ts` (geração de masmorra, BFS/Dijkstra, navegação, +12 testes unitários).
  - 4b: `core/events.ts` e `core/shop.ts` (resolução pura de eventos e loja, +26 testes unitários).
  - 4c: `core/elements.ts` (elementos, afixos de elite e multiplicadores, +7 testes unitários).
  - 4d: `data/talents.ts`, `core/monsters.ts` e `core/relics.ts` (captura, equipe de monstros, relíquias, +17 testes unitários).
  - 4e: `core/ai.ts` (inteligência de inimigos, rotação de chefes e sinergia de aliados, +10 testes unitários).
- **Fase 5 — Testes e balanceamento data-driven:** Poderes de status em `core/combat.ts`, constantes e multiplicadores centralizados em `src/data/config.ts`. Total alcançado: 114 testes unitários e 11 specs E2E.
- **Fase 6 — Polimento estético e performance:** Favicon SVG inline, Web Manifest, meta tags Open Graph. Otimização de performance no loop de patrulha (reutilização de matriz 42x42 ao invés de alocação por frame).

### Rodada 2 (2026-08-29): Refinamentos de QA Visual e Usabilidade Móvel
- **Commit `a98f7bf`:** Ajuste de alvos de toque para padrão mobile (mínimo 44px na barra superior e nos slots), feedback sonoro/toast para importação de saves e sanitização contra injeção de HTML/XSS em saves importados.
- **Commit `feb9879`:** Correção do painel de combate por turnos (eliminação de sobreposição de camadas visuais), legenda do modo action íntegra, menu de pausa com inventário completo renderizado e correção de pequenos erros tipográficos.

---

### Rodada 3 (2026-09-29): Elevação de UX, UI, Jogabilidade, Diversão e Gráficos (Régua 9.0 a 9.5) — ✅ CONCLUÍDA

- **Subagente Crítico Invocado:** Auditoria adversarial inicial diagnosticou gargalos (notas iniciais: UX 6.8, UI 7.0, Jogabilidade 7.2, Gráficos 6.9).
- **Melhorias de UX (Nota Final: 9.3 / 10):**
  - Implementada deadzone central neutra de 14px em `directionFromDpad` e `vectorFromDpad`, eliminando passos falsos ao repousar o dedo.
  - Intervalo de repetição do D-Pad (`DPAD_REPEAT_MS`) ajustado de 135ms para 170ms, prevenindo overstepping sobre armadilhas.
  - Movimentação diagonal/analógica no modo ação para touch, garantindo paridade total entre touch e teclado WASD.
  - Cancelamento de menu de comandos (`cancelCommandMenu`) seguro: não drena mais ATB nem penaliza o jogador com turno grátis do monstro.
  - Interação contextual no Botão A (`inspectAhead`): verifica o piso sob os pés prioritariamente (descer escadas, abrir baús, usar fontes) com rótulos contextuais dinâmicos (`DESCER`, `USAR`, `VER`).
- **Melhorias de UI (Nota Final: 9.2 / 10):**
  - Centralização dinâmica do painel de combate (`drawCombatPanel`) com base em `CONFIG.CANVAS_W`, eliminando distorções em widescreen e tablets.
  - Modais com `overflow-y: auto`, `max-height: 94dvh` e barra de rolagem estilizada em `src/style.css`, prevenindo cortes de botões em telas pequenas.
- **Melhorias de Jogabilidade & Diversão (Nota Final: 9.5 / 10):**
  - Janela de bloqueio (`BLOCK_WINDOW_MS`) ampliada para 480ms e janela de ataque para 560ms, compensando latência de toque móvel.
  - Decaimento suave de combo: dano não bloqueado reduz apenas 1 nível de combo ao invés de zerar brutalmente todo o medidor.
  - Arcos de corte dinâmicos (*slashing arcs*) com `ctx.arc`, gradientes e faíscas brilhantes ao golpear no modo de ação.
- **Melhorias de Gráficos, Estética & Áudio (Nota Final: 9.2 / 10):**
  - Silhueta/outline escura 16-bit (`#060614`) adicionada aos sprites de heróis e monstros, destacando-os com nitidez contra qualquer piso.
  - Iluminação radial suave pulsante da tocha projetando um halo dourado em torno do herói e das paredes.
  - Trilha sonora com canal de percussão procedural chiptune no Web Audio (sub-kick, snare e hi-hats rítmicos).
- **Verificação:** 114/114 testes unitários passando, 18/18 testes E2E do Playwright passando, build de produção e single-file gerados com sucesso.

---

### Rodada 4 (2026-09-29): Refinamentos Cirúrgicos de Jogabilidade, Diversão e Gráficos — ✅ CONCLUÍDA

- **Subagente Crítico Invocado:** `game-critic` (Roguelike UX/UI and Gameplay Critic).
- **Melhorias de Jogabilidade & Diversão (Nota Final: 9.6 / 10):**
  - **Cinematic Slow-Mo & Impact Juice:** Finalizadores de combo (`slowMoTicks = 10`) e acertos críticos (`slowMoTicks = 12`) ativam câmera lenta suave ("bullet time") sincronizada com `triggerZoomPulse()` e feedback háptico, entregando game feel visceral.
  - **Telegrafia de Área de Efeito (Boss AoE Warning Rings):** Na Fase 2 do Guardião Rubro, o boss canaliza ondas de choque rubras com anéis concêntricos tracejados e raio progressivo. Esquivar com timing nos i-frames recompensa com `ESQUIVA PERFEITA DA ONDA DE CHOQUE!`, +40 de Momentum e 3 turnos de vulnerabilidade do chefe.
  - Integração da transição para Fase 2 do Guardião Rubro também no combate em modo Ação.
- **Melhorias de Gráficos & Estética Visual (Nota Final: 9.5 / 10):**
  - **Iluminação Dinâmica em Projéteis (Bolt Glow Cache):** Pré-render de gradiente radial em canvas cache (`ensureBoltGlowCache`) desenhado com blend mode `screen` sob cada projétil mágico no modo ação (`drawActionBolts`), sem perda de desempenho por frame.
  - **Decalques Temporários no Chão (Floor Decals / Blood Splatters):** Marcas de sangue procedurais no piso da masmorra e na arena de combate com pool controlado (`MAX_DECALS_COUNT = 48`), fade-out gradual e descarte limpo na mudança de andar.
- **Melhorias de UX & UI (Notas Finais: UX 9.5 / 10, UI 9.4 / 10):**
  - **Ghost HP Bar (Barra Fantasma):** Tanto no painel de combate por turnos (`drawCombatPanel`) quanto sobre a cabeça dos inimigos no modo ação (`drawActionEnemySprite`), dano recebido causa decréscimo imediato do HP e animação suave amortecida (`CONFIG.GHOST_HP_LERP_SPEED = 0.08`) da barra âmbar/amarela.
- **Verificação Completa:**
  - `npx tsc --noEmit`: 0 erros.
  - Vitest: 13 suítes, 120/120 testes passando (incluindo nova suíte `tests/gameplay-polish.test.ts`).
  - Playwright: 27/27 specs E2E passando com Edge headless.
  - Pacote autônomo offline gerado: `release/CRIPTA DO NÚCLEO RUBRO (jogo único).html` (250 kB).

---

### Rodada 5 (2026-09-29): Loop de Jogabilidade, Tática de Combate e Exploração (Régua 9.6 a 9.7) — ✅ CONCLUÍDA

- **Subagente Crítico Invocado:** Auditoria e calibração de Game Feel & Tática de Roguelike (inspirado em *Soul Knight*, *Shattered Pixel Dungeon* e *Dead Cells*).
- **Melhorias de Jogabilidade & Diversão (Nota Final: 9.7 / 10):**
  - **Sistema de Emboscada e Vantagem de Iniciativa:** Ao interceptar ou avançar em direção a um inimigo desatento (`!enemy.alert`), o jogador obtém vantagem de emboscada (`EMBOSCADA!`). No modo por turnos, concede ATB cheio instantâneo (`playerAtbReady = true`), menu de comandos aberto imediatamente e +25 de Momentum. No modo de ação, atordoa o inimigo (`eStagger = 50`) e o torna vulnerável por 2 segundos.
  - **Contra-Ataque Relâmpago (Flash Counter):** Esquivas perfeitas no combate de ação ativam janela de 30 ticks (`counterWindow`). Pressionar ataque projeta o herói num lunge veloz contra o oponente, desferindo corte dourado cruzado em X com 1.75x de dano crítico, áudio de parry, câmera lenta e restauração da cadeia de combo.
  - **Calibração da Janela de Combo:** Janela de encadeamento de golpes (`ACTION_COMBO_WINDOW_TICKS`) calibrada de 24 para 30 ticks (500ms), eliminando perdas acidentais de combo em telas de toque e sob variações de framerate.
- **Melhorias de Combate por Turnos, Áudio & UI (Nota Final: 9.6 / 10):**
  - **Telegrafia de Guarda e Parry Metálico Sintetizado:** Implementação de síntese procedural de alta frequência via Web Audio (`playSfx("parry")` em 880/1320/1760Hz). `openBlockWindow` emite faíscas telegrafadas e som de alerta; riposte bem-sucedido aciona o som metálico de parry com zoom-pulse e câmera lenta.
  - **Indicador Dinâmico de Vantagem Elemental:** Badges no painel de combate por turnos (`drawCombatPanel`) indicam em tempo real vantagens (`(+50%!)` em dourado) ou resistências (`(-30%)` em vermelho carmesim) baseadas no elemento da arma ou magia equipada.
- **Melhorias de Exploração & Interatividade (Nota Final: 9.6 / 10):**
  - **Desarme Tático de Armadilhas via Botão Contextual:** Ao encarar armadilhas adjacentes, o botão de ação exibe `DESARMAR`. Ladinos possuem 100% de taxa de sucesso; demais classes contam com 75%. Sucesso rende +12 XP e +5 Gold sem risco; falhas reduzem o dano pela metade devido ao reflexo defensivo.
- **Verificação Completa:**
  - `npx tsc --noEmit`: 0 erros.
  - Vitest: 13 suítes, 124/124 testes unitários passando (`tests/gameplay-polish.test.ts` expandido com testes de emboscada, flash counter e desarme).
  - Playwright E2E: 28/28 specs passando com Edge headless (`e2e/actionmode.spec.ts` validando Flash Counter).
  - Pacote autônomo offline atualizado: `release/CRIPTA DO NÚCLEO RUBRO (jogo único).html` (253 kB).
