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
  assert.equal(deriveOpportunityIntelligence(opportunity({ ownership_status: null, raw_evidence: {} })).ownershipGroup, "unknown");
});
