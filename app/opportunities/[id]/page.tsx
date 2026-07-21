import { notFound } from "next/navigation";
import { demoOpportunities } from "@/lib/demo";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Opportunity } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let item: Opportunity | undefined = demoOpportunities.find((opportunity) => opportunity.id === id);
  const supabase = getSupabaseAdmin();
  if (supabase && !item) {
    const { data } = await supabase.from("opportunities").select("*").eq("id", id).single();
    item = (data as Opportunity | null) ?? undefined;
  }
  if (!item) notFound();
  return <main className="shell"><a className="tiny" href="/">← Back to opportunities</a><div className="panel"><span className="score">{item.opportunity_score}</span><h1>{item.name}</h1><p className="lead">{item.rationale}</p><div className="grid2"><div><h2>Evidence signals</h2><p>Planning: {item.planning_signal}/100<br />Vacancy: {item.vacancy_signal}/100<br />Access: {item.access_signal}/100<br />Confidence: {item.evidence_confidence}/100</p></div><div><h2>Acquisition route</h2><p>{item.acquisition_route || "Research required"}</p></div></div></div></main>;
}
