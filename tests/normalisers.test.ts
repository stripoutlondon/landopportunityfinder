import assert from "node:assert/strict";
import test from "node:test";
import { HertsmerePlanningNormalizer } from "../lib/atlas/ingestion/planning";
import { HertsmereBrownfieldNormalizer } from "../lib/atlas/ingestion/brownfield";
import { normaliseRecords } from "../lib/atlas/ingestion/service";
import { parseWktPoint } from "../lib/atlas/ingestion/fields";

test("parses Planning Data WKT points in longitude-latitude order", () => {
  assert.deepEqual(parseWktPoint("POINT (-0.30712 51.68724)"), { longitude: -0.30712, latitude: 51.68724 });
  assert.equal(parseWktPoint("POINT (514000 196000)"), null);
});

test("brownfield normaliser accepts official Planning Data field names", () => {
  const result = new HertsmereBrownfieldNormalizer().normalize({ entity: 1727370, reference: "BR031", "site-address": "18 Watford Road, Radlett", "planning-permission-status": "not permissioned", "minimum-net-dwellings": 5, "maximum-net-dwellings": 8, hectares: 0.12, point: "POINT (-0.321 51.684)", "ownership-status": "not owned by a public authority" });
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.lead.latitude, 51.684);
  assert.equal(result.lead.longitude, -0.321);
  assert.equal(result.lead.areaSqm, 1200);
  assert.equal(result.lead.postcode, null);
  assert.equal(result.lead.evidence.length, 2);
  assert.ok(result.lead.planningSignal >= 80);
  assert.match(result.lead.evidence[0].sourceUrl ?? "", /1727370$/);
});

test("brownfield normaliser extracts postcodes and rejects ended register entries", () => {
  const current = new HertsmereBrownfieldNormalizer().normalize({ reference: "BR001", "site-address": "The Directors Arms, Borehamwood, WD6 2HS", point: "POINT (-0.26 51.65)" });
  assert.equal(current.accepted, true);
  if (current.accepted) assert.equal(current.lead.postcode, "WD6 2HS");
  const historical = new HertsmereBrownfieldNormalizer().normalize({ reference: "BR002", "site-address": "Former site, Borehamwood", "end-date": "2022-05-18" });
  assert.deepEqual(historical, { accepted: false, reason: "historical brownfield entry" });
});

test("brownfield normaliser preserves official site-plan and planning-history evidence", () => {
  const result = new HertsmereBrownfieldNormalizer().normalize({
    reference: "BR001",
    "site-address": "The Directors Arms, Borehamwood, WD6 2HS",
    "site-plan-url": "https://example.test/site-plan.pdf",
    "planning-permission-history": "https://example.test/planning/19-0483",
    "planning-permission-date": "2019-05-17",
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.lead.evidence.length, 4);
  assert.ok(result.lead.evidence.some((item) => item.evidenceType === "official_site_plan"));
  assert.ok(result.lead.evidence.some((item) => item.evidenceType === "planning_history" && item.observedAt === "2019-05-17"));
});

test("planning normaliser recognises Hertsmere aliases and refused applications", () => {
  const result = new HertsmerePlanningNormalizer().normalize({ "Application Number": "24/1234/FUL", "Site Address": "1 High Street, Borehamwood", Proposal: "Demolition and 8 flats", Decision: "Refused", "Decision Date": "2025-03-01" });
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.lead.externalKey, "hertsmere-planning:24-1234-ful");
  assert.equal(result.lead.status, "review");
  assert.ok(result.lead.planningSignal >= 80);
});

test("brownfield normaliser does not treat British National Grid eastings as longitude", () => {
  const result = new HertsmereBrownfieldNormalizer().normalize({ SiteReference: "HBC-001", SiteNameAddress: "Former Yard, Bushey", Deliverable: "yes", MinimumNetDwellings: "12", Hectares: "0.4", GeoX: "514000", GeoY: "196000" });
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.lead.longitude, null);
  assert.equal(result.lead.areaSqm, 4000);
  assert.equal(result.lead.status, "review");
});

test("normaliseRecords deduplicates repeated source records by stable external key", () => {
  const records = [{ reference: "25/0001", address: "Test Site", decision: "Withdrawn" }, { reference: "25/0001", address: "Test Site", decision: "Withdrawn" }];
  const result = normaliseRecords(records, new HertsmerePlanningNormalizer());
  assert.equal(result.leads.length, 1);
  assert.deepEqual(result.rejectionReasons, {});
});

test("normalisers reject records that cannot be traced to a source reference", () => {
  const result = new HertsmerePlanningNormalizer().normalize({ address: "Unknown site" });
  assert.deepEqual(result, { accepted: false, reason: "missing planning reference" });
});
