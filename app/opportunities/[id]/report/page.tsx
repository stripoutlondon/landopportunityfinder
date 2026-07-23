import Link from "next/link";
import { notFound } from "next/navigation";
import PrintReportButton from "@/components/PrintReportButton";
import { assessAcquisitionRoute } from "@/lib/atlas/acquisition-route";
import { deriveOpportunityIntelligence } from "@/lib/atlas/opportunity-intelligence";
import { assessOpportunityVerification } from "@/lib/atlas/verification";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Opportunity } from "@/lib/types";

export const dynamic = "force-dynamic";

type Evidence = {
  id: string;
  title: string;
  summary: string | null;
  evidence_type: string;
  confidence: number;
  source_url: string | null;
  observed_at: string | null;
  created_at: string;
};

type VerificationTask = {
  id: string;
  title: string;
  instructions: string | null;
  status: string;
  priority: string;
};

export default async function InvestmentCommitteeReport({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) notFound();
  const [opportunityResult, evidenceResult, tasksResult] = await Promise.all([
    supabase.from("opportunities").select("*").eq("id", id).single(),
    supabase.from("evidence_items").select("id,title,summary,evidence_type,confidence,source_url,observed_at,created_at").eq("opportunity_id", id).order("created_at", { ascending: false }),
    supabase.from("verification_tasks").select("id,title,instructions,status,priority").eq("opportunity_id", id).order("created_at", { ascending: true }),
  ]);
  const opportunity = opportunityResult.data as Opportunity | null;
  if (!opportunity) notFound();
  const evidence = (evidenceResult.data as Evidence[] | null) ?? [];
  const tasks = (tasksResult.data as VerificationTask[] | null) ?? [];
  const intelligence = deriveOpportunityIntelligence(opportunity);
  const verification = assessOpportunityVerification(opportunity, intelligence);
  const acquisition = assessAcquisitionRoute(opportunity, intelligence, verification);
  const generatedAt = new Date();

  return <main className="report-shell">
    <div className="report-toolbar no-print">
      <Link href={`/opportunities/${id}`}>← Back to case file</Link>
      <PrintReportButton />
    </div>
    <header className="report-header">
      <div><span className="eyebrow">Atlas investment committee report</span><h1>{opportunity.name}</h1><p>{opportunity.address}{opportunity.postcode ? ` · ${opportunity.postcode}` : ""}</p></div>
      <div className="report-score"><strong>{verification.verificationScore}</strong><span>verification</span></div>
    </header>
    <section className="report-summary">
      <div><span>Recommendation</span><strong>{verification.decision}</strong></div>
      <div><span>Acquisition stage</span><strong>{acquisition.pipelineStage}</strong></div>
      <div><span>Route readiness</span><strong>{acquisition.readiness}%</strong></div>
      <div><span>Evidence readiness</span><strong>{intelligence.evidenceReadiness}%</strong></div>
    </section>
    <section className="report-section">
      <h2>Executive recommendation</h2>
      <p className="report-lead">{verification.committeeSummary}</p>
      <p><strong>Next decision:</strong> {acquisition.recommendation}</p>
    </section>
    <div className="report-columns">
      <section className="report-section"><h2>Opportunity thesis</h2><ul>{verification.strengths.map((item) => <li key={item}>{item}</li>)}</ul></section>
      <section className="report-section"><h2>Material risks and unknowns</h2><ul>{verification.risks.map((risk) => <li key={`${risk.severity}-${risk.title}`}><strong>{risk.title}:</strong> {risk.detail}</li>)}{verification.unknowns.map((item) => <li key={item}>{item}</li>)}</ul></section>
    </div>
    <section className="report-section">
      <h2>Acquisition route</h2>
      <dl className="report-facts">
        <div><dt>Route</dt><dd>{acquisition.routeLabel}</dd></div>
        <div><dt>Proposed counterparty</dt><dd>{acquisition.counterparty}</dd></div>
        <div><dt>Title</dt><dd>{opportunity.title_number ?? "Current title required"}</dd></div>
        <div><dt>Proprietor</dt><dd>{opportunity.proprietor_name ?? "Not yet verified"}</dd></div>
        <div><dt>Planning</dt><dd>{intelligence.planningPosition}</dd></div>
        <div><dt>Capacity</dt><dd>{intelligence.capacityLabel}</dd></div>
      </dl>
    </section>
    <section className="report-section">
      <h2>Acquisition gates</h2>
      <table className="report-table"><thead><tr><th>Gate</th><th>State</th><th>Evidence position</th></tr></thead><tbody>{acquisition.gates.map((gate) => <tr key={gate.key}><td>{gate.label}</td><td><span className={`gate-state ${gate.state}`}>{gate.state}</span></td><td>{gate.detail}</td></tr>)}</tbody></table>
    </section>
    <section className="report-section">
      <h2>Required actions</h2>
      <ol>{acquisition.nextSteps.map((step) => <li key={step}>{step}</li>)}</ol>
      {tasks.length > 0 && <table className="report-table"><thead><tr><th>Verification task</th><th>Priority</th><th>Status</th></tr></thead><tbody>{tasks.map((task) => <tr key={task.id}><td><strong>{task.title}</strong><br /><small>{task.instructions}</small></td><td>{task.priority}</td><td>{task.status}</td></tr>)}</tbody></table>}
    </section>
    <section className="report-section">
      <h2>Evidence schedule</h2>
      <table className="report-table"><thead><tr><th>Evidence</th><th>Confidence</th><th>Observed</th></tr></thead><tbody>{evidence.map((item) => <tr key={item.id}><td><strong>{item.title}</strong>{item.summary && <><br /><small>{item.summary}</small></>}{item.source_url && <><br /><a href={item.source_url}>Source</a></>}</td><td>{item.confidence}%</td><td>{new Date(item.observed_at ?? item.created_at).toLocaleDateString("en-GB")}</td></tr>)}</tbody></table>
    </section>
    <footer className="report-footer">
      <p>Generated {generatedAt.toLocaleString("en-GB")} by Land Opportunity Finder · Project Atlas.</p>
      <p>This is an evidence-led research report, not legal, valuation, planning or investment advice. Obtain current title documents and professional advice before contact, offer or acquisition.</p>
    </footer>
  </main>;
}
