# ⚔️ Cripta do Núcleo Rubro

> **Dungeon Crawler Roguelike 16-bit em HTML5 Canvas**  
> Explore as profundezas da cripta, domine combates dinâmicos ou por turnos, capture monstros e destrua o selo do Guardião Rubro!

🎮 **Jogue diretamente no navegador:**  
👉 **[https://jonjonesbr.github.io/Cripta-do-Nucleo-Rubro/](https://jonjonesbr.github.io/Cripta-do-Nucleo-Rubro/)**

---

## 🌟 Destaques do Jogo

- **⚔️ Dois Modos de Combate Fluidos:**
  - **Ação em Tempo Real:** Esquivas ágeis com i-frames, arcos de corte cortantes (*slashing arcs*), combos de golpes, contra-ataque relâmpago (*Flash Counter*), câmera lenta cinemática (*Slow-Mo / Bullet-Time*) em finalizadores e acertos críticos, e projéteis arcanos com brilho neon dinâmico.
  - **Estratégico por Turnos (ATB):** Barra de prontidão de ação, timing ativo de defesa e riposte metálico sintetizado, emboscada furtiva com vantagem de iniciativa, telegrafia de intenções inimigas e fraquezas elementais dinâmicas.
- **🎨 Gráficos 16-bit, Sprites Vivos & Animações:**
  - **Heróis Expressivos:** Espelhamento horizontal de postura e armas (`facing`), ciclo de passos de 4 fases, golpes específicos por classe e feedback de impacto com *white damage flash*.
  - **Monstros com Vida Própria:** Deformação elástica (*squash & stretch*) com conservação de volume em Slimes, ciclo de voo de 3 fases em Morcegos, orelhas e adagas em Goblins, chamas espectrais em Armaduras Vivas e o Núcleo Rubro pulsando no peito do Guardião.
  - **Cenário e Adereços Detalhados:** Escadaria de saída em perspectiva 3D com portal rúnico, baús de mogno com brilho dourado estelar, altares com cristais e orbes de mana em levitação.
- **✨ Game Feel e Feedback Visual Primoroso:**
  - **Barra de Vida Fantasma (Ghost HP):** Rastro âmbar amortecido que desliza suavemente ao causar dano, tanto no HUD de turnos quanto na barra de combate de ação.
  - **Decalques de Batalha no Chão:** Marcas de sangue procedurais e fagulhas que marcam o piso da cripta durante os confrontos e desaparecem gradualmente.
  - **Telegrafia de Área de Efeito (Boss AoE):** Ondas de choque do Guardião Rubro com anéis concêntricos tracejados expansivos, permitindo fuga por raio ou contra-ataque de Esquiva Perfeita.
- **🛡️ 5 Classes Exclusivas:**
  - **Guerreiro:** Tanque disciplinado de alta armadura e bloqueio devastador.
  - **Ladino:** Crítico evasivo, velocidade, desarme mestre de armadilhas e sangramento furtivo.
  - **Mago:** Canhão de vidro com feitiços explosivos em área e queimadura ígnea.
  - **Domador:** Mestre das feras e sinergia de combate selvagem.
  - **Bruxa:** Magia caótica com drenagem de vida e aflições arcanas.
- **🐾 Captura e Equipe de Criaturas:** Capture monstros durante a descida e monte um time de até 3 aliados para lutar ao seu lado.
- **✨ Relíquias, Talentos e Afixos:** Dezenas de itens místicos, árvore de talentos por andar e monstros de elite com afixos perigosos.
- **🎶 Áudio Procedural Chiptune:** Trilha sonora polifônica procedural sintetizada em tempo real com percussão estruturada (kick, snare, hi-hats) e SFX dinâmicos via Web Audio API.
- **♿ Acessibilidade Total:** Modos para daltonismo (Protanopia, Deuteranopia, Tritanopia), alto contraste, redução de flash, escala de interface e modo para uma mão no celular.
- **📱 100% Autônomo e Responsivo:** D-pad virtual com deadzone e suporte analógico/diagonal, jogável tanto no computador (teclado/gamepad) quanto no celular (touch/gestos).

---

## 🎮 Controles

| Ação | Teclado | Controles Móveis (Touch) |
|---|---|---|
| **Movimento** | Setas / `WASD` | D-Pad virtual / Deslizar o dedo (Swipe) |
| **Atacar / Confirmar** | `Z` / `Enter` | Botão virtual **A** |
| **Habilidade / Poção** | `X` / `Espaço` | Botão virtual **B** |
| **Pausar / Menu** | `Esc` / `P` | Botão **Ⅱ** (Topo) |
| **Inspecionar / Usar / Desarmar** | Pisar / `Z` | Botão contextual **A** (`DESCER` / `USAR` / `DESARMAR`) |

---

## 🚀 Publicação & CI/CD

O projeto conta com esteira automatizada de Integração e Entrega Contínua via **GitHub Actions** (`.github/workflows/deploy.yml`):
- A cada push na branch `main`, os testes unitários e de tipos são validados.
- O bundle autônomo de arquivo único (`release/CRIPTA DO NÚCLEO RUBRO (jogo único).html`) é gerado e publicado diretamente no **GitHub Pages**.
- O jogo pode ser baixado e executado 100% offline em qualquer dispositivo sem servidor web (`file://`).

---

## 🛠️ Requisitos & Comandos de Desenvolvimento

- **Node.js 18+**
- **npm**

| Comando | O que faz |
|---|---|
| `npm install` | Instala as dependências |
| `npm run dev` | Servidor local de desenvolvimento (Vite, porta 5173) |
| `npm run check` | **Validação de CI:** Typecheck TypeScript (`tsc --noEmit`) + Vitest |
| `npm run typecheck` | Executa apenas a verificação de tipos (`tsc --noEmit`) |
| `npm test` | Executa a suíte de testes unitários (Vitest) |
| `npm run test:e2e` | Executa a suíte de testes end-to-end com navegador real (Playwright) |
| `npm run build` | Compila a versão de produção em `dist/` |
| `npm run single` | Injeta assets e gera o HTML de arquivo único autônomo em `release/` |

---

## 📁 Estrutura do Código

```
src/
  main.ts          # Ponto de entrada (CSS + game)
  game.ts          # Game loop, Canvas rendering, HUD, inputs e orquestração de estados
  core/            # Módulos de lógica pura tipados e cobertos por testes unitários
    combat.ts      # Fórmulas de dano, status, timing e combate
    dungeon.ts     # Geração de masmorra procedural e navegação
    ai.ts          # IA tática de monstros, rotação de chefes e sinergia de aliados
    elements.ts    # Fraquezas elementais, afixos de elite e multiplicadores
    events.ts      # Eventos aleatórios e escolhas de narrativa
    monsters.ts    # Captura e gerenciamento da equipe de criaturas
    relics.ts      # Catálogo e cálculo de efeitos de relíquias
    pathfinding.ts # Algoritmos de busca de caminho (BFS/Dijkstra)
    rng.ts         # Gerador de números pseudoaleatórios determinístico
    save.ts        # Persistência de slots com checksum e migração de versão
    shop.ts        # Geração dinâmica da loja do mercador
  data/            # Tabelas de dados estáticos, constantes e configurações balanceadas
tests/             # Suíte de testes unitários (Vitest)
e2e/               # Testes ponta a ponta (Playwright)
scripts/           # Scripts de utilidade (singlefile bundler)
release/           # Artefato compilado autônomo de distribuição
.github/workflows/ # Pipeline de deploy automatizado para GitHub Pages
```
