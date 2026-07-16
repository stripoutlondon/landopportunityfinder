import type { SupabaseClient } from "@supabase/supabase-js";
import { explainScore, scoreOpportunity } from "@/lib/scoring";
import type { AtlasLeadDraft, AtlasNormalizer, AtlasRawRecord, IngestionSummary } from "./types";

export function normaliseRecords(records: AtlasRawRecord[], normalizer: AtlasNormalizer) {
  const leads = new Map<string, AtlasLeadDraft>();
  const rejectionReasons: Record<string, number> = {};
  for (const record of records) {
    const result = normalizer.normalize(record);
    if (!result.accepted) {
      rejectionReasons[result.reason] = (rejectionReasons[result.reason] ?? 0) + 1;
      continue;
    }
    leads.set(result.lead.externalKey, result.lead);
  }
  return { leads: [...leads.values()], rejectionReasons };
}

export async function ingestRecords(params: { supabase: SupabaseClient; sourceSlug: string; records: AtlasRawRecord[]; normalizer: AtlasNormalizer; }): Promise<IngestionSummary> {
  const { supabase, sourceSlug, records, normalizer } = params;
  const { data: source, error: sourceError } = await supabase.from("data_sources").select("id").eq("slug", sourceSlug).single();
  if (sourceError || !source) throw new Error(`Atlas source '${sourceSlug}' is not configured`);
  const { data: run, error: runError } = await supabase.from("ingestion_runs").insert({ source_id: source.id, status: "running", started_at: new Date().toISOString(), records_seen: records.length }).select("id").single();
  if (runError || !run) throw new Error(runError?.message ?? "Could not create ingestion run");
  const { leads, rejectionReasons } = normaliseRecords(records, normalizer);

  try {
    const opportunityRows = leads.map((lead) => {
      const scoreInput = { ownership_status: lead.ownershipStatus ?? null, vacancy_signal: lead.vacancySignal, planning_signal: lead.planningSignal, access_signal: lead.accessSignal, assembly_signal: lead.assemblySignal, constraint_penalty: lead.constraintPenalty, evidence_confidence: lead.evidenceConfidence, area_sqm: lead.areaSqm ?? null };
      const opportunityScore = scoreOpportunity(scoreInput);
      return { external_key: lead.externalKey, name: lead.name, address: lead.address ?? null, locality: lead.locality ?? null, postcode: lead.postcode ?? null, latitude: lead.latitude ?? null, longitude: lead.longitude ?? null, area_sqm: lead.areaSqm ?? null, source_type: lead.sourceType, source_reference: lead.sourceReference ?? null, ownership_status: lead.ownershipStatus ?? null, vacancy_signal: lead.vacancySignal, planning_signal: lead.planningSignal, access_signal: lead.accessSignal, assembly_signal: lead.assemblySignal, constraint_penalty: lead.constraintPenalty, evidence_confidence: lead.evidenceConfidence, opportunity_score: opportunityScore, acquisition_route: lead.acquisitionRoute, rationale: lead.rationale || explainScore(scoreInput, opportunityScore), status: lead.status, raw_evidence: lead.rawEvidence, updated_at: new Date().toISOString() };
    });
    const { data: opportunities, error: opportunityError } = await supabase.from("opportunities").upsert(opportunityRows, { onConflict: "external_key" }).select("id,external_key");
    if (opportunityError) throw new Error(opportunityError.message);
    const opportunityIds = new Map((opportunities ?? []).map((row) => [row.external_key as string, row.id as string]));
    const evidenceRows = leads.flatMap((lead) => {
      const opportunityId = opportunityIds.get(lead.externalKey);
      if (!opportunityId) return [];
      return lead.evidence.map((evidence) => ({ opportunity_id: opportunityId, source_id: source.id, evidence_key: evidence.evidenceKey, evidence_type: evidence.evidenceType, title: evidence.title, summary: evidence.summary, source_reference: evidence.sourceReference ?? null, source_url: evidence.sourceUrl ?? null, observed_at: evidence.observedAt ?? null, payload: evidence.payload, confidence: evidence.confidence, verification_status: "unverified" }));
    });
    if (evidenceRows.length) {
      const { error: evidenceError } = await supabase.from("evidence_items").upsert(evidenceRows, { onConflict: "opportunity_id,evidence_key" });
      if (evidenceError) throw new Error(evidenceError.message);
    }
    await supabase.from("ingestion_runs").update({ status: "completed", completed_at: new Date().toISOString(), records_created: leads.length, records_rejected: records.length - leads.length, metadata: { rejectionReasons } }).eq("id", run.id);
    return { runId: run.id, seen: records.length, accepted: leads.length, rejected: records.length - leads.length, opportunitiesUpserted: opportunityRows.length, evidenceUpserted: evidenceRows.length, rejectionReasons };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown ingestion failure";
    await supabase.from("ingestion_runs").update({ status: "failed", completed_at: new Date().toISOString(), error_summary: message }).eq("id", run.id);
    throw error;
  }
}
