import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function MarketPage() {
  let snapshots: Awaited<ReturnType<typeof prisma.marketListingSnapshot.findMany>> = [];
  let dbError: string | null = null;

  try {
    snapshots = await prisma.marketListingSnapshot.findMany({
      orderBy: { observedAt: "desc" },
      take: 25,
    });
  } catch (err) {
    dbError = err instanceof Error ? err.message : "Database unavailable";
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12 text-sm">
      <div>
        <p className="text-muted-foreground">Phase 5 · Live Supabase Persistence</p>
        <h1 className="text-3xl font-semibold">Market listings</h1>
        <p className="mt-1 text-muted-foreground">
          Showing {snapshots.length} persisted market listing snapshot(s) from Supabase.
        </p>
        {dbError && <p className="mt-2 text-red-500">DB Error: {dbError}</p>}
        <Link className="mt-2 inline-block underline" href="/">
          Back
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Marketplace</th>
              <th className="px-3 py-2">Contract / Token</th>
              <th className="px-3 py-2">Price (wei)</th>
              <th className="px-3 py-2">Freshness</th>
              <th className="px-3 py-2">Observed At</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="px-3 py-2 font-mono text-xs">{row.id}</td>
                <td className="px-3 py-2">{row.marketplace} (chain {row.chainId})</td>
                <td className="px-3 py-2">
                  <div>#{row.tokenId ?? "—"}</div>
                  <div className="font-mono text-xs text-muted-foreground">{row.contract ?? "—"}</div>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{row.price ?? "—"}</td>
                <td className="px-3 py-2">{row.freshness}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {row.observedAt.toISOString()}
                </td>
              </tr>
            ))}
            {snapshots.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">
                  No snapshots recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}