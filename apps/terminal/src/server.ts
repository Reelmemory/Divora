import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { ConstitutionConfig, Decision, HealthReport, Opportunity, Simulator, TransactionIntent, SimulationResult } from "@divora/shared";
import { filterOpportunities } from "@divora/opportunities";
import { filterDecisions } from "@divora/policy";
import { createOpenSeaMarketplace, createOpenSeaProvider, prepareBuyOrder, runListingPipeline } from "@divora/market";
import { createPrismaListingStore } from "./persist.js";
import { buildTransactionRequest, createIntent, simulateRequest, unavailableSimulator, validateIntent } from "@divora/tx";

function statusFor(state: string): number {
  if (state === "AVAILABLE") return 200;
  if (state === "RATE_LIMITED") return 429;
  if (state === "UNSUPPORTED") return 501;
  if (state === "PROVIDER_ERROR") return 502;
  return 503;
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(payload) });
  res.end(payload);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

export interface TerminalOptions {
  opportunities?: Opportunity[];
  decisions?: Decision[];
  constitution?: ConstitutionConfig;
  simulator?: Simulator;
}

export function createHealthServer(options: TerminalOptions = {}) {
  const opportunities = options.opportunities ?? [];
  const decisions = options.decisions ?? [];
  const intents = new Map<string, TransactionIntent>();
  const simulations = new Map<string, SimulationResult>();
  const simulator = options.simulator ?? unavailableSimulator;
  const market = createOpenSeaMarketplace(createOpenSeaProvider({ apiKey: process.env.OPENSEA_API_KEY, baseUrl: process.env.OPENSEA_API_BASE, chain: process.env.OPENSEA_CHAIN }));
  const store = process.env.DATABASE_URL ? createPrismaListingStore() : undefined;
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/")) {
      const report: HealthReport = {
        status: "ok", service: "divora-terminal", phase: "0", timestamp: new Date().toISOString(),
        dependencies: { database: process.env.DATABASE_URL ? "configured" : "unconfigured", redis: process.env.REDIS_URL ? "configured" : "unconfigured", rpc: process.env.ROBINHOOD_RPC_URL ? "configured" : "unconfigured" },
      };
      send(res, 200, report);
      return;
    }
    if (req.method === "GET" && url.pathname === "/opportunities") {
      const minScore = url.searchParams.get("minScore");
      const chain = url.searchParams.get("chain");
      send(res, 200, { execution: "disabled", items: filterOpportunities(opportunities, { strategy: url.searchParams.get("strategy") ?? undefined, chainId: chain ? Number(chain) : undefined, collection: url.searchParams.get("collection") ?? undefined, minScore: minScore ? Number(minScore) : undefined, status: url.searchParams.get("status") ?? undefined }) });
      return;
    }
    const opportunityMatch = url.pathname.match(/^\/opportunities\/([^/]+)$/);
    if (req.method === "GET" && opportunityMatch) {
      const item = opportunities.find((opportunity) => opportunity.id === decodeURIComponent(opportunityMatch[1] ?? ""));
      send(res, item ? 200 : 404, item ? { execution: "disabled", item } : { status: "not_found" });
      return;
    }
    if (req.method === "GET" && url.pathname === "/decisions") {
      const minConfidence = url.searchParams.get("minConfidence");
      send(res, 200, { execution: "disabled", items: filterDecisions(decisions, { action: url.searchParams.get("action") ?? undefined, riskLevel: url.searchParams.get("riskLevel") ?? undefined, strategy: url.searchParams.get("strategy") ?? undefined, collection: url.searchParams.get("collection") ?? undefined, minConfidence: minConfidence ? Number(minConfidence) : undefined, status: url.searchParams.get("status") ?? undefined }) });
      return;
    }
    const decisionMatch = url.pathname.match(/^\/decisions\/([^/]+)$/);
    if (req.method === "GET" && decisionMatch) {
      const item = decisions.find((decision) => decision.id === decodeURIComponent(decisionMatch[1] ?? ""));
      send(res, item ? 200 : 404, item ? { execution: "disabled", analytical: true, item } : { status: "not_found" });
      return;
    }
    if (req.method === "GET" && url.pathname === "/transaction-intents") {
      send(res, 200, { execution: "disabled", items: [...intents.values()] });
      return;
    }
    const intentMatch = url.pathname.match(/^\/transaction-intents\/([^/]+)$/);
    if (req.method === "GET" && intentMatch) {
      const item = intents.get(decodeURIComponent(intentMatch[1] ?? ""));
      send(res, item ? 200 : 404, item ? { execution: "disabled", item } : { status: "not_found" });
      return;
    }
    const simulationMatch = url.pathname.match(/^\/simulations\/([^/]+)$/);
    if (req.method === "GET" && simulationMatch) {
      const item = simulations.get(decodeURIComponent(simulationMatch[1] ?? ""));
      send(res, item ? 200 : 404, item ? { execution: "disabled", item } : { status: "not_found" });
      return;
    }
    if (req.method === "GET" && url.pathname === "/market/listings") {
      const result = await market.getListings({ chain: process.env.OPENSEA_CHAIN ?? "robinhood", collectionSlug: url.searchParams.get("collection") ?? undefined, limit: 20 });
      const persistence = result.state === "AVAILABLE" && result.data && store ? await store.upsertSnapshots(result.data.map((listing) => ({ id: listing.id, chainId: listing.chainId, marketplace: listing.marketplace, contract: listing.contractAddress, tokenId: listing.tokenId, price: listing.price, seller: listing.seller, freshness: listing.freshness, observedAt: new Date(listing.observedAt), payload: { source: listing.source, currency: listing.currency } }))).then(() => ({ persisted: result.data?.length ?? 0, error: null })).catch((error: unknown) => ({ persisted: 0, error: error instanceof Error ? error.message : "persistence failed" })) : { persisted: 0, error: store ? null : "DATABASE_URL is not configured" };
      send(res, statusFor(result.state), { execution: "disabled", source: "opensea", live: result.state === "AVAILABLE" && result.cached !== true, persistence, ...result });
      return;
    }
    const listingMatch = url.pathname.match(/^\/market\/listings\/([^/]+)$/);
    if (req.method === "GET" && listingMatch) {
      const result = await market.getListing(decodeURIComponent(listingMatch[1] ?? ""));
      send(res, statusFor(result.state), { execution: "disabled", source: "opensea", live: result.state === "AVAILABLE" && result.cached !== true, ...result });
      return;
    }
    const collectionMatch = url.pathname.match(/^\/market\/collections\/([^/]+)$/);
    if (req.method === "GET" && collectionMatch) {
      const result = await market.getCollection({ chain: "robinhood", contract: decodeURIComponent(collectionMatch[1] ?? "") as `0x${string}` });
      send(res, statusFor(result.state), { execution: "disabled", source: "opensea", live: false, ...result });
      return;
    }
    const nftMatch = url.pathname.match(/^\/market\/nfts\/([^/]+)\/([^/]+)$/);
    if (req.method === "GET" && nftMatch) {
      const result = await market.getNFT({ chain: "robinhood", contract: decodeURIComponent(nftMatch[1] ?? "") as `0x${string}`, tokenId: decodeURIComponent(nftMatch[2] ?? "") });
      send(res, statusFor(result.state), { execution: "disabled", source: "opensea", live: false, ...result });
      return;
    }
      if (req.method === "POST" && url.pathname === "/market/pipeline") {
      const result = await market.getListings({ chain: process.env.OPENSEA_CHAIN ?? "robinhood", limit: 20 });
      const pipeline = await runListingPipeline({ provider: result, store, config: options.constitution ?? emptyConfig() });
      send(res, pipeline.stage === "provider" ? statusFor(result.state) : pipeline.stage === "persistence" ? 500 : 200, { execution: "disabled", live: result.state === "AVAILABLE" && result.cached !== true, pipeline });
      return;
    }
    if (req.method === "POST" && url.pathname === "/market/orders/prepare") {
      const body = await readJson(req);
      if ("calldata" in body || "data" in body) {
        send(res, 422, { execution: "disabled", prepared: false, violations: ["ARBITRARY_CALLDATA_REJECTED"] });
        return;
      }
      const prepared = await prepareBuyOrder({ order: body as never, config: options.constitution ?? emptyConfig() });
      send(res, prepared.source === "unsupported" ? 422 : 200, { execution: "disabled", prepared: prepared.source !== "unsupported", item: prepared });
      return;
    }
    if (req.method === "POST" && url.pathname === "/transaction-intents") {
      const body = await readJson(req);
      const decision = decisions.find((item) => item.id === body.decisionId);
      const opportunity = opportunities.find((item) => item.id === decision?.opportunityId);
      const draft = { expectedPrice: String(body.expectedPrice ?? ""), maxPrice: String(body.maxPrice ?? ""), estimatedGas: String(body.estimatedGas ?? ""), slippageBps: Number(body.slippageBps ?? 0), marketplace: String(body.marketplace ?? "") };
      const validation = validateIntent({ decision, opportunity, config: options.constitution ?? emptyConfig(), draft });
      if (!validation.valid || !decision || !opportunity) {
        send(res, 422, { execution: "disabled", created: false, validation });
        return;
      }
      const intent = createIntent({ decision, opportunity, draft });
      intents.set(intent.id, intent);
      send(res, 201, { execution: "disabled", created: true, intent, validation });
      return;
    }
    const simulateMatch = url.pathname.match(/^\/transaction-intents\/([^/]+)\/simulate$/);
    if (req.method === "POST" && simulateMatch) {
      const intent = intents.get(decodeURIComponent(simulateMatch[1] ?? ""));
      if (!intent) { send(res, 404, { status: "not_found" }); return; }
      const decision = decisions.find((item) => item.id === intent.decisionId);
      const opportunity = opportunities.find((item) => item.id === intent.opportunityId);
      const validation = validateIntent({ decision, opportunity, config: options.constitution ?? emptyConfig(), draft: { expectedPrice: intent.expectedPrice, maxPrice: intent.maxPrice, estimatedGas: intent.estimatedGas, slippageBps: intent.slippageBps, marketplace: intent.marketplace } });
      if (!validation.valid) { send(res, 422, { execution: "disabled", simulated: false, validation }); return; }
      const request = buildTransactionRequest(intent, validation);
      const result = await simulateRequest({ intentId: intent.id, request, simulator });
      simulations.set(result.id, result);
      send(res, 200, { execution: "disabled", simulated: true, result });
      return;
    }
    send(res, 404, { status: "not_found" });
  });
}

function emptyConfig(): ConstitutionConfig {
  return { maxTradeValue: null, maxDailySpend: null, maxGas: null, maxSlippageBps: null, allowedChains: [], allowedCollections: [], allowedMarketplaces: [], allowedStrategies: [], minOpportunityScore: 100, minConfidence: 100, buyMinScore: 100, buyMinConfidence: 100, watchMinScore: 100 };
}
