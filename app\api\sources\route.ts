import { NextResponse } from "next/server";
import { hertsmereSources } from "@/lib/atlas/sources";

export async function GET() {
  return NextResponse.json({ territory: "Hertsmere", sources: hertsmereSources });
}
