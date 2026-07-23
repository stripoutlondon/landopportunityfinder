import Link from "next/link";
import { assessAcquisitionRoute } from "@/lib/atlas/acquisition-route";
import { deriveOpportunityIntelligence } from "@/lib/atlas/opportunity-intelligence";
import { assessOpportunityVerification } from "@/lib/atlas/verification";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Opportunity } from "@/lib/types";

export const dynamic = "force-dynamic";

type Task = {
  id: string;
  opportunity_id: string;
  title: string;
  status: string;
  priority: string;
};

export default async function VerificationQueue() {
  const supabase = getSupabaseAdmin();
  let opportunities: Opportunity[] = [];
  let tasks: Task[] = [];
  if (supabase) {
    const [opportunityResult, taskResult] = await Promise.all([
      supabase.from("opportunities").select("*").order("opportunity_score", { ascending: false }).limit(500),
      supabase.from("verification_tasks").select("id,opportunity_id,title,status,priority").neq("status", "completed"),
    ]);
    opportunities = (opportunityResult.data as Opportunity[] | null) ?? [];
    tasks = (taskResult.data as Task[] | null) ?? [];
  }
  const taskMap = new Map<string, Task[]>();
  for (const task of tasks) taskMap.set(task.opportunity_id, [...(taskMap.get(task.opportunity_id) ?? []), task]);
  const rows = opportunities.map((opportunity) => {
    const intelligence = deriveOpportunityIntelligence(opportunity);
    const verification = assessOpportunityVerification(opportunity, intelligence);
    const acquisition = assessAcquisitionRoute(opportunity, intelligence, verification);
    const openTasks = taskMap.get(opportunity.id) ?? [];
    return { opportunity, verification, acquisition, openTasks };
  }).filter((row) => row.verification.decision === "investigate" || row.acquisition.pipelineStage !== "lead")
    .sort((a, b) => b.acquisition.readiness - a.acquisition.readiness || b.verification.verificationScore - a.verification.verificationScore);

  const contactReady = rows.filter((row) => row.acquisition.canContact).length;
  const blocking = rows.filter((row) => row.acquisition.blockers.length).length;
  const highTasks = tasks.filter((task) => task.priority === "high").length;

  return <main className="shell">
    <div className="topbar"><div><Link className="tiny" href="/">← Opportunity dashboard</Link><h1>Verified acquisition queue</h1></div><span className="badge">Sprint 10</span></div>
    <section className="hero queue-hero"><div className="panel"><h2>Turn intelligence into controlled acquisition action.</h2><p className="lead">Atlas ranks the sites worth verifying, identifies the lawful counterparty and prevents premature owner contact while title or authority gates remain unresolved.</p></div><div className="panel metrics"><div className="metric"><strong>{rows.length}</strong><span>active case files</span></div><div className="metric"><strong>{contactReady}</strong><span>contact ready</span></div><div className="metric"><strong>{blocking}</strong><span>blocked routes</span></div><div className="metric"><strong>{highTasks}</strong><span>high-priority checks</span></div></div></section>
    <section className="panel">
      <div className="topbar"><strong>Acquisition case files</strong><span className="tiny">Highest route-readiness first</span></div>
      {rows.length === 0 ? <p className="empty">No opportunities currently meet the investigation threshold.</p> : <table className="table acquisition-table"><thead><tr><th>Route readiness</th><th>Opportunity</th><th>Stage</th><th>Acquisition route</th><th>Blocking gates</th><th>Open checks</th><th>Action</th></tr></thead><tbody>{rows.map(({ opportunity, verification, acquisition, openTasks }) => <tr key={opportunity.id}>
        <td><span className={acquisition.readiness >= 70 ? "score" : "score medium"}>{acquisition.readiness}</span><div className="tiny">Verification {verification.verificationScore}</div></td>
        <td><Link href={`/opportunities/${opportunity.id}`}><strong>{opportunity.name}</strong></Link><div className="tiny">{opportunity.address ?? opportunity.postcode ?? "Location pending"}</div></td>
        <td><span className={`stage-badge ${acquisition.pipelineStage}`}>{acquisition.pipelineStage}</span></td>
        <td><strong>{acquisition.routeLabel}</strong><div className="tiny">{acquisition.counterparty}</div></td>
        <td>{acquisition.blockers.length ? <ul className="compact-list">{acquisition.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : <span className="gate-state ready">clear</span>}</td>
        <td><strong>{openTasks.length}</strong><div className="tiny">{openTasks.filter((task) => task.priority === "high").length} high priority</div></td>
        <td><Link className="button-link" href={`/opportunities/${opportunity.id}/report`}>Committee report</Link></td>
      </tr>)}</tbody></table>}
    </section>
  </main>;
}
