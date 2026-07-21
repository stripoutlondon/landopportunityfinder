import { NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import { getSupabaseAdmin } from "@/lib/supabase";
import { HertsmerePlanningNormalizer } from "@/lib/atlas/ingestion/planning";
import { HertsmereBrownfieldNormalizer } from "@/lib/atlas/ingestion/brownfield";
import { ingestRecords } from "@/lib/atlas/ingestion/service";
import type { AtlasRawRecord } from "@/lib/atlas/ingestion/types";

const sources = {
  planning: { slug: "hertsmere-planning", normalizer: new HertsmerePlanningNormalizer() },
  brownfield: { slug: "hertsmere-brownfield", normalizer: new HertsmereBrownfieldNormalizer() },
} as const;

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  const form = await request.formData();
  const source = form.get("source");
  const file = form.get("file");
  if (source !== "planning" && source !== "brownfield") return NextResponse.json({ error: "source must be planning or brownfield" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "CSV file is required" }, { status: 400 });
  try {
    const records = parse(await file.text(), { columns: true, skip_empty_lines: true, trim: true, bom: true }) as AtlasRawRecord[];
    const configuration = sources[source];
    return NextResponse.json(await ingestRecords({ supabase, sourceSlug: configuration.slug, records, normalizer: configuration.normalizer }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Ingestion failed" }, { status: 400 });
  }
}
