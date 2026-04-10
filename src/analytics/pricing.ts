export interface ModelPricingDefinition {
  id: string;
  effectiveFrom: string;
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
  cacheReadUsdPerMillionTokens: number;
  cacheCreationUsdPerMillionTokens: number;
  aliases: string[];
  notes?: string;
}

export interface UsageCostInput {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

export const ANALYTICS_MODEL_PRICING: readonly ModelPricingDefinition[] = [
  {
    id: "claude-sonnet-4",
    effectiveFrom: "2026-04-08",
    inputUsdPerMillionTokens: 3,
    outputUsdPerMillionTokens: 15,
    cacheReadUsdPerMillionTokens: 0.3,
    cacheCreationUsdPerMillionTokens: 3.75,
    aliases: [
      "claude-sonnet-4",
      "claude-sonnet-4-5",
      "claude-sonnet-4.5",
      "claude-sonnet-4-6",
      "claude-sonnet-4.6",
    ],
    notes:
      "Cache creation uses the 5-minute write multiplier when transcript history does not preserve cache TTL.",
  },
  {
    id: "claude-opus-4.1",
    effectiveFrom: "2026-04-08",
    inputUsdPerMillionTokens: 15,
    outputUsdPerMillionTokens: 75,
    cacheReadUsdPerMillionTokens: 1.5,
    cacheCreationUsdPerMillionTokens: 18.75,
    aliases: [
      "claude-opus-4-1",
      "claude-opus-4.1",
      "claude-opus-4",
    ],
    notes:
      "Cache creation uses the 5-minute write multiplier when transcript history does not preserve cache TTL.",
  },
  {
    id: "claude-haiku-3.5",
    effectiveFrom: "2026-04-08",
    inputUsdPerMillionTokens: 0.8,
    outputUsdPerMillionTokens: 4,
    cacheReadUsdPerMillionTokens: 0.08,
    cacheCreationUsdPerMillionTokens: 1,
    aliases: [
      "claude-haiku-3-5",
      "claude-haiku-3.5",
      "claude-3-5-haiku",
    ],
    notes:
      "Cache creation uses the 5-minute write multiplier when transcript history does not preserve cache TTL.",
  },
] as const;

function normalizeModelName(model: string): string {
  return model.trim().toLowerCase();
}

export function findModelPricing(
  model?: string
): ModelPricingDefinition | undefined {
  if (!model) {
    return undefined;
  }

  const normalized = normalizeModelName(model);
  return ANALYTICS_MODEL_PRICING.find((entry) =>
    entry.aliases.some((alias) => normalizeModelName(alias) === normalized)
  );
}

export function estimateUsageCostUsd(input: UsageCostInput): number {
  const pricing = findModelPricing(input.model);
  if (!pricing) {
    return 0;
  }

  const inputTokens = input.inputTokens ?? 0;
  const outputTokens = input.outputTokens ?? 0;
  const cacheReadTokens = input.cacheReadTokens ?? 0;
  const cacheCreationTokens = input.cacheCreationTokens ?? 0;

  const cost =
    (inputTokens / 1_000_000) * pricing.inputUsdPerMillionTokens
    + (outputTokens / 1_000_000) * pricing.outputUsdPerMillionTokens
    + (cacheReadTokens / 1_000_000) * pricing.cacheReadUsdPerMillionTokens
    + (cacheCreationTokens / 1_000_000) * pricing.cacheCreationUsdPerMillionTokens;

  return Number(cost.toFixed(9));
}
