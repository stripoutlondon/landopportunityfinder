import assert from "node:assert/strict";
import test from "node:test";
import { HertsmerePlanningNormalizer } from "../lib/atlas/ingestion/planning";
import { HertsmereBrownfieldNormalizer } from "../lib/atlas/ingestion/brownfield";
import { normaliseRecords } from "../lib/atlas/ingestion/service";

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
