import { NextResponse } from "next/server";
import { authorizeIngestion } from "@/lib/atlas/ingestion/auth";
import { fetchCompanyProfile, normaliseCompanyNumber } from "@/lib/atlas/enrichment/companies-house";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(request: Request, { params }: { params: Promise<{ companyNumber: string }> }) {
  const authorization = authorizeIngestion(request);
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });

  try {
    const { companyNumber } = await params;
    const normalised = normaliseCompanyNumber(companyNumber);
    const profile = await fetchCompanyProfile(normalised);
    const { data: opportunities, error: opportunityError } = await supabase
      .from("opportunities")
      .select("id")
      .in("company_number", [normalised, companyNumber]);
    if (opportunityError) throw new Error(opportunityError.message);
    if (!opportunities?.length) return NextResponse.json({ error: "No Atlas leads use this company number" }, { status: 404 });

    const opportunityIds = opportunities.map((item) => item.id as string);
    const { error: updateError } = await supabase.from("opportunities").update({
      company_number: profile.companyNumber,
      company_status: profile.companyStatus,
      proprietor_name: profile.companyName,
      updated_at: profile.observedAt,
    }).in("id", opportunityIds);
    if (updateError) throw new Error(updateError.message);

    const evidence = opportunityIds.map((opportunityId) => ({
      opportunity_id: opportunityId,
      evidence_key: `companies-house:${profile.companyNumber}:profile`,
      evidence_type: "company_profile",
      title: `${profile.companyName} — Companies House profile`,
      summary: `Company status: ${profile.companyStatus}; charges recorded: ${profile.hasCharges ? "yes" : "no"}; insolvency history flag: ${profile.hasInsolvencyHistory ? "yes" : "no"}.`,
      source_reference: profile.companyNumber,
      source_url: profile.sourceUrl,
      observed_at: profile.observedAt,
      payload: profile,
      confidence: 100,
      verification_status: "source_verified",
      updated_at: profile.observedAt,
    }));
    const { error: evidenceError } = await supabase.from("evidence_items").upsert(evidence, { onConflict: "opportunity_id,evidence_key" });
    if (evidenceError) throw new Error(evidenceError.message);
    return NextResponse.json({ company: profile, opportunitiesEnriched: opportunityIds.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Companies House enrichment failed";
    const status = /not found|No Atlas leads/.test(message) ? 404 : /Invalid/.test(message) ? 400 : /not configured/.test(message) ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
