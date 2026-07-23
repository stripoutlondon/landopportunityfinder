import assert from "node:assert/strict";
import test from "node:test";
import { applyVerificationPack, buildVerificationEvidence, normaliseVerificationPack } from "../lib/atlas/enrichment/verification-evidence";
import type { Opportunity } from "../lib/types";

const opportunity: Opportunity = {
  id: "site-1", name: "Test site", address: "Test Road", locality: "Bushey", postcode: "WD23 1AA",
  latitude: 51.6, longitude: -0.3, area_sqm: 2000, source_type: "brownfield", source_reference: "BR100",
  ownership_status: "not-owned-by-a-public-authority", proprietor_name: null, company_number: null, company_status: null,
  title_number: null, vacancy_signal: 70, planning_signal: 70, access_signal: 0, assembly_signal: 50,
  constraint_penalty: 0, evidence_confidence: 70, opportunity_score: 55, acquisition_route: null, rationale: null,
  status: "review", raw_evidence: {}, created_at: "2026-07-23T00:00:00Z",
};

test("normalises a mixed verification pack with a stable observation time", () => {
  const pack = normaliseVerificationPack({
    title: { titleNumber: "HD123456", proprietorName: "ATLAS LIMITED", companyNumber: "01234567", tenure: "freehold", sourceUrl: "https://example.test/title" },
    access: { status: "confirmed", description: "Direct frontage to an adopted public highway.", sourceUrl: "https://example.test/highway" },
  }, new Date("2026-07-23T12:00:00Z"));
  assert.equal(pack.title?.checkedAt, "2026-07-23T12:00:00.000Z");
  assert.equal(pack.access?.checkedAt, "2026-07-23T12:00:00.000Z");
});

test("rejects non-HTTPS evidence and empty submissions", () => {
  assert.throws(() => normaliseVerificationPack({}), /At least one/);
  assert.throws(() => normaliseVerificationPack({
    access: { status: "confirmed", description: "Road frontage confirmed.", sourceUrl: "http://example.test/highway" },
  }), /HTTPS/);
});

test("creates traceable evidence rows for every verified section", () => {
  const pack = normaliseVerificationPack({
    planning: { reference: "21/1448/PD56", status: "Prior approval given", implementationStatus: "not-checked", sourceUrl: "https://example.test/planning" },
    access: { status: "partial", description: "Frontage exists but title rights remain unverified.", sourceUrl: "https://example.test/access" },
  });
  const rows = buildVerificationEvidence(pack);
  assert.deepEqual(rows.map((row) => row.evidence_type), ["planning_verification", "access_verification"]);
  assert.ok(rows.every((row) => row.verification_status === "analyst_verified"));
});

test("applies verified title and access evidence without deleting prior raw evidence", () => {
  const pack = normaliseVerificationPack({
    title: { titleNumber: "HD123456", proprietorName: "ATLAS LIMITED", companyNumber: "01234567", sourceUrl: "https://example.test/title" },
    access: { status: "confirmed", description: "Direct frontage to an adopted public highway.", sourceUrl: "https://example.test/access" },
  });
  const result = applyVerificationPack({ ...opportunity, raw_evidence: { existing: true } }, pack);
  assert.equal(result.title_number, "HD123456");
  assert.equal(result.access_signal, 85);
  assert.equal((result.raw_evidence as Record<string, unknown>).existing, true);
  assert.ok(result.opportunity_score > opportunity.opportunity_score);
});
