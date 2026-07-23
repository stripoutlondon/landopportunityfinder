import { NextResponse } from "next/server";
import { authorizeIngestion } from "@/lib/atlas/ingestion/auth";
import {
  companyProfileEvidence,
  fetchCompanyProfile,
  isInsolvencyCompanyStatus,
  normaliseCompanyNumber,
} from "@/lib/atlas/enrichment/companies-house";
import {
  companyChargesEvidence,
  companyInsolvencyEvidence,
  fetchCompanyInsolvencyIntelligence,
  insolvencyVerificationTasks,
} from "@/lib/atlas/enrichment/company-insolvency";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Opportunity } from "@/lib/types";

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
      .select("*")
      .in("company_number", [normalised, companyNumber]);
    if (opportunityError) throw new Error(opportunityError.message);
    if (!opportunities?.length) return NextResponse.json({ error: "No Atlas leads use this company number" }, { status: 404 });

    const opportunityRows = opportunities as Opportunity[];
    const opportunityIds = opportunityRows.map((item) => item.id);
    const insolvency = isInsolvencyCompanyStatus(profile.companyStatus)
      ? await fetchCompanyInsolvencyIntelligence(profile.companyNumber)
      : null;
    for (const opportunity of opportunityRows) {
      const { error: updateError } = await supabase.from("opportunities").update({
        company_number: profile.companyNumber,
        company_status: profile.companyStatus,
        proprietor_name: profile.companyName,
        raw_evidence: insolvency
          ? {
            ...(opportunity.raw_evidence ?? {}),
            atlas_insolvency: insolvency,
          }
          : opportunity.raw_evidence ?? {},
        updated_at: profile.observedAt,
      }).eq("id", opportunity.id);
      if (updateError) throw new Error(updateError.message);
    }

    const evidence = opportunityIds.flatMap((opportunityId) => [
      companyProfileEvidence(profile, opportunityId),
      ...(insolvency
        ? [
          companyInsolvencyEvidence(insolvency, opportunityId),
          companyChargesEvidence(insolvency, opportunityId),
        ]
        : []),
    ]);
    const { error: evidenceError } = await supabase
      .from("evidence_items")
      .upsert(evidence, { onConflict: "opportunity_id,evidence_key" });
    if (evidenceError) throw new Error(evidenceError.message);

    if (insolvency) {
      for (const opportunityId of opportunityIds) {
        for (const task of insolvencyVerificationTasks(insolvency, opportunityId)) {
          const { error: taskError } = await supabase
            .from("verification_tasks")
            .upsert(task, { onConflict: "opportunity_id,task_type" });
          if (taskError) throw new Error(taskError.message);
        }
      }
    }

    return NextResponse.json({
      company: profile,
      insolvency,
      opportunitiesEnriched: opportunityIds.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Companies House enrichment failed";
    const status = /not found|No Atlas leads/.test(message) ? 404 : /Invalid/.test(message) ? 400 : /not configured/.test(message) ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
