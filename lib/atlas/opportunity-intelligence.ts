import type { Opportunity } from "@/lib/types";
import {
  classifyCompanyStatus,
  type CorporateStatusSignal,
} from "@/lib/atlas/enrichment/companies-house";
import type { CompanyInsolvencyIntelligence } from "@/lib/atlas/enrichment/company-insolvency";

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
  corporateSignal: CorporateStatusSignal;
  corporateStatusLabel: string;
  insolvency: CompanyInsolvencyIntelligence | null;
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
  constraintsChecked: boolean;
  constraintCheckedAt: string | null;
  constraints: Array<{ dataset: string; entity: string; name: string; reference: string | null }>;
  constraintStatus: "pending" | "clear" | "flagged";
  constraintDisclaimer: string | null;
  inspire: {
    checked: boolean;
    status: "pending" | "matched" | "ambiguous" | "unmatched";
    checkedAt: string | null;
    parcels: Array<{
      inspireId: string;
      label: string | null;
      nationalCadastralReference: string | null;
      areaSqm: number;
    }>;
    disclaimer: string | null;
  };
  verification: {
    title: { verified: boolean; sourceUrl: string | null; checkedAt: string | null };
    planning: { verified: boolean; sourceUrl: string | null; checkedAt: string | null; implementationStatus: string | null };
    access: { verified: boolean; status: string; sourceUrl: string | null; checkedAt: string | null };
  };
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
  const verificationRoot = raw?.atlas_verification && typeof raw.atlas_verification === "object"
    ? raw.atlas_verification as Record<string, unknown>
    : null;
  const titleVerification = verificationRoot?.title && typeof verificationRoot.title === "object"
    ? verificationRoot.title as Record<string, unknown>
    : null;
  const planningVerification = verificationRoot?.planning && typeof verificationRoot.planning === "object"
    ? verificationRoot.planning as Record<string, unknown>
    : null;
  const accessVerification = verificationRoot?.access && typeof verificationRoot.access === "object"
    ? verificationRoot.access as Record<string, unknown>
    : null;
  const verificationValue = (record: Record<string, unknown> | null, key: string): string | null => {
    const value = record?.[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  const titleVerified = Boolean(verificationValue(titleVerification, "checkedAt") && opportunity.title_number && opportunity.proprietor_name);
  const planningVerified = Boolean(verificationValue(planningVerification, "checkedAt") && verificationValue(planningVerification, "sourceUrl"));
  const accessStatus = verificationValue(accessVerification, "status") ?? "unverified";
  const accessVerified = Boolean(verificationValue(accessVerification, "checkedAt") && accessStatus !== "unverified");
  const constraintScreen = raw?.atlas_constraints && typeof raw.atlas_constraints === "object"
    ? raw.atlas_constraints as Record<string, unknown>
    : null;
  const constraints = Array.isArray(constraintScreen?.constraints)
    ? constraintScreen.constraints.filter((item): item is { dataset: string; entity: string; name: string; reference: string | null } => Boolean(item) && typeof item === "object" && typeof (item as { dataset?: unknown }).dataset === "string" && typeof (item as { name?: unknown }).name === "string")
    : [];
  const constraintsChecked = Boolean(constraintScreen?.checkedAt);
  const constraintStatus = constraintsChecked ? (constraints.length ? "flagged" : "clear") : "pending";
  const inspireScreen = raw?.atlas_inspire && typeof raw.atlas_inspire === "object"
    ? raw.atlas_inspire as Record<string, unknown>
    : null;
  const inspireStatusValue = typeof inspireScreen?.status === "string" ? inspireScreen.status : "pending";
  const inspireStatus = ["matched", "ambiguous", "unmatched"].includes(inspireStatusValue)
    ? inspireStatusValue as "matched" | "ambiguous" | "unmatched"
    : "pending";
  const inspireParcels = Array.isArray(inspireScreen?.parcels)
    ? inspireScreen.parcels.filter((item): item is { inspireId: string; label: string | null; nationalCadastralReference: string | null; areaSqm: number } =>
      Boolean(item)
      && typeof item === "object"
      && typeof (item as { inspireId?: unknown }).inspireId === "string"
      && typeof (item as { areaSqm?: unknown }).areaSqm === "number")
    : [];
  const planningPosition = verificationValue(planningVerification, "status") ?? rawValue(raw, ["planning-permission-status", "development status", "status"]) ?? "Not supplied";
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
  const corporateSignal = classifyCompanyStatus(opportunity.company_status);
  const corporateStatusLabel = corporateSignal === "insolvency"
    ? `Insolvency: ${opportunity.company_status}`
    : corporateSignal === "dissolved" ? "Dissolved company"
    : corporateSignal === "unmatched" ? "Company record unmatched"
    : corporateSignal === "active" ? "Active company"
    : corporateSignal === "other" ? `Company status: ${opportunity.company_status}`
    : "Company status pending";
  const insolvencyRoot = raw?.atlas_insolvency && typeof raw.atlas_insolvency === "object"
    ? raw.atlas_insolvency as unknown as CompanyInsolvencyIntelligence
    : null;
  const insolvency = insolvencyRoot
    && typeof insolvencyRoot.companyNumber === "string"
    && typeof insolvencyRoot.observedAt === "string"
    && Array.isArray(insolvencyRoot.cases)
    && Array.isArray(insolvencyRoot.activePractitioners)
    && Array.isArray(insolvencyRoot.outstandingCharges)
    ? insolvencyRoot
    : null;
  const notes = rawValue(raw, ["notes"]);
  const combinedText = `${opportunity.name} ${opportunity.address ?? ""} ${opportunity.locality ?? ""} ${notes ?? ""}`.toLowerCase();
  const siteTypes = classifySiteTypes(combinedText);
  const planningHistoryUrl = verificationValue(planningVerification, "sourceUrl") ?? rawValue(raw, ["planning-permission-history", "planning permission history"]);
  const planningPermissionDate = verificationValue(planningVerification, "decisionDate") ?? rawValue(raw, ["planning-permission-date", "planning permission date"]);
  const planningAgeYears = yearsSince(planningPermissionDate, now);
  const planningReferences = [...new Set([
    ...parsePlanningReferences(`${notes ?? ""} ${opportunity.source_reference ?? ""}`),
    ...(verificationValue(planningVerification, "reference") ? [verificationValue(planningVerification, "reference")!] : []),
  ])];
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
  if (corporateSignal === "insolvency") { priorityBonus += 12; priorityReasons.push("corporate proprietor is in formal insolvency"); }
  if (corporateSignal === "dissolved") { priorityBonus += 14; priorityReasons.push("corporate proprietor is dissolved"); }
  if (corporateSignal === "unmatched") priorityReasons.push("company identifier needs correction");

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
    constraintsChecked,
  ];
  const evidenceReadiness = Math.round((evidenceChecks.filter(Boolean).length / evidenceChecks.length) * 100);
  const evidenceGaps: string[] = [];
  if (!opportunity.title_number || !opportunity.proprietor_name) evidenceGaps.push("current title and registered proprietor");
  if (!planningHistoryUrl) evidenceGaps.push("direct planning-history record");
  if (minimumDwellings === null && maximumDwellings === null) evidenceGaps.push("stated development capacity");
  if (ownershipGroup === "unknown" || ownershipGroup === "mixed") evidenceGaps.push("clear ownership route");
  if (opportunity.company_number && corporateSignal === "unmatched") evidenceGaps.push("verified corporate identifier");
  if (corporateSignal === "insolvency" && !insolvency) evidenceGaps.push("detailed insolvency case record");
  if (corporateSignal === "insolvency" && insolvency && !insolvency.activePractitioners.length) {
    evidenceGaps.push("current insolvency practitioner authority");
  }
  if (!accessVerified) evidenceGaps.push("highway and access evidence");
  if (!constraintsChecked) evidenceGaps.push("constraint screening");
  if (!inspireScreen?.checkedAt) evidenceGaps.push("indicative Land Registry parcel screen");
  const nextActions: EvidenceAction[] = [];
  if (!opportunity.title_number || !opportunity.proprietor_name) nextActions.push({ type: "title", title: "Confirm title and proprietor", detail: "Obtain the current HM Land Registry title register and plan; do not infer ownership from the brownfield record.", priority: "high" });
  if (stalePlanning || (!planningVerified && (planningGroup === "unpermissioned" || !planningHistoryUrl))) nextActions.push({ type: "planning", title: "Verify the live planning position", detail: stalePlanning ? "Check whether the recorded permission was implemented, superseded or has lapsed." : "Review Hertsmere's planning portal, decision notice and supporting documents.", priority: "high" });
  if (minimumDwellings === null && maximumDwellings === null) nextActions.push({ type: "capacity", title: "Establish indicative capacity", detail: "Review the site plan, policy context and nearby schemes before relying on a dwelling estimate.", priority: "normal" });
  if (opportunity.company_number && !opportunity.company_status) nextActions.push({ type: "company", title: "Enrich the corporate proprietor", detail: "Check the company's live status, insolvency indicators and filing position through Companies House.", priority: "high" });
  if (corporateSignal === "insolvency" && !insolvency) nextActions.push({ type: "company", title: "Enrich the insolvency case", detail: "Retrieve the public Companies House insolvency record, acting practitioners and company charges before approaching any party.", priority: "high" });
  if (corporateSignal === "insolvency" && insolvency) nextActions.push({
    type: "company",
    title: "Confirm insolvency practitioner authority",
    detail: insolvency.activePractitioners.length
      ? `Verify that ${[...new Set(insolvency.activePractitioners.map((item) => item.name))].join(", ")} has authority to deal with this specific property.`
      : "No currently acting practitioner was returned. Review the latest filings and Gazette notices to identify the authorised office-holder.",
    priority: "high",
  });
  if (corporateSignal === "dissolved") nextActions.push({ type: "company", title: "Verify the bona vacantia route", detail: "Confirm the title, dissolution date and whether the property vested in the Crown or another relevant authority before making contact.", priority: "high" });
  if (corporateSignal === "unmatched") nextActions.push({ type: "company", title: "Correct the corporate identifier", detail: "Compare the proprietor name and company number with the current official title register before relying on Companies House status.", priority: "high" });
  if (!constraintsChecked) nextActions.push({ type: "constraints", title: "Run constraints and access screening", detail: "Check Green Belt, flood, heritage, trees, highways and lawful access before progressing the lead.", priority: "normal" });
  else if (constraints.length) nextActions.push({ type: "constraints", title: "Verify flagged constraints", detail: "Review authoritative source records and assess how the indicative constraints affect deliverability.", priority: "high" });
  else if (!accessVerified) nextActions.push({ type: "constraints", title: "Verify highway and lawful access", detail: "The indicative constraint screen is complete, but highway and title access evidence is still required.", priority: "normal" });

  return {
    planningPosition,
    planningGroup,
    minimumDwellings,
    maximumDwellings,
    capacityLabel,
    ownershipGroup,
    corporateSignal,
    corporateStatusLabel,
    insolvency,
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
    constraintsChecked,
    constraintCheckedAt: typeof constraintScreen?.checkedAt === "string" ? constraintScreen.checkedAt : null,
    constraints,
    constraintStatus,
    constraintDisclaimer: typeof constraintScreen?.disclaimer === "string" ? constraintScreen.disclaimer : null,
    inspire: {
      checked: Boolean(inspireScreen?.checkedAt),
      status: inspireStatus,
      checkedAt: typeof inspireScreen?.checkedAt === "string" ? inspireScreen.checkedAt : null,
      parcels: inspireParcels,
      disclaimer: typeof inspireScreen?.disclaimer === "string" ? inspireScreen.disclaimer : null,
    },
    verification: {
      title: {
        verified: titleVerified,
        sourceUrl: verificationValue(titleVerification, "sourceUrl"),
        checkedAt: verificationValue(titleVerification, "checkedAt"),
      },
      planning: {
        verified: planningVerified,
        sourceUrl: verificationValue(planningVerification, "sourceUrl"),
        checkedAt: verificationValue(planningVerification, "checkedAt"),
        implementationStatus: verificationValue(planningVerification, "implementationStatus"),
      },
      access: {
        verified: accessVerified,
        status: accessStatus,
        sourceUrl: verificationValue(accessVerification, "sourceUrl"),
        checkedAt: verificationValue(accessVerification, "checkedAt"),
      },
    },
  };
}
