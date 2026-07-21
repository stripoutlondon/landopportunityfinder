"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import OpportunityMap from "@/components/OpportunityMap";
import { deriveOpportunityIntelligence } from "@/lib/atlas/opportunity-intelligence";
import type { Opportunity } from "@/lib/types";

type SortMode = "priority" | "readiness" | "capacity" | "area";
type InvestigationFilter = "all" | "planning-anomaly" | "planning-linked" | "title-gap" | "ready";

export default function OpportunityExplorer({ items }: { items: Opportunity[] }) {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("all");
  const [planning, setPlanning] = useState("all");
  const [ownership, setOwnership] = useState("all");
  const [minimumHomes, setMinimumHomes] = useState(0);
  const [investigation, setInvestigation] = useState<InvestigationFilter>("all");
  const [sort, setSort] = useState<SortMode>("priority");
  const rankedIds = useMemo(() => new Set([...items]
    .sort((a, b) => deriveOpportunityIntelligence(b).researchPriority - deriveOpportunityIntelligence(a).researchPriority)
    .slice(0, 10).map((item) => item.id)), [items]);
  const locations = useMemo(() => [...new Set(items.map((item) => deriveOpportunityIntelligence(item).location))].sort(), [items]);
  const analystMetrics = useMemo(() => items.reduce((totals, item) => {
    const intelligence = deriveOpportunityIntelligence(item);
    if (intelligence.planningGroup === "unpermissioned" || intelligence.stalePlanning) totals.planningAnomalies += 1;
    if (intelligence.planningHistoryUrl) totals.planningLinked += 1;
    if (intelligence.evidenceReadiness >= 70) totals.ready += 1;
    if (intelligence.evidenceGaps.includes("current title and registered proprietor")) totals.titleGaps += 1;
    return totals;
  }, { planningAnomalies: 0, planningLinked: 0, ready: 0, titleGaps: 0 }), [items]);

  const filtered = useMemo(() => items.filter((item) => {
    const intelligence = deriveOpportunityIntelligence(item);
    const text = `${item.name} ${item.address ?? ""} ${item.postcode ?? ""} ${intelligence.planningReferences.join(" ")}`.toLowerCase();
    const investigationMatch = investigation === "all"
      || (investigation === "planning-anomaly" && (intelligence.planningGroup === "unpermissioned" || intelligence.stalePlanning))
      || (investigation === "planning-linked" && Boolean(intelligence.planningHistoryUrl))
      || (investigation === "title-gap" && intelligence.evidenceGaps.includes("current title and registered proprietor"))
      || (investigation === "ready" && intelligence.evidenceReadiness >= 70);
    return (!query || text.includes(query.toLowerCase()))
      && (location === "all" || intelligence.location === location)
      && (planning === "all" || intelligence.planningGroup === planning)
      && (ownership === "all" || intelligence.ownershipGroup === ownership)
      && (minimumHomes === 0 || (intelligence.maximumDwellings ?? 0) >= minimumHomes)
      && investigationMatch;
  }).sort((a, b) => {
    if (sort === "readiness") return deriveOpportunityIntelligence(b).evidenceReadiness - deriveOpportunityIntelligence(a).evidenceReadiness;
    if (sort === "capacity") return (deriveOpportunityIntelligence(b).maximumDwellings ?? 0) - (deriveOpportunityIntelligence(a).maximumDwellings ?? 0);
    if (sort === "area") return (b.area_sqm ?? 0) - (a.area_sqm ?? 0);
    return deriveOpportunityIntelligence(b).researchPriority - deriveOpportunityIntelligence(a).researchPriority;
  }), [items, query, location, planning, ownership, minimumHomes, investigation, sort]);

  return <section className="explorer">
    <div className="analyst-metrics">
      <Metric value={analystMetrics.planningAnomalies} label="planning status checks" />
      <Metric value={analystMetrics.planningLinked} label="direct planning links" />
      <Metric value={analystMetrics.ready} label="70%+ evidence ready" />
      <Metric value={analystMetrics.titleGaps} label="title checks required" />
    </div>
    <div className="panel filter-panel">
      <div className="explorer-heading"><div><h2>Atlas analyst queue</h2><p className="tiny">Filter the developer's patch, then focus on planning status checks and evidence gaps.</p></div><strong>{filtered.length} matches</strong></div>
      <div className="filters sprint3-filters">
        <label>Search<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Site, town, postcode or planning ref" /></label>
        <label>Location<select value={location} onChange={(event) => setLocation(event.target.value)}><option value="all">All Hertsmere</option>{locations.map((name) => <option key={name}>{name}</option>)}</select></label>
        <label>Planning<select value={planning} onChange={(event) => setPlanning(event.target.value)}><option value="all">All positions</option><option value="unpermissioned">No current permission</option><option value="permissioned">Permissioned / approved</option><option value="other">Other / unclear</option></select></label>
        <label>Ownership<select value={ownership} onChange={(event) => setOwnership(event.target.value)}><option value="all">All ownership</option><option value="private">Private</option><option value="public">Public authority</option><option value="mixed">Mixed</option><option value="unknown">Unknown</option></select></label>
        <label>Minimum homes<select value={minimumHomes} onChange={(event) => setMinimumHomes(Number(event.target.value))}><option value="0">Any capacity</option><option value="5">5+</option><option value="10">10+</option><option value="25">25+</option><option value="50">50+</option></select></label>
        <label>Investigation<select value={investigation} onChange={(event) => setInvestigation(event.target.value as InvestigationFilter)}><option value="all">All evidence states</option><option value="planning-anomaly">Planning status check</option><option value="planning-linked">Direct planning link</option><option value="title-gap">Title check required</option><option value="ready">70%+ evidence ready</option></select></label>
        <label>Sort by<select value={sort} onChange={(event) => setSort(event.target.value as SortMode)}><option value="priority">Research priority</option><option value="readiness">Evidence readiness</option><option value="capacity">Housing capacity</option><option value="area">Site area</option></select></label>
      </div>
    </div>
    <div className="panel map-panel"><OpportunityMap items={filtered} priorityIds={rankedIds} /><div className="map-legend"><span><i className="priority-dot" />Top-ten research priority</span><span><i className="standard-dot" />Other matching leads</span></div></div>
    <div className="panel"><div className="topbar"><strong>Ranked investigation shortlist</strong><span className="tiny">Research leads, not acquisition or planning advice</span></div>{filtered.length === 0 ? <div className="empty">No opportunities match these acquisition criteria.</div> : <table className="table"><thead><tr><th>Priority</th><th>Opportunity</th><th>Capacity</th><th>Planning position</th><th>Evidence</th><th>Ownership</th></tr></thead><tbody>{filtered.map((item) => {
      const intelligence = deriveOpportunityIntelligence(item);
      return <tr key={item.id}>
        <td><span className={rankedIds.has(item.id) ? "score" : "score low"}>{intelligence.researchPriority}</span>{rankedIds.has(item.id) && <div className="tiny">Top 10</div>}</td>
        <td><Link href={`/opportunities/${item.id}`}><strong>{item.name}</strong></Link><div className="tiny">{intelligence.location}{item.postcode ? ` · ${item.postcode}` : ""}</div><div className="signals">{intelligence.siteTypes.map((type) => <span className="signal" key={type}>{type}</span>)}</div></td>
        <td><strong>{intelligence.capacityLabel}</strong><div className="tiny">{item.area_sqm ? `${(item.area_sqm / 10_000).toFixed(2)} ha` : "Area pending"}</div></td>
        <td>{intelligence.planningPosition}<div className="tiny">{intelligence.planningAgeYears !== null ? `${intelligence.planningAgeYears} years since recorded decision` : intelligence.priorityReasons.slice(0, 2).join(" · ") || "Verify against council records"}</div></td>
        <td><strong>{intelligence.evidenceReadiness}%</strong><div className="readiness-track"><i style={{ width: `${intelligence.evidenceReadiness}%` }} /></div><div className="tiny">{intelligence.evidenceGaps.length} gaps</div></td>
        <td><span className="badge">{intelligence.ownershipGroup}</span></td>
      </tr>;
    })}</tbody></table>}</div>
  </section>;
}

function Metric({ value, label }: { value: number; label: string }) {
  return <div className="panel analyst-metric"><strong>{value}</strong><span>{label}</span></div>;
}
