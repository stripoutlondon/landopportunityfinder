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
  const { data: source, error: sourceError } = await supabase.from("data_sources").select("id,territory_id").eq("slug", sourceSlug).single();
  if (sourceError || !source) throw new Error(`Atlas source '${sourceSlug}' is not configured`);
  const { data: run, error: runError } = await supabase.from("ingestion_runs").insert({ source_id: source.id, status: "running", started_at: new Date().toISOString(), records_seen: records.length }).select("id").single();
  if (runError || !run) throw new Error(runError?.message ?? "Could not create ingestion run");
  const { leads, rejectionReasons } = normaliseRecords(records, normalizer);

  try {
    const externalKeys = leads.map((lead) => lead.externalKey);
    const existingKeys = new Set<string>();
    if (externalKeys.length) {
      const { data: existing, error: existingError } = await supabase.from("opportunities").select("external_key").in("external_key", externalKeys);
      if (existingError) throw new Error(existingError.message);
      for (const row of existing ?? []) existingKeys.add(row.external_key as string);
    }

    const opportunityRows = leads.map((lead) => {
      const scoreInput = { ownership_status: lead.ownershipStatus ?? null, vacancy_signal: lead.vacancySignal, planning_signal: lead.planningSignal, access_signal: lead.accessSignal, assembly_signal: lead.assemblySignal, constraint_penalty: lead.constraintPenalty, evidence_confidence: lead.evidenceConfidence, area_sqm: lead.areaSqm ?? null };
      const opportunityScore = scoreOpportunity(scoreInput);
      return { territory_id: source.territory_id, external_key: lead.externalKey, name: lead.name, address: lead.address ?? null, locality: lead.locality ?? null, postcode: lead.postcode ?? null, latitude: lead.latitude ?? null, longitude: lead.longitude ?? null, area_sqm: lead.areaSqm ?? null, source_type: lead.sourceType, source_reference: lead.sourceReference ?? null, ownership_status: lead.ownershipStatus ?? null, vacancy_signal: lead.vacancySignal, planning_signal: lead.planningSignal, access_signal: lead.accessSignal, assembly_signal: lead.assemblySignal, constraint_penalty: lead.constraintPenalty, evidence_confidence: lead.evidenceConfidence, opportunity_score: opportunityScore, acquisition_route: lead.acquisitionRoute, rationale: lead.rationale || explainScore(scoreInput, opportunityScore), status: lead.status, raw_evidence: lead.rawEvidence, updated_at: new Date().toISOString() };
    });
    const { data: opportunities, error: opportunityError } = opportunityRows.length
      ? await supabase.from("opportunities").upsert(opportunityRows, { onConflict: "external_key" }).select("id,external_key,opportunity_score,rationale")
      : { data: [], error: null };
    if (opportunityError) throw new Error(opportunityError.message);
    const opportunityIds = new Map((opportunities ?? []).map((row) => [row.external_key as string, row.id as string]));
    const evidenceRows = leads.flatMap((lead) => {
      const opportunityId = opportunityIds.get(lead.externalKey);
      if (!opportunityId) return [];
      return lead.evidence.map((evidence) => ({ opportunity_id: opportunityId, source_id: source.id, evidence_key: evidence.evidenceKey, evidence_type: evidence.evidenceType, title: evidence.title, summary: evidence.summary, source_reference: evidence.sourceReference ?? null, source_url: evidence.sourceUrl ?? null, observed_at: evidence.observedAt ?? null, payload: evidence.payload, confidence: evidence.confidence, verification_status: "unverified", updated_at: new Date().toISOString() }));
    });
    if (evidenceRows.length) {
      const { error: evidenceError } = await supabase.from("evidence_items").upsert(evidenceRows, { onConflict: "opportunity_id,evidence_key" });
      if (evidenceError) throw new Error(evidenceError.message);
    }

    const reviewOpportunities = (opportunities ?? []).filter((row) => Number(row.opportunity_score) >= 45);
    const investigationRows = reviewOpportunities.map((row) => ({ opportunity_id: row.id, status: "open", priority: Number(row.opportunity_score) >= 70 ? "high" : "normal", thesis: row.rationale }));
    const { data: investigations, error: investigationError } = investigationRows.length
      ? await supabase.from("investigations").upsert(investigationRows, { onConflict: "opportunity_id" }).select("id,opportunity_id")
      : { data: [], error: null };
    if (investigationError) throw new Error(investigationError.message);
    const verificationRows = (investigations ?? []).flatMap((investigation) => [{
      opportunity_id: investigation.opportunity_id,
      investigation_id: investigation.id,
      task_type: "ownership_check",
      title: "Confirm registered ownership and acquisition route",
      instructions: "Obtain and review the current title register and plan before contacting any owner.",
      priority: "high",
    }, {
      opportunity_id: investigation.opportunity_id,
      investigation_id: investigation.id,
      task_type: "planning_check",
      title: "Verify current planning position",
      instructions: "Check the council planning portal and supporting documents for the latest status and constraints.",
      priority: "normal",
    }]);
    if (verificationRows.length) {
      const { error: taskError } = await supabase.from("verification_tasks").upsert(verificationRows, { onConflict: "opportunity_id,task_type" });
      if (taskError) throw new Error(taskError.message);
    }

    const created = leads.filter((lead) => !existingKeys.has(lead.externalKey)).length;
    const updated = leads.length - created;
    const completedAt = new Date().toISOString();
    const { error: completionError } = await supabase.from("ingestion_runs").update({ status: "completed", completed_at: completedAt, records_created: created, records_updated: updated, records_rejected: records.length - leads.length, metadata: { rejectionReasons } }).eq("id", run.id);
    if (completionError) throw new Error(completionError.message);
    await supabase.from("data_sources").update({ last_success_at: completedAt, updated_at: completedAt, status: "active" }).eq("id", source.id);
    return { runId: run.id, seen: records.length, accepted: leads.length, rejected: records.length - leads.length, opportunitiesUpserted: opportunityRows.length, opportunitiesCreated: created, opportunitiesUpdated: updated, evidenceUpserted: evidenceRows.length, investigationsUpserted: investigationRows.length, verificationTasksUpserted: verificationRows.length, rejectionReasons };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown ingestion failure";
    await supabase.from("ingestion_runs").update({ status: "failed", completed_at: new Date().toISOString(), error_summary: message }).eq("id", run.id);
    throw error;
  }
}
