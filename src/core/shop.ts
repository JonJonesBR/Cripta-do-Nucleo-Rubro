// Regras de loja (mercador) — geração de ofertas com sobretaxa por andar.
// Fonte única dos preços; game.ts aplica a compra e emite os efeitos.

import { CONFIG } from "../data/config";
import { RELIC_POOL } from "../data/relics";

export type Rng = () => number;

export type ShopOffer = {
  kind: "potion" | "crystal" | "relic";
  name: string;
  cost: number;
};

// Gera as ofertas do mercador: poção + cristal sempre, e uma relíquia ainda não
// possuída quando houver. Preços sobem a partir do andar 3 (sobretaxa por andar).
export function buildShopOfferings(ownedRelicNames: string[], currentFloor: number, rng: Rng = Math.random): ShopOffer[] {
  const floorSurcharge = Math.max(0, currentFloor - 2) * CONFIG.SHOP_FLOOR_COST_ADD;
  const offerings: ShopOffer[] = [
    { kind: "potion", name: "Poção de Cura", cost: CONFIG.SHOP_POTION_COST + floorSurcharge },
    { kind: "crystal", name: "Cristal de Captura", cost: CONFIG.CAPTURE_CRYSTAL_COST + floorSurcharge }
  ];
  const pool = RELIC_POOL.filter((r) => !ownedRelicNames.includes(r.name));
  if (pool.length > 0) {
    const relic = pool[Math.floor(rng() * pool.length)];
    offerings.push({ kind: "relic", name: relic.name, cost: CONFIG.SHOP_RELIC_COST + floorSurcharge });
  }
  return offerings;
}
