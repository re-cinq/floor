// Pure: what a visit's agent cost in money. An agent that says what it cost is believed. One that only counts is priced from the prices its agent definition states; the floor holds no price of its own.
import type { AgentSettings, ModelPrice } from "@floor/store";
import type { ModelCounts, ResultCost } from "./sink-event.js";

const TOKENS_PER_MILLION = 1_000_000;
/** A millionth of a dollar: past it is the arithmetic's noise, and no price. */
const DECIMALS = 6;

export interface Priced {
  costUsd?: number;
  /** The models that counted tokens and have no price stated, so their part of the cost is not in it. */
  unpriced?: string[];
  /** Each model's counts, with what it cost beside them where a price was stated. */
  models?: Record<string, ModelCounts>;
}

type Stated = Pick<AgentSettings, "model" | "prices"> | null;
type Prices = Partial<Record<string, ModelPrice>>;
type Counted = [model: string, counts: ModelCounts][];

export function pricedBy(stated: Stated, cost: ResultCost): Priced {
  if (cost.costUsd !== undefined) return { costUsd: cost.costUsd };
  const counted = Object.entries(cost.models ?? aloneOf(stated, cost.usage));
  const prices: Prices = stated?.prices ?? {};

  return { ...costIn(counted, prices), ...unpricedIn(counted, prices), ...(counted.length > 0 && { models: Object.fromEntries(counted.map((each) => costedAt(prices, each))) }) };
}

function costIn(counted: Counted, prices: Prices): Priced {
  const costs = counted.flatMap(([model, counts]) => costOf(prices[model], counts));

  return costs.length > 0 ? { costUsd: rounded(sumOf(costs)) } : {};
}

function costedAt(prices: Prices, [model, counts]: Counted[number]): Counted[number] {
  const costs = costOf(prices[model], counts).map((cost) => ({ ...counts, cost_usd: rounded(cost) }));

  return [model, costs.at(0) ?? counts];
}

function unpricedIn(counted: Counted, prices: Prices): Priced {
  const unpriced = counted.filter(([model]) => !prices[model]).map(([model]) => model);

  return unpriced.length > 0 ? { unpriced } : {};
}

// An agent that names no models counted for the one it was given.
function aloneOf(stated: Stated, usage: unknown): Record<string, ModelCounts> {
  const model = stated?.model;

  return model && isCounts(usage) ? { [model]: numbersOf(usage) } : {};
}

function isCounts(usage: unknown): usage is Record<string, unknown> {
  return typeof usage === "object" && usage !== null;
}

function numbersOf(usage: Record<string, unknown>): ModelCounts {
  const numbers = Object.entries(usage).filter((entry): entry is [string, number] => typeof entry[1] === "number");

  return Object.fromEntries(numbers);
}

function costOf(price: ModelPrice | undefined, counts: ModelCounts): number[] {
  if (!price) return [];
  const rates = ratesOf(price);
  const costs = Object.entries(rates).map(([counted, rate]) => (counts[counted] ?? 0) * rate);

  return [sumOf(costs) / TOKENS_PER_MILLION];
}

// By the name each count goes by. What was read from the cache, or written to it, is priced as any other reading unless the definition states otherwise.
function ratesOf(price: ModelPrice): Record<string, number> {
  return {
    input_tokens: price.inputPerMillion,
    cache_read_input_tokens: price.cacheReadPerMillion ?? price.inputPerMillion,
    cache_creation_input_tokens: price.cacheWritePerMillion ?? price.inputPerMillion,
    output_tokens: price.outputPerMillion,
  };
}

function sumOf(costs: number[]): number {
  return costs.reduce((sum, cost) => sum + cost, 0);
}

function rounded(cost: number): number {
  return Number(cost.toFixed(DECIMALS));
}
