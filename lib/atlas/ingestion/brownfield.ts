import { normalisePostcode, parseWktPoint, plausibleCoordinate, postcodeFromText, readField, readNumber, stableKey } from "./fields";
import type { AtlasNormalizer, AtlasRawRecord, NormalizationResult } from "./types";

export class HertsmereBrownfieldNormalizer implements AtlasNormalizer {
  readonly sourceKind = "brownfield" as const;

  normalize(record: AtlasRawRecord): NormalizationResult {
    const reference = readField(record, ["SiteReference", "site_reference", "reference", "OrganisationURI"]);
    const address = readField(record, ["SiteNameAddress", "site_name_address", "site-address", "site address", "address", "site name"]);
    if (!reference) return { accepted: false, reason: "missing brownfield site reference" };
    if (!address) return { accepted: false, reason: "missing brownfield site address" };
    const endDate = readField(record, ["end-date", "end date"]);
    if (endDate && Date.parse(endDate) <= Date.now()) return { accepted: false, reason: "historical brownfield entry" };

    const status = readField(record, ["DevelopmentStatus", "development_status", "planning-permission-status", "status"]) ?? "not supplied";
    const permissionType = readField(record, ["planning-permission-type", "permission type"]);
    const deliverable = readField(record, ["Deliverable", "deliverable"]);
    const minimumDwellings = readNumber(record, ["MinimumNetDwellings", "minimum_net_dwellings", "minimum-net-dwellings", "min dwellings"]);
    const maximumDwellings = readNumber(record, ["MaximumNetDwellings", "maximum_net_dwellings", "maximum-net-dwellings", "max dwellings"]);
    const hectares = readNumber(record, ["Hectares", "site_area_hectares", "area hectares"]);
    const externalKey = `hertsmere-brownfield:${stableKey(reference)}`;
    const point = parseWktPoint(readField(record, ["point", "geometry"]));
    const latitude = point?.latitude ?? plausibleCoordinate(readNumber(record, ["latitude", "lat"]), "latitude");
    const longitude = point?.longitude ?? plausibleCoordinate(readNumber(record, ["longitude", "lng", "lon"]), "longitude");
    const entityId = readField(record, ["entity"]);
    const sourceUrl = entityId ? `https://www.planning.data.gov.uk/entity/${entityId}` : undefined;
    const statusText = status.toLowerCase();
    const planningSignal = /not permissioned|expired|lapsed|withdrawn|refused/.test(statusText)
      ? 84
      : /permissioned|approved/.test(statusText)
        ? 68
        : deliverable?.toLowerCase() === "yes" ? 78 : 72;
    const dwellingRange = maximumDwellings && maximumDwellings !== minimumDwellings
      ? `${minimumDwellings ?? "unknown"}-${maximumDwellings}`
      : minimumDwellings ? String(minimumDwellings) : "not stated";

    return { accepted: true, lead: {
      externalKey,
      name: address,
      address,
      locality: readField(record, ["WardName", "ward", "parish", "town", "site-name"]),
      postcode: normalisePostcode(readField(record, ["postcode", "post_code"])) ?? postcodeFromText(address),
      latitude,
      longitude,
      areaSqm: hectares === null ? null : hectares * 10_000,
      sourceType: "brownfield",
      sourceReference: reference,
      ownershipStatus: readField(record, ["ownership-status", "ownership status"]),
      vacancySignal: 35,
      planningSignal,
      accessSignal: 0,
      assemblySignal: minimumDwellings && minimumDwellings >= 5 ? 30 : 10,
      constraintPenalty: 0,
      evidenceConfidence: 90,
      acquisitionRoute: "Confirm title ownership, availability, access, constraints and the register's latest planning position.",
      rationale: `Official brownfield register entry with ${dwellingRange} net dwellings indicated. Planning position: ${status}${permissionType ? ` (${permissionType})` : ""}.`,
      status: "review",
      rawEvidence: record,
      evidence: [{
        evidenceKey: `${externalKey}:register-entry`, evidenceType: "brownfield_register", title: `Brownfield site ${reference}`,
        summary: `Planning status: ${status}; dwelling range: ${dwellingRange}${deliverable ? `; deliverable: ${deliverable}` : ""}`,
        sourceReference: reference, sourceUrl, confidence: 95, payload: record,
      }, {
        evidenceKey: `${externalKey}:planning-position`, evidenceType: "planning_status", title: "Recorded planning position",
        summary: `${status}${permissionType ? `; permission type: ${permissionType}` : ""}`,
        sourceReference: reference, sourceUrl, confidence: 90, payload: record,
      }],
    }};
  }
}
