import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { sampleDecisions } from "@/lib/sampleDecisions";

export const dynamic = "force-dynamic";

export default async function DecisionsPage() {
  let dbDecisions: any[] = [];
  let sourceLabel = "Supabase Live Records";

  try {
    dbDecisions = await prisma.decisionRecord.findMany({
      include: { policy: true, risk: true },
      orderBy: { createdAt: "desc" },
      take: 25,
    });
  } catch {
    sourceLabel = "Fixture Fallback (DB unreachable)";
  }

  const rows =
    dbDecisions.length > 0
      ? dbDecisions.map((item) => ({
          id: item.id,
          action: item.action,
          confidence: item.confidence,
          opportunityScore: item.opportunityScore,
          riskLevel: item.riskLevel,
          reasoning: item.reasoning,
          createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : String(item.createdAt),
          policy: {
            allowed: item.policy?.allowed ?? (Array.isArray(item.rejectionReasons) && item.rejectionReasons.length === 0),
            violations: Array.isArray(item.policy?.violations) ? item.policy.violations : [],
            warnings: Array.isArray(item.policy?.warnings) ? item.policy.warnings : [],
          },
          risk: {
            findings: Array.isArray(item.risk?.findings) ? item.risk.findings : [],
          },
        }))
      : sampleDecisions;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12">
      <div>
        <p className="text-sm text-muted-foreground">Phase 3 · {sourceLabel}</p>
        <h1 className="text-3xl font-semibold">Decisions</h1>
        <p className="mt-2 text-sm font-medium">
          BUY means ANALYTICAL — NOT EXECUTED ({dbDecisions.length} live DB rows)
        </p>
        <Link className="text-sm underline" href="/">
          Back
        </Link>
      </div>
      {rows.map((item) => (
        <article key={item.id} className="rounded-lg border border-border p-4 text-sm">
          <p className="font-medium">
            Action: {item.action} · confidence {item.confidence} · score {item.opportunityScore ?? "—"} · risk{" "}
            {item.riskLevel}
          </p>
          <p>
            Policy: {item.policy.allowed ? "allowed" : "denied"} · violations{" "}
            {item.policy.violations.join(", ") || "none"} · warnings {item.policy.warnings.join(", ") || "none"}
          </p>
          <ul className="mt-2 list-disc pl-5">
            {item.risk.findings.map((finding: any) => (
              <li key={`${finding.type}-${finding.severity}`}>
                {finding.type}: {finding.severity} — {finding.reason}
              </li>
            ))}
          </ul>
          <p className="mt-2">{item.reasoning}</p>
          <p className="text-xs text-muted-foreground">{item.createdAt}</p>
        </article>
      ))}
    </main>
  );
}