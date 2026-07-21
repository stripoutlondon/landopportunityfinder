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

const clamp = (n: number, min = 0, max = 100) => Math.ma…2680 tokens truncated…_date", "decision date", "status_date"]);
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
