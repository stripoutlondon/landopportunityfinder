import assert from "node:assert/strict";
import test from "node:test";
import { deriveOpportunityIntelligence } from "../lib/atlas/opportunity-intelligence";
import type { Opportunity } from "../lib/types";

const opportunity = (overrides: Partial<Opportunity> = {}): Opportunity => ({
  id: "test", name: "Kemp Place Car Park, Bushey", address: "Kemp Place, Bushey, WD23 1DW", locality: null,
  postcode: "WD23 1DW", latitude: 51.64, longitude: -0.36, area_sqm: 1200, source_type: "brownfield",
  ownership_status: "not-owned-by-a-public-authority", company_status: null, vacancy_signal: 70, planning_signal: 84,
  access_signal: 0, assembly_signal: 65, constraint_penalty: 0, evidence_confidence: 90, opportunity_score: 62,
  acquisition_route: null, rationale: null, status: "review", created_at: "2026-07-21T00:00:00Z",
  raw_evidence: { "planning-permission-status": "not permissioned", "minimum-net-dwellings": "10", "maximum-net-dwellings": "18" },
  ...overrides,
});

test("derives developer-facing capacity, planning, ownership and location intelligence", () => {
  const result = deriveOpportunityIntelligence(opportunity());
  assert.equal(result.planningGroup, "unpermissioned");
  assert.equal(result.capacityLabel, "10–18 homes");
  assert.equal(result.ownershipGroup, "private");
  assert.equal(result.location, "Bushey");
  assert.ok(result.siteTypes.includes("Car park"));
  assert.ok(result.researchPriority > 62);
  assert.ok(result.priorityReasons.includes("no current permission recorded"));
});

test("distinguishes public ownership without misclassifying private wording", () => {
  assert.equal(deriveOpportunityIntelligence(opportunity({ ownership_status: "owned-by-a-public-authority" })).ownershipGroup, "public");
  assert.equal(deriveOpportunityIntelligence(opportunity({ ownership_status: "mixed-ownership" })).ownershipGroup, "mixed");
  assert.equal(deriveOpportunityIntelligence(opportunity({ ownership_status: null, raw_evidence: {} })).ownershipGroup, "unknown");
});

test("flags an old unstarted permission and extracts planning references", () => {
  const result = deriveOpportunityIntelligence(opportunity({
    source_reference: "BR001",
    raw_evidence: {
      "planning-permission-status": "permissioned",
      "planning-permission-date": "2019-05-17",
      "planning-permission-history": "https://example.test/planning",
      "site-plan-url": "https://example.test/plan.pdf",
      "ownership-status": "owned-by-a-public-authority",
      "minimum-net-dwellings": "26",
      notes: "Demolition approved under 19/0483/FUL",
    },
  }), new Date("2026-07-21T00:00:00Z"));
  assert.equal(result.stalePlanning, true);
  assert.equal(result.planningAgeYears, 7);
  assert.deepEqual(result.planningReferences, ["19/0483/FUL"]);
  assert.ok(result.priorityReasons.includes("7-year-old permission needs status check"));
  assert.ok(result.evidenceReadiness >= 70);
});

test("does not flag a permission where the source says development started", () => {
  const result = deriveOpportunityIntelligence(opportunity({
    raw_evidence: {
      "planning-permission-status": "permissioned",
      "planning-permission-date": "2015-12-18",
      notes: "STARTED (15/0058/FUL)",
    },
  }), new Date("2026-07-21T00:00:00Z"));
  assert.equal(result.stalePlanning, false);
  assert.deepEqual(result.planningReferences, ["15/0058/FUL"]);
});

test("creates explicit evidence gaps and human next actions", () => {
  const result = deriveOpportunityIntelligence(opportunity({
    ownership_status: null,
    source_reference: null,
    postcode: null,
    latitude: null,
    longitude: null,
    raw_evidence: { "planning-permission-status": "not permissioned" },
  }));
  assert.ok(result.evidenceReadiness < 50);
  assert.ok(result.evidenceGaps.includes("current title and registered proprietor"));
  assert.ok(result.nextActions.some((action) => action.type === "title" && action.priority === "high"));
  assert.ok(result.nextActions.some((action) => action.type === "planning"));
});
