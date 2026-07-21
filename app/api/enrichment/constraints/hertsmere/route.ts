import { NextResponse } from "next/server";
import { fetchPlanningConstraints } from "@/lib/atlas/enrichment/constraints";
import { authorizeIngestion } from "@/lib/atlas/ingestion/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { scoreOpportunity } from "@/lib/scoring";

export const maxDuration = 60;

type OpportunityRow = {
  id: string;
  latitude: number | null;
  longitude: number | null;
  raw_evidence: Record<string, unknown> | null;
  ownership_status: string | null;
  company_status: string | null;
  vacancy_signal: number;
  planning_signal: number;
  access_signal: number;
  assembly_signal: number;
  evidence_confidence: number;
  area_sqm: number | null;
};

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index]);
    }
  }));
  return results;
}

export async function POST(request: Request) {
  const authorization = authorizeIngestion(request);
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });

  try {
    const { data: territory, error: territoryError } = await supabase.from("territories").select("id").eq("slug", "hertsmere").single();
    if (territoryError || !territory) throw new Error("Hertsmere territory is not configured");
    const now = new Date().toISOString();
    const { data: source, error: sourceError } = await supabase.from("data_sources").upsert({
      territory_id: territory.id,
      slug: "planning-data-constraints",
      name: "Planning Data indicative constraints",
      category: "constraints",
      authority: "Ministry of Housing, Communities and Local Government",
      source_url: "https://www.planning.data.gov.uk/docs",
      licence: "Open Government Licence v3.0",
      refresh_cadence: "on demand",
      status: "active",
      trust_score: 85,
      configuration: { mode: "point-query", coverage_warning: true },
      updated_at: now,
    }, { onConflict: "slug" }).select("id").single();
    if (sourceError || !source) throw new Error(sourceError?.message ?? "Could not configure the Planning Data source");

    const { data, error } = await supabase.from("opportunities")
      .select("id,latitude,longitude,raw_evidence,ownership_status,company_status,vacancy_signal,planning_signal,access_signal,assembly_signal,evidence_confidence,area_sqm")
      .eq("territory_id", territory.id)
      .not("latitude", "is", null)
      .not("longitude", "is", null);
    if (error) throw new Error(error.message);
    const opportunities = (data ?? []) as OpportunityRow[];
    let flagged = 0;
    let clear = 0;
    let failed = 0;

    const results = await mapWithConcurrency(opportunities, 4, async (opportunity) => {
      try {
        const screen = await fetchPlanningConstraints(opportunity.latitude!, opportunity.longitude!);
        if (screen.status === "flagged") flagged += 1; else clear += 1;
        const score = scoreOpportunity({ ...opportunity, constraint_penalty: screen.penalty });
        const { error: updateError } = await supabase.from("opportunities").update({
          raw_evidence: { ...(opportunity.raw_evidence ?? {}), atlas_constraints: screen },
          constraint_penalty: screen.penalty,
          opportunity_score: score,
          updated_at: screen.checkedAt,
        }).eq("id", opportunity.id);
        if (updateError) throw new Error(updateError.message);
        const names = screen.constraints.map((constraint) => constraint.name).slice(0, 5);
        const { error: evidenceError } = await supabase.from("evidence_items").upsert({
          opportunity_id: opportunity.id,
          source_id: source.id,
          evidence_key: "planning-data:indicative-constraint-screen",
          evidence_type: "constraint_screen",
          title: screen.status === "flagged" ? `${screen.constraints.length} indicative constraint signal${screen.constraints.length === 1 ? "" : "s"}` : "No constraint entities returned by the indicative screen",
          summary: screen.status === "flagged" ? names.join("; ") : screen.disclaimer,
          source_url: screen.sourceUrl,
          observed_at: screen.checkedAt,
          payload: screen,
          confidence: 85,
          verification_status: "source_verified",
          updated_at: screen.checkedAt,
        }, { onConflict: "opportunity_id,evidence_key" });
        if (evidenceError) throw new Error(evidenceError.message);
        return { id: opportunity.id, status: screen.status, constraintCount: screen.constraints.length };
      } catch (error) {
        failed += 1;
        return { id: opportunity.id, status: "failed", error: error instanceof Error ? error.message : "Unknown error" };
      }
    });
    await supabase.from("data_sources").update({ last_success_at: now, updated_at: now }).eq("id", source.id);
    return NextResponse.json({ territory: "Hertsmere", processed: opportunities.length, flagged, clear, failed, results });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Constraint enrichment failed" }, { status: 502 });
  }
}
