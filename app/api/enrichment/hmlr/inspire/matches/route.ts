import { NextResponse } from "next/server";
import { z } from "zod";
import { INSPIRE_DISCLAIMER } from "@/lib/atlas/enrichment/hmlr-inspire";
import { authorizeIngestion } from "@/lib/atlas/ingestion/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

const parcelSchema = z.object({
  inspireId: z.string().min(1).max(200),
  label: z.string().max(500).nullable(),
  nationalCadastralReference: z.string().max(200).nullable(),
  validFrom: z.string().max(100).nullable(),
  areaSqm: z.number().nonnegative().finite(),
});

const bodySchema = z.object({
  polygonCount: z.number().int().positive(),
  coordinateReferenceSystem: z.literal("EPSG:27700"),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  matches: z.array(z.object({
    opportunityId: z.string().uuid(),
    matches: z.array(parcelSchema).max(20),
  })).max(500),
});

export async function POST(request: Request) {
  const authorization = authorizeIngestion(request);
  if (!authorization.ok) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });

  try {
    const body = bodySchema.parse(await request.json());
    const { data: territory, error: territoryError } = await supabase
      .from("territories")
      .select("id")
      .eq("slug", "hertsmere")
      .single();
    if (territoryError || !territory) throw new Error("Hertsmere territory is not configured");
    const now = new Date().toISOString();
    const { data: source, error: sourceError } = await supabase.from("data_sources").upsert({
      territory_id: territory.id,
      slug: "hmlr-inspire-index-polygons",
      name: "HM Land Registry INSPIRE Index Polygons",
      category: "ownership",
      authority: "HM Land Registry",
      source_url: "https://use-land-property-data.service.gov.uk/datasets/inspire",
      licence: "HM Land Registry INSPIRE Index Polygons licence",
      refresh_cadence: "monthly",
      status: "active",
      trust_score: 80,
      configuration: {
        mode: "local_point_in_polygon",
        coordinateReferenceSystem: body.coordinateReferenceSystem,
        polygonCount: body.polygonCount,
        sourceSha256: body.sourceSha256,
      },
      last_success_at: now,
      updated_at: now,
    }, { onConflict: "slug" }).select("id").single();
    if (sourceError || !source) throw new Error(sourceError?.message ?? "Could not configure the INSPIRE source");

    const opportunityIds = body.matches.map((entry) => entry.opportunityId);
    const { data: opportunities, error: opportunityError } = await supabase
      .from("opportunities")
      .select("id,raw_evidence")
      .eq("territory_id", territory.id)
      .in("id", opportunityIds);
    if (opportunityError) throw new Error(opportunityError.message);
    const rawById = new Map((opportunities ?? []).map((item) => [
      item.id as string,
      (item.raw_evidence ?? {}) as Record<string, unknown>,
    ]));

    let matched = 0;
    let ambiguous = 0;
    let unmatched = 0;
    for (const entry of body.matches) {
      const rawEvidence = rawById.get(entry.opportunityId);
      if (!rawEvidence) continue;
      const matchStatus = entry.matches.length === 1 ? "matched" : entry.matches.length > 1 ? "ambiguous" : "unmatched";
      if (matchStatus === "matched") matched += 1;
      else if (matchStatus === "ambiguous") ambiguous += 1;
      else unmatched += 1;
      const atlasInspire = {
        status: matchStatus,
        checkedAt: now,
        sourceSha256: body.sourceSha256,
        polygonCount: body.polygonCount,
        parcels: entry.matches,
        disclaimer: INSPIRE_DISCLAIMER,
      };
      const { error: updateError } = await supabase.from("opportunities").update({
        raw_evidence: { ...rawEvidence, atlas_inspire: atlasInspire },
        updated_at: now,
      }).eq("id", entry.opportunityId);
      if (updateError) throw new Error(updateError.message);

      const confidence = entry.matches.length === 1 ? 80 : entry.matches.length > 1 ? 55 : 65;
      const title = entry.matches.length === 1
        ? "One indicative INSPIRE parcel contains the site point"
        : entry.matches.length > 1
          ? `${entry.matches.length} indicative INSPIRE parcels contain the site point`
          : "No INSPIRE parcel contained the site point";
      const { error: evidenceError } = await supabase.from("evidence_items").upsert({
        opportunity_id: entry.opportunityId,
        source_id: source.id,
        evidence_key: "hmlr-inspire:point-in-polygon",
        evidence_type: "indicative_parcel_match",
        title,
        summary: INSPIRE_DISCLAIMER,
        source_reference: entry.matches.map((parcel) => parcel.inspireId).join(", ") || null,
        source_url: "https://use-land-property-data.service.gov.uk/datasets/inspire",
        observed_at: now,
        payload: atlasInspire,
        confidence,
        verification_status: matchStatus === "matched" ? "indicative_spatial_match" : "requires_human_review",
        updated_at: now,
      }, { onConflict: "opportunity_id,evidence_key" });
      if (evidenceError) throw new Error(evidenceError.message);

      const { error: taskError } = await supabase.from("verification_tasks").upsert({
        opportunity_id: entry.opportunityId,
        task_type: "verify_inspire_parcel",
        title: "Confirm the parcel against current title documents",
        instructions: INSPIRE_DISCLAIMER,
        status: "open",
        priority: entry.matches.length > 1 ? "high" : "normal",
        result: { matchStatus, parcels: entry.matches },
      }, { onConflict: "opportunity_id,task_type" });
      if (taskError) throw new Error(taskError.message);
    }

    return NextResponse.json({
      territory: "Hertsmere",
      candidatesProcessed: body.matches.length,
      matched,
      ambiguous,
      unmatched,
      warning: INSPIRE_DISCLAIMER,
    });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 502;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "INSPIRE match import failed" },
      { status },
    );
  }
}
