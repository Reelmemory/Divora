import {
  planApproval,
  type ConstitutionConfig,
  type NormalizedListing,
  type ProviderResult,
  type Simulator,
} from "@divora/shared";
import { evaluateObservation } from "@divora/opportunities";
import { decide } from "@divora/policy";
import { simulateRequest, buildTransactionRequest } from "@divora/tx";
import { listingToObservation } from "./observe.js";
import { orderFromListing, validateOrder } from "./orders.js";
import { persistListings, type ListingStore } from "./persist.js";
import { rankListings } from "./rank.js";
import { assessFulfillmentReadiness } from "./readiness.js";
import { quoteFromEnvironment } from "./swap.js";
import type { Opportunity, StructuredRecommendation } from "@divora/shared";

export interface OpportunityStore {
  saveOpportunity(opp: any): Promise<any>;
  saveDecision(decision: any): Promise<any>;
}

export interface TransactionStore {
  saveIntent(intentId: string, data: any): Promise<any>;
  saveSimulation(result: any): Promise<any>;
}

export async function runListingPipeline(input: {
  provider: ProviderResult<NormalizedListing[]>;
  store?: ListingStore;
  opportunityStore?: OpportunityStore;
  txStore?: TransactionStore;
  simulator?: Simulator;
  config: ConstitutionConfig;
  buyer?: `0x${string}`;
  spender?: `0x${string}` | null;
  maxPrice?: string;
  slippageBps?: number;
  estimatedGas?: string;
  now?: Date;
  analyzeOpportunity?: (opportunity: Opportunity) => Promise<StructuredRecommendation | null>;
}) {
  const now = input.now ?? new Date();
  const swapQuote = quoteFromEnvironment();

  if (input.provider.state !== "AVAILABLE" || !input.provider.data) {
    return {
      stage: "provider",
      providerState: input.provider.state,
      error: input.provider.error,
      persisted: 0,
      persistenceError: null,
      opportunities: [],
      rankedListings: [],
      decisions: [],
      orders: [],
      approvals: [],
      readiness: [],
      swapQuote,
      simulation: { state: "NOT_RUN", executable: false, onChain: false },
    };
  }

  const persistence = input.store
    ? await persistListings(input.provider.data, input.store)
    : { persisted: 0, error: "ListingStore not provided" };

  if (persistence.error && input.store) {
    return {
      stage: "persistence",
      providerState: input.provider.state,
      error: persistence.error,
      persisted: 0,
      persistenceError: persistence.error,
      opportunities: [],
      rankedListings: [],
      decisions: [],
      orders: [],
      approvals: [],
      readiness: [],
      swapQuote,
      simulation: { state: "NOT_RUN", executable: false, onChain: false },
    };
  }

  const observations = input.provider.data
    .map((listing) => listingToObservation(listing, now))
    .filter((item) => item !== null);

  const opportunities = observations.map((observation) => evaluateObservation(observation, {}, now));

  const scoreByContractToken = new Map<string, number | null>();
  for (const opp of opportunities) {
    scoreByContractToken.set(`${(opp.contract ?? "").toLowerCase()}:${opp.tokenId ?? ""}`, opp.score);
  }

  if (input.opportunityStore) {
    for (const opp of opportunities) {
      try {
        await input.opportunityStore.saveOpportunity(opp);
      } catch (err) {
        console.error(`Failed to persist opportunity ${opp.id}:`, err);
      }
    }
  }

  const rankedListings = rankListings(
    input.provider.data.map((listing) => {
      const key = `${(listing.contractAddress ?? "").toLowerCase()}:${listing.tokenId ?? ""}`;
      const feeBaseUnits =
        listing.price && listing.sellerConsideration && /^\d+$/.test(listing.price) && /^\d+$/.test(listing.sellerConsideration)
          ? (BigInt(listing.price) - BigInt(listing.sellerConsideration)).toString()
          : "0";
      return {
        id: listing.id,
        score: scoreByContractToken.get(key) ?? null,
        currency: listing.currency ?? "ETH",
        priceBaseUnits: listing.price,
        feeBaseUnits,
        quoteState: swapQuote.state === "AVAILABLE" ? "AVAILABLE" : "UNAVAILABLE",
      };
    })
  );

  const aiAnalyses = new Map<string, StructuredRecommendation>();
  if (input.analyzeOpportunity) {
    for (const opportunity of opportunities) {
      try {
        const analysis = await input.analyzeOpportunity(opportunity);
        if (analysis) aiAnalyses.set(opportunity.id, analysis);
      } catch (error) {
        console.warn(`AI analysis unavailable for ${opportunity.id}:`, error instanceof Error ? error.message : "unknown error");
      }
    }
  }

  const decisions = opportunities.map((opportunity) =>
    decide(
      opportunity,
      input.config,
      {
        tradeValue: opportunity.observedPrice ?? "0",
        gas: input.estimatedGas ?? "0",
        slippageBps: input.slippageBps ?? 0,
        marketplace: "opensea",
        analysis: aiAnalyses.get(opportunity.id) ?? null,
      },
      now
    )
  );

  if (input.opportunityStore) {
    for (const decision of decisions) {
      try {
        await input.opportunityStore.saveDecision(decision);
      } catch (err) {
        console.error(`Failed to persist decision ${decision.id}:`, err);
      }
    }
  }

  const orders = input.provider.data.map((listing) => {
    if (!input.buyer || !input.maxPrice) return { id: listing.id, validation: null, reason: "BUYER_OR_MAX_PRICE_MISSING" };
    const order = orderFromListing(listing, {
      buyer: input.buyer,
      maxPrice: input.maxPrice,
      slippageBps: input.slippageBps ?? 0,
      estimatedGas: input.estimatedGas ?? "0",
      feesBps: listing.feeBps ?? null,
    });
    if (!order) return { id: listing.id, validation: null, reason: "ORDER_FIELDS_MISSING" };
    return { id: listing.id, validation: validateOrder(order, input.config, now), reason: null };
  });

  const approvals = input.provider.data.map((listing) => ({
    id: listing.id,
    plan: planApproval({
      currency: listing.currency ?? "ETH",
      spender: input.spender ?? null,
      amount: listing.price,
    }),
  }));

  const readiness = input.provider.data.map((listing) => ({
    id: listing.id,
    status: assessFulfillmentReadiness(listing, {
      buyer: input.buyer ?? null,
      paymentToken: listing.paymentToken ?? null,
      paymentSymbol: listing.currency,
      considerationTotal: listing.sellerConsideration ?? null,
    }),
  }));

  let finalSimulationState: any = { state: "NOT_RUN", executable: false, onChain: false };
  
  if (input.simulator && input.txStore && input.buyer) {
    for (const decision of decisions) {
      if (decision.action === "BUY") {
        const linkedOpp = opportunities.find((o: any) => o.id === decision.opportunityId);
        if (!linkedOpp) continue;

        const intentId = `intent-${decision.id}`;
        const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
        
      const intentDraft = {
          id: intentId,
          decisionId: decision.id,
          opportunityId: decision.opportunityId,
          chainId: linkedOpp.chainId,
          contract: linkedOpp.contract as `0x${string}`,
          tokenId: linkedOpp.tokenId ?? "",
          marketplace: "opensea",
          expectedPrice: linkedOpp.observedPrice ?? "0",
          maxPrice: input.maxPrice ?? "0",
          estimatedGas: input.estimatedGas ?? "0",
          slippageBps: input.slippageBps ?? 0,
        };

        const payload = buildTransactionRequest(
          intentDraft as any,
          { valid: true } as any
        );

        const intentData = {
          ...intentDraft,
          payload,
          expiresAt,
        };

        await input.txStore.saveIntent(intentId, intentData);

        const simResult = await simulateRequest({
          intentId,
          request: payload,
          simulator: input.simulator,
          now,
        });

        await input.txStore.saveSimulation(simResult);

        finalSimulationState = simResult;
        break;
      }
    }
  } else if (!input.simulator) {
    finalSimulationState = { state: "SIMULATION_UNAVAILABLE", executable: false, onChain: false };
  }

  return {
    stage: "complete",
    providerState: input.provider.state,
    error: null,
    persisted: persistence.persisted,
    persistenceError: persistence.error,
    opportunities,
    rankedListings,
    decisions,
    orders,
    approvals,
    readiness,
    swapQuote,
    simulation: finalSimulationState,
  };
}