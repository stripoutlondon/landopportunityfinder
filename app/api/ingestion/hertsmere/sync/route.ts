import { NextResponse } from "next/server";
import { authorizeIngestion } from "@/lib/atlas/ingestion/auth";
import { HertsmereBrownfieldNormalizer } from "@/lib/atlas/ingestion/brownfield";
import { fetchHertsmereBrownfieldRecords } from "@/lib/atlas/ingestion/planning-data";
import { ingestRecords } from "@/lib/atlas/ingestion/service";
import { getSupabaseAdmin } from "@/lib/supabase";

export const maxDuration = 60;

export async function POST(request: Request) {
  const authorization = authorizeIngestion(request);
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });

  try {
    const records = await fetchHertsmereBrownfieldRecords();
    const summary = await ingestRecords({ supabase, sourceSlug: "hertsmere-brownfield", records, normalizer: new HertsmereBrownfieldNormalizer() });
    return NextResponse.json({ source: "Planning Data brownfield-land", ...summary });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Hertsmere sync failed" }, { status: 502 });
  }
}
