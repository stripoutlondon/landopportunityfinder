import { NextResponse } from "next/server";
import {
  CompanyNotFoundError,
  companyLookupGapEvidence,
  companyProfileEvidence,
  findCompanyProfileByExactName,
  fetchCompanyProfile,
  isInsolvencyCompanyStatus,
  isDissolvedCompanyStatus,
  normaliseCompanyNumber,
  type CompanyOpportunity,
} from "@/lib/atlas/enrichment/companies-house";
import {
  companyChargesEvidence,
  companyInsolvencyEvidence,
  fetchCompanyInsolvencyIntelligence,
  insolvencyVerificationTasks,
} from "@/lib/atlas/enrichment/company-insolvency";
import { authorizeIngestion } from "@/lib/atlas/ingestion/auth";
import { scoreOpportunity, type ScoreInput } from "@/lib/scoring";
import { getSupabaseAdmin } from "@/lib/supabase";

export const maxDuration = 60;

type EnrichmentOpportunity = CompanyOpportunity & ScoreInput & {
  proprietor_name: string | null;
  raw_evidence: Record<string, unknown> | null;
};

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
      .select("id,company_number,proprietor_name,ownership_status,vacancy_signal,planning_signal,access_signal,assembly_signal,constraint_penalty,evidence_confidence,area_sqm,raw_evidence")
      .eq("territory_id", territory.id)
      .not("company_number", "is", null);
    if (error) throw new Error(error.message);

    const grouped = new Map<string, EnrichmentOpportunity[]>();
    for (const opportunity of (data ?? []) as EnrichmentOpportunity[]) {
      if (!opportunity.company_number) continue;
      try {
        const companyNumber = normaliseCompanyNumber(opportunity.company_number);
        grouped.set(companyNumber, [...(grouped.get(companyNumber) ?? []), opportunity]);
      } catch {
        // Invalid identifiers remain visible for human correction and are not
        // submitted to Companies House.
      }
    }
    const companyNumbers = [...grouped.keys()];
    const results = await mapWithConcurrency(companyNumbers, 3, async (companyNumber) => {
      const opportunities = grouped.get(companyNumber) ?? [];
      const opportunityIds = opportunities.map((opportunity) => opportunity.id);
      try {
        let profile;
        try {
          profile = await fetchCompanyProfile(companyNumber);
        } catch (profileError) {
          if (!(profileError instanceof CompanyNotFoundError)) throw profileError;
          const proprietorNames = [...new Set(opportunities
            .map((opportunity) => opportunity.proprietor_name?.trim())
            .filter((name): name is string => Boolean(name)))];
          for (const proprietorName of proprietorNames) {
            profile = await findCompanyProfileByExactName(proprietorName);
            if (profile) break;
          }
          if (!profile) {
            const observedAt = new Date().toISOString();
            await Promise.all(opportunities.map(async (opportunity) => {
              const { error: updateGapError } = await supabase.from("opportunities").update({
                company_status: "not-found",
                opportunity_score: scoreOpportunity({ ...opportunity, company_status: "not-found" }),
                updated_at: observedAt,
              }).eq("id", opportunity.id);
              if (updateGapError) throw new Error(updateGapError.message);
            }));
            const { error: gapEvidenceError } = await supabase
              .from("evidence_items")
              .upsert(
                opportunities.map((opportunity) => companyLookupGapEvidence(
                  companyNumber,
                  opportunity.proprietor_name,
                  opportunity.id,
                  observedAt,
                )),
                { onConflict: "opportunity_id,evidence_key" },
              );
            if (gapEvidenceError) throw new Error(gapEvidenceError.message);
            await Promise.all(opportunities.map(async (opportunity) => {
              const task = {
                opportunity_id: opportunity.id,
                task_type: "company_identifier",
                title: "Correct the corporate identifier",
                instructions: "Compare the company number and proprietor name with the current official title register before relying on Companies House status.",
                status: "open",
                priority: "high",
              };
              const { data: existingTask } = await supabase
                .from("verification_tasks")
                .select("id")
                .eq("opportunity_id", opportunity.id)
                .eq("task_type", "company_identifier")
                .maybeSingle();
              const taskResult = existingTask?.id
                ? await supabase.from("verification_tasks").update(task).eq("id", existingTask.id)
                : await supabase.from("verification_tasks").insert(task);
              if (taskResult.error) throw new Error(taskResult.error.message);
            }));
            return {
              companyNumber,
              opportunitiesUpdated: opportunities.length,
              dissolved: false,
              matchStatus: "unmatched",
              error: "Company was not found by number or exact proprietor name",
            };
          }
        }

        const insolvency = isInsolvencyCompanyStatus(profile.companyStatus)
          ? await fetchCompanyInsolvencyIntelligence(profile.companyNumber)
          : null;

        await Promise.all(opportunities.map(async (opportunity) => {
          const { error: updateError } = await supabase.from("opportunities").update({
            company_number: profile.companyNumber,
            company_status: profile.companyStatus,
            proprietor_name: profile.companyName,
            opportunity_score: scoreOpportunity({ ...opportunity, company_status: profile.companyStatus }),
            raw_evidence: insolvency
              ? {
                ...(opportunity.raw_evidence ?? {}),
                atlas_insolvency: insolvency,
              }
              : opportunity.raw_evidence ?? {},
            updated_at: profile.observedAt,
          }).eq("id", opportunity.id);
          if (updateError) throw new Error(updateError.message);
        }));

        const { error: evidenceError } = await supabase
          .from("evidence_items")
          .upsert(
            opportunityIds.flatMap((opportunityId) => [
              companyProfileEvidence(profile, opportunityId),
              ...(insolvency
                ? [
                  companyInsolvencyEvidence(insolvency, opportunityId),
                  companyChargesEvidence(insolvency, opportunityId),
                ]
                : []),
            ]),
            { onConflict: "opportunity_id,evidence_key" },
          );
        if (evidenceError) throw new Error(evidenceError.message);

        if (insolvency) {
          for (const opportunityId of opportunityIds) {
            for (const task of insolvencyVerificationTasks(insolvency, opportunityId)) {
              const { data: existingTask, error: taskLookupError } = await supabase
                .from("verification_tasks")
                .select("id")
                .eq("opportunity_id", task.opportunity_id)
                .eq("task_type", task.task_type)
                .maybeSingle();
              if (taskLookupError) throw new Error(taskLookupError.message);
              const taskResult = existingTask?.id
                ? await supabase.from("verification_tasks").update(task).eq("id", existingTask.id)
                : await supabase.from("verification_tasks").insert(task);
              if (taskResult.error) throw new Error(taskResult.error.message);
            }
          }
        }

        return {
          companyNumber,
          resolvedCompanyNumber: profile.companyNumber,
          corrected: profile.companyNumber !== companyNumber,
          companyStatus: profile.companyStatus,
          opportunitiesUpdated: opportunityIds.length,
          dissolved: isDissolvedCompanyStatus(profile.companyStatus),
          insolvencyCases: insolvency?.cases.length ?? 0,
          activePractitioners: insolvency?.activePractitioners.length ?? 0,
          outstandingCharges: insolvency?.outstandingCharges.length ?? 0,
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
      companyNumbersCorrected: results.filter((result) => "corrected" in result && result.corrected).length,
      unmatchedCompanies: results.filter((result) => "matchStatus" in result && result.matchStatus === "unmatched").length,
      dissolvedCompanies: results.filter((result) => result.dissolved).length,
      insolvencyCases: results.reduce((sum, result) => sum + ("insolvencyCases" in result ? result.insolvencyCases ?? 0 : 0), 0),
      activePractitioners: results.reduce((sum, result) => sum + ("activePractitioners" in result ? result.activePractitioners ?? 0 : 0), 0),
      outstandingCharges: results.reduce((sum, result) => sum + ("outstandingCharges" in result ? result.outstandingCharges ?? 0 : 0), 0),
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
