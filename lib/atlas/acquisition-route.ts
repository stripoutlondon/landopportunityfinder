import { deriveOpportunityIntelligence, type OpportunityIntelligence } from "@/lib/atlas/opportunity-intelligence";
import { assessOpportunityVerification, type VerificationAssessment } from "@/lib/atlas/verification";
import type { Opportunity } from "@/lib/types";

export type AcquisitionRouteType =
  | "insolvency-practitioner"
  | "bona-vacantia"
  | "public-disposal"
  | "direct-owner"
  | "ownership-assembly"
  | "verify-ownership";

export type AcquisitionPipelineStage = "lead" | "investigating" | "verified" | "contact" | "offer";
export type AcquisitionGateState = "ready" | "pending" | "blocking";

export type AcquisitionGate = {
  key: "title" | "authority" | "creditors" | "planning" | "access" | "constraints";
  label: string;
  state: AcquisitionGateState;
  detail: string;
};

export type AcquisitionRouteAssessment = {
  routeType: AcquisitionRouteType;
  routeLabel: string;
  pipelineStage: AcquisitionPipelineStage;
  counterparty: string;
  contactTarget: string | null;
  readiness: number;
  canContact: boolean;
  recommendation: string;
  gates: AcquisitionGate[];
  blockers: string[];
  nextSteps: string[];
};

const stageOrder: AcquisitionPipelineStage[] = ["lead", "investigating", "verified", "contact", "offer"];

function storedAcquisition(opportunity: Opportunity): Record<string, unknown> {
  const value = opportunity.raw_evidence?.atlas_acquisition;
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function storedBoolean(record: Record<string, unknown>, key: string): boolean {
  return record[key] === true;
}

function explicitStage(opportunity: Opportunity): AcquisitionPipelineStage | null {
  const status = opportunity.status.toLowerCase().replaceAll("_", "-");
  if (/offer|heads-of-terms|under-offer/.test(status)) return "offer";
  if (/contact|approach|negotiat/.test(status)) return "contact";
  if (/verified|candidate/.test(status)) return "verified";
  if (/investigat|screened|review/.test(status)) return "investigating";
  return null;
}

function gateScore(gate: AcquisitionGate): number {
  if (gate.state === "ready") return 100;
  if (gate.state === "pending") return 45;
  return 0;
}

function routeFor(opportunity: Opportunity, intelligence: OpportunityIntelligence) {
  const practitioners = [...new Set(intelligence.insolvency?.activePractitioners.map((item) => item.name) ?? [])];
  if (intelligence.corporateSignal === "insolvency") return {
    routeType: "insolvency-practitioner" as const,
    routeLabel: "Insolvency practitioner acquisition",
    counterparty: practitioners.length ? practitioners.join(", ") : "Authorised insolvency office-holder",
    contactTarget: practitioners[0] ?? null,
  };
  if (intelligence.corporateSignal === "dissolved") return {
    routeType: "bona-vacantia" as const,
    routeLabel: "Bona vacantia or company-restoration route",
    counterparty: "Crown representative or restored company",
    contactTarget: null,
  };
  if (intelligence.ownershipGroup === "public") return {
    routeType: "public-disposal" as const,
    routeLabel: "Public-sector disposal approach",
    counterparty: opportunity.proprietor_name ?? "Relevant public authority",
    contactTarget: opportunity.proprietor_name ?? null,
  };
  if (intelligence.ownershipGroup === "mixed") return {
    routeType: "ownership-assembly" as const,
    routeLabel: "Multi-owner site assembly",
    counterparty: "All registered proprietors",
    contactTarget: opportunity.proprietor_name ?? null,
  };
  if (opportunity.proprietor_name) return {
    routeType: "direct-owner" as const,
    routeLabel: "Direct registered-owner approach",
    counterparty: opportunity.proprietor_name,
    contactTarget: opportunity.proprietor_name,
  };
  return {
    routeType: "verify-ownership" as const,
    routeLabel: "Ownership verification required",
    counterparty: "Unknown until current title is obtained",
    contactTarget: null,
  };
}

export function assessAcquisitionRoute(
  opportunity: Opportunity,
  intelligence = deriveOpportunityIntelligence(opportunity),
  verification = assessOpportunityVerification(opportunity, intelligence),
): AcquisitionRouteAssessment {
  const saved = storedAcquisition(opportunity);
  const route = routeFor(opportunity, intelligence);
  const titleReady = intelligence.verification.title.verified;
  const authorityReady = route.routeType !== "insolvency-practitioner"
    || storedBoolean(saved, "authorityConfirmed");
  const creditorsReady = route.routeType !== "insolvency-practitioner"
    || !(intelligence.insolvency?.outstandingCharges.length)
    || storedBoolean(saved, "creditorsReconciled");
  const planningReady = intelligence.verification.planning.verified;
  const accessReady = intelligence.verification.access.verified;
  const constraintsReady = intelligence.constraintsChecked && intelligence.constraintStatus !== "flagged";

  const gates: AcquisitionGate[] = [
    {
      key: "title",
      label: "Current title and proprietor",
      state: titleReady ? "ready" : "blocking",
      detail: titleReady ? `Verified against ${opportunity.title_number}.` : "Obtain the current title register and plan before contact.",
    },
    {
      key: "authority",
      label: "Authority to transact",
      state: authorityReady ? "ready" : "blocking",
      detail: authorityReady
        ? "The current acquisition counterparty has been confirmed."
        : `${route.counterparty} must confirm authority over this specific property.`,
    },
    {
      key: "creditors",
      label: "Secured-creditor position",
      state: creditorsReady ? "ready" : "pending",
      detail: creditorsReady
        ? "No unresolved company-level charge issue is recorded."
        : `${intelligence.insolvency?.outstandingCharges.length ?? 0} company charge records require reconciliation with the title.`,
    },
    {
      key: "planning",
      label: "Live planning position",
      state: planningReady ? "ready" : "pending",
      detail: planningReady ? intelligence.planningPosition : "Verify the latest council decision and implementation position.",
    },
    {
      key: "access",
      label: "Highway and lawful access",
      state: accessReady ? "ready" : "pending",
      detail: accessReady ? intelligence.verification.access.status : "Confirm frontage, adopted highway and private title rights.",
    },
    {
      key: "constraints",
      label: "Initial constraints screen",
      state: !intelligence.constraintsChecked ? "pending" : intelligence.constraintStatus === "flagged" ? "blocking" : "ready",
      detail: !intelligence.constraintsChecked
        ? "Initial constraints screening is incomplete."
        : intelligence.constraintStatus === "flagged"
          ? `${intelligence.constraints.length} constraint signal${intelligence.constraints.length === 1 ? "" : "s"} require assessment.`
          : "No entities were returned by the indicative screen.",
    },
  ];

  const blockers = gates.filter((gate) => gate.state === "blocking").map((gate) => gate.label);
  const readiness = Math.round(gates.reduce((sum, gate) => sum + gateScore(gate), 0) / gates.length);
  const canContact = titleReady && authorityReady && !gates.some((gate) => gate.state === "blocking");
  const inferredStage: AcquisitionPipelineStage = canContact
    ? "contact"
    : verification.stage === "candidate" ? "verified"
    : verification.decision === "investigate" ? "investigating"
    : "lead";
  const requestedStage = explicitStage(opportunity);
  const pipelineStage = requestedStage && stageOrder.indexOf(requestedStage) > stageOrder.indexOf(inferredStage)
    ? requestedStage
    : inferredStage;

  const nextSteps = gates
    .filter((gate) => gate.state !== "ready")
    .sort((a, b) => (a.state === "blocking" ? 0 : 1) - (b.state === "blocking" ? 0 : 1))
    .map((gate) => gate.detail);
  if (!nextSteps.length) nextSteps.push(`Prepare a controlled approach to ${route.counterparty} and record the response.`);

  const recommendation = canContact
    ? `Proceed with a controlled approach to ${route.counterparty}; preserve an evidence log and do not make an unconditional offer before legal review.`
    : blockers.length
      ? `Do not contact yet. Resolve ${blockers.join(" and ").toLowerCase()} first.`
      : `Continue focused verification before approaching ${route.counterparty}.`;

  return {
    ...route,
    pipelineStage,
    readiness,
    canContact,
    recommendation,
    gates,
    blockers,
    nextSteps,
  };
}
