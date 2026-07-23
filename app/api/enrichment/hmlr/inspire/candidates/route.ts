import { NextResponse } from "next/server";
import { authorizeIngestion } from "@/lib/atlas/ingestion/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request) {
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
      .select("id,name,latitude,longitude")
      .eq("territory_id", territory.id)
      .not("latitude", "is", null)
      .not("longitude", "is", null);
    if (error) throw new Error(error.message);
    return NextResponse.json({
      territory: "Hertsmere",
      coordinateReferenceSystem: "EPSG:4326",
      candidates: data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load INSPIRE candidates" },
      { status: 502 },
    );
  }
}
