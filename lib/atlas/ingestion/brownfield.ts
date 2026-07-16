import { plausibleCoordinate, readField, readNumber, normalisePostcode, stableKey } from "./fields";
import type { AtlasNormalizer, AtlasRawRecord, NormalizationResult } from "./types";

export class HertsmereBrownfieldNormalizer implements AtlasNormalizer {
  readonly sourceKind = "brownfield" as const;

  normalize(record: AtlasRawRecord): NormalizationResult {
    const reference = readField(record, ["SiteReference", "site_reference", "reference", "OrganisationURI"]);
    const address = readField(record, ["SiteNameAddress", "site_name_address", "site address", "address", "site name"]);
    if (!reference) return { accepted: false, reason: "missing brownfield site reference" };
    if (!address) return { accepted: false, reason: "missing brownfield site address" };

    const status = readField(record, ["DevelopmentStatus", "development_status", "status"]) ?? "not supplied";
    const deliverable = readField(record, ["Deliverable", "deliverable"]);
    const minimumDwellings = readNumber(record, ["MinimumNetDwellings", "minimum_net_dwellings", "min dwellings"]);
    const hectares = readNumber(record, ["Hectares", "site_area_hectares", "area hectares"]);
    const externalKey = `hertsmere-brownfield:${stableKey(reference)}`;
    const latitude = plausibleCoordinate(readNumber(record, ["latitude", "lat"]), "latitude");
    const longitude = plausibleCoordinate(readNumber(record, ["longitude", "lng", "lon"]), "longitude");

    return { accepted: true, lead: {
      externalKey,
      name: address,
      address,
      locality: readField(record, ["WardName", "ward", "parish", "town"]),
      postcode: normalisePostcode(readField(record, ["postcode", "post_code"])),
      latitude,
      longitude,
      areaSqm: hectares === null ? null : hectares * 10_000,
      sourceType: "brownfield",
      sourceReference: reference,
      vacancySignal: 35,
      planningSignal: deliverable?.toLowerCase() === "yes" ? 82 : 68,
      accessSignal: 0,
      assemblySignal: minimumDwellings && minimumDwellings >= 5 ? 30 : 10,
      constraintPenalty: 0,
      evidenceConfidence: 90,
      acquisitionRoute: "Confirm ownership, availability, constraints and the register's latest planning position.",
      rationale: `Hertsmere brownfield register site; development status: ${status}${minimumDwellings ? `; minimum ${minimumDwellings} dwellings` : ""}.`,
      status: "review",
      rawEvidence: record,
      evidence: [{
        evidenceKey: `${externalKey}:register-entry`, evidenceType: "brownfield_register", title: `Brownfield site ${reference}`,
        summary: `Development status: ${status}${deliverable ? `; deliverable: ${deliverable}` : ""}`,
        sourceReference: reference, confidence: 95, payload: record,
      }],
    }};
  }
}
