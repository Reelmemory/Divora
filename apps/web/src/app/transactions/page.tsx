import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  let intents: Awaited<ReturnType<typeof prisma.transactionIntentRecord.findMany>> = [];
  let simulations: Awaited<ReturnType<typeof prisma.simulationResultRecord.findMany>> = [];

  try {
    [intents, simulations] = await Promise.all([
      prisma.transactionIntentRecord.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.simulationResultRecord.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);
  } catch {
    // Fallback if offline
  }

  const simByIntent = new Map(simulations.map((s) => [s.intentId, s]));

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-4 px-6 py-12 text-sm">
      <p className="text-muted-foreground">Phase 4 · Supabase Live Intents & Simulations</p>
      <h1 className="text-3xl font-semibold">Transaction intents</h1>
      <p className="font-medium">NOT EXECUTED ({intents.length} persisted intents)</p>
      <p>There is no buy button. Simulation cannot broadcast.</p>

      {intents.map((intent) => {
        const sim = simByIntent.get(intent.id);
        return (
          <dl key={intent.id} className="grid grid-cols-2 gap-2 rounded-lg border border-border p-4">
            <dt className="font-medium">Intent ID</dt>
            <dd className="font-mono text-xs">{intent.id}</dd>
            <dt className="font-medium">Opportunity</dt>
            <dd>{intent.opportunityId}</dd>
            <dt className="font-medium">Decision</dt>
            <dd>{intent.decisionId}</dd>
            <dt className="font-medium">Asset</dt>
            <dd className="font-mono text-xs">
              {intent.contract} #{intent.tokenId}
            </dd>
            <dt className="font-medium">Expected / max price</dt>
            <dd>
              {intent.expectedPrice} / {intent.maxPrice}
            </dd>
            <dt className="font-medium">Gas estimate</dt>
            <dd>{intent.estimatedGas}</dd>
            <dt className="font-medium">Simulation state</dt>
            <dd className="font-semibold">{sim?.state ?? "NOT_SIMULATED"}</dd>
            <dt className="font-medium">Revert reason</dt>
            <dd>{sim?.revertReason ?? "none"}</dd>
            <dt className="font-medium">Timestamp</dt>
            <dd className="text-xs text-muted-foreground">{intent.createdAt.toISOString()}</dd>
          </dl>
        );
      })}

      <Link className="underline" href="/">
        Back
      </Link>
    </main>
  );
}