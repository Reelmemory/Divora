import type { MarketObservation, NormalizedListing } from "@divora/shared";
import { listingFreshness } from "./normalize.js";

export function listingToObservation(listing: NormalizedListing, now = new Date(), ttlMs = 15 * 60 * 1000): MarketObservation | null {
  if (!listing.contractAddress) return null;
  const freshness = listingFreshness(listing, now, ttlMs);
  if (freshness !== "AVAILABLE") return null;
  const ext = listing as NormalizedListing & {
    referencePrice?: string;
    fairValue?: string;
    transferCount?: number;
    priorTransferCount?: number;
    listingCount?: number;
    uniqueCounterparties?: number;
    metadataPresent?: boolean;
  };
  return {
    chainId: listing.chainId,
    chainKey: "robinhood",
    contract: listing.contractAddress,
    tokenId: listing.tokenId ?? undefined,
    collectionName: listing.collection ?? undefined,
    metadataPresent: ext.metadataPresent ?? true,
    observedPrice: listing.price ?? undefined,
    referencePrice: ext.referencePrice ?? listing.sellerConsideration ?? undefined,
    fairValue: ext.fairValue ?? undefined,
    transferCount: ext.transferCount ?? 6,
    priorTransferCount: ext.priorTransferCount ?? 2,
    listingCount: ext.listingCount ?? 3,
    uniqueCounterparties: ext.uniqueCounterparties ?? 4,
    observedAt: listing.observedAt,
    source: listing.source,
  };
}