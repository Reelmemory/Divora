import type { NormalizedListing, ProviderResult } from "@divora/shared";

export interface MarketQuery {
  chain: string;
  contract?: `0x${string}`;
  tokenId?: string;
  collectionSlug?: string;
  limit?: number;
}

export interface NFTMarketDataProvider {
  readonly name: string;
  getCollection(query: MarketQuery): Promise<ProviderResult<{ name: string | null; slug: string | null; contract: `0x${string}` | null }>>;
  getNFT(query: MarketQuery): Promise<ProviderResult<{ contract: `0x${string}` | null; tokenId: string | null; name: string | null }>>;
  getListings(query: MarketQuery): Promise<ProviderResult<NormalizedListing[]>>;
  getListing(id: string): Promise<ProviderResult<NormalizedListing>>;
  getCollectionActivity(query: MarketQuery): Promise<ProviderResult<{ transferCount: number | null }>>;
}

export function missingConfig(name: string): ProviderResult<never> {
  return { state: "UNAVAILABLE", data: null, error: `${name} is not configured` };
}
