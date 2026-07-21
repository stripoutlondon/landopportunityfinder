import Link from "next/link";
import { notFound } from "next/navigation";
import { demoOpportunities } from "@/lib/demo";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Opportunity } from "@/lib/types";
import { deriveOpportunityIntelligence } from "@/lib/atlas/opportunity-intelligence";
import { constraintLabel } from "@/lib/atlas/enrichment/constraints";

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
  const intelligence = deriveOpportunityIntelligence(item);

  const mapsUrl = item.latitude !== null && item.longitude !== null
    ? `https://www.openstreetmap.org/?mlat=${item.latitude}&mlon=${item.longitude}#map=17/${item.latitude}/${item.longitude}`
    : null;

  return <main className="shell">
    <Link className="tiny" href="/">← Back to opportunities</Link>
    <div className="panel investigation-header">
      <div><span className="score">{intelligence.researchPriority}</span><div className="tiny">Research priority</div><span className="readiness-badge">{intelligence.evidenceReadiness}% evidence ready</span>{isDemo && <span className="badge">Demonstration</span>}</div>
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
    <section className="panel constraint-panel">
      <div className="topbar"><h2>Indicative constraints screen</h2><span className={`constraint-state ${intelligence.constraintStatus}`}>{intelligence.constraintStatus}</span></div>
      {!intelligence.constraintsChecked ? <p className="empty">This lead has not yet been checked against the Planning Data point-query datasets.</p> : intelligence.constraints.length ? <div className="constraint-list">{intelligence.constraints.map((constraint) => <article key={`${constraint.dataset}-${constraint.entity}`}><span>{constraintLabel(constraint.dataset)}</span><strong>{constraint.name}</strong>{constraint.reference && <small>{constraint.reference}</small>}</article>)}</div> : <p>No entities were returned by the indicative point screen.</p>}
      {intelligence.constraintCheckedAt && <p className="tiny">Checked {new Date(intelligence.constraintCheckedAt).toLocaleString("en-GB")}</p>}
      <p className="constraint-warning">{intelligence.constraintDisclaimer ?? "Indicative screen only. Coverage varies and no result is not proof that a site has no constraints. Verify against authoritative records before relying on it."}</p>
    </section>
    <section className="panel intelligence-strip"><div><span>Indicative capacity</span><strong>{intelligence.capacityLabel}</strong></div><div><span>Planning position</span><strong>{intelligence.planningPosition}</strong></div><div><span>Planning age</span><strong>{intelligence.planningAgeYears !== null ? `${intelligence.planningAgeYears} years` : "Not dated"}</strong></div><div><span>Ownership route</span><strong>{intelligence.ownershipGroup}</strong></div><div><span>Patch</span><strong>{intelligence.location}</strong></div></section>
    {intelligence.priorityReasons.length > 0 && <section className="panel priority-reasons"><h2>Why Atlas prioritised it</h2><div className="signals">{intelligence.priorityReasons.map((reason) => <span className="signal" key={reason}>{reason}</span>)}</div></section>}
    <div className="grid2 investigation-grid">
      <section className="panel"><h2>Planning evidence brief</h2><dl className="evidence-facts"><div><dt>Recorded decision date</dt><dd>{intelligence.planningPermissionDate ? new Date(intelligence.planningPermissionDate).toLocaleDateString("en-GB") : "Not supplied"}</dd></div><div><dt>Planning references found</dt><dd>{intelligence.planningReferences.length ? intelligence.planningReferences.join(", ") : "None extracted"}</dd></div><div><dt>Direct portal record</dt><dd>{intelligence.planningHistoryUrl ? "Available" : "Missing"}</dd></div><div><dt>Status check</dt><dd>{intelligence.stalePlanning ? "Priority — permission may be stale" : "Standard verification"}</dd></div></dl></section>
      <section className="panel"><h2>Evidence gaps</h2>{intelligence.evidenceGaps.length ? <ul className="gap-list">{intelligence.evidenceGaps.map((gap) => <li key={gap}>{gap}</li>)}</ul> : <p>No core evidence gaps detected.</p>}<p className="tiny">Evidence readiness measures source completeness, not commercial viability.</p></section>
    </div>
    <section className="panel next-actions"><div className="topbar"><h2>Atlas next actions</h2><span className="tiny">Ordered for human verification</span></div><div className="action-grid">{intelligence.nextActions.map((action) => <article key={`${action.type}-${action.title}`}><span className={`action-priority ${action.priority}`}>{action.priority}</span><strong>{action.title}</strong><p>{action.detail}</p></article>)}</div></section>
    {(item.title_number || item.company_number) && <section className="panel source-intelligence"><h2>Registered corporate ownership intelligence</h2><dl className="evidence-facts"><div><dt>Title number</dt><dd>{item.title_number ?? "Not matched"}</dd></div><div><dt>Proprietor</dt><dd>{item.proprietor_name ?? "Name pending enrichment"}</dd></div><div><dt>Company number</dt><dd>{item.company_number ?? "Not supplied in source"}</dd></div><div><dt>Companies House status</dt><dd>{item.company_status ?? "Not yet enriched"}</dd></div></dl>{item.company_number && <a className="button-link" href={`https://find-and-update.company-information.service.gov.uk/company/${encodeURIComponent(item.company_number)}`} target="_blank" rel="noreferrer">Open Companies House profile ↗</a>}<p className="constraint-warning">Dataset match only. Obtain the current official title register and plan before contacting a proprietor or making an acquisition decision.</p></section>}
    {(intelligence.notes || intelligence.sitePlanUrl || intelligence.planningHistoryUrl) && <section className="panel source-intelligence"><h2>Source intelligence</h2>{intelligence.notes && <p>{intelligence.notes}</p>}<div className="toolbar">{intelligence.sitePlanUrl && <a className="button-link" href={intelligence.sitePlanUrl} target="_blank" rel="noreferrer">Open official site plan ↗</a>}{intelligence.planningHistoryUrl && <a className="button-link" href={intelligence.planningHistoryUrl} target="_blank" rel="noreferrer">Open planning history ↗</a>}</div></section>}
    <div className="grid2 investigation-grid">
      <section className="panel"><h2>Evidence timeline</h2>{evidence.length ? <ol className="timeline">{evidence.map((entry) => <li key={entry.id}><div className="timeline-heading"><strong>{entry.title}</strong><span>{entry.confidence}% confidence</span></div><p>{entry.summary}</p><div className="tiny">{entry.evidence_type.replaceAll("_", " ")} · {new Date(entry.observed_at ?? entry.created_at).toLocaleDateString("en-GB")}{entry.source_url && <> · <a href={entry.source_url} target="_blank" rel="noreferrer">Open source ↗</a></>}</div></li>)}</ol> : <p className="empty">No persisted evidence is available for this demonstration record.</p>}</section>
      <section className="panel"><h2>Human verification</h2>{tasks.length ? <ul className="checklist">{tasks.map((task) => <li key={task.id}><span className={`task-state ${task.status}`}>{task.status === "completed" ? "✓" : "○"}</span><div><strong>{task.title}</strong><p>{task.instructions}</p><span className="tiny">{task.priority} priority</span></div></li>)}</ul> : <p className="empty">Verification tasks will be created when a real opportunity is ingested.</p>}</section>
    </div>
  </main>;
}

function Signal({ label, value, inverse = false }: { label: string; value: number; inverse?: boolean }) {
  return <div className="signal-card"><span>{label}</span><strong>{value}</strong><div className="signal-track"><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} className={inverse ? "inverse" : ""} /></div></div>;
}
