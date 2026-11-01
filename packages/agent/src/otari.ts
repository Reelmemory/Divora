import type { Opportunity, StructuredRecommendation } from "@divora/shared";

export interface OtariAnalyzerConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

const ALLOWED_RECOMMENDATIONS = new Set(["review", "watch", "ignore"]);

function parseRecommendation(
  content: string,
  opportunity: Opportunity
): StructuredRecommendation | null {
  const normalized = content.trim().replace(/^\x60\x60\x60(?:json)?\s*/i, "").replace(/\s*\x60\x60\x60$/, "");
  let value: unknown;
  try {
    value = JSON.parse(normalized);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;

  const result = value as Record<string, unknown>;
  if (
    typeof result.recommendation !== "string" ||
    !ALLOWED_RECOMMENDATIONS.has(result.recommendation) ||
    typeof result.confidence !== "number" ||
    !Number.isFinite(result.confidence) ||
    result.confidence < 0 ||
    result.confidence > 100 ||
    typeof result.reasoning !== "string" ||
    !Array.isArray(result.supportingSignals) ||
    !Array.isArray(result.invalidationConditions)
  ) return null;

  const allowedSignals = new Set(opportunity.signals.map((signal) => signal.code));
  const supportingSignals = result.supportingSignals
    .filter((signal): signal is string => typeof signal === "string" && allowedSignals.has(signal))
    .slice(0, 8);
  const invalidationConditions = result.invalidationConditions
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 240))
    .slice(0, 8);

  return {
    recommendation: result.recommendation as StructuredRecommendation["recommendation"],
    confidence: result.confidence,
    reasoning: result.reasoning.trim().slice(0, 1000),
    supportingSignals,
    invalidationConditions,
  };
}

/**
 * Uses Otari only for contextual market analysis. Its output is advisory:
 * deterministic policy and risk checks remain authoritative for every decision.
 */
export function createOtariAnalyzer(
  config: OtariAnalyzerConfig,
  fetchImpl: typeof fetch = fetch
): ((opportunity: Opportunity) => Promise<StructuredRecommendation | null>) {
  const apiKey = config.apiKey;
  const baseUrl = (config.baseUrl ?? "https://api.otari.ai/v1").replace(/\/+$/, "");
  const model = config.model ?? "mzai:moonshotai/Kimi-K2.6";

  return async (opportunity) => {
    if (!apiKey) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 12000);
    try {
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          temperature: 0.1,
          max_tokens: 450,
          messages: [
            {
              role: "system",
              content: [
                "You are Divora's NFT market research analyst.",
                "Analyze only the supplied observation. Do not invent market facts, prices, activity, ownership, or wallet intent.",
                "You are advisory only. Never authorize trades, signing, broadcasting, or transaction construction.",
                "Return one JSON object with exactly these fields:",
                '{"recommendation":"review|watch|ignore","confidence":0-100,"reasoning":"string","supportingSignals":["existing signal code"],"invalidationConditions":["string"]}.',
                "Use only supplied signal codes in supportingSignals. If evidence is incomplete or stale, recommend ignore or watch.",
              ].join(" "),
            },
            {
              role: "user",
              content: JSON.stringify({
                chainId: opportunity.chainId,
                chain: opportunity.chainKey,
                collection: opportunity.collectionName ?? null,
                contract: opportunity.contract,
                tokenId: opportunity.tokenId ?? null,
                status: opportunity.status,
                strategy: opportunity.strategy,
                score: opportunity.score,
                confidence: opportunity.confidence,
                observedPrice: opportunity.observedPrice ?? null,
                referencePrice: opportunity.referencePrice ?? null,
                fairValue: opportunity.fairValue ?? null,
                observedAt: opportunity.observedAt,
                expiresAt: opportunity.expiresAt,
                signals: opportunity.signals.map((signal) => ({
                  code: signal.code,
                  category: signal.category,
                  applicable: signal.applicable,
                  score: signal.score,
                  explanation: signal.explanation,
                })),
                evidence: opportunity.evidence,
              }),
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Otari gateway returned HTTP ${response.status}`);
      }
      const payload = await response.json() as ChatCompletionResponse;
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) return null;
      return parseRecommendation(content, opportunity);
    } finally {
      clearTimeout(timer);
    }
  };
}
