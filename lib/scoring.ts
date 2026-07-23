import { classifyCompanyStatus } from "@/lib/atlas/enrichment/companies-house";

export type ScoreInput = {
  ownership_status?: string | null;
  company_status?: string | null;
  vacancy_signal?: number;
  planning_signal?: number;
  access_signal?: number;
  assembly_signal?: number;
  constraint_penalty?: number;
  evidence_confidence?: number;
  area_sqm?: number | null;
};

const clamp = (value: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, value));

const signal = (value: number | undefined) => clamp(value ?? 0);

export function scoreOpportunity(input: ScoreInput): number {
  const corporateSignal = classifyCompanyStatus(input.company_status);
  const ownershipStatus = input.ownership_status?.trim().toLowerCase() ?? "";

  const corporateOpportunityBonus = corporateSignal === "dissolved"
    ? 12
    : corporateSignal === "insolvency" ? 10 : 0;
  const ownershipUncertaintyBonus =
    ownershipStatus.includes("unclear") ||
    ownershipStatus.includes("unknown") ||
    ownershipStatus.includes("unregistered")
      ? 8
      : 0;
  const viableScaleBonus = (input.area_sqm ?? 0) >= 500 ? 4 : 0;

  const weightedSignals =
    signal(input.planning_signal) * 0.25 +
    signal(input.vacancy_signal) * 0.2 +
    signal(input.access_signal) * 0.15 +
    signal(input.assembly_signal) * 0.15 +
    signal(input.evidence_confidence) * 0.15;
  const riskDeduction = signal(input.constraint_penalty) * 0.25;

  return Math.round(
    clamp(
      weightedSignals +
        corporateOpportunityBonus +
        ownershipUncertaintyBonus +
        viableScaleBonus -
        riskDeduction,
    ),
  );
}

export function explainScore(input: ScoreInput, score = scoreOpportunity(input)): string {
  const strengths: string[] = [];
  const cautions: string[] = [];

  if (signal(input.planning_signal) >= 60) strengths.push("planning potential");
  if (signal(input.vacancy_signal) >= 60) strengths.push("vacancy or underuse");
  if (signal(input.access_signal) >= 60) strengths.push("site access");
  if (signal(input.assembly_signal) >= 60) strengths.push("assembly potential");
  const corporateSignal = classifyCompanyStatus(input.company_status);
  if (corporateSignal === "dissolved") {
    strengths.push("dissolved-company ownership signal");
  }
  if (corporateSignal === "insolvency") strengths.push("corporate insolvency signal");
  if (corporateSignal === "unmatched") cautions.push("an unmatched corporate identifier");
  if (signal(input.constraint_penalty) >= 40) cautions.push("material constraints");
  if (signal(input.evidence_confidence) < 50) cautions.push("limited evidence confidence");

  const reason = strengths.length
    ? `Strongest signals: ${strengths.join(", ")}.`
    : "No single strong opportunity signal has yet been verified.";
  const caution = cautions.length
    ? ` Further investigation is required because of ${cautions.join(" and ")}.`
    : " Evidence and title checks are still required before acquisition decisions.";

  return `Atlas score ${score}/100. ${reason}${caution}`;
}
