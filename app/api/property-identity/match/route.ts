import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";
import {
  authorizePropertyIdentity,
  scorePropertyIdentityMatch,
} from "@/lib/atlas/property-identity-match";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = authorizePropertyIdentity(request);
  if (!authorization.ok) {
    return NextResponse.json(
      { error: authorization.error },
      { status: authorization.status },
    );
  }
  const url = new URL(request.url);
  const address = url.searchParams.get("address")?.trim() ?? "";
  const postcode = url.searchParams.get("postcode")?.trim().toUpperCase() ?? "";
  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "LOF data is not configured" }, { status: 503 });
  }

  let query = supabase
    .from("opportunities")
    .select(
      "id,name,address,locality,postcode,latitude,longitude,title_number,company_number,evidence_confidence",
    )
    .limit(20);
  if (postcode) {
    query = query.eq("postcode", postcode);
  } else {
    const firstToken = address.split(/\s+/).find((token) => token.length > 2);
    query = query.ilike("address", `%${firstToken ?? address.slice(0, 20)}%`);
  }
  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "LOF match query failed" }, { status: 503 });
  }

  const ids = (data ?? []).map((candidate) => candidate.id);
  const evidenceCounts = new Map<string, number>();
  if (ids.length) {
    const { data: evidence } = await supabase
      .from("evidence_items")
      .select("opportunity_id")
      .in("opportunity_id", ids);
    for (const item of evidence ?? []) {
      evidenceCounts.set(
        item.opportunity_id,
        (evidenceCounts.get(item.opportunity_id) ?? 0) + 1,
      );
    }
  }

  const matches = (data ?? [])
    .map((candidate) => ({
      opportunityId: candidate.id,
      name: candidate.name,
      address: candidate.address,
      locality: candidate.locality,
      postcode: candidate.postcode,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      titleNumber: candidate.title_number,
      companyNumber: candidate.company_number,
      confidence: scorePropertyIdentityMatch({
        requestedAddress: address,
        requestedPostcode: postcode,
        candidateAddress: candidate.address,
        candidatePostcode: candidate.postcode,
        evidenceConfidence: candidate.evidence_confidence,
        titleNumber: candidate.title_number,
        companyNumber: candidate.company_number,
      }),
      evidenceCount: evidenceCounts.get(candidate.id) ?? 0,
    }))
    .filter((match) => match.confidence >= 25)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 5);

  return NextResponse.json({
    available: true,
    checkedAt: new Date().toISOString(),
    matches,
    coverage: {
      identity: "available",
      ownership: "partial",
      planning: "partial",
    },
  });
}
