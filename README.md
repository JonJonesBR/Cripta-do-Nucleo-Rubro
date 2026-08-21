# Cripta do Núcleo Rubro

Dungeon 16-bit — roguelike de masmorra em HTML/Canvas. TypeScript + Vite, com build de
distribuição em HTML de arquivo único que roda direto de `file://`.

## Requisitos

- Node.js 18+ (Vite 6)
- npm

## Comandos

| Comando | O que faz |
|---|---|
| `npm install` | Instala dependências |
| `npm run dev` | Dev server (Vite, porta 5173) |
| `npm run check` | **Verificação padrão:** typecheck + testes unitários |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` / `npm run test:watch` | Testes unitários (Vitest) |
| `npm run test:e2e` | Testes end-to-end (Playwright, 10 specs; sobe dev server na 4173) |
| `npm run build` | Build de produção em `dist/` |
| `npm run single` | Gera o HTML de arquivo único em `release/` (pré-requisito: `npm run build`) |
| `npm run split` | Regenera `src/` a partir do HTML legado em `legacy/` — **uso de recuperação apenas** |

## Estrutura

```
src/
  main.ts          # entry (CSS + game)
  game.ts          # lógica do jogo — monólito legado com @ts-nocheck, em extração gradual
  core/            # módulos puros, tipados e testados (combat, pathfinding, rng, save)
  data/            # dados do jogo (config, enemies, classes, events, relics, strings, ...)
tests/             # testes unitários (Vitest)
e2e/               # testes end-to-end (Playwright)
scripts/
  split.mjs        # HTML legado → projeto Vite
  singlefile.mjs   # dist/ → HTML de arquivo único
legacy/            # HTML original arquivado (fonte de verdade antiga — não editar)
release/           # HTML de distribuição gerado por `npm run single`
```

**Fonte da verdade: `src/`.** O arquivo em `legacy/` é histórico; `scripts/split.mjs`
regenera o projeto a partir dele apenas para recuperar o estado pré-migração.

## Features

- **5 classes:** Guerreiro, Ladino, Mago, Domador, Bruxa
- **2 modos de combate:** ação no mapa e ATB por turnos (alternável em opções)
- Captura de monstros (equipe de até 3), relíquias, talentos, eventos aleatórios, loja,
  chefe final + minichefes, elites com afixos, sistema de elementos (fogo/gelo/arcano/caos)
- **Acessibilidade:** paletas para daltonismo, alto contraste, redução de flash, escala de
  UI, modo uma mão, gamepad, vibração
- **i18n:** pt-BR e English (menu de opções)
- **Save:** 3 slots com checksum de integridade + migração de versão, export/import

## Fluxo de trabalho

1. Edite `src/` — nunca `legacy/`.
2. Rode `npm run check` após mudanças.
3. Mexeu em lógica de jogo? Rode `npm run test:e2e` (specs relevantes: `smoke`, `combat`,
   `balance`, `enemyai`, `turndepth`).
4. Gerou distribuição? `npm run build && npm run single` → `release/`.

## Desenvolvimento

- Plano de melhorias por fases: [`PLANO-DE-MELHORIAS.md`](PLANO-DE-MELHORIAS.md)
- Regra de arquitetura: lógica pura (sem DOM/estado global) deve morar em `src/core` ou
  `src/logic`, tipada e com testes unitários. `game.ts` importa — nunca duplica.
