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

test("distinguishes a completed clear constraint screen from missing evidence", () => {
  const result = deriveOpportunityIntelligence(opportunity({
    constraint_penalty: 0,
    raw_evidence: {
      "planning-permission-status": "not permissioned",
      atlas_constraints: { checkedAt: "2026-07-21T12:00:00Z", constraints: [], status: "clear", disclaimer: "Indicative only" },
    },
  }));
  assert.equal(result.constraintsChecked, true);
  assert.equal(result.constraintStatus, "clear");
  assert.ok(!result.evidenceGaps.includes("constraint screening"));
  assert.ok(!result.nextActions.some((action) => action.title === "Run constraints and access screening"));
});

test("surfaces flagged constraints and asks for authoritative verification", () => {
  const result = deriveOpportunityIntelligence(opportunity({
    constraint_penalty: 30,
    raw_evidence: {
      "planning-permission-status": "not permissioned",
      atlas_constraints: {
        checkedAt: "2026-07-21T12:00:00Z",
        constraints: [{ dataset: "green-belt", entity: "626169", name: "London Area Green Belt", reference: null }],
        status: "flagged",
      },
    },
  }));
  assert.equal(result.constraintStatus, "flagged");
  assert.equal(result.constraints[0].dataset, "green-belt");
  assert.ok(result.nextActions.some((action) => action.title === "Verify flagged constraints" && action.priority === "high"));
});

test("prioritises a proprietor in liquidation with a specific acquisition action", () => {
  const result = deriveOpportunityIntelligence(opportunity({
    company_number: "10963682",
    company_status: "liquidation",
    proprietor_name: "ATLAS PROPERTY LIMITED",
  }));
  assert.equal(result.corporateSignal, "insolvency");
  assert.match(result.corporateStatusLabel, /liquidation/i);
  assert.ok(result.priorityReasons.includes("corporate proprietor is in formal insolvency"));
  assert.ok(result.evidenceGaps.includes("detailed insolvency case record"));
  assert.ok(result.nextActions.some((action) => action.title === "Enrich the insolvency case"));
});

test("turns detailed insolvency evidence into a named authority-check action", () => {
  const result = deriveOpportunityIntelligence(opportunity({
    company_number: "10963682",
    company_status: "liquidation",
    proprietor_name: "ATLAS PROPERTY LIMITED",
    raw_evidence: {
      "planning-permission-status": "not permissioned",
      atlas_insolvency: {
        companyNumber: "10963682",
        status: "liquidation",
        cases: [{ type: "creditors-voluntary-liquidation", practitioners: [] }],
        activePractitioners: [{
          name: "JANE OFFICEHOLDER",
          role: "final-liquidator",
          appointedOn: "2026-04-02",
          ceasedToActOn: null,
          isActing: true,
        }],
        charges: [],
        outstandingCharges: [],
        observedAt: "2026-07-23T12:00:00Z",
        insolvencySourceUrl: "https://example.test/insolvency",
        chargesSourceUrl: "https://example.test/charges",
      },
    },
  }));
  assert.equal(result.insolvency?.activePractitioners[0].name, "JANE OFFICEHOLDER");
  assert.ok(!result.evidenceGaps.includes("detailed insolvency case record"));
  assert.ok(result.nextActions.some((action) =>
    action.title === "Confirm insolvency practitioner authority"
    && action.detail.includes("JANE OFFICEHOLDER"),
  ));
});

test("treats a Companies House miss as an evidence gap rather than a verified company", () => {
  const result = deriveOpportunityIntelligence(opportunity({
    company_number: "00058224",
    company_status: "not-found",
    proprietor_name: "UNMATCHED PROPRIETOR",
  }));
  assert.equal(result.corporateSignal, "unmatched");
  assert.ok(result.evidenceGaps.includes("verified corporate identifier"));
  assert.ok(result.nextActions.some((action) => action.title === "Correct the corporate identifier"));
});
