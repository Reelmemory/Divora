import type { ConstitutionConfig, Decision, IntentValidation, Opportunity, TransactionIntent } from "@divora/shared";

export interface IntentDraft {
  expectedPrice: string;
  maxPrice: string;
  estimatedGas: string;
  slippageBps: number;
  marketplace: string;
  currency?: string;
}

export function validateIntent(input: {
  decision?: Decision;
  opportunity?: Opportunity;
  config: ConstitutionConfig;
  draft: IntentDraft;
  now?: Date;
}): IntentValidation {
  const now = input.now ?? new Date();
  const violations: string[] = [];
  const warnings: string[] = [];
  const evaluatedRules = ["decision", "policy", "freshness", "risk", "price", "gas", "slippage"];
  const decision = input.decision;
  const opportunity = input.opportunity;
  if (!decision) violations.push("DECISION_MISSING");
  if (decision && decision.action !== "BUY") violations.push("DECISION_NOT_BUY");
  if (decision && (decision.status === "EXPIRED" || new Date(decision.expiresAt).getTime() < now.getTime())) violations.push("DECISION_EXPIRED");
  if (decision?.action === "REJECT") violations.push("DECISION_REJECTED");
  if (!opportunity || opportunity.status !== "VALID") violations.push("OPPORTUNITY_NOT_VALID");
  if (opportunity && new Date(opportunity.expiresAt).getTime() < now.getTime()) violations.push("OPPORTUNITY_STALE");
  if (opportunity && (!opportunity.observedPrice || !opportunity.referencePrice)) violations.push("PRICE_STALE_OR_MISSING");
  if (decision?.riskLevel === "CRITICAL" || opportunity?.status === "INVALIDATED") violations.push("CRITICAL_RISK");
  if (opportunity && !input.config.allowedChains.includes(opportunity.chainId)) violations.push("CHAIN_NOT_ALLOWED");
  if (opportunity && (input.config.allowedCollections.length === 0 || !input.config.allowedCollections.some((item) => item.toLowerCase() === opportunity.contract.toLowerCase()))) violations.push("COLLECTION_NOT_ALLOWED");
  if (!input.draft.marketplace || !input.config.allowedMarketplaces.includes(input.draft.marketplace)) violations.push("MARKETPLACE_NOT_ALLOWED");
  if (!opportunity?.strategy || !input.config.allowedStrategies.includes(opportunity.strategy)) violations.push("STRATEGY_NOT_ALLOWED");
  if (input.config.maxTradeValue === null || Number(input.draft.maxPrice) > Number(input.config.maxTradeValue)) violations.push("TRADE_VALUE_EXCEEDED");
  if (input.config.maxGas === null || Number(input.draft.estimatedGas) > Number(input.config.maxGas)) violations.push("GAS_LIMIT_EXCEEDED");
  if (input.config.maxSlippageBps === null || input.draft.slippageBps > input.config.maxSlippageBps) violations.push("SLIPPAGE_EXCEEDED");
  if (opportunity?.observedPrice && Number(input.draft.maxPrice) < Number(opportunity.observedPrice)) violations.push("PRICE_EXCEEDED");
  if (input.config.allowedChains.length === 0) violations.push("POLICY_MISSING");
  return { valid: violations.length === 0, violations: [...new Set(violations)], warnings, evaluatedRules };
}

export function createIntent(input: {
  decision: Decision;
  opportunity: Opportunity;
  draft: IntentDraft;
  now?: Date;
}): TransactionIntent {
  const now = input.now ?? new Date();
  return {
    id: `intent:${input.decision.id}`,
    type: "BUY_NFT",
    chainId: input.opportunity.chainId,
    chainKey: input.opportunity.chainKey,
    collection: input.opportunity.collectionName ?? input.opportunity.contract,
    contract: input.opportunity.contract,
    tokenId: input.opportunity.tokenId ?? "",
    marketplace: input.draft.marketplace,
    expectedPrice: input.draft.expectedPrice,
    maxPrice: input.draft.maxPrice,
    currency: input.draft.currency ?? "ETH",
    estimatedGas: input.draft.estimatedGas,
    slippageBps: input.draft.slippageBps,
    opportunityId: input.opportunity.id,
    decisionId: input.decision.id,
    evidence: { source: "phase4-validator", executable: false },
    createdAt: now.toISOString(),
    expiresAt: input.decision.expiresAt,
    executable: false,
  };
}
