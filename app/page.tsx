import OpportunityTable from "@/components/OpportunityTable";
import { demoOpportunities } from "@/lib/demo";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Opportunity } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = getSupabaseAdmin();
  let items: Opportunity[] = [];
  let isDemo = !supabase;
  let lastRefresh: string | null = null;
  if (supabase) {
    const [opportunitiesResult, sourceResult] = await Promise.all([
      supabase.from("opportunities").select("*").order("opportunity_score", { ascending: false }).limit(100),
      supabase.from("data_sources").select("last_success_at").not("last_success_at", "is", null).order("last_success_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    items = (opportunitiesResult.data as Opportunity[] | null) ?? [];
    lastRefresh = sourceResult.data?.last_success_at ?? null;
  } else {
    items = demoOpportunities;
  }
  const high = items.filter((item) => item.opportunity_score >= 70).length;
  return <main className="shell"><div className="topbar"><div className="brand">Land Opportunity Finder</div><div className="toolbar"><a className="tiny" href="/sources">Source registry</a><span className="badge">Hertsmere {isDemo ? "demonstration" : "intelligence"}</span></div></div><section className="hero"><div className="panel"><h1>Find land and property opportunities others miss.</h1><p className="lead">Evidence-led acquisition intelligence combining planning, brownfield, ownership and constraint signals.</p>{lastRefresh && <p className="tiny">Official data last synchronised {new Date(lastRefresh).toLocaleString("en-GB")}</p>}</div><div className="panel metrics"><div className="metric"><strong>{items.length}</strong><span>leads ranked</span></div><div className="metric"><strong>{high}</strong><span>high-potential</span></div></div></section>{supabase && items.length === 0 ? <div className="panel empty"><h2>Atlas is ready for its first Hertsmere sync</h2><p>The database is connected, but no real opportunities have been imported yet.</p></div> : <OpportunityTable items={items} />}</main>;
}
