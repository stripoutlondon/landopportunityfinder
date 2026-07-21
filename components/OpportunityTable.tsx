import Link from "next/link";
import type { Opportunity } from "@/lib/types";

const scoreClass = (score: number) => score >= 70 ? "score" : score >= 50 ? "score medium" : "score low";

export default function OpportunityTable({ items }: { items: Opportunity[] }) {
  return <div className="panel"><div className="topbar"><strong>Ranked opportunities</strong><span className="tiny">Hertsmere pilot</span></div>{items.length === 0 ? <div className="empty">No opportunities loaded yet.</div> : <table className="table"><thead><tr><th>Score</th><th>Opportunity</th><th>Signals</th><th>Acquisition route</th><th>Status</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><span className={scoreClass(item.opportunity_score)}>{item.opportunity_score}</span></td><td><Link href={`/opportunities/${item.id}`}><strong>{item.name}</strong></Link><div className="tiny">{item.address || item.locality || "Location pending"}</div></td><td><div className="signals"><span className="signal">Planning {item.planning_signal}</span><span className="signal">Vacancy {item.vacancy_signal}</span><span className="signal">Access {item.access_signal}</span></div></td><td className="tiny">{item.acquisition_route || "Research required"}</td><td><span className="badge">{item.status}</span></td></tr>)}</tbody></table>}</div>;
}
