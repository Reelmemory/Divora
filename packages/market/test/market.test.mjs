import assert from "node:assert/strict";
import test from "node:test";
import { evaluateObservation } from "../../opportunities/dist/index.js";
import { decide } from "../../policy/dist/index.js";
import { createOpenSeaMarketplace, createOpenSeaProvider, listingFreshness, listingToObservation, normalizeOpenSeaOrder } from "../dist/index.js";

const now = new Date("2026-10-08T12:00:00.000Z");

test("normalizes a listing and keeps missing fields null", () => {
  const listing = normalizeOpenSeaOrder({
    chainId: 4663,
    observedAt: now.toISOString(),
    order: { order_hash: "0xabc", current_price: "100", maker: { address: "0x1111111111111111111111111111111111111111" }, expiration_time: 1790000000, protocol_data: { parameters: { offer: [{ token: "0x2222222222222222222222222222222222222222", identifierOrCriteria: "29" }] } } },
  });
  assert.equal(listing?.tokenId, "29");
  assert.equal(listing?.price, "100");
  const missing = normalizeOpenSeaOrder({ chainId: 4663, observedAt: now.toISOString(), order: { order_hash: "0xdef" } });
  assert.equal(missing?.price, null);
  assert.equal(missing?.seller, null);
  assert.equal(missing?.protocolAddress, null);
  const liveShape = normalizeOpenSeaOrder({ chainId: 4663, observedAt: now.toISOString(), order: { order_hash: "0xlive", protocol_address: "0x0000000000000068f116a894984e2db1123eb395", price: { current: { currency: "USDG", decimals: 6, value: "250000" } }, protocol_data: { parameters: { offerer: "0xseller", endTime: "1799794098", offer: [{ token: "0x2222222222222222222222222222222222222222", identifierOrCriteria: "54" }] } } } });
  assert.equal(liveShape?.price, "250000");
  assert.equal(liveShape?.currency, "USDG");
  assert.equal(liveShape?.seller, "0xseller");
  assert.equal(normalizeOpenSeaOrder({ chainId: 4663, observedAt: now.toISOString(), order: {} }), null);
});

test("provider maps success, empty, timeout, rate limit, and error without inventing listings", async () => {
  const provider = createOpenSeaProvider({ apiKey: "test", minIntervalMs: 0 }, async () => new Response(JSON.stringify({ orders: [] }), { status: 200 }));
  const empty = await provider.getListings({ chain: "robinhood" });
  assert.deepEqual(empty.data, []);
  const limited = createOpenSeaProvider({ apiKey: "test", minIntervalMs: 0 }, async () => new Response("no", { status: 429 }));
  assert.equal((await limited.getListings({ chain: "robinhood" })).state, "RATE_LIMITED");
  const errored = createOpenSeaProvider({ apiKey: "test", minIntervalMs: 0 }, async () => new Response("no", { status: 500 }));
  assert.equal((await errored.getListings({ chain: "robinhood" })).state, "PROVIDER_ERROR");
  const missing = createOpenSeaProvider({}, async () => new Response("{}", { status: 200 }));
  assert.equal((await missing.getListings({ chain: "robinhood" })).state, "UNAVAILABLE");
  const timedOut = createOpenSeaProvider({ apiKey: "test", timeoutMs: 20, minIntervalMs: 0 }, (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("abort")));
  }));
  assert.equal((await timedOut.getListings({ chain: "robinhood" })).state, "PROVIDER_ERROR");
  assert.equal((await provider.getCollectionActivity({ chain: "robinhood" })).state, "UNSUPPORTED");
  const malformed = createOpenSeaProvider({ apiKey: "test", minIntervalMs: 0 }, async () => new Response("not-json", { status: 200 }));
  assert.equal((await malformed.getListings({ chain: "robinhood" })).state, "PROVIDER_ERROR");
  const shape = createOpenSeaProvider({ apiKey: "test", minIntervalMs: 0 }, async () => new Response(JSON.stringify({ nope: true }), { status: 200 }));
  assert.equal((await shape.getListings({ chain: "robinhood" })).error, "malformed listings response");
  const collection = await provider.getCollection({ chain: "robinhood", collectionSlug: "echoed" });
  assert.equal(collection.state, "UNSUPPORTED");
  assert.equal(collection.data, null);
  const nft = await provider.getNFT({ chain: "robinhood", contract: "0x2222222222222222222222222222222222222222", tokenId: "1" });
  assert.equal(nft.state, "UNSUPPORTED");
  assert.equal(nft.data, null);
  assert.equal(empty.cached, false);
  const second = await provider.getListings({ chain: "robinhood" });
  assert.equal(second.cached, true);
});

test("freshness and marketplace refuse calldata and fulfillment", () => {
  const listing = normalizeOpenSeaOrder({ chainId: 4663, observedAt: now.toISOString(), order: { order_hash: "0xabc", current_price: "10", expiration_time: 1, protocol_data: { parameters: { offer: [{ token: "0x2222222222222222222222222222222222222222", identifierOrCriteria: "1" }] } } } });
  assert.ok(listing);
  assert.equal(listingFreshness(listing, now, 1000), "STALE");
  assert.equal(listingToObservation(listing, now), null);
  assert.equal(listingFreshness({ ...listing, expiresAt: null, observedAt: now.toISOString() }, now, 1000), "AVAILABLE");
  const adapter = createOpenSeaMarketplace({ name: "mock", getListings: async () => ({ state: "AVAILABLE", data: [], error: null }), getListing: async () => ({ state: "UNAVAILABLE", data: null, error: null }), getCollection: async () => ({ state: "UNAVAILABLE", data: null, error: null }), getNFT: async () => ({ state: "UNAVAILABLE", data: null, error: null }), getCollectionActivity: async () => ({ state: "UNSUPPORTED", data: null, error: null }) });
  assert.equal(adapter.buildBuyTransaction(listing).supported, false);
  assert.equal(adapter.buildBuyTransaction({ ...listing, calldata: "0x1234" }).supported, false);
});

test("a fixture listing is labeled and feeds the existing opportunity and decision path", () => {
  const listing = normalizeOpenSeaOrder({ chainId: 4663, observedAt: now.toISOString(), order: { order_hash: "0xabc", current_price: "10", maker: { address: "0xseller" }, protocol_data: { parameters: { offer: [{ token: "0x2222222222222222222222222222222222222222", identifierOrCriteria: "29" }] } }, collection_slug: "fixture" } });
  assert.ok(listing);
  const observation = listingToObservation(listing, now);
  assert.ok(observation);
  assert.equal(observation.source, "opensea");
  assert.equal(observation.observedPrice, "10");
  const opportunity = evaluateObservation({ ...observation, referencePrice: "100", transferCount: 6, priorTransferCount: 5, listingCount: 1, uniqueCounterparties: 2, metadataPresent: true }, {}, now);
  const decision = decide(opportunity, { maxTradeValue: "100", maxDailySpend: "100", maxGas: "1", maxSlippageBps: 100, allowedChains: [4663], allowedCollections: [observation.contract], allowedMarketplaces: ["fixture"], allowedStrategies: ["MISPRICED_NFT"], minOpportunityScore: 10, minConfidence: 10, buyMinScore: 10, buyMinConfidence: 10, watchMinScore: 1 }, { tradeValue: "10", gas: "0.1", slippageBps: 10, marketplace: "fixture" }, now);
  assert.equal(decision.execution, "disabled");
  assert.equal(opportunity.evidence.source, "opensea");
  assert.ok(decision.action === "BUY" || decision.action === "WATCH" || decision.action === "REJECT");
});
