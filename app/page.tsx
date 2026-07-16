import OpportunityTable from "@/components/OpportunityTable";
import { demoOpportunities } from "@/lib/demo";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Opportunity } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = getSupabaseAdmin();
  let items: Opportunity[] = demoOpportunities;
  if (supabase) {
    const { data } = await supabase.from("opportunities").select("*").order("opportunity_score", { ascending: false }).limit(100);
    if (data?.length) items = data as Opportunity[];
  }
  const high = items.filter((item) => item.opportunity_score >= 70).length;
  return <main className="shell"><div className="topbar"><div className="brand">Land Opportunity Finder</div><div className="toolbar"><a className="tiny" href="/sources">Source registry</a><span className="badge">Hertsmere MVP</span></div></div><section className="hero"><div className="panel"><h1>Find land and property opportunities others miss.</h1><p className="lead">Evidence-led acquisition intelligence combining planning, brownfield, ownership and constraint signals.</p></div><div className="panel metrics"><div className="metric"><strong>{items.length}</strong><span>leads ranked</span></div><div className="metric"><strong>{high}</strong><span>high-potential</span></div></div></section><OpportunityTable items={items} /></main>;
}
