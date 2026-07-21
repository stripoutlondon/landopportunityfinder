import type { Opportunity } from "@/lib/types";

export type PlanningGroup = "unpermissioned" | "permissioned" | "other";
export type OwnershipGroup = "public" | "private" | "mixed" | "unknown";

export type EvidenceAction = {
  type: "title" | "planning" | "capacity" | "constraints" | "company";
  title: string;
  detail: string;
  priority: "high" | "normal";
};

export type OpportunityIntelligence = {
  planningPosition: string;
  planningGroup: PlanningGroup;
  minimumDwellings: number | null;
  maximumDwellings: number | null;
  capacityLabel: string;
  ownershipGroup: OwnershipGroup;
  location: string;
  siteTypes: string[];
  sitePlanUrl: string | null;
  planningHistoryUrl: string | null;
  planningPermissionDate: string | null;
  planningAgeYears: number | null;
  planningReferences: string[];
  stalePlanning: boolean;
  notes: string | null;
  researchPriority: number;
  priorityReasons: string[];
  evidenceReadiness: number;
  evidenceGaps: string[];
  nextActions: EvidenceAction[];
};

const canonical = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

function rawValue(raw: Record<string, unknown> | null | undefined, aliases: string[]): string | null {
  if (!raw) return null;
  const keys = new Map(Object.keys(raw).map((key) => [canonical(key), key]));
  for (const alias of aliases) {
    const key = keys.get(canonical(alias));
    if (!key) continue;
    const value = raw[key];
    if (value === null || value === undefined || String(value).trim() === "") continue;
    return String(value).trim();
  }
  return null;
}

function rawNumber(raw: Record<string, unknown> | null | undefined, aliases: string[]): number | null {
  const value = rawValue(raw, aliases);
  if (!value) return null;
  const number = Number(value.replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

function classifyLocation(text: string): string {
  const locations = ["Borehamwood", "Bushey", "Potters Bar", "Radlett", "Elstree", "Shenley", "Aldenham"];
  return locations.find((location) => text.toLowerCase().includes(location.toLowerCase())) ?? "Elsewhere in Hertsmere";
}

function classifySiteTypes(text: string): string[] {
  const rules: Array<[RegExp, string]> = [
    [/vacant|derelict|unused|redundant/, "Vacant or underused"],
    [/car park|parking/, "Car park"],
    [/garage|garages|workshop|petrol|filling station/, "Garage or automotive"],
    [/office|commercial|industrial|warehouse|factory|retail/, "Commercial"],
    [/council|civic|fire station|police|library|school|college/, "Public asset"],
    [/golf|playing field|sports|open land/, "Open or leisure land"],
  ];
  const matches = rules.filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
  return matches.length ? matches : ["Other brownfield"];
}

function parsePlanningReferences(text: string): string[] {
  const matches = text.match(/\b(?:[A-Z]{1,4}\/)?\d{2}\/\d{3,5}(?:\/[A-Z]{2,5})?\b/gi) ?? [];
  return [...new Set(matches.map((value) => value.toUpperCase()))];
}

function yearsSince(value: string | null, now: Date): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date > now) return null;
  return Math.floor((now.getTime() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

export function deriveOpportunityIntelligence(opportunity: Opportunity, now = new Date()): OpportunityIntelligence {
  const raw = opportunity.raw_evidence;
  const planningPosition = rawValue(raw, ["planning-permission-status", "development status", "status"]) ?? "Not supplied";
  const planningText = planningPosition.toLowerCase();
  const planningGroup: PlanningGroup = /not permissioned|expired|lapsed|withdrawn|refused/.test(planningText)
    ? "unpermissioned"
    : /permissioned|approved|prior approval|consent/.test(planningText) ? "permissioned" : "other";
  const minimumDwellings = rawNumber(raw, ["minimum-net-dwellings", "minimum net dwellings"]);
  const maximumDwellings = rawNumber(raw, ["maximum-net-dwellings", "maximum net dwellings"]);
  const capacityLabel = maximumDwellings && maximumDwellings !== minimumDwellings
    ? `${minimumDwellings ?? "?"}–${maximumDwellings} homes`
    : minimumDwellings ? `${minimumDwellings} homes` : "Capacity not stated";
  const ownership = (opportunity.ownership_status ?? rawValue(raw, ["ownership-status", "ownership status"]) ?? "").toLowerCase();
  const ownershipGroup: OwnershipGroup = /not[- ]owned[- ]by[- ]a[- ]public/.test(ownership)
    ? "private"
    : /mixed/.test(ownership) ? "mixed"
    : /owned[- ]by[- ]a[- ]public|public authority/.test(ownership) ? "public" : "unknown";
  const notes = rawValue(raw, ["notes"]);
  const combinedText = `${opportunity.name} ${opportunity.address ?? ""} ${opportunity.locality ?? ""} ${notes ?? ""}`.toLowerCase();
  const siteTypes = classifySiteTypes(combinedText);
  const planningHistoryUrl = rawValue(raw, ["planning-permission-history", "planning permission history"]);
  const planningPermissionDate = rawValue(raw, ["planning-permission-date", "planning permission date"]);
  const planningAgeYears = yearsSince(planningPermissionDate, now);
  const planningReferences = parsePlanningReferences(`${notes ?? ""} ${opportunity.source_reference ?? ""}`);
  const appearsStarted = /\bstarted\b|under construction|completed/i.test(notes ?? "");
  const stalePlanning = planningGroup === "permissioned" && (planningAgeYears ?? 0) >= 3 && !appearsStarted;
  const priorityReasons: string[] = [];
  let priorityBonus = 0;
  if (planningGroup === "unpermissioned") { priorityBonus += 12; priorityReasons.push("no current permission recorded"); }
  if (stalePlanning) { priorityBonus += 8; priorityReasons.push(`${planningAgeYears}-year-old permission needs status check`); }
  if ((maximumDwellings ?? 0) >= 50) { priorityBonus += 8; priorityReasons.push("50+ home capacity"); }
  else if ((maximumDwellings ?? 0) >= 20) { priorityBonus += 6; priorityReasons.push("20+ home capacity"); }
  else if ((maximumDwellings ?? 0) >= 5) { priorityBonus += 3; priorityReasons.push("5+ home capacity"); }
  if (siteTypes.some((type) => ["Vacant or underused", "Car park", "Garage or automotive", "Commercial"].includes(type))) {
    priorityBonus += 4;
    priorityReasons.push("underuse or redevelopment signal");
  }
  if (ownershipGroup !== "unknown") { priorityBonus += 2; priorityReasons.push("ownership route classified"); }
  if (ownershipGroup === "public") { priorityBonus += 2; priorityReasons.push("public-sector ownership signal"); }
  if (ownershipGroup === "mixed") { priorityBonus += 4; priorityReasons.push("mixed ownership may create an assembly angle"); }

  const evidenceChecks = [
    Boolean(opportunity.source_reference),
    opportunity.latitude !== null && opportunity.longitude !== null,
    Boolean(opportunity.postcode),
    Boolean(rawValue(raw, ["site-plan-url", "site plan url"])),
    planningPosition !== "Not supplied",
    Boolean(planningHistoryUrl),
    minimumDwellings !== null || maximumDwellings !== null,
    ownershipGroup !== "unknown",
    Boolean(opportunity.title_number),
    Boolean(opportunity.company_number || opportunity.proprietor_name),
  ];
  const evidenceReadiness = evidenceChecks.filter(Boolean).length * 10;
  const evidenceGaps: string[] = [];
  if (!opportunity.title_number || !opportunity.proprietor_name) evidenceGaps.push("current title and registered proprietor");
  if (!planningHistoryUrl) evidenceGaps.push("direct planning-history record");
  if (minimumDwellings === null && maximumDwellings === null) evidenceGaps.push("stated development capacity");
  if (ownershipGroup === "unknown" || ownershipGroup === "mixed") evidenceGaps.push("clear ownership route");
  if (opportunity.access_signal === 0) evidenceGaps.push("highway and access evidence");
  if (opportunity.constraint_penalty === 0) evidenceGaps.push("constraint screening");
  const nextActions: EvidenceAction[] = [];
  if (!opportunity.title_number || !opportunity.proprietor_name) nextActions.push({ type: "title", title: "Confirm title and proprietor", detail: "Obtain the current HM Land Registry title register and plan; do not infer ownership from the brownfield record.", priority: "high" });
  if (planningGroup === "unpermissioned" || stalePlanning || !planningHistoryUrl) nextActions.push({ type: "planning", title: "Verify the live planning position", detail: stalePlanning ? "Check whether the recorded permission was implemented, superseded or has lapsed." : "Review Hertsmere's planning portal, decision notice and supporting documents.", priority: "high" });
  if (minimumDwellings === null && maximumDwellings === null) nextActions.push({ type: "capacity", title: "Establish indicative capacity", detail: "Review the site plan, policy context and nearby schemes before relying on a dwelling estimate.", priority: "normal" });
  if (opportunity.company_number) nextActions.push({ type: "company", title: "Enrich the corporate proprietor", detail: "Check the company's live status, insolvency indicators and filing position through Companies House.", priority: "high" });
  nextActions.push({ type: "constraints", title: "Run constraints and access screening", detail: "Check Green Belt, flood, heritage, trees, highways and lawful access before progressing the lead.", priority: "normal" });

  return {
    planningPosition,
    planningGroup,
    minimumDwellings,
    maximumDwellings,
    capacityLabel,
    ownershipGroup,
    location: classifyLocation(combinedText),
    siteTypes,
    sitePlanUrl: rawValue(raw, ["site-plan-url", "site plan url"]),
    planningHistoryUrl,
    planningPermissionDate,
    planningAgeYears,
    planningReferences,
    stalePlanning,
    notes,
    researchPriority: Math.min(100, opportunity.opportunity_score + priorityBonus),
    priorityReasons,
    evidenceReadiness,
    evidenceGaps,
    nextActions,
  };
}
