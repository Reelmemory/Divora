import { PrismaClient } from "@prisma/client";
import {
  PrismaOpportunityStore,
  type ConstitutionConfig,
  type NormalizedListing,
  type ProviderResult,
} from "@divora/shared";
import {
  createOpenSeaProvider,
  PrismaListingStore,
  runListingPipeline,
} from "@divora/market";
import { createOtariAnalyzer } from "./otari.js";

export interface AgentWorkerOptions {
  intervalMs?: number;
  maxTicks?: number;
  collectionSlug?: string;
  collectionSlugs?: string[];
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
  allowedCollections: [],
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

  const env = (globalThis as any).process?.env ?? {};
  const apiKey = options.apiKey ?? env.OPENSEA_API_KEY;
  const chain = options.chain ?? env.DIVORA_CHAIN ?? "robinhood";
  const chainId = options.chainId ?? Number(env.DIVORA_CHAIN_ID ?? 4663);
  const constitution: ConstitutionConfig = {
    ...defaultAgentConstitution,
    allowedCollections: String(env.DIVORA_ALLOWED_COLLECTIONS ?? "").split(",").map((value: string) => value.trim()).filter(Boolean),
  };
  const otariToken = env.OTARI_AI_TOKEN;
  const analyzeOpportunity = otariToken
    ? createOtariAnalyzer({ apiKey: otariToken, baseUrl: env.OTARI_BASE_URL, model: env.OTARI_MODEL })
    : undefined;
  const intervalMs = options.intervalMs ?? Number(env.AGENT_POLL_INTERVAL_MS ?? 10_000);
  const maxTicks = options.maxTicks ?? (env.AGENT_MAX_TICKS ? Number(env.AGENT_MAX_TICKS) : undefined);
  const allowSynthetic = options.allowSyntheticFallback ?? false;

  const provider = createOpenSeaProvider({
    apiKey,
    chain,
    chainId,
  });

  let tick = 0;

  try {
    while (maxTicks === undefined || tick < maxTicks) {
      tick++;
      const now = new Date();
      console.log(`\n[Agent Worker] Tick #${tick} at ${now.toISOString()}`);

      const configuredSlugs = options.collectionSlugs?.length
        ? options.collectionSlugs
        : options.collectionSlug
          ? [options.collectionSlug]
          : String(env.OPENSEA_COLLECTION_SLUGS ?? env.OPENSEA_COLLECTION_SLUG ?? "")
              .split(",")
              .map((value: string) => value.trim())
              .filter(Boolean);

      // OpenSea requests are locally throttled by the provider. Query scopes
      // sequentially so one collection does not cause the others to be RATE_LIMITED.
      const collectionResults: Array<{
        collectionSlug: string | null;
        result: Awaited<ReturnType<typeof provider.getListings>>;
      }> = [];
      const collectionScopes: Array<string | undefined> =
        configuredSlugs.length > 0 ? configuredSlugs : [undefined];

      for (const collectionSlug of collectionScopes) {
        if (collectionResults.length > 0) {
          await new Promise((resolve) => setTimeout(resolve, 260));
        }
        try {
          const result = await provider.getListings({ chain, collectionSlug, limit: 10 });
          collectionResults.push({ collectionSlug: collectionSlug ?? null, result });
        } catch (error) {
          collectionResults.push({
            collectionSlug: collectionSlug ?? null,
            result: {
              state: "PROVIDER_ERROR",
              data: null,
              error: error instanceof Error ? error.message : "unknown provider error",
            },
          });
        }
      }
      const availableResults = collectionResults.filter(
        (entry) => entry.result.state === "AVAILABLE" && Array.isArray(entry.result.data)
      );
      const combinedListings = availableResults.flatMap((entry) => entry.result.data ?? []);
      const uniqueListings = [...new Map(combinedListings.map((listing) => [listing.id, listing])).values()];

      let providerResult: ProviderResult<NormalizedListing[]> = availableResults.length > 0
        ? { state: "AVAILABLE", data: uniqueListings, error: null }
        : collectionResults[0]?.result ?? { state: "UNAVAILABLE", data: null, error: "No collection query was made" };

      for (const entry of collectionResults) {
        if (entry.result.state !== "AVAILABLE") {
          console.warn(
            `[Agent Worker] Collection query failed (${entry.collectionSlug ?? "unfiltered"}): ${entry.result.error ?? entry.result.state}`
          );
        }
      }
      console.log(
        `[Agent Worker] Discovery queried ${collectionResults.length} collection scope(s), received ${uniqueListings.length} unique listings.`
      );

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
        config: constitution,
        analyzeOpportunity,
        now,
      });

      console.log(
        `[Agent Worker] Stage=${result.stage} | Snapshots=${result.persisted} | Opps=${result.opportunities.length} | Decisions=${result.decisions.map((d) => d.action).join(",") || "none"} | AI=${result.aiAnalysisCount ?? 0} | Sim=${result.simulation.state}`
      );
      if (result.error) {
        console.error(`[Agent Worker] Pipeline error: ${result.error}`);
      }
      if (result.persistenceError) {
        console.error(`[Agent Worker] Persistence error: ${result.persistenceError}`);
      }

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
