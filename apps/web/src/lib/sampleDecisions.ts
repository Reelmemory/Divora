import { evaluateObservation } from "@divora/opportunities";
import { decide } from "@divora/policy";

const now = new Date("2026-10-08T12:00:00.000Z");
const contract = "0x1111111111111111111111111111111111111111" as const;
const opportunity = evaluateObservation({
  chainId: 4663,
  chainKey: "robinhood",
  contract,
  tokenId: "29",
  collectionName: "Fixture",
  metadataPresent: true,
  observedPrice: "10",
  referencePrice: "100",
  transferCount: 6,
  priorTransferCount: 5,
  listingCount: 1,
  uniqueCounterparties: 2,
  observedAt: "2026-10-08T11:55:00.000Z",
  source: "ui-fixture",
}, {}, now);

export const sampleDecisions = [
  decide(opportunity, {
    maxTradeValue: "100",
    maxDailySpend: "200",
    maxGas: "1",
    maxSlippageBps: 100,
    allowedChains: [4663],
    allowedCollections: [contract],
    allowedMarketplaces: ["fixture"],
    allowedStrategies: ["MISPRICED_NFT", "ACTIVITY_SPIKE"],
    minOpportunityScore: 50,
    minConfidence: 50,
    buyMinScore: 50,
    buyMinConfidence: 50,
    watchMinScore: 25,
  }, { tradeValue: "40", gas: "0.2", slippageBps: 50, marketplace: "fixture" }, now),
];
