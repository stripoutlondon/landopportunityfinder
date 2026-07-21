import Link from "next/link";
import { hertsmereSources } from "@/lib/atlas/sources";

export default function SourcesPage() {
  return <main className="shell"><div className="topbar"><div><Link className="tiny" href="/">← Opportunity dashboard</Link><h1>Atlas Source Registry</h1></div><span className="badge">Hertsmere</span></div><div className="panel"><table className="table"><thead><tr><th>Source</th><th>Category</th><th>Authority</th><th>Refresh</th><th>Status</th></tr></thead><tbody>{hertsmereSources.map((source) => <tr key={source.slug}><td><strong>{source.name}</strong><div className="tiny">{source.description}</div></td><td>{source.category}</td><td>{source.authority}</td><td>{source.refreshCadence}</td><td><span className="badge">{source.status}</span></td></tr>)}</tbody></table></div></main>;
}
