// Seleção de relíquias (fonte única) — a aplicação do efeito fica no chamador,
// pois muta o estado do jogador no contexto do jogo.

import { RELIC_POOL } from "../data/relics";

export type Rng = () => number;

export type RelicLike = {
  name: string;
  apply: (p: unknown) => void;
};

const FALLBACK_RELIC: RelicLike = {
  name: "Fragmento Rubro",
  apply: (p: { maxHp?: number; hp?: number }) => { p.maxHp = (p.maxHp || 0) + 3; p.hp = (p.hp || 0) + 3; }
};

// Sorteia uma relíquia ainda não possuída; se a pool esgotar, cai na relíquia
// de consolação (Fragmento Rubro).
export function rollRelic(ownedRelicNames: string[], rng: Rng = Math.random): RelicLike {
  const pool = RELIC_POOL.filter(relic => !ownedRelicNames.includes(relic.name));
  if (pool.length === 0) return FALLBACK_RELIC;
  return pool[Math.floor(rng() * pool.length)];
}
