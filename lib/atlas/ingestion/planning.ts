import { plausibleCoordinate, readField, readNumber, normalisePostcode, stableKey } from "./fields";
import type { AtlasNormalizer, AtlasRawRecord, NormalizationResult } from "./types";

const opportunityDecisions = ["refused", "withdrawn", "expired", "lapsed", "not determined", "invalid"];
const developmentTerms = ["dwelling", "residential", "flat", "house", "redevelop", "demolition", "change of use", "outline"];

export class HertsmerePlanningNormalizer implements AtlasNormalizer {
  readonly sourceKind = "planning" as const;

  normalize(record: AtlasRawRecord): NormalizationResult {
    const reference = readField(record, ["application_reference", "reference", "planning_reference", "app_ref", "application number"]);
    const address = readField(record, ["site_address", "address", "location", "site location"]);
    if (!reference) return { accepted: false, reason: "missing planning reference" };
    if (!address) return { accepted: false, reason: "missing site address" };

    const proposal = readField(record, ["proposal", "description", "development_description"]) ?? "Planning application";
    const decision = readField(record, ["decision", "decision_type", "status", "application_status"]) ?? "unknown";
    const decisionDate = readField(record, ["decision_date", "decision date", "status_date"]);
    const lowerDecision = decision.toLowerCase();
    const lowerProposal = proposal.toLowerCase();
    const decisionSignal = opportunityDecisions.some((term) => lowerDecision.includes(term));
    const developmentSignal = developmentTerms.some((term) => lowerProposal.includes(term));
    const planningSignal = Math.min(100, 35 + (decisionSignal ? 30 : 0) + (developmentSignal ? 20 : 0));
    const latitude = plausibleCoordinate(readNumber(record, ["latitude", "lat"]), "latitude");
    const longitude = plausibleCoordinate(readNumber(record, ["longitude", "lng", "lon"]), "longitude");
    const postcode = normalisePostcode(readField(record, ["postcode", "post_code"]));
    const externalKey = `hertsmere-planning:${stableKey(reference)}`;

    return { accepted: true, lead: {
      externalKey,
      name: address,
      address,
      locality: readField(record, ["parish", "ward", "locality", "town"]),
      postcode,
      latitude,
      longitude,
      areaSqm: readNumber(record, ["site_area_sqm", "area_sqm", "site area"]),
      sourceType: "planning",
      sourceReference: reference,
      vacancySignal: 0,
      planningSignal,
      accessSignal: 0,
      assemblySignal: 0,
      constraintPenalty: 0,
      evidenceConfidence: decisionDate ? 85 : 70,
      acquisitionRoute: "Review the application documents, title and current site use before approaching the owner.",
      rationale: `${decision} planning record for: ${proposal}`,
      status: decisionSignal ? "review" : "lead",
      rawEvidence: record,
      evidence: [{
        evidenceKey: `${externalKey}:decision`, evidenceType: "planning_application", title: `Planning ${reference}`,
        summary: `${decision}: ${proposal}`, sourceReference: reference, observedAt: decisionDate,
        confidence: decisionDate ? 90 : 75, payload: record,
      }],
    }};
  }
}
