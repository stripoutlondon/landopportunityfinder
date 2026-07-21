import type { Opportunity } from "@/lib/types";

export type PlanningGroup = "unpermissioned" | "permissioned" | "other";
export type OwnershipGroup = "public" | "private" | "unknown";

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
  notes: string | null;
  researchPriority: number;
  priorityReasons: string[];
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

export function deriveOpportunityIntelligence(opportunity: Opportunity): OpportunityIntelligence {
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
    : /owned[- ]by[- ]a[- ]public|public authority/.test(ownership) ? "public" : "unknown";
  const notes = rawValue(raw, ["notes"]);
  const combinedText = `${opportunity.name} ${opportunity.address ?? ""} ${opportunity.locality ?? ""} ${notes ?? ""}`.toLowerCase();
  const siteTypes = classifySiteTypes(combinedText);
  const priorityReasons: string[] = [];
  let priorityBonus = 0;
  if (planningGroup === "unpermissioned") { priorityBonus += 12; priorityReasons.push("no current permission recorded"); }
  if ((maximumDwellings ?? 0) >= 50) { priorityBonus += 8; priorityReasons.push("50+ home capacity"); }
  else if ((maximumDwellings ?? 0) >= 20) { priorityBonus += 6; priorityReasons.push("20+ home capacity"); }
  else if ((maximumDwellings ?? 0) >= 5) { priorityBonus += 3; priorityReasons.push("5+ home capacity"); }
  if (siteTypes.some((type) => ["Vacant or underused", "Car park", "Garage or automotive", "Commercial"].includes(type))) {
    priorityBonus += 4;
    priorityReasons.push("underuse or redevelopment signal");
  }
  if (ownershipGroup !== "unknown") { priorityBonus += 2; priorityReasons.push("ownership route classified"); }

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
    planningHistoryUrl: rawValue(raw, ["planning-permission-history", "planning permission history"]),
    notes,
    researchPriority: Math.min(100, opportunity.opportunity_score + priorityBonus),
    priorityReasons,
  };
}
