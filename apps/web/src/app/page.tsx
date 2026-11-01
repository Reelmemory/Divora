import Link from "next/link";
import {
  Shield,
  Activity,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Database,
  ArrowUpRight,
  Cpu,
  Layers,
  Terminal,
} from "lucide-react";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function formatEth(wei: string | null | undefined): string {
  if (!wei || !/^\d+$/.test(wei)) return "—";
  const eth = Number(BigInt(wei)) / 1e18;
  return `${eth.toFixed(4)} ETH`;
}

export default async function DashboardHomePage() {
  let snapshotCount = 0;
  let opportunityCount = 0;
  let decisionCount = 0;
  let intentCount = 0;
  let simulationCount = 0;

  let recentOpportunities: any[] = [];
  let recentDecisions: any[] = [];
  let recentSnapshots: any[] = [];
  let recentSimulations: any[] = [];
  let dbOnline = true;

  try {
    const [
      snapTotal,
      oppTotal,
      decTotal,
      intTotal,
      simTotal,
      opps,
      decs,
      snaps,
      sims,
    ] = await Promise.all([
      prisma.marketListingSnapshot.count(),
      prisma.opportunityRecord.count(),
      prisma.decisionRecord.count(),
      prisma.transactionIntentRecord.count(),
      prisma.simulationResultRecord.count(),
      prisma.opportunityRecord.findMany({
        include: { signals: true },
        orderBy: { updatedAt: "desc" },
        take: 6,
      }),
      prisma.decisionRecord.findMany({
        include: { policy: true, risk: true },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      prisma.marketListingSnapshot.findMany({
        orderBy: { observedAt: "desc" },
        take: 6,
      }),
      prisma.simulationResultRecord.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
    ]);

    snapshotCount = snapTotal;
    opportunityCount = oppTotal;
    decisionCount = decTotal;
    intentCount = intTotal;
    simulationCount = simTotal;
    recentOpportunities = opps;
    recentDecisions = decs;
    recentSnapshots = snaps;
    recentSimulations = sims;
  } catch {
    dbOnline = false;
  }

  const buyDecisions = recentDecisions.filter((d) => d.action === "BUY").length;
  const latestTickTime =
    recentSnapshots[0]?.observedAt instanceof Date
      ? recentSnapshots[0].observedAt.toISOString()
      : "No ticks recorded";

  const pipelineStages = [
    { step: "1. DISCOVER", label: "Listings Ingested", count: snapshotCount, active: snapshotCount > 0 },
    { step: "2. ANALYZE", label: "Opportunities Scored", count: opportunityCount, active: opportunityCount > 0 },
    { step: "3. DECIDE", label: "Policy Decisions", count: decisionCount, active: decisionCount > 0 },
    { step: "4. VALIDATE", label: "Intent validation", count: intentCount, active: false },
    { step: "5. SIMULATE", label: "RPC simulations", count: simulationCount, active: false },
    { step: "6. EXECUTE", label: "Signing & broadcast", count: "DISABLED", active: false },
    { step: "7. VERIFY", label: "Receipt & ownership", count: "NOT WIRED", active: false },
    { step: "8. PORTFOLIO", label: "Position management", count: "NOT WIRED", active: false },
  ];

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Top Status Bar */}
      <header className="border-b border-zinc-800 bg-zinc-900/60 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white">DIVORA ENGINE</h1>
                <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                  {dbOnline ? "LIVE SUPABASE TELEMETRY" : "DB OFFLINE"}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                AI-Assisted NFT Market Research · Deterministic Risk &amp; Policy Controls
              </p>
            </div>
          </div>

          <nav className="flex items-center gap-2 text-xs font-medium">
            <Link
              href="/market"
              className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-200 hover:border-zinc-700 hover:bg-zinc-800"
            >
              Market ({snapshotCount})
            </Link>
            <Link
              href="/opportunities"
              className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-200 hover:border-zinc-700 hover:bg-zinc-800"
            >
              Opportunities ({opportunityCount})
            </Link>
            <Link
              href="/decisions"
              className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-200 hover:border-zinc-700 hover:bg-zinc-800"
            >
              Decisions ({decisionCount})
            </Link>
            <Link
              href="/transactions"
              className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-200 hover:border-zinc-700 hover:bg-zinc-800"
            >
              Intents &amp; Sim ({intentCount})
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        {/* KPI Metric Cards */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-xs font-medium uppercase tracking-wider">Market Snapshots</span>
              <Database className="h-4 w-4 text-sky-400" />
            </div>
            <p className="mt-3 text-3xl font-bold text-white">{snapshotCount}</p>
            <p className="mt-1 text-xs text-zinc-500">Latest tick: {latestTickTime.slice(11, 19)} UTC</p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-xs font-medium uppercase tracking-wider">Scored Opportunities</span>
              <Activity className="h-4 w-4 text-amber-400" />
            </div>
            <p className="mt-3 text-3xl font-bold text-white">{opportunityCount}</p>
            <p className="mt-1 text-xs text-zinc-500">Deterministic multi-signal engine</p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-xs font-medium uppercase tracking-wider">Policy Decisions</span>
              <Cpu className="h-4 w-4 text-emerald-400" />
            </div>
            <p className="mt-3 text-3xl font-bold text-white">{decisionCount}</p>
            <p className="mt-1 text-xs text-emerald-400">{buyDecisions} BUY decisions in latest records</p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-xs font-medium uppercase tracking-wider">Simulated Intents</span>
              <Zap className="h-4 w-4 text-purple-400" />
            </div>
            <p className="mt-3 text-3xl font-bold text-white">{simulationCount}</p>
            <p className="mt-1 text-xs text-zinc-500">No transaction broadcast</p>
          </div>
        </section>

        {/* Live Pipeline Stage Telemetry */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-emerald-400" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-200">
                Pipeline Capability & Telemetry
              </h2>
            </div>
            <span className="font-mono text-xs text-zinc-400">
              Historical records: {snapshotCount > 0 ? "PRESENT" : "NONE"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
            {pipelineStages.map((stage) => (
              <div
                key={stage.step}
                className={`rounded-lg border p-3 ${
                  stage.active
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-zinc-800 bg-zinc-900/60"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-zinc-300">{stage.step}</span>
                  {stage.active ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 text-zinc-500" />
                  )}
                </div>
                <p className="mt-2 text-lg font-bold text-white">{stage.count}</p>
                <p className="text-xs text-zinc-400">{stage.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Main 2-Column Live Feed Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left Column: Scored Opportunities */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">Latest Scored Opportunities</h2>
                <p className="text-xs text-zinc-400">Real-time output from @divora/opportunities</p>
              </div>
              <Link
                href="/opportunities"
                className="flex items-center gap-1 text-xs font-medium text-emerald-400 hover:underline"
              >
                View all <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="space-y-3">
              {recentOpportunities.map((opp) => (
                <div
                  key={opp.id}
                  className="flex items-center justify-between rounded-lg border border-zinc-800/80 bg-zinc-900/80 p-3.5 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">
                        {opp.collectionName ?? "Collection"} #{opp.tokenId}
                      </span>
                      <span className="rounded bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                        {opp.strategy ?? "MISPRICED_NFT"}
                      </span>
                    </div>
                    <p className="font-mono text-[11px] text-zinc-400">
                      Observed: {formatEth(opp.observedPrice)} · Floor Ref: {formatEth(opp.referencePrice)}
                    </p>
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-bold text-emerald-400">Score {opp.score ?? "—"}</div>
                    <div className="text-[11px] text-zinc-400">Confidence {opp.confidence}%</div>
                  </div>
                </div>
              ))}
              {recentOpportunities.length === 0 && (
                <p className="py-6 text-center text-xs text-zinc-500">No opportunities recorded yet.</p>
              )}
            </div>
          </section>

          {/* Right Column: Policy Decisions & Simulations */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">Policy Decisions &amp; Guardrails</h2>
                <p className="text-xs text-zinc-400">Constitution checks &amp; risk verdicts</p>
              </div>
              <Link
                href="/decisions"
                className="flex items-center gap-1 text-xs font-medium text-emerald-400 hover:underline"
              >
                View all <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="space-y-3">
              {recentDecisions.map((dec) => {
                const isBuy = dec.action === "BUY";
                return (
                  <div
                    key={dec.id}
                    className="rounded-lg border border-zinc-800/80 bg-zinc-900/80 p-3.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-2 py-0.5 font-mono text-[11px] font-bold ${
                            isBuy
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                              : "bg-zinc-800 text-zinc-300"
                          }`}
                        >
                          {dec.action}
                        </span>
                        <span className="font-medium text-zinc-200">
                          Score {dec.opportunityScore ?? "—"} · Risk: {dec.riskLevel}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] text-zinc-500">
                        {dec.createdAt instanceof Date ? dec.createdAt.toISOString().slice(11, 19) : ""}
                      </span>
                    </div>
                    <p className="mt-1.5 text-zinc-400 line-clamp-1">{dec.reasoning}</p>
                  </div>
                );
              })}
              {recentDecisions.length === 0 && (
                <p className="py-6 text-center text-xs text-zinc-500">No policy decisions recorded yet.</p>
              )}
            </div>
          </section>
        </div>

        {/* Bottom Section: Market Snapshots & Simulation Results */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-sky-400" />
                <h2 className="text-base font-semibold text-white">Recent Market Listing Snapshots</h2>
              </div>
              <Link href="/market" className="text-xs text-emerald-400 hover:underline">
                Full Table →
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-800 text-zinc-400">
                  <tr>
                    <th className="pb-2">Listing ID</th>
                    <th className="pb-2">Token</th>
                    <th className="pb-2">Price</th>
                    <th className="pb-2">Freshness</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {recentSnapshots.map((snap) => (
                    <tr key={snap.id}>
                      <td className="py-2.5 font-mono text-[11px] text-zinc-300">{snap.id}</td>
                      <td className="py-2.5 text-white">#{snap.tokenId}</td>
                      <td className="py-2.5 font-mono text-emerald-400">{formatEth(snap.price)}</td>
                      <td className="py-2.5 text-zinc-400">{snap.freshness}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-purple-400" />
                <h2 className="text-base font-semibold text-white">Recent Transaction Simulations</h2>
              </div>
              <Link href="/transactions" className="text-xs text-emerald-400 hover:underline">
                All Intents →
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-800 text-zinc-400">
                  <tr>
                    <th className="pb-2">Intent ID</th>
                    <th className="pb-2">State</th>
                    <th className="pb-2">Success</th>
                    <th className="pb-2">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {recentSimulations.map((sim) => (
                    <tr key={sim.id}>
                      <td className="py-2.5 font-mono text-[11px] text-zinc-300">{sim.intentId}</td>
                      <td className="py-2.5 font-semibold text-emerald-400">{sim.state}</td>
                      <td className="py-2.5 text-zinc-300">{sim.success ? "PASS" : "FAIL"}</td>
                      <td className="py-2.5 font-mono text-[11px] text-zinc-500">
                        {sim.createdAt instanceof Date ? sim.createdAt.toISOString().slice(11, 19) : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}