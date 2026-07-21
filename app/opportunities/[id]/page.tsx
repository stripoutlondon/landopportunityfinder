import Link from "next/link";
import { notFound } from "next/navigation";
import { demoOpportunities } from "@/lib/demo";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Opportunity } from "@/lib/types";

export const dynamic = "force-dynamic";

type Evidence = { id: string; title: string; summary: string | null; evidence_type: string; confidence: number; source_url: string | null; observed_at: string | null; created_at: string };
type VerificationTask = { id: string; title: string; instructions: string | null; status: string; priority: string };

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  let item: Opportunity | undefined;
  let evidence: Evidence[] = [];
  let tasks: VerificationTask[] = [];
  let isDemo = false;

  if (supabase) {
    const [opportunityResult, evidenceResult, taskResult] = await Promise.all([
      supabase.from("opportunities").select("*").eq("id", id).single(),
      supabase.from("evidence_items").select("id,title,summary,evidence_type,confidence,source_url,observed_at,created_at").eq("opportunity_id", id).order("created_at", { ascending: false }),
      supabase.from("verification_tasks").select("id,title,instructions,status,priority").eq("opportunity_id", id).order("created_at", { ascending: true }),
    ]);
    item = (opportunityResult.data as Opportunity | null) ?? undefined;
    evidence = (evidenceResult.data as Evidence[] | null) ?? [];
    tasks = (taskResult.data as VerificationTask[] | null) ?? [];
  } else {
    item = demoOpportunities.find((opportunity) => opportunity.id === id);
    isDemo = Boolean(item);
  }
  if (!item) notFound();

  const mapsUrl = item.latitude !== null && item.longitude !== null
    ? `https://www.openstreetmap.org/?mlat=${item.latitude}&mlon=${item.longitude}#map=17/${item.latitude}/${item.longitude}`
    : null;

  return <main className="shell">
    <Link className="tiny" href="/">← Back to opportunities</Link>
    <div className="panel investigation-header">
      <div><span className="score">{item.opportunity_score}</span>{isDemo && <span className="badge">Demonstration</span>}</div>
      <div><h1>{item.name}</h1><p className="lead">{item.rationale}</p><p className="tiny">{item.address}{item.postcode ? ` · ${item.postcode}` : ""}</p></div>
    </div>
    <div className="grid2 investigation-grid">
      <section className="panel"><h2>Why this site?</h2><div className="signal-grid">
        <Signal label="Planning" value={item.planning_signal} />
        <Signal label="Vacancy" value={item.vacancy_signal} />
        <Signal label="Access" value={item.access_signal} />
        <Signal label="Assembly" value={item.assembly_signal} />
        <Signal label="Evidence confidence" value={item.evidence_confidence} />
        <Signal label="Constraint penalty" value={item.constraint_penalty} inverse />
      </div></section>
      <section className="panel"><h2>Recommended acquisition route</h2><p>{item.acquisition_route || "Further research required."}</p>{mapsUrl && <a className="button-link" href={mapsUrl} target="_blank" rel="noreferrer">View location on map ↗</a>}</section>
    </div>
    <div className="grid2 investigation-grid">
      <section className="panel"><h2>Evidence timeline</h2>{evidence.length ? <ol className="timeline">{evidence.map((entry) => <li key={entry.id}><div className="timeline-heading"><strong>{entry.title}</strong><span>{entry.confidence}% confidence</span></div><p>{entry.summary}</p><div className="tiny">{entry.evidence_type.replaceAll("_", " ")} · {new Date(entry.observed_at ?? entry.created_at).toLocaleDateString("en-GB")}{entry.source_url && <> · <a href={entry.source_url} target="_blank" rel="noreferrer">Open source ↗</a></>}</div></li>)}</ol> : <p className="empty">No persisted evidence is available for this demonstration record.</p>}</section>
      <section className="panel"><h2>Human verification</h2>{tasks.length ? <ul className="checklist">{tasks.map((task) => <li key={task.id}><span className={`task-state ${task.status}`}>{task.status === "completed" ? "✓" : "○"}</span><div><strong>{task.title}</strong><p>{task.instructions}</p><span className="tiny">{task.priority} priority</span></div></li>)}</ul> : <p className="empty">Verification tasks will be created when a real opportunity is ingested.</p>}</section>
    </div>
  </main>;
}

function Signal({ label, value, inverse = false }: { label: string; value: number; inverse?: boolean }) {
  return <div className="signal-card"><span>{label}</span><strong>{value}</strong><div className="signal-track"><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} className={inverse ? "inverse" : ""} /></div></div>;
}
