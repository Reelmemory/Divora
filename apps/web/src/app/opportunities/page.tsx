import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { sampleOpportunities } from "@/lib/sampleOpportunities";

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage() {
  let dbOpportunities: any[] = [];
  let sourceLabel = "Supabase Live Records";

  try {
    dbOpportunities = await prisma.opportunityRecord.findMany({
      include: { signals: true },
      orderBy: { updatedAt: "desc" },
      take: 25,
    });
  } catch {
    sourceLabel = "Fixture Fallback (DB unreachable)";
  }

  const rows =
    dbOpportunities.length > 0
      ? dbOpportunities.map((item) => ({
          id: item.id,
          score: item.score,
          strategy: item.strategy,
          collectionName: item.collectionName ?? "Collection",
          tokenId: item.tokenId,
          contract: item.contract,
          status: item.status,
          confidence: item.confidence,
          signals: item.signals ?? [],
          analysis: (item.analysis as {
            reasoning?: string;
            otari?: {
              recommendation?: "review" | "watch" | "ignore";
              confidence?: number;
              reasoning?: string;
              supportingSignals?: string[];
              invalidationConditions?: string[];
            } | null;
          }) ?? { reasoning: "", otari: null },
          updatedAt: item.updatedAt instanceof Date ? item.updatedAt.toISOString() : String(item.updatedAt),
        }))
      : sampleOpportunities;

  // Fixture rows use StructuredRecommendation, while persisted rows wrap the
  // advisory under analysis.otari. Normalize both shapes for the table.
  const displayRows = rows.map((item) => ({
    ...item,
    otari:
      item.analysis && typeof item.analysis === "object" && "otari" in item.analysis
        ? item.otari
        : null,
  }));

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12">
      <div>
        <p className="text-sm text-muted-foreground">Phase 2 · {sourceLabel}</p>
        <h1 className="text-3xl font-semibold">Opportunities</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Scores come from the deterministic engine ({dbOpportunities.length} live DB rows). Execution is disabled.
        </p>
        <Link className="text-sm underline" href="/">
          Back
        </Link>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="px-3 py-2">Score</th>
              <th className="px-3 py-2">Strategy</th>
              <th className="px-3 py-2">Asset</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Confidence</th>
              <th className="px-3 py-2">Deterministic signals</th>
              <th className="px-3 py-2">Otari advisory</th>
              <th className="px-3 py-2">Updated</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((item) => (
              <tr key={item.id} className="border-t border-border">
                <td className="px-3 py-2">{item.score ?? "—"}</td>
                <td className="px-3 py-2">{item.strategy ?? "—"}</td>
                <td className="px-3 py-2">
                  {item.collectionName} #{item.tokenId}
                  <div className="text-xs text-muted-foreground">{item.contract}</div>
                </td>
                <td className="px-3 py-2">{item.status}</td>
                <td className="px-3 py-2">{item.confidence}</td>
                <td className="px-3 py-2">
                  {item.signals
                    .filter((signal: any) => signal.applicable)
                    .map((signal: any) => signal.code)
                    .join(", ") || "none"}
                  <div className="text-xs text-muted-foreground">{item.analysis?.reasoning}</div>
                </td>
                <td className="px-3 py-2 min-w-64">
                  {item.otari ? (
                    <>
                      <div className="font-medium uppercase">
                        {item.analysis.otari.recommendation} · {item.analysis.otari.confidence}% confidence
                      </div>
                      <div className="text-xs text-muted-foreground">{item.analysis.otari.reasoning}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Signals: {item.analysis.otari.supportingSignals?.join(", ") || "none"}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Reconsider if: {item.analysis.otari.invalidationConditions?.join("; ") || "not specified"}
                      </div>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not analyzed / unavailable</span>
                  )}
                </td>
                <td className="px-3 py-2">{item.updatedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}