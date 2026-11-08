/**
 * Per-million-token prices (USD) for cost tracking (R11) and the daily spend
 * cap (R8). Cache writes bill at 1.25x input for the default 5-minute TTL.
 * Source: Anthropic pricing as of 2026-10; update if prices change.
 */
interface Price {
  input: number;
  output: number;
  cacheRead: number;
}

const PRICES: Record<string, Price> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

export function emptyUsage(): TokenUsage {
  return { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
}

export function addUsage(total: TokenUsage, u: Partial<Record<keyof TokenUsage, number | null>>): void {
  total.input_tokens += u.input_tokens ?? 0;
  total.output_tokens += u.output_tokens ?? 0;
  total.cache_creation_input_tokens += u.cache_creation_input_tokens ?? 0;
  total.cache_read_input_tokens += u.cache_read_input_tokens ?? 0;
}

export function costUsd(model: string, u: TokenUsage): number {
  // Unknown models are priced as Opus so the spend cap errs on the safe side.
  const p = PRICES[model] ?? PRICES["claude-opus-5-5"];
  const perToken = (perMillion: number) => perMillion / 1_000_000;
  return (
    u.input_tokens * perToken(p.input) +
    u.cache_creation_input_tokens * perToken(p.input * 1.25) +
    u.cache_read_input_tokens * perToken(p.cacheRead) +
    u.output_tokens * perToken(p.output)
  );
}

/** Server-side refusal fallbacks are available on these models (not Haiku). */
export function supportsServerFallback(model: string): boolean {
  return model.startsWith("claude-opus-") || model.startsWith("claude-sonnet-") || model.startsWith("claude-fable-");
}
