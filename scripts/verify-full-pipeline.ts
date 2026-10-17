import { PrismaClient } from "@prisma/client";
import type { ConstitutionConfig, NormalizedListing, Simulator } from "@divora/shared";
import { PrismaOpportunityStore } from "../packages/shared/src/prisma-opportunity-store.js";
import { PrismaListingStore } from "../packages/market/src/prisma-store.js";
import { runListingPipeline } from "../packages/market/src/pipeline.js";
import { PrismaTransactionStore } from "../packages/tx/src/prisma-store.js";

const prisma = new PrismaClient();

const testConstitution: ConstitutionConfig = {
  maxTradeValue: "2000000000000000000", // 2 ETH
  maxDailySpend: "5000000000000000000", // 5 ETH
  maxGas: "300000",
  maxSlippageBps: 200,
  allowedChains: [1],
  allowedCollections: ["0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"],
  allowedMarketplaces: ["opensea"],
  allowedStrategies: ["MISPRICED_NFT", "SMART_MONEY_ACTIVITY", "ACTIVITY_SPIKE", "COLLECTION_MOMENTUM"],
  minOpportunityScore: 20,
  minConfidence: 20,
  buyMinScore: 30,
  buyMinConfidence: 25,
  watchMinScore: 15,
};

async function main() {
  console.log("Running full E2E pipeline verification...");

  const listingStore = new PrismaListingStore(prisma);
  const opportunityStore = new PrismaOpportunityStore(prisma);
  const txStore = new PrismaTransactionStore(prisma);

  const mockSimulator: Simulator = {
    async simulate() {
      return {
        state: "SIMULATED_SUCCESS",
        gasEstimate: "135000",
        effectiveGasCost: "1800000000000",
        warnings: [],
      };
    },
  };

  const now = new Date();
  const mockListing: NormalizedListing = {
    id: "e2e-listing-1",
    chainId: 1,
    marketplace: "opensea",
    collection: "divora-e2e-test",
    contractAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    tokenId: "42",
    seller: "0x1111111111111111111111111111111111111111",
    price: "800000000000000000", // 0.8 ETH
    currency: "ETH",
    paymentToken: null,
    sellerConsideration: "780000000000000000",
    feeBps: 250,
    expiresAt: new Date(now.getTime() + 3600 * 1000).toISOString(),
    protocolAddress: "0x0000000000000068f116a894984e2db1123eb395",
    source: "opensea",
    observedAt: now.toISOString(),
    freshness: "AVAILABLE",
    referencePrice: "1200000000000000000", // 1.2 ETH reference floor
    transferCount: 12,
    metadataPresent: true,
  } as any;

  const result = await runListingPipeline({
    provider: {
      state: "AVAILABLE",
      data: [mockListing],
      error: null,
    } as any,
    store: listingStore,
    opportunityStore,
    txStore,
    simulator: mockSimulator,
    config: testConstitution,
    buyer: "0x2222222222222222222222222222222222222222",
    spender: "0x0000000000000068f116a894984e2db1123eb395",
    maxPrice: "1000000000000000000",
    slippageBps: 100,
    estimatedGas: "150000",
    now,
  });

  console.log("Pipeline Stage:", result.stage);
  console.log("Persistence Error:", result.persistenceError);
  console.log("Snapshots Persisted:", result.persisted);
  console.log("Opportunities Evaluated:", result.opportunities.length);
  console.log("Decisions Made:", result.decisions.map((d: any) => `${d.action} (${d.status}) - score: ${d.opportunityScore}`));
  console.log("Simulation State:", result.simulation.state);

  const [snapshots, opps, decisions, intents, sims] = await Promise.all([
    prisma.marketListingSnapshot.count(),
    prisma.opportunityRecord.count(),
    prisma.decisionRecord.count(),
    prisma.transactionIntentRecord.count(),
    prisma.simulationResultRecord.count(),
  ]);

  console.log("\n--- Supabase Database Totals ---");
  console.log(`Snapshots: ${snapshots}`);
  console.log(`Opportunities: ${opps}`);
  console.log(`Decisions: ${decisions}`);
  console.log(`Intents: ${intents}`);
  console.log(`Simulations: ${sims}`);
}

main()
  .catch((e) => {
    console.error("E2E Pipeline failed:", e);
    (globalThis as any).process?.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });