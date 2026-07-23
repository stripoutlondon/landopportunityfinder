import { NextResponse } from "next/server";
import {
  companyProfileEvidence,
  fetchCompanyProfile,
  groupOpportunitiesByCompany,
  isDissolvedCompanyStatus,
  type CompanyOpportunity,
} from "@/lib/atlas/enrichment/companies-house";
import { authorizeIngestion } from "@/lib/atlas/ingestion/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const maxDuration = 60;

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
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
  if (!authorization.ok) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });

  try {
    const { data: territory, error: territoryError } = await supabase
      .from("territories")
      .select("id")
      .eq("slug", "hertsmere")
      .single();
    if (territoryError || !territory) throw new Error("Hertsmere territory is not configured");

    const { data, error } = await supabase
      .from("opportunities")
      .select("id,company_number")
      .eq("territory_id", territory.id)
      .not("company_number", "is", null);
    if (error) throw new Error(error.message);

    const grouped = groupOpportunitiesByCompany((data ?? []) as CompanyOpportunity[]);
    const companyNumbers = [...grouped.keys()];
    const results = await mapWithConcurrency(companyNumbers, 3, async (companyNumber) => {
      const opportunityIds = grouped.get(companyNumber) ?? [];
      try {
        const profile = await fetchCompanyProfile(companyNumber);
        const { error: updateError } = await supabase.from("opportunities").update({
          company_number: profile.companyNumber,
          company_status: profile.companyStatus,
          proprietor_name: profile.companyName,
          updated_at: profile.observedAt,
        }).in("id", opportunityIds);
        if (updateError) throw new Error(updateError.message);

        const { error: evidenceError } = await supabase
          .from("evidence_items")
          .upsert(
            opportunityIds.map((opportunityId) => companyProfileEvidence(profile, opportunityId)),
            { onConflict: "opportunity_id,evidence_key" },
          );
        if (evidenceError) throw new Error(evidenceError.message);

        return {
          companyNumber,
          companyStatus: profile.companyStatus,
          opportunitiesUpdated: opportunityIds.length,
          dissolved: isDissolvedCompanyStatus(profile.companyStatus),
        };
      } catch (companyError) {
        return {
          companyNumber,
          opportunitiesUpdated: 0,
          dissolved: false,
          error: companyError instanceof Error ? companyError.message : "Company enrichment failed",
        };
      }
    });

    return NextResponse.json({
      territory: "Hertsmere",
      companiesReviewed: companyNumbers.length,
      companiesEnriched: results.filter((result) => !("error" in result)).length,
      dissolvedCompanies: results.filter((result) => result.dissolved).length,
      opportunitiesUpdated: results.reduce((sum, result) => sum + result.opportunitiesUpdated, 0),
      failed: results.filter((result) => "error" in result).length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Companies House batch enrichment failed" },
      { status: 502 },
    );
  }
}
