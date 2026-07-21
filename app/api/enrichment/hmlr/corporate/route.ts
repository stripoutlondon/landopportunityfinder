import { NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import { authorizeIngestion } from "@/lib/atlas/ingestion/auth";
import { matchCorporateOwnership, parseCorporateOwnershipRecord, type OwnershipCandidate } from "@/lib/atlas/enrichment/hmlr-corporate";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(request: Request) {
  const authorization = authorizeIngestion(request);
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "A licensed HM Land Registry corporate ownership CSV is required" }, { status: 400 });
    const rows = parse(await file.text(), { columns: true, skip_empty_lines: true, trim: true, bom: true }) as Record<string, unknown>[];
    const records = rows.map(parseCorporateOwnershipRecord).filter((record): record is NonNullable<typeof record> => Boolean(record));
    if (!records.length) return NextResponse.json({ error: "No valid corporate ownership records were found. Check that this is the current HMLR CSV format." }, { status: 400 });

    const { data: territory, error: territoryError } = await supabase.from("territories").select("id").eq("slug", "hertsmere").single();
    if (territoryError || !territory) throw new Error("Hertsmere territory is not configured");
    const { data, error } = await supabase.from("opportunities").select("id,name,address,postcode").eq("territory_id", territory.id);
    if (error) throw new Error(error.message);
    const opportunities = (data ?? []) as OwnershipCandidate[];
    const matches = matchCorporateOwnership(opportunities, records);
    const now = new Date().toISOString();
    const { data: source, error: sourceError } = await supabase.from("data_sources").upsert({
      territory_id: territory.id,
      slug: "hmlr-uk-corporate-ownership",
      name: "HM Land Registry UK corporate ownership",
      category: "ownership",
      authority: "HM Land Registry",
      source_url: "https://use-land-property-data.service.gov.uk/datasets/ccod",
      licence: "HM Land Registry dataset licence accepted by account holder",
      refresh_cadence: "monthly",
      status: "active",
      trust_score: 95,
      configuration: { mode: "licensed_csv_upload", matching: "exact_postcode_plus_address_tokens" },
      last_success_at: now,
      updated_at: now,
    }, { onConflict: "slug" }).select("id").single();
    if (sourceError || !source) throw new Error(sourceError?.message ?? "Could not configure the HMLR source");

    for (const match of matches.matched) {
      const { error: updateError } = await supabase.from("opportunities").update({
        title_number: match.record.titleNumber,
        proprietor_name: match.record.proprietorName,
        company_number: match.record.companyNumber,
        ownership_status: "registered-corporate",
        updated_at: now,
      }).eq("id", match.opportunity.id);
      if (updateError) throw new Error(updateError.message);
      const { error: evidenceError } = await supabase.from("evidence_items").upsert({
        opportunity_id: match.opportunity.id,
        source_id: source.id,
        evidence_key: `hmlr-corporate:${match.record.titleNumber}`,
        evidence_type: "registered_corporate_ownership",
        title: `Corporate ownership match for title ${match.record.titleNumber}`,
        summary: `${match.record.proprietorName}; ${match.record.tenure ?? "tenure not supplied"}. Atlas address-match confidence: ${match.confidence}%. Confirm against a current official title register before contact or acquisition decisions.`,
        source_reference: match.record.titleNumber,
        source_url: "https://use-land-property-data.service.gov.uk/datasets/ccod",
        observed_at: now,
        payload: {
          titleNumber: match.record.titleNumber,
          tenure: match.record.tenure,
          propertyAddress: match.record.propertyAddress,
          district: match.record.district,
          postcode: match.record.postcode,
          proprietorName: match.record.proprietorName,
          companyNumber: match.record.companyNumber,
          proprietorAddedAt: match.record.proprietorAddedAt,
          matchConfidence: match.confidence,
        },
        confidence: match.confidence,
        verification_status: "matched_source_record",
        updated_at: now,
      }, { onConflict: "opportunity_id,evidence_key" });
      if (evidenceError) throw new Error(evidenceError.message);
    }

    return NextResponse.json({
      sourceRows: rows.length,
      validCorporateRecords: records.length,
      opportunitiesReviewed: opportunities.length,
      matched: matches.matched.length,
      ambiguous: matches.ambiguous.length,
      unmatched: matches.unmatched.length,
      warning: "Matches use exact postcode plus address similarity. Every match still requires a current official title-register check.",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "HMLR corporate ownership import failed" }, { status: 400 });
  }
}
