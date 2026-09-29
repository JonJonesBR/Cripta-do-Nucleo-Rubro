# NÃO COMMITAR — Guia Geral do Projeto: Cripta do Núcleo Rubro

Este documento resume as diretrizes de comportamento, arquitetura, zonas proibidas e armadilhas conhecidas deste projeto.

---

## 1. Diretrizes de Arquitetura

- **Stack:** Roguelike de masmorra em HTML5 Canvas (estilo 16-bit), Vite 6, TypeScript, Vitest para testes unitários, Playwright para testes E2E.
- **Distribuição:** O jogo gera um artefato único auto-contido (`release/CRIPTA DO NÚCLEO RUBRO (jogo único).html`) via `npm run build && npm run single`. Esse artefato DEVE rodar perfeitamente direto de protocolo `file://`, sem depender de servidor web.
- **Estrutura de Fontes:**
  - `src/core/`: Lógica pura, funções sem efeitos colaterais de DOM/Canvas, 100% tipadas em TypeScript e cobertas por testes unitários (`combat.ts`, `dungeon.ts`, `ai.ts`, `elements.ts`, `events.ts`, `monsters.ts`, `pathfinding.ts`, `relics.ts`, `rng.ts`, `save.ts`, `shop.ts`).
  - `src/data/`: Configurações data-driven, constantes, balanceamento, tabelas e strings i18n (`config.ts`, `enemies.ts`, `classes.ts`, `colors.ts`, `events.ts`, `relics.ts`, `talents.ts`, `strings.ts`, `lore.ts`, `achievements.ts`).
  - `src/game.ts`: Game loop, renderização Canvas, HUD, eventos de input, áudio Web Audio API sintetizado, orquestração de estados (`explore`, `combat`, `bossIntro`, `paused`, `win`, `gameover`).
  - `src/style.css`: Estilização dos overlays, menus, D-pad virtual, botões e responsividade.
  - `index.html`: Shell HTML do jogo, estrutura DOM e overlays modais.
  - `legacy/`: Código legado arquivado. **NUNCA EDITAR.**

---

## 2. Zonas Proibidas (Zonas de Risco Crítico)

1. **`legacy/`:** Arquivo morto/histórico pré-migração. Jamais edite ou dependa de alterações manuais nesta pasta.
2. **Edição cega em massa de `src/game.ts`:** `src/game.ts` possui mais de 7.400 linhas. Nunca utilize scripts cegos de substituição global (regex em massa). Toda edição deve ser cirúrgica e validada com `npx tsc --noEmit` e `npx vitest run tests`.
3. **Quebra de compatibilidade com `file://`:** Todo asset, script e estilo deve continuar embutível inline no HTML único de release sem dependências externas via CDN não cacheadas.
4. **Quebra do sistema de Save:** O formato de save possui checksum (`CRC32-like`) e versionamento de migração (`migrateRun`). Não altere a estrutura básica de slots sem migração retrocompatível.
5. **Divergência de regras (drift):** Fórmulas de combate, geração de mapa, IA e loja devem ser importadas de `src/core/`. Nunca reinserir fórmulas de dano ou RNG inline duplicadas dentro de `src/game.ts`.

---

## 3. Armadilhas Conhecidas

- **Google Drive / Virtual Drive Streaming:** O projeto está situado em `G:\Meu Drive\...`. Operações excessivas de I/O em paralelo ou sub-processos do Node podem travar ou enfrentar locks temporários no Windows. Mantenha comandos concisos, rode `vitest` de forma focada e preserve commits limpos.
- **Áudio Sintetizado (Web Audio API):** Navegadores bloqueiam `AudioContext` antes da primeira interação do usuário. O som precisa ser iniciado/resumido apenas após clique/toque. Sons são gerados proceduralmente via osciladores, sem arquivos WAV/MP3 externos para preservar o arquivo único.
- **Input Móvel vs Teclado vs Gamepad:** O jogo suporta D-pad virtual na tela, gestos de swipe, teclas WASD/Setas + Z/X/Enter/Esc, e Gamepad API padrão. Ao adicionar novas ações ou atalhos, certifique-se de suportar tanto o toque mobile (alvo mínimo de 44px) quanto atalhos de teclado.
- **Acessibilidade e Daltonismo:** O jogo conta com paletas específicas para daltonismo (Protanopia, Deuteranopia, Tritanopia) e modo de alto contraste. Toda nova cor ou indicador visual deve respeitar os tokens em `src/data/colors.ts`.
- **E2E Playwright:** Os testes Playwright (`e2e/`) testam o jogo real no navegador headless. São a garantia contra regressões no Canvas e nos overlays.
