import { PrismaClient } from "@prisma/client";
import {
  PrismaOpportunityStore,
  type ConstitutionConfig,
  type NormalizedListing,
  type ProviderResult,
  type Simulator,
} from "@divora/shared";
import {
  createOpenSeaProvider,
  PrismaListingStore,
  runListingPipeline,
} from "@divora/market";
import { PrismaTransactionStore } from "@divora/tx";

export interface AgentWorkerOptions {
  intervalMs?: number;
  maxTicks?: number;
  collectionSlug?: string;
  chain?: string;
  chainId?: number;
  apiKey?: string;
  allowSyntheticFallback?: boolean;
}

export const defaultAgentConstitution: ConstitutionConfig = {
  maxTradeValue: "2000000000000000000", // 2 ETH
  maxDailySpend: "5000000000000000000", // 5 ETH
  maxGas: "300000",
  maxSlippageBps: 250,
  allowedChains: [1, 4663],
  allowedCollections: ["0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"],
  allowedMarketplaces: ["opensea"],
  allowedStrategies: [
    "MISPRICED_NFT",
    "SMART_MONEY_ACTIVITY",
    "ACTIVITY_SPIKE",
    "COLLECTION_MOMENTUM",
  ],
  minOpportunityScore: 20,
  minConfidence: 20,
  buyMinScore: 30,
  buyMinConfidence: 25,
  watchMinScore: 15,
};

function buildSyntheticTickListings(tick: number, chainId: number): NormalizedListing[] {
  const now = new Date();
  const tokenId = String(100 + tick);
  return [
    {
      id: `agent-tick-${tick}-token-${tokenId}`,
      chainId,
      marketplace: "opensea",
      collection: "divora-agent-feed",
      contractAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      tokenId,
      seller: "0x1111111111111111111111111111111111111111",
      price: "750000000000000000", // 0.75 ETH
      currency: "ETH",
      paymentToken: null,
      sellerConsideration: "730000000000000000",
      feeBps: 250,
      expiresAt: new Date(now.getTime() + 3600 * 1000).toISOString(),
      protocolAddress: "0x0000000000000068f116a894984e2db1123eb395",
      source: "opensea",
      observedAt: now.toISOString(),
      freshness: "AVAILABLE",
      referencePrice: "1200000000000000000", // 1.2 ETH reference floor
      transferCount: 10 + tick,
      priorTransferCount: 3,
      listingCount: 4,
      uniqueCounterparties: 5,
      metadataPresent: true,
    } as NormalizedListing,
  ];
}

export async function runAgentWorker(options: AgentWorkerOptions = {}) {
  const prisma = new PrismaClient();
  const listingStore = new PrismaListingStore(prisma);
  const opportunityStore = new PrismaOpportunityStore(prisma);
  const txStore = new PrismaTransactionStore(prisma);

  const env = (globalThis as any).process?.env ?? {};
  const apiKey = options.apiKey ?? env.OPENSEA_API_KEY;
  const chain = options.chain ?? env.DIVORA_CHAIN ?? "ethereum";
  const chainId = options.chainId ?? Number(env.DIVORA_CHAIN_ID ?? 1);
  const intervalMs = options.intervalMs ?? Number(env.AGENT_POLL_INTERVAL_MS ?? 10_000);
  const maxTicks = options.maxTicks ?? (env.AGENT_MAX_TICKS ? Number(env.AGENT_MAX_TICKS) : undefined);
  const allowSynthetic = options.allowSyntheticFallback ?? true;

  const provider = createOpenSeaProvider({
    apiKey,
    chain,
    chainId,
  });

  const simulator: Simulator = {
    async simulate() {
      return {
        state: "SIMULATED_SUCCESS",
        gasEstimate: "138000",
        effectiveGasCost: "1850000000000",
        warnings: [],
      };
    },
  };

  let tick = 0;

  try {
    while (maxTicks === undefined || tick < maxTicks) {
      tick++;
      const now = new Date();
      console.log(`\n[Agent Worker] Tick #${tick} at ${now.toISOString()}`);

      let providerResult: ProviderResult<NormalizedListing[]> = await provider.getListings({
        chain,
        collectionSlug: options.collectionSlug ?? env.OPENSEA_COLLECTION_SLUG,
        limit: 10,
      });

     if ((providerResult.state !== "AVAILABLE" || !providerResult.data || providerResult.data.length === 0) && allowSynthetic) {
        console.log(
          `[Agent Worker] Live provider returned ${providerResult.data?.length ?? 0} listings (state=${providerResult.state}). Using synthetic discovery feed.`
        );
        providerResult = {
          state: "AVAILABLE",
          data: buildSyntheticTickListings(tick, chainId),
          error: null,
        };
      }
      

      const result = await runListingPipeline({
        provider: providerResult,
        store: listingStore,
        opportunityStore,
        txStore,
        simulator,
        config: defaultAgentConstitution,
        buyer: "0x2222222222222222222222222222222222222222",
        spender: "0x0000000000000068f116a894984e2db1123eb395",
        maxPrice: "1500000000000000000",
        slippageBps: 100,
        estimatedGas: "150000",
        now,
      });

      console.log(
        `[Agent Worker] Stage=${result.stage} | Snapshots=${result.persisted} | Opps=${result.opportunities.length} | Decisions=${result.decisions.map((d) => d.action).join(",") || "none"} | Sim=${result.simulation.state}`
      );

      if (maxTicks !== undefined && tick >= maxTicks) break;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  } finally {
    await prisma.$disconnect();
  }
}

const isDirectRun = Boolean(
  (globalThis as any).process?.argv?.[1]?.replace(/\\/g, "/").endsWith("worker.ts") ||
  (globalThis as any).process?.argv?.[1]?.replace(/\\/g, "/").endsWith("worker.js")
);

if (isDirectRun) {
  const maxTicksArg = (globalThis as any).process?.argv?.find((a: string) => a.startsWith("--ticks="));
  const maxTicks = maxTicksArg ? Number(maxTicksArg.split("=")[1]) : undefined;
  runAgentWorker({ maxTicks }).catch((err) => {
    console.error("[Agent Worker] Fatal error:", err);
    (globalThis as any).process?.exit(1);
  });
}
