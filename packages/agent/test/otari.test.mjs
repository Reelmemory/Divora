import assert from "node:assert/strict";
import test from "node:test";
import { evaluateObservation } from "../../opportunities/dist/index.js";
import { createOtariAnalyzer } from "../dist/otari.js";

const now = new Date("2026-10-08T12:00:00.000Z");
const opportunity = evaluateObservation({
  chainId: 4663,
  chainKey: "robinhood",
  contract: "0x1111111111111111111111111111111111111111",
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
  source: "fixture",
}, {}, now);

function completion(content) {
  return new Response(JSON.stringify({
    model: "moonshotai/kimi-k2.6",
    choices: [{ message: { content: JSON.stringify(content) } }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

test("sends the opportunity to the configured Otari endpoint and parses structured advice", async () => {
  let requestUrl;
  let requestOptions;
  const analyzer = createOtariAnalyzer({
    apiKey: "test-token",
    baseUrl: "https://api.otari.ai/api/v1",
    model: "moonshotai/kimi-k2.6",
  }, async (url, options) => {
    requestUrl = url;
    requestOptions = options;
    return completion({
      recommendation: "watch",
      confidence: 87,
      reasoning: "The listing needs human review.",
      supportingSignals: [opportunity.signals[0]?.code, "NOT_A_REAL_SIGNAL"],
      invalidationConditions: ["Reference price changes."],
    });
  });

  const result = await analyzer(opportunity);
  assert.equal(requestUrl, "https://api.otari.ai/api/v1/chat/completions");
  assert.equal(requestOptions.headers.Authorization, "Bearer test-token");
  const sent = JSON.parse(requestOptions.body);
  assert.equal(sent.model, "moonshotai/kimi-k2.6");
  assert.equal(result.recommendation, "watch");
  assert.equal(result.confidence, 87);
  assert.ok(result.supportingSignals.every((code) => opportunity.signals.some((signal) => signal.code === code)));
});

test("rejects malformed or unsupported model output", async () => {
  const analyzer = createOtariAnalyzer({ apiKey: "test-token" }, async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: "not-json" } }] }), { status: 200 })
  );
  assert.equal(await analyzer(opportunity), null);
});

test("surfaces gateway HTTP failures without exposing credentials", async () => {
  const analyzer = createOtariAnalyzer({ apiKey: "test-token" }, async () =>
    new Response(JSON.stringify({ detail: "provider unavailable" }), { status: 424 })
  );
  await assert.rejects(() => analyzer(opportunity), /HTTP 424/);
});

test("does not make a request when no token is configured", async () => {
  let called = false;
  const analyzer = createOtariAnalyzer({}, async () => {
    called = true;
    throw new Error("should not be called");
  });
  assert.equal(await analyzer(opportunity), null);
  assert.equal(called, false);
});
