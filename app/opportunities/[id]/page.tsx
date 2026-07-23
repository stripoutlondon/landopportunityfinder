import Link from "next/link";
import { notFound } from "next/navigation";
import { demoOpportunities } from "@/lib/demo";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Opportunity } from "@/lib/types";
import { deriveOpportunityIntelligence } from "@/lib/atlas/opportunity-intelligence";
import { constraintLabel } from "@/lib/atlas/enrichment/constraints";
import { assessOpportunityVerification } from "@/lib/atlas/verification";
import { assessAcquisitionRoute } from "@/lib/atlas/acquisition-route";

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
  const assessment = assessOpportunityVerification(item, intelligence);
  const acquisition = assessAcquisitionRoute(item, intelligence, assessment);

  const mapsUrl = item.latitude !== null && item.longitude !== null
    ? `https://www.openstreetmap.org/?mlat=${item.latitude}&mlon=${item.longitude}#map=17/${item.latitude}/${item.longitude}`
    : null;

  return <main className="shell">
    <div className="case-nav"><Link className="tiny" href="/">← Back to opportunities</Link><div className="toolbar"><Link className="tiny" href="/verification">Verification queue</Link><Link className="button-link" href={`/opportunities/${item.id}/report`}>Investment Committee report</Link></div></div>
    <div className="panel investigation-header">
      <div><span className="score">{assessment.verificationScore}</span><div className="tiny">Verification score</div><span className={`decision-badge ${assessment.decision}`}>{assessment.decision}</span><span className="readiness-badge">{intelligence.evidenceReadiness}% evidence ready</span>{isDemo && <span className="badge">Demonstration</span>}</div>
      <div><h1>{item.name}</h1><p className="lead">{item.rationale}</p><p className="tiny">{item.address}{item.postcode ? ` · ${item.postcode}` : ""}</p></div>
    </div>
    <section className="panel committee-panel">
      <div className="topbar"><div><span className="eyebrow">Atlas investment committee</span><h2>{assessment.committeeSummary}</h2></div><span className={`stage-badge ${assessment.stage}`}>{assessment.stage}</span></div>
      <div className="committee-scores">
        <CommitteeScore label="Commercial potential" value={assessment.commercialPotential} />
        <CommitteeScore label="Deliverability" value={assessment.deliverability} />
        <CommitteeScore label="Acquisition clarity" value={assessment.acquisitionClarity} />
        <CommitteeScore label="Evidence quality" value={assessment.evidenceQuality} />
      </div>
      <div className="committee-columns">
        <div><h3>Reasons to progress</h3>{assessment.strengths.length ? <ul>{assessment.strengths.map((strength) => <li key={strength}>{strength}</li>)}</ul> : <p className="empty">No verified strength is strong enough to present yet.</p>}</div>
        <div><h3>Risks and unknowns</h3>{assessment.risks.length ? <ul>{assessment.risks.map((risk) => <li key={`${risk.title}-${risk.severity}`}><span className={`risk-severity ${risk.severity}`}>{risk.severity}</span><strong>{risk.title}</strong><small>{risk.detail}</small></li>)}</ul> : <p>No material risks surfaced by the current evidence.</p>}<p className="tiny">{assessment.unknowns.length} core evidence gap{assessment.unknowns.length === 1 ? "" : "s"} remain.</p></div>
      </div>
      <div className="next-best-action"><span>Next best action</span><strong>{assessment.nextBestAction}</strong></div>
    </section>
    <section className="panel acquisition-route-panel">
      <div className="topbar"><div><span className="eyebrow">Sprint 10 acquisition route</span><h2>{acquisition.routeLabel}</h2></div><div className="route-status"><span className={`stage-badge ${acquisition.pipelineStage}`}>{acquisition.pipelineStage}</span><strong>{acquisition.readiness}% route ready</strong></div></div>
      <div className="acquisition-summary">
        <div><span>Proposed counterparty</span><strong>{acquisition.counterparty}</strong></div>
        <div><span>Contact decision</span><strong>{acquisition.canContact ? "Controlled contact permitted" : "Do not contact yet"}</strong></div>
      </div>
      <p className={`route-recommendation ${acquisition.canContact ? "ready" : "blocked"}`}>{acquisition.recommendation}</p>
      <div className="acquisition-gates">{acquisition.gates.map((gate) => <article key={gate.key}><span className={`gate-state ${gate.state}`}>{gate.state}</span><strong>{gate.label}</strong><p>{gate.detail}</p></article>)}</div>
      <div className="topbar route-footer"><p className="tiny">{acquisition.blockers.length ? `${acquisition.blockers.length} blocking gate${acquisition.blockers.length === 1 ? "" : "s"}` : "No blocking acquisition gates"}</p><Link className="button-link" href={`/opportunities/${item.id}/report`}>Open printable report</Link></div>
    </section>
    <section className="panel verification-panel">
      <div className="topbar"><div><span className="eyebrow">Sprint 6 due diligence</span><h2>Verified evidence gates</h2></div><span className={`stage-badge ${assessment.stage}`}>{assessment.stage}</span></div>
      <div className="verification-gates">
        <VerificationGate label="Title and proprietor" verified={intelligence.verification.title.verified} sourceUrl={intelligence.verification.title.sourceUrl} checkedAt={intelligence.verification.title.checkedAt} />
        <VerificationGate label="Planning position" verified={intelligence.verification.planning.verified} sourceUrl={intelligence.verification.planning.sourceUrl} checkedAt={intelligence.verification.planning.checkedAt} detail={intelligence.verification.planning.implementationStatus} />
        <VerificationGate label="Highway and access" verified={intelligence.verification.access.verified} sourceUrl={intelligence.verification.access.sourceUrl} checkedAt={intelligence.verification.access.checkedAt} detail={intelligence.verification.access.status} />
      </div>
      <p className="constraint-warning">A site becomes an Atlas candidate only when title, live planning position, access and the initial constraints screen are all evidenced. Professional legal, planning and technical advice is still required.</p>
    </section>
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
    <section className="panel constraint-panel">
      <div className="topbar"><div><span className="eyebrow">HM Land Registry spatial intelligence</span><h2>Indicative INSPIRE parcel screen</h2></div><span className={`constraint-state ${intelligence.inspire.status === "matched" ? "clear" : intelligence.inspire.status === "ambiguous" ? "flagged" : "pending"}`}>{intelligence.inspire.status}</span></div>
      {!intelligence.inspire.checked ? <p className="empty">This lead has not yet been matched against the local Hertsmere INSPIRE polygon file.</p> : intelligence.inspire.parcels.length ? <div className="constraint-list">{intelligence.inspire.parcels.map((parcel) => <article key={parcel.inspireId}><span>Indicative cadastral parcel</span><strong>{parcel.label ?? parcel.inspireId}</strong><small>{parcel.nationalCadastralReference ?? parcel.inspireId} · {parcel.areaSqm.toLocaleString("en-GB")} m²</small></article>)}</div> : <p>No INSPIRE polygon contained the source point. This may indicate a coordinate or coverage issue and is not evidence that the land is unregistered.</p>}
      {intelligence.inspire.checkedAt && <p className="tiny">Checked {new Date(intelligence.inspire.checkedAt).toLocaleString("en-GB")}</p>}
      <p className="constraint-warning">{intelligence.inspire.disclaimer ?? "Indicative polygon screen only. It is not a legal boundary and does not prove ownership."}</p>
    </section>
    <section className="panel intelligence-strip"><div><span>Indicative capacity</span><strong>{intelligence.capacityLabel}</strong></div><div><span>Planning position</span><strong>{intelligence.planningPosition}</strong></div><div><span>Planning age</span><strong>{intelligence.planningAgeYears !== null ? `${intelligence.planningAgeYears} years` : "Not dated"}</strong></div><div><span>Ownership route</span><strong>{intelligence.ownershipGroup}</strong></div><div><span>Patch</span><strong>{intelligence.location}</strong></div></section>
    {intelligence.priorityReasons.length > 0 && <section className="panel priority-reasons"><h2>Why Atlas prioritised it</h2><div className="signals">{intelligence.priorityReasons.map((reason) => <span className="signal" key={reason}>{reason}</span>)}</div></section>}
    <div className="grid2 investigation-grid">
      <section className="panel"><h2>Planning evidence brief</h2><dl className="evidence-facts"><div><dt>Recorded decision date</dt><dd>{intelligence.planningPermissionDate ? new Date(intelligence.planningPermissionDate).toLocaleDateString("en-GB") : "Not supplied"}</dd></div><div><dt>Planning references found</dt><dd>{intelligence.planningReferences.length ? intelligence.planningReferences.join(", ") : "None extracted"}</dd></div><div><dt>Direct portal record</dt><dd>{intelligence.planningHistoryUrl ? "Available" : "Missing"}</dd></div><div><dt>Status check</dt><dd>{intelligence.stalePlanning ? "Priority — permission may be stale" : "Standard verification"}</dd></div></dl></section>
      <section className="panel"><h2>Evidence gaps</h2>{intelligence.evidenceGaps.length ? <ul className="gap-list">{intelligence.evidenceGaps.map((gap) => <li key={gap}>{gap}</li>)}</ul> : <p>No core evidence gaps detected.</p>}<p className="tiny">Evidence readiness measures source completeness, not commercial viability.</p></section>
    </div>
    <section className="panel next-actions"><div className="topbar"><h2>Atlas next actions</h2><span className="tiny">Ordered for human verification</span></div><div className="action-grid">{intelligence.nextActions.map((action) => <article key={`${action.type}-${action.title}`}><span className={`action-priority ${action.priority}`}>{action.priority}</span><strong>{action.title}</strong><p>{action.detail}</p></article>)}</div></section>
    {(item.title_number || item.company_number) && <section className={`panel source-intelligence corporate-panel ${intelligence.corporateSignal}`}>
      <div className="topbar"><div><span className="eyebrow">Atlas corporate intelligence</span><h2>Registered corporate ownership</h2></div><span className={`corporate-badge ${intelligence.corporateSignal}`}>{intelligence.corporateStatusLabel}</span></div>
      {intelligence.corporateSignal === "insolvency" && <p className="corporate-alert"><strong>Time-sensitive ownership signal.</strong> Identify the appointed insolvency practitioner, secured creditors and the party authorised to deal with this property.</p>}
      {intelligence.corporateSignal === "dissolved" && <p className="corporate-alert"><strong>Specialist acquisition route.</strong> Verify whether the title vested as bona vacantia and whether restoration, disclaimer or another disposal route applies.</p>}
      {intelligence.corporateSignal === "unmatched" && <p className="corporate-alert"><strong>Identifier requires correction.</strong> Companies House did not return an exact record by number or proprietor name. Check the current official title before relying on this ownership data.</p>}
      <dl className="evidence-facts"><div><dt>Title number</dt><dd>{item.title_number ?? "Not matched"}</dd></div><div><dt>Proprietor</dt><dd>{item.proprietor_name ?? "Name pending enrichment"}</dd></div><div><dt>Company number</dt><dd>{item.company_number ?? "Not supplied in source"}</dd></div><div><dt>Companies House status</dt><dd>{item.company_status ?? "Not yet enriched"}</dd></div></dl>
      {item.company_number && intelligence.corporateSignal !== "unmatched" && <a className="button-link" href={`https://find-and-update.company-information.service.gov.uk/company/${encodeURIComponent(item.company_number)}`} target="_blank" rel="noreferrer">Open Companies House profile ↗</a>}
      {item.company_number && intelligence.corporateSignal === "unmatched" && <a className="button-link" href={`https://find-and-update.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(item.proprietor_name ?? item.company_number)}`} target="_blank" rel="noreferrer">Search Companies House by proprietor ↗</a>}
      {intelligence.insolvency && <InsolvencyCasePanel intelligence={intelligence.insolvency} />}
      <p className="constraint-warning">Dataset match only. Obtain the current official title register and plan before contacting a proprietor or making an acquisition decision.</p>
    </section>}
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

function CommitteeScore({ label, value }: { label: string; value: number }) {
  return <div><span>{label}</span><strong>{value}</strong><div className="readiness-track"><i style={{ width: `${value}%` }} /></div></div>;
}

function VerificationGate({ label, verified, sourceUrl, checkedAt, detail }: { label: string; verified: boolean; sourceUrl: string | null; checkedAt: string | null; detail?: string | null }) {
  return <article><span className={`gate-state ${verified ? "verified" : "pending"}`}>{verified ? "Verified" : "Required"}</span><strong>{label}</strong>{detail && <small>{detail.replaceAll("-", " ")}</small>}{checkedAt && <small>Checked {new Date(checkedAt).toLocaleDateString("en-GB")}</small>}{sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer">Open evidence ↗</a>}</article>;
}

function InsolvencyCasePanel({ intelligence }: { intelligence: NonNullable<ReturnType<typeof deriveOpportunityIntelligence>["insolvency"]> }) {
  const caseTypes = [...new Set(intelligence.cases.map((item) => item.type.replaceAll("-", " ")))];
  const chargeHolders = [...new Set(intelligence.outstandingCharges.flatMap((item) => item.personsEntitled))];
  return <div className="insolvency-dossier">
    <div className="topbar"><div><span className="eyebrow">Live insolvency dossier</span><h3>Authority and creditor evidence</h3></div><span className="tiny">Checked {new Date(intelligence.observedAt).toLocaleDateString("en-GB")}</span></div>
    <div className="insolvency-metrics">
      <div><strong>{intelligence.cases.length}</strong><span>insolvency cases</span></div>
      <div><strong>{intelligence.activePractitioners.length}</strong><span>acting practitioners</span></div>
      <div><strong>{intelligence.outstandingCharges.length}</strong><span>outstanding charges</span></div>
    </div>
    <dl className="evidence-facts">
      <div><dt>Case type</dt><dd>{caseTypes.join(", ") || intelligence.status || "Not supplied"}</dd></div>
      <div><dt>Practitioner route</dt><dd>{intelligence.activePractitioners.length ? "Office-holder identified — authority still requires confirmation" : "No currently acting practitioner returned"}</dd></div>
      <div><dt>Company charge holders</dt><dd>{chargeHolders.join(", ") || "No outstanding charge holder returned"}</dd></div>
    </dl>
    {intelligence.activePractitioners.length > 0 && <div className="practitioner-list">
      {intelligence.activePractitioners.map((practitioner, index) => <article key={`${practitioner.name}-${practitioner.role}-${index}`}>
        <span>{practitioner.role?.replaceAll("-", " ") ?? "practitioner"}</span>
        <strong>{practitioner.name}</strong>
        <small>{practitioner.appointedOn ? `Appointed ${new Date(practitioner.appointedOn).toLocaleDateString("en-GB")}` : "Appointment date not supplied"}</small>
      </article>)}
    </div>}
    <div className="toolbar">
      <a className="button-link" href={intelligence.insolvencySourceUrl} target="_blank" rel="noreferrer">Open insolvency record ↗</a>
      <a className="button-link" href={intelligence.chargesSourceUrl} target="_blank" rel="noreferrer">Open company charges ↗</a>
    </div>
    <p className="constraint-warning">Practitioners and charges are company-level evidence. They do not prove that a particular property remains an insolvency asset or that an office-holder can sell it. Confirm against the current title and directly with the authorised practitioner.</p>
  </div>;
}
