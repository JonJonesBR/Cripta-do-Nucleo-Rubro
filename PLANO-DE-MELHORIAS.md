# Plano de Melhorias — Cripta do Núcleo Rubro

> Plano de fases para melhorias estruturais do projeto. Cada fase é independente,
> com escopo, entregáveis e critérios de aceite. Ordem recomendada = da base para
> o topo: o que reduz risco primeiro vem primeiro.
>
> Estado: **concluído** (Fases 1–6 implementadas e verificadas em 2026-08-21; Fase 7 não aplicável — repo não publicado).

## Histórico de execução

- **Fase 1 — Controle de versão:** ✅ git (branch `main`, baseline `773a718`), legado arquivado em `legacy/`, `npm run check`.
- **Fase 2 — Documentação:** ✅ `README.md`, artefato único em `release/` (`singlefile.mjs` apontando para lá).
- **Fase 3 — Unificar fórmulas:** ✅ `core/combat.ts` com `attackRoll`/`specialDamage`/`summonDamage`/`trapDamage` (CONFIG 4..8, corrigido drift) + 13 testes dourados; zero fórmulas inline de dano em `game.ts`.
- **Fase 4 — Extração incremental:** ✅ 4a `core/dungeon.ts` (+12 testes) · 4b `core/events.ts` + `core/shop.ts` (+26 testes) · 4c `core/elements.ts` (+7) · 4d `data/talents.ts`, `core/monsters.ts`, `core/relics.ts` (+17) · 4e `core/ai.ts` (+10).
- **Fase 5 — Testes e balance:** ✅ poderes de status em `core/combat.ts`, multiplicadores em `CONFIG` (data-driven), cenário e2e de coerência das constantes. Total: **114 testes unitários** (era 24) + 11 specs e2e.
- **Fase 6 — Polimento:** ✅ favicon (SVG inline, sobrevive ao HTML único), manifest, meta/og tags; auditoria de perf: matriz de ocupação das patrulhas reutilizada (era alocada 42×42 por passo).
- **Fase 7 — CI:** ⏭️ não aplicável — exige repo publicado no GitHub; reabrir quando houver.

Cada fase foi commitada atomicamente (`git log`); `npm run check` + e2e relevantes verdes a cada passo.

---

## Contexto (achados da auditoria inicial, 2026-08-21)

| # | Achado | Evidência |
|---|--------|-----------|
| 1 | **Sem controle de versão** — projeto vive só no Google Drive, sem git | `git status` → "not a git repository" |
| 2 | **Monólito `src/game.ts` (~6.4k linhas, 318 KB) com `@ts-nocheck`** — toda a lógica do jogo sem tipos | Header do arquivo: `// @ts-nocheck // Arquivo legado migrado em Fase 0` |
| 3 | **Fórmulas duplicadas e já divergentes** — `core/combat.ts` existe, é tipado e testado, mas `game.ts` **não o importa** e repete a matemática inline | `physicalDamage` (core): `atk + rand(0..variance) - floor(def/2)`; inline em game.ts:5372: `atk + rand(0,4) - def` (def sem divisão). Drift real entre as duas cópias |
| 4 | **TypeScript fraco** — `strict: false`, `noImplicitAny: false`; typecheck passa só porque `game.ts` está com `@ts-nocheck` | `tsconfig.json` |
| 5 | **Sem documentação** — sem README, sem LICENSE, sem instruções de build/distribuição | Pasta raiz: só código + `CONTINUAR DESENVOLVIMENTO OPENCODE.txt` (um id de sessão) |
| 6 | **Arquivo legado no root** — `CRIPTA DO NÚCLEO RUBRO (REPAGINADA v8).html` (8.9k linhas) é a fonte do split, mas a fonte da verdade atual é `src/` | `scripts/split.mjs` lê o HTML legado; `game.ts` se diz "migrado em Fase 0" |
| 7 | **Cobertura unitária pequena vs. lógica total** — 24 testes unitários (só `core/`); zero testes para a lógica do monólito | `tests/` = combat, pathfinding, rng, save |

**Pontos fortes (não quebrar):** 10 specs e2e (accessibility, actionmode, balance, cinema, combat, enemyai, juice, mousehold, smoke, turndepth); acessibilidade (paletas para daltonismo, alto contraste, redução de flash, escala de UI, modo uma mão, gamepad, vibração); i18n pt-BR/en; save com 3 slots + checksum + migração + export/import; pipeline Vite → dist → HTML de arquivo único.

---

## Fases

### Fase 1 — Controle de versão (git) ⭐ recomendada primeiro

**Por quê:** sem git não há rollback, diff ou histórico. Todas as outras fases (especialmente extração de código) são arriscadas sem rede de segurança. O `.gitignore` já existe e cobre `node_modules/`, `dist/`, `test-results/`.

**Escopo:**
- `git init` + commit inicial da baseline atual (tudo que não estiver ignorado)
- Arquivar `CRIPTA DO NÚCLEO RUBRO (REPAGINADA v8).html` → `legacy/` (atualizar caminho em `scripts/split.mjs`)
- Adicionar script `npm run check` = `typecheck && test` (comando único de verificação)

**Entregáveis:**
- Repositório com histórico; árvore limpa (`git status` sem surpresas)
- `legacy/` com o HTML antigo; `split.mjs` apontando para ele

**Critérios de aceite:**
- `git log` mostra commit inicial com a baseline
- `npm run check` passa (24 testes + typecheck)
- `git status` limpo após o commit

**Risco/tradeoff:** git dentro de pasta do Google Drive funciona, mas exige que o repo continue pequeno (src ~400 KB; `node_modules/` ignorado). Nada a fazer além de manter disciplina de commit.

---

### Fase 2 — Documentação e higiene do repositório

**Escopo:**
- `README.md`: o que é o jogo, requisitos (Node + npm), comandos (`dev`, `test`, `test:e2e`, `build`, `single`), estrutura do projeto (`src/game.ts` monólito legado vs. `src/core`/`src/data` tipados), features (classes, modos de combate, acessibilidade, i18n)
- Nota de arquitetura: `src/` é a fonte da verdade; `legacy/` é arquivo morto; `npm run single` gera o HTML de distribuição
- Definir destino do HTML de arquivo único (sugestão: `release/`) para não poluir o root com artefato de build

**Critérios de aceite:** um leitor novo consegue rodar, testar e gerar a distribuição seguindo só o README.

---

### Fase 3 — Unificar fórmulas de combate (eliminar drift) ⭐ alto valor

**Por quê:** `core/combat.ts` (tipado + testado) e a matemática inline de `game.ts` já divergiram (achado #3). Cada ajuste de balanceamento agora precisa ser feito em dois lugares, e o e2e `balance.spec.ts` não pega drift porque os dois lados são usados em pontos diferentes do código.

**Escopo:**
- `game.ts` passa a importar e usar `physicalDamage`, `magicDamage`, `applyCrit`, `trapDamage`, `guardedDamage`, `xpForLevel` do `core/combat.ts`
- Remover as cópias inline; **decidir por fórmula** onde houver divergência (o teste `combat.test.ts` define o contrato)
- Ajustar `core/combat.ts` se necessário para cobrir variantes (ex.: dano de boss com `rand(0,4)`, crit de elite)

**Critérios de aceite:**
- Zero ocorrências de fórmulas de dano inline em `game.ts` (grep por `Math.max(1, ` em contexto de dano retorna só chamadas a core)
- `npm test` (24+ testes) e e2e `balance`/`combat`/`turndepth` passam
- Uma única fonte de verdade para cada fórmula

---

### Fase 4 — Extração incremental de lógica pura do monólito

**Por quê:** `game.ts` não tem tipos e nenhum teste unitário. Extrair módulos puros (sem DOM/estado global) para `src/core` + `src/logic` os torna testáveis e tipados, um pedaço por vez, sem reescrever o jogo inteiro.

**Escopo (sub-fases, cada uma = extrair + tipar + testar + religar):**
- **4a. Geração de masmorra** — `generateDungeon`, `carveRoom`, `isWalkable`, `randomFloorFarFrom`, `findFreeTile`, `computeDijkstraMap`, `nextStepFromDijkstra` (já há `pathfinding.ts`; completar)
- **4b. Eventos e loja** — resolução de `EVENT_OPTIONS` (effects: `gold_cost`, `rob`, `gamble_hp`, …) e regras de shop, como funções puras sobre estado
- **4c. Sistema de elementos e afixos** — `elementMultiplier`, `applyEliteAffix`, `ENEMY_ELEMENT_BY_KIND`
- **4d. Relíquias, talentos e captura** — `RELIC_EFFECTS`, `TALENT_POOL`, regras de captura/equipe de monstros
- **4e. IA e padrões de boss** — `rollEnemyIntent`, `doBossPattern`, `computeEnemySynergy`

**Regras de execução:**
- Cada sub-fase é um PR/commit atômico; nada de migração total de uma vez
- Módulos novos com tipos estritos (`strict` por módulo via `// @ts-check`-inverso não se aplica — usar tipagem explícita e deixar `game.ts` com `@ts-nocheck` até o fim)
- `game.ts` só importa; nunca duplica a lógica extraída
- Rede de segurança: rodar e2e `smoke`, `combat`, `enemyai`, `turndepth` após cada sub-fase

**Critérios de aceite:** cada sub-fase: módulo tipado + testes unitários novos + `game.ts` usando o módulo + e2e verde.

---

### Fase 5 — Cobertura de testes e balanceamento guiado por dados

**Escopo:**
- Testes unitários para tudo extraído na Fase 4 (curva de XP, multiplicadores de elemento, afixos, resultados de eventos, regras de captura)
- Revisar `balance.spec.ts`: adicionar cenários de faixa de dano por classe/inimigo para travar o balanceamento contra regressão silenciosa
- Tornar o balanceamento **data-driven** (valores em `src/data/`) para ajustes não tocarem em lógica

**Critérios de aceite:** cobertura unitária cobrindo todas as fórmulas de `core/` + `src/logic`; e2e `balance` verde.

---

### Fase 6 — Polimento e distribuição (baixa prioridade)

**Escopo:**
- `public/` hoje vazia: favicon, manifest, meta tags (og:, description)
- Revisar `index.html` (222 linhas) — checar overlays duplicados/pontos mortos
- Verificar performance (caches de mapa/luz já existem; audit de alocação no hot path do loop)

**Critérios de aceite:** favicon/manifest servidos; Lighthouse/auditoria manual sem regressão visível.

---

### Fase 7 — CI (opcional, só se publicar no GitHub)

**Escopo:** GitHub Actions com `typecheck` + unit + e2e em push/PR.
**Pré-requisito:** repo publicado fora do Drive.

---

## Ordem recomendada e dependências

```
Fase 1 (git) → Fase 2 (docs) → Fase 3 (unificar fórmulas)
                                          ↓
        Fase 4a→4b→4c→4d→4e (extração, em paralelo parcial com Fase 5)
                                          ↓
                        Fase 5 (testes/balance) → Fase 6 (polimento) → Fase 7 (CI)
```

- Fases 1 e 2 são independentes entre si.
- Fase 3 antes da 4 (unificar antes de mover mais código).
- Fase 5 anda junto com a 4 (extrair sem testar = dívida nova).
- Fases 6 e 7 são opcionais e podem ficar para depois.

## Riscos globais

1. **Drift entre `legacy/` e `src/`** — o HTML legado não deve mais ser editado; se um ajuste cair no arquivo errado, o split o sobrescreve. Mitigação: Fase 1 arquiva e Fase 2 documenta.
2. **E2e é a única rede de segurança do monólito** — durante a Fase 4, qualquer extração sem e2e verde é rejeitada. Playwright é lento (~60s/spec); rodar seletivamente (`npx playwright test smoke combat`).
3. **Google Drive + git** — manter repo enxuto; nunca commitar `node_modules/` (já ignorado).
