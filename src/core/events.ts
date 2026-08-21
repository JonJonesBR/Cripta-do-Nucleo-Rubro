// Resolução pura dos efeitos de eventos aleatórios (EVENT_OPTIONS).
// Fonte única das regras de cada escolha: limiares, chances e quantias.
// game.ts aplica os deltas ao jogador e emite FX/logs/toasts a partir do outcome.

export type Rng = () => number;

// Estado mínimo do jogador consumido pelos efeitos.
export type EventPlayerState = {
  gold: number;
  hp: number;
  maxHp: number;
  atk: number;
  mag: number;
  def: number;
  level: number;
  potions: number;
};

export type EventOutcome =
  | { type: "gold_cost_paid"; value: number }
  | { type: "rob"; amount: number }
  | { type: "power" } // +atk/+mag/+hp máx (poça amaldiçoada ou fonte)
  | { type: "damage"; amount: number }
  | { type: "gold_blessing_paid" }
  | { type: "xp"; amount: number }
  | { type: "heal"; amount: number }
  | { type: "gamble_win"; amount: number }
  | { type: "gamble_lose"; wager: number }
  | { type: "gamble_hp_win"; hpCost: number }
  | { type: "gamble_hp_lose"; hpCost: number }
  | { type: "relic"; hpCost?: number; goldCost?: number }
  | { type: "potion" }
  | { type: "stats"; atk?: number; def?: number }
  | { type: "insufficient" };

export type EventResolution = {
  state: EventPlayerState;
  outcome: EventOutcome;
};

const takeHp = (state: EventPlayerState, amount: number): EventPlayerState => ({
  ...state, hp: Math.max(1, state.hp - amount)
});

const gainHp = (state: EventPlayerState, amount: number): EventPlayerState => ({
  ...state, hp: Math.min(state.maxHp, state.hp + amount)
});

// Resolve uma escolha de evento: limiares, chances e quantias — sem efeitos colaterais.
export function resolveEventChoice(
  effect: string,
  state: EventPlayerState,
  value: number | undefined,
  rng: Rng = Math.random
): EventResolution {
  switch (effect) {
    case "gold_cost": {
      // Dar ouro → poção de agradecimento.
      if (state.gold < (value || 0)) return { state, outcome: { type: "insufficient" } };
      return {
        state: { ...state, gold: state.gold - (value || 0), potions: state.potions + 1 },
        outcome: { type: "gold_cost_paid", value: value || 0 }
      };
    }
    case "rob": {
      const amount = 6 + Math.floor(rng() * 15); // rand(6,20)
      return { state: { ...state, gold: state.gold + amount }, outcome: { type: "rob", amount } };
    }
    case "risk_power": {
      if (rng() < 0.55) {
        return {
          state: { ...state, atk: state.atk + 1, mag: state.mag + 1, maxHp: state.maxHp + 3, hp: state.hp + 3 },
          outcome: { type: "power" }
        };
      }
      // dano bruto; game.ts aplica o scaling por dificuldade (effectiveIncomingDamage)
      const amount = 4 + Math.floor(rng() * 7); // rand(4,10)
      return { state, outcome: { type: "damage", amount } };
    }
    case "gold_blessing": {
      if (state.gold < (value || 0)) return { state, outcome: { type: "insufficient" } };
      return {
        state: { ...state, gold: state.gold - (value || 0), atk: state.atk + 1, mag: state.mag + 1 },
        outcome: { type: "gold_blessing_paid" }
      };
    }
    case "xp_boost": {
      const amount = 20 + state.level * 4;
      return { state, outcome: { type: "xp", amount } };
    }
    case "heal": {
      const amount = Math.min(state.maxHp - state.hp, 20 + state.level * 3);
      return { state: gainHp(state, amount), outcome: { type: "heal", amount } };
    }
    case "gamble_gold": {
      if (state.gold < (value || 0)) return { state, outcome: { type: "insufficient" } };
      const wager = value || 0;
      if (rng() < 0.5) {
        return {
          state: { ...state, gold: state.gold - wager + wager * 2 },
          outcome: { type: "gamble_win", amount: wager * 2 }
        };
      }
      return { state: { ...state, gold: state.gold - wager }, outcome: { type: "gamble_lose", wager } };
    }
    case "gamble_hp": {
      if (state.hp <= (value || 0)) return { state, outcome: { type: "insufficient" } };
      const st = takeHp(state, value || 0);
      if (rng() < 0.5) return { state: st, outcome: { type: "gamble_hp_win", hpCost: value || 0 } };
      return { state: st, outcome: { type: "gamble_hp_lose", hpCost: value || 0 } };
    }
    case "sacrifice_hp": {
      if (state.hp <= (value || 0)) return { state, outcome: { type: "insufficient" } };
      return {
        state: takeHp(state, value || 0),
        outcome: { type: "relic", hpCost: value || 0 }
      };
    }
    case "sacrifice_gold": {
      if (state.gold < (value || 0)) return { state, outcome: { type: "insufficient" } };
      return {
        state: { ...state, gold: state.gold - (value || 0) },
        outcome: { type: "relic", goldCost: value || 0 }
      };
    }
    case "force_lock": {
      if (rng() < 0.6) return { state, outcome: { type: "relic" } };
      const amount = 6 + Math.floor(rng() * 9); // rand(6,14)
      return { state, outcome: { type: "damage", amount } };
    }
    case "pay_lock": {
      if (state.gold < (value || 0)) return { state, outcome: { type: "insufficient" } };
      return {
        state: { ...state, gold: state.gold - (value || 0) },
        outcome: { type: "relic", goldCost: value || 0 }
      };
    }
    case "fountain_drink": {
      if (rng() < 0.6) {
        return {
          state: { ...state, atk: state.atk + 1, mag: state.mag + 1, maxHp: state.maxHp + 4, hp: state.hp + 4 },
          outcome: { type: "power" }
        };
      }
      const amount = 5 + Math.floor(rng() * 8); // rand(5,12)
      return { state, outcome: { type: "damage", amount } };
    }
    case "fountain_bottle": {
      return { state: { ...state, potions: state.potions + 1 }, outcome: { type: "potion" } };
    }
    case "bone_upgrade": {
      return { state: { ...state, atk: state.atk + 2 }, outcome: { type: "stats", atk: 2 } };
    }
    case "bone_armor": {
      return { state: { ...state, def: state.def + 2 }, outcome: { type: "stats", def: 2 } };
    }
    default:
      return { state, outcome: { type: "insufficient" } };
  }
}
