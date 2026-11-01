import assert from "node:assert/strict";
import test from "node:test";
import { normalizeOpenSeaOrder, persistListings, runListingPipeline, snapshotFromListing } from "../dist/index.js";

const now = new Date("2026-10-08T12:00:00.000Z");
const listing = {
  id: "0xabc", chainId: 4663, marketplace: "opensea", collection: "fixture",
  contractAddress: "0x2222222222222222222222222222222222222222", tokenId: "29",
  seller: "0x1111111111111111111111111111111111111111", price: "10", currency: null,
  expiresAt: "2026-10-08T12:10:00.000Z", source: "fixture", observedAt: now.toISOString(), freshness: "AVAILABLE",
};
const config = {
  maxTradeValue: "100", maxDailySpend: "100", maxGas: "1", maxSlippageBps: 100,
  allowedChains: [4663], allowedCollections: [listing.contractAddress], allowedMarketplaces: ["opensea"],
  allowedStrategies: ["MISPRICED_NFT"], minOpportunityScore: 1, minConfidence: 1,
  buyMinScore: 1, buyMinConfidence: 1, watchMinScore: 1,
};

test("persists snapshots once and reports store failures", async () => {
  const seen = new Map();
  const store = { async upsertSnapshots(rows) { for (const row of rows) seen.set(row.id, row); return { persisted: rows.length }; } };
  const first = await persistListings([listing], store);
  const second = await persistListings([listing], store);
  assert.equal(first.persisted, 1);
  assert.equal(second.persisted, 1);
  assert.equal(seen.size, 1);
  assert.equal(snapshotFromListing(listing)?.payload.currency, null);
  const failed = await persistListings([listing], { async upsertSnapshots() { throw new Error("db down"); } });
  assert.equal(failed.persisted, 0);
  assert.equal(failed.error, "db down");
});

test("pipeline stops on provider or persistence failure and does not fabricate opportunities", async () => {
  const unavailable = await runListingPipeline({ provider: { state: "UNAVAILABLE", data: null, error: "OPENSEA_API_KEY is not configured" }, config, now });
  assert.equal(unavailable.stage, "provider");
  assert.equal(unavailable.opportunities.length, 0);
  const stale = { ...listing, freshness: "STALE", expiresAt: "2026-10-08T11:00:00.000Z" };
  const stored = [];
  const result = await runListingPipeline({ provider: { state: "AVAILABLE", data: [stale], error: null }, store: { async upsertSnapshots(rows) { stored.push(...rows); return { persisted: rows.length }; } }, config, now });
  assert.equal(stored[0].freshness, "STALE");
  assert.equal(result.opportunities.length, 0);
  const broken = await runListingPipeline({ provider: { state: "AVAILABLE", data: [listing], error: null }, store: { async upsertSnapshots() { throw new Error("write failed"); } }, config, now });
  assert.equal(broken.stage, "persistence");
  assert.equal(broken.opportunities.length, 0);
});

test("pipeline reaches decision, ranks ETH ahead of USDG, and keeps simulation non-executable", async () => {
  const usdgOrder = normalizeOpenSeaOrder({
    chainId: 4663,
    observedAt: now.toISOString(),
    order: {
      order_hash: "0xusdg",
      protocol_address: "0x0000000000000068f116a894984e2db1123eb395",
      price: { current: { currency: "USDG", decimals: 6, value: "20000" } },
      protocol_data: {
        parameters: {
          offerer: "0x1111111111111111111111111111111111111111",
          endTime: "1799794098",
          offer: [{ token: listing.contractAddress, identifierOrCriteria: "30" }],
          consideration: [
            { itemType: 1, token: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", startAmount: "19800", recipient: "0x1111111111111111111111111111111111111111" },
            { itemType: 1, token: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", startAmount: "200", recipient: "0x0000a26b00c1f0df003000390027140000faa719" },
          ],
        },
      },
    },
  });
  assert.ok(usdgOrder);
  assert.equal(usdgOrder.paymentToken, "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168");
  assert.equal(usdgOrder.sellerConsideration, "19800");
  assert.equal(usdgOrder.feeBps, 100);

  const result = await runListingPipeline({
    provider: { state: "AVAILABLE", data: [usdgOrder, { ...listing, currency: "ETH" }], error: null },
    store: { async upsertSnapshots(rows) { return { persisted: rows.length }; } },
    config,
    buyer: "0x3333333333333333333333333333333333333333",
    maxPrice: "12",
    slippageBps: 10,
    estimatedGas: "0.1",
    now,
  });
  assert.equal(result.stage, "complete");
  assert.equal(result.persisted, 2);
  assert.equal(result.opportunities.length, 2);
  assert.equal(result.rankedListings[0].id, "0xabc");
  assert.equal(result.rankedListings[1].id, "0xusdg");
  assert.equal(result.approvals[0].plan.required, true);
  assert.equal(result.approvals[0].plan.spender, null);
  assert.equal(result.readiness[0].status.feeBps, 100);
  assert.equal(result.swapQuote.executable, false);
  assert.equal(result.decisions[0].execution, "disabled");
  assert.equal(result.simulation.executable, false);
  assert.equal(result.simulation.onChain, false);
});

test("pipeline persists Otari advisory separately from deterministic analysis", async () => {
  const saved = [];
  const decisions = [];
  const recommendation = {
    recommendation: "watch",
    confidence: 82,
    reasoning: "Listing evidence merits monitoring, not immediate action.",
    supportingSignals: [],
    invalidationConditions: ["Listing expires or price changes"],
  };
  const result = await runListingPipeline({
    provider: { state: "AVAILABLE", data: [listing], error: null },
    store: { async upsertSnapshots(rows) { return { persisted: rows.length }; } },
    opportunityStore: {
      async saveOpportunity(value) { saved.push(value); return value; },
      async saveDecision(value) { decisions.push(value); return value; },
    },
    analyzeOpportunity: async () => recommendation,
    config,
    now,
  });

  assert.equal(result.stage, "complete");
  assert.equal(result.aiAnalysisCount, 1);
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].analysis.otari, recommendation);
  assert.ok(saved[0].analysis.reasoning !== undefined || saved[0].analysis.signals !== undefined);
  assert.equal(decisions.length, result.decisions.length);
  assert.equal(result.decisions[0].action === "BUY", false);
});
