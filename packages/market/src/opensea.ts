import type { NFTMarketDataProvider } from "./provider.js";
import { normalizeOpenSeaOrder } from "./normalize.js";
import type { MarketQuery } from "./provider.js";
import type { NormalizedListing, ProviderResult } from "@divora/shared";

export interface OpenSeaConfig {
  apiKey?: string;
  baseUrl?: string;
  chain?: string;
  chainId?: number;
  timeoutMs?: number;
  minIntervalMs?: number;
}

export function createOpenSeaProvider(config: OpenSeaConfig, fetchImpl: typeof fetch = fetch): NFTMarketDataProvider {
  const baseUrl = config.baseUrl ?? "https://api.opensea.io";
  const chain = config.chain ?? "robinhood";
  const chainId = config.chainId ?? 4663;
  let lastCall = 0;
  const cache = new Map<string, { at: number; value: ProviderResult<NormalizedListing[]> }>();

  async function request(path: string): Promise<ProviderResult<unknown>> {
    if (!config.apiKey) return { state: "UNAVAILABLE", data: null, error: "OPENSEA_API_KEY is not configured" };
    const now = Date.now();
    if (now - lastCall < (config.minIntervalMs ?? 250)) return { state: "RATE_LIMITED", data: null, error: "local throttle" };
    lastCall = now;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 8000);
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, { headers: { "x-api-key": config.apiKey }, signal: controller.signal });
      if (response.status === 429) return { state: "RATE_LIMITED", data: null, error: "provider rate limit" };
      if (!response.ok) return { state: "PROVIDER_ERROR", data: null, error: `provider status ${response.status}` };
      return { state: "AVAILABLE", data: await response.json(), error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : "provider error";
      return { state: message.includes("abort") ? "PROVIDER_ERROR" : "PROVIDER_ERROR", data: null, error: message };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    name: "opensea",
    async getListings(query: MarketQuery) {
      const key = `${query.collectionSlug ?? ""}:${query.contract ?? ""}:${query.tokenId ?? ""}`;
      const cached = cache.get(key);
      if (cached && Date.now() - cached.at < 30_000) return { ...cached.value, cached: true };
      const path = query.collectionSlug
        ? `/api/v2/listings/collection/${query.collectionSlug}/all?limit=${query.limit ?? 20}`
        : `/api/v2/collections?chain=${chain}&limit=${query.limit ?? 5}`;
      const result = await request(path);
      if (result.state !== "AVAILABLE" || !result.data) return { state: result.state, data: null, error: result.error, cached: false };
      if (typeof result.data !== "object" || result.data === null) {
        return { state: "PROVIDER_ERROR", data: null, error: "malformed listings response", cached: false };
      }
      const body = result.data as { orders?: unknown; listings?: unknown; collections?: Array<{ collection?: string }> };
      if (!query.collectionSlug && Array.isArray(body.collections)) {
        const slug = body.collections.find((item) => typeof item.collection === "string")?.collection;
        if (!slug) return { state: "UNAVAILABLE", data: [], error: "no Robinhood collections returned", cached: false };
        return this.getListings({ ...query, collectionSlug: slug });
      }
      if (!Array.isArray(body.orders) && !Array.isArray(body.listings)) {
        return { state: "PROVIDER_ERROR", data: null, error: "malformed listings response", cached: false };
      }
      const orders = (body.orders ?? body.listings) as Record<string, unknown>[];
      const listings = orders.map((order) => normalizeOpenSeaOrder({ chainId, order, observedAt: new Date().toISOString() })).filter((item): item is NormalizedListing => item !== null);
      const value = { state: "AVAILABLE" as const, data: listings, error: null, cached: false };
      cache.set(key, { at: Date.now(), value });
      return value;
    },
    async getListing(id: string) {
      const listings = await this.getListings({ chain });
      const found = listings.data?.find((item) => item.id === id) ?? null;
      return { state: found ? listings.state : "UNAVAILABLE", data: found, error: found ? null : listings.error ?? "listing was not in the latest provider response", cached: listings.cached };
    },
    async getCollection() {
      return { state: "UNSUPPORTED", data: null, error: "Collection lookup is not verified against the provider in phase 5", cached: false };
    },
    async getNFT(query: MarketQuery) {
      if (!query.contract || !query.tokenId) return { state: "UNAVAILABLE", data: null, error: "contract and tokenId are required", cached: false };
      return { state: "UNSUPPORTED", data: null, error: "NFT lookup is not verified against the provider in phase 5", cached: false };
    },
    async getCollectionActivity() {
      return { state: "UNSUPPORTED", data: null, error: "OpenSea activity is not mapped in phase 5; use chain discovery transfers" };
    },
  };
}
