import { NextResponse } from "next/server";
import { z } from "zod";
import { explainScore, scoreOpportunity } from "@/lib/scoring";

const schema = z.object({
  ownership_status: z.string().nullable().optional(), company_status: z.string().nullable().optional(),
  vacancy_signal: z.number().min(0).max(100).optional(), planning_signal: z.number().min(0).max(100).optional(),
  access_signal: z.number().min(0).max(100).optional(), assembly_signal: z.number().min(0).max(100).optional(),
  constraint_penalty: z.number().min(0).max(100).optional(), evidence_confidence: z.number().min(0).max(100).optional(),
  area_sqm: z.number().positive().nullable().optional(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const score = scoreOpportunity(parsed.data);
  return NextResponse.json({ score, rationale: explainScore(parsed.data, score) });
}
