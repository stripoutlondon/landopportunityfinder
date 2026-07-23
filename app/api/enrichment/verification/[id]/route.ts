import { NextResponse } from "next/server";
import { authorizeIngestion } from "@/lib/atlas/ingestion/auth";
import { applyVerificationPack, buildVerificationEvidence, normaliseVerificationPack } from "@/lib/atlas/enrichment/verification-evidence";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Opportunity } from "@/lib/types";

const taskTypes = {
  title: "ownership_check",
  planning: "planning_check",
  access: "access_check",
} as const;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = authorizeIngestion(request);
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });

  try {
    const { id } = await params;
    const pack = normaliseVerificationPack(await request.json());
    const { data, error } = await supabase.from("opportunities").select("*").eq("id", id).single();
    if (error || !data) return NextResponse.json({ error: "Opportunity was not found" }, { status: 404 });
    const opportunity = data as Opportunity;
    const updates = applyVerificationPack(opportunity, pack);
    const { error: updateError } = await supabase.from("opportunities").update(updates).eq("id", id);
    if (updateError) throw new Error(updateError.message);

    const evidence = buildVerificationEvidence(pack).map((row) => ({ ...row, opportunity_id: id }));
    const { error: evidenceError } = await supabase.from("evidence_items").upsert(evidence, { onConflict: "opportunity_id,evidence_key" });
    if (evidenceError) throw new Error(evidenceError.message);

    const completedAt = updates.updated_at ?? new Date().toISOString();
    for (const section of Object.keys(pack) as Array<keyof typeof taskTypes>) {
      const taskType = taskTypes[section];
      if (!taskType) continue;
      const { error: taskError } = await supabase.from("verification_tasks").update({
        status: "completed",
        completed_at: completedAt,
        result: pack[section],
      }).eq("opportunity_id", id).eq("task_type", taskType);
      if (taskError) throw new Error(taskError.message);
    }
    if (pack.access) {
      const { error: taskCreateError } = await supabase.from("verification_tasks").upsert({
        opportunity_id: id,
        task_type: "access_check",
        title: "Verify highway and lawful access",
        instructions: "Confirm physical frontage, adopted-highway status and any private title rights.",
        status: "completed",
        priority: "high",
        completed_at: completedAt,
        result: pack.access,
      }, { onConflict: "opportunity_id,task_type" });
      if (taskCreateError) throw new Error(taskCreateError.message);
    }
    return NextResponse.json({
      opportunityId: id,
      verified: Object.keys(pack),
      evidenceUpserted: evidence.length,
      opportunityScore: updates.opportunity_score,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Verification evidence could not be saved";
    const status = /JSON|At least one|Evidence URLs|Invalid|Expected|too_|must/.test(message) ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
