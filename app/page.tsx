import OpportunityExplorer from "@/components/OpportunityExplorer";
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
      supabase.from("opportunities").select("*").order("opportunity_score", { ascending: false }).limit(500),
      supabase.from("data_sources").select("last_success_at").not("last_success_at", "is", null).order("last_success_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    items = (opportunitiesResult.data as Opportunity[] | null) ?? [];
    lastRefresh = sourceResult.data?.last_success_at ?? null;
  } else {
    items = demoOpportunities;
  }
  const mapped = items.filter((item) => item.latitude !== null && item.longitude !== null).length;
  const shortlist = Math.min(10, items.length);
  return <main className="shell"><div className="topbar"><div className="brand">Land Opportunity Finder</div><div className="toolbar"><a className="tiny" href="/sources">Source registry</a><span className="badge">Hertsmere {isDemo ? "demonstration" : "intelligence"}</span></div></div><section className="hero"><div className="panel"><h1>Find land and property opportunities others miss.</h1><p className="lead">Explore Hertsmere by location, development capacity, planning position and ownership route—then open the evidence behind every lead.</p>{lastRefresh && <p className="tiny">Official data last synchronised {new Date(lastRefresh).toLocaleString("en-GB")}</p>}</div><div className="panel metrics"><div className="metric"><strong>{items.length}</strong><span>current leads</span></div><div className="metric"><strong>{mapped}</strong><span>sites mapped</span></div><div className="metric"><strong>{shortlist}</strong><span>priority shortlist</span></div></div></section>{supabase && items.length === 0 ? <div className="panel empty"><h2>Atlas is ready for its first Hertsmere sync</h2><p>The database is connected, but no real opportunities have been imported yet.</p></div> : <OpportunityExplorer items={items} />}</main>;
}
