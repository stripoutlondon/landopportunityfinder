import { deriveOpportunityIntelligence, type OpportunityIntelligence } from "@/lib/atlas/opportunity-intelligence";
import type { Opportunity } from "@/lib/types";

export type VerificationDecision = "investigate" | "monitor" | "hold";
export type VerificationStage = "lead" | "screened" | "candidate";
export type RiskSeverity = "material" | "moderate" | "minor";

export type VerificationRisk = {
  severity: RiskSeverity;
  title: string;
  detail: string;
};

export type VerificationAssessment = {
  decision: VerificationDecision;
  stage: VerificationStage;
  verificationScore: number;
  commercialPotential: number;
  deliverability: number;
  acquisitionClarity: number;
  evidenceQuality: number;
  strengths: string[];
  risks: VerificationRisk[];
  unknowns: string[];
  nextBestAction: string;
  committeeSummary: string;
  shortlistEligible: boolean;
};

const MATERIAL_CONSTRAINTS = new Set([
  "scheduled-monument",
  "site-of-special-scientific-interest",
  "ancient-woodland",
]);

const MODERATE_CONSTRAINTS = new Set([
  "green-belt",
  "flood-risk-zone",
  "listed-building-outline",
]);

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function capacityScore(intelligence: OpportunityIntelligence): number {
  const capacity = intelligence.maximumDwellings ?? intelligence.minimumDwellings ?? 0;
  if (capacity >= 50) return 92;
  if (capacity >= 20) return 80;
  if (capacity >= 10) return 70;
  if (capacity >= 5) return 58;
  return 38;
}

function buildRisks(opportunity: Opportunity, intelligence: OpportunityIntelligence): VerificationRisk[] {
  const risks: VerificationRisk[] = intelligence.constraints.map((constraint) => ({
    severity: MATERIAL_CONSTRAINTS.has(constraint.dataset)
      ? "material"
      : MODERATE_CONSTRAINTS.has(constraint.dataset) ? "moderate" : "minor",
    title: constraint.name,
    detail: `${constraint.dataset.replaceAll("-", " ")} signal requires authoritative verification.`,
  }));
  if (intelligence.planningGroup === "permissioned" && !intelligence.stalePlanning) {
    risks.push({
      severity: "moderate",
      title: "Existing planning position",
      detail: "The recorded permission may reduce the off-market or planning-uplift angle.",
    });
  }
  if (opportunity.access_signal === 0) {
    risks.push({
      severity: "moderate",
      title: "Access is unverified",
      detail: "No reliable highway or lawful-access evidence has been recorded.",
    });
  }
  return risks;
}

export function assessOpportunityVerification(
  opportunity: Opportunity,
  intelligence = deriveOpportunityIntelligence(opportunity),
): VerificationAssessment {
  const risks = buildRisks(opportunity, intelligence);
  const materialRiskCount = risks.filter((risk) => risk.severity === "material").length;
  const moderateRiskCount = risks.filter((risk) => risk.severity === "moderate").length;
  const ownershipKnown = Boolean(opportunity.title_number && opportunity.proprietor_name);
  const companyVerified = Boolean(opportunity.company_number && opportunity.company_status);
  const planningLinked = Boolean(intelligence.planningHistoryUrl);

  const commercialPotential = clamp(
    capacityScore(intelligence) * 0.42
    + opportunity.vacancy_signal * 0.2
    + opportunity.planning_signal * 0.2
    + opportunity.assembly_signal * 0.18,
  );
  const deliverability = clamp(
    76
    + (intelligence.constraintsChecked ? 6 : -12)
    - opportunity.constraint_penalty
    - materialRiskCount * 12
    - moderateRiskCount * 4
    + (opportunity.access_signal > 0 ? opportunity.access_signal * 0.08 : -8),
  );
  const acquisitionClarity = clamp(
    18
    + (ownershipKnown ? 46 : 0)
    + (companyVerified ? 20 : 0)
    + (intelligence.ownershipGroup !== "unknown" ? 10 : 0)
    + (opportunity.acquisition_route ? 6 : 0),
  );
  const evidenceQuality = intelligence.evidenceReadiness;
  const verificationScore = clamp(
    commercialPotential * 0.38
    + deliverability * 0.27
    + acquisitionClarity * 0.17
    + evidenceQuality * 0.18,
  );

  const stage: VerificationStage = ownershipKnown && planningLinked && intelligence.constraintsChecked
    ? "candidate"
    : intelligence.constraintsChecked ? "screened" : "lead";
  const decision: VerificationDecision = materialRiskCount > 0 || verificationScore < 45
    ? "hold"
    : verificationScore >= 60 && intelligence.constraintsChecked ? "investigate" : "monitor";
  const shortlistEligible = decision === "investigate" && materialRiskCount === 0;

  const strengths: string[] = [];
  if (commercialPotential >= 70) strengths.push("Strong indicative development capacity and site signals");
  if (intelligence.planningGroup === "unpermissioned") strengths.push("No current permission recorded, preserving a planning-uplift angle");
  if (intelligence.stalePlanning) strengths.push("Older permission may warrant a renewed planning and acquisition review");
  if (intelligence.constraintStatus === "clear") strengths.push("No entities returned by the initial constraints screen");
  if (ownershipKnown) strengths.push("Registered title and proprietor have been matched");
  if (companyVerified) strengths.push("Corporate proprietor status has been checked");
  if (intelligence.siteTypes.some((type) => ["Vacant or underused", "Car park", "Garage or automotive", "Commercial"].includes(type))) {
    strengths.push("Physical-use description suggests redevelopment or intensification potential");
  }

  const unknowns = [...intelligence.evidenceGaps];
  const nextBestAction = !ownershipKnown
    ? "Obtain and verify the current HM Land Registry title register and title plan."
    : !planningLinked
      ? "Verify the live planning history, decision notice and implementation position."
      : companyVerified || !opportunity.company_number
        ? risks.length
          ? "Review the flagged constraints with authoritative mapping and professional advice."
          : "Complete an acquisition appraisal and owner-contact strategy."
        : "Check the corporate proprietor's current Companies House status and filing position.";

  const committeeSummary = `${decision === "investigate" ? "Progress to focused investigation" : decision === "monitor" ? "Keep under review" : "Do not prioritise yet"}. `
    + `${strengths[0] ?? "The site has an incomplete opportunity thesis"}. `
    + `${unknowns.length ? `${unknowns.length} core evidence gap${unknowns.length === 1 ? "" : "s"} remain.` : "Core evidence fields are populated."}`;

  return {
    decision,
    stage,
    verificationScore,
    commercialPotential,
    deliverability,
    acquisitionClarity,
    evidenceQuality,
    strengths,
    risks,
    unknowns,
    nextBestAction,
    committeeSummary,
    shortlistEligible,
  };
}
