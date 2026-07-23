import assert from "node:assert/strict";
import test from "node:test";
import { assessAcquisitionRoute } from "../lib/atlas/acquisition-route";
import type { Opportunity } from "../lib/types";

function opportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: "site-one",
    name: "Test site",
    address: "1 Test Road",
    locality: "Bushey",
    postcode: "WD23 1AA",
    latitude: 51.6,
    longitude: -0.35,
    area_sqm: 1000,
    source_type: "brownfield",
    source_reference: "BR001",
    ownership_status: "not-owned-by-a-public-authority",
    proprietor_name: "TEST OWNER LIMITED",
    company_number: "10963682",
    company_status: "liquidation",
    title_number: "HD1234",
    vacancy_signal: 70,
    planning_signal: 70,
    access_signal: 0,
    assembly_signal: 30,
    constraint_penalty: 0,
    evidence_confidence: 80,
    opportunity_score: 75,
    acquisition_route: null,
    rationale: "Test",
    status: "lead",
    created_at: "2026-07-23T10:00:00Z",
    raw_evidence: {
      atlas_constraints: { checkedAt: "2026-07-23T10:00:00Z", constraints: [] },
      atlas_insolvency: {
        companyNumber: "10963682",
        status: "liquidation",
        cases: [{ caseNumber: "1", type: "compulsory-liquidation", dates: [], notes: [], practitioners: [] }],
        activePractitioners: [{ name: "JANE PRACTITIONER", role: "liquidator", appointedOn: null, ceasedToActOn: null, isActing: true }],
        charges: [],
        outstandingCharges: [{ id: "c1", chargeCode: null, status: "outstanding", createdOn: null, satisfiedOn: null, personsEntitled: ["ATLAS BANK"], classification: [] }],
        observedAt: "2026-07-23T10:00:00Z",
        insolvencySourceUrl: "https://example.com/insolvency",
        chargesSourceUrl: "https://example.com/charges",
      },
    },
    ...overrides,
  };
}

test("holds an insolvency lead before title and practitioner authority are verified", () => {
  const assessment = assessAcquisitionRoute(opportunity());
  assert.equal(assessment.routeType, "insolvency-practitioner");
  assert.equal(assessment.contactTarget, "JANE PRACTITIONER");
  assert.equal(assessment.canContact, false);
  assert.ok(assessment.blockers.includes("Current title and proprietor"));
  assert.ok(assessment.blockers.includes("Authority to transact"));
  assert.match(assessment.recommendation, /Do not contact yet/);
});

test("promotes a fully verified insolvency route to controlled contact", () => {
  const item = opportunity({
    access_signal: 85,
    raw_evidence: {
      ...opportunity().raw_evidence,
      atlas_verification: {
        title: { checkedAt: "2026-07-23T10:00:00Z", sourceUrl: "https://example.com/title" },
        planning: { checkedAt: "2026-07-23T10:00:00Z", sourceUrl: "https://example.com/planning", status: "approved" },
        access: { checkedAt: "2026-07-23T10:00:00Z", sourceUrl: "https://example.com/access", status: "confirmed" },
      },
      atlas_acquisition: { authorityConfirmed: true, creditorsReconciled: true },
    },
  });
  const assessment = assessAcquisitionRoute(item);
  assert.equal(assessment.canContact, true);
  assert.equal(assessment.pipelineStage, "contact");
  assert.equal(assessment.blockers.length, 0);
  assert.match(assessment.recommendation, /controlled approach/);
});

test("routes dissolved proprietors through bona vacantia verification", () => {
  const assessment = assessAcquisitionRoute(opportunity({
    company_status: "dissolved",
    raw_evidence: { atlas_constraints: { checkedAt: "2026-07-23T10:00:00Z", constraints: [] } },
  }));
  assert.equal(assessment.routeType, "bona-vacantia");
  assert.match(assessment.routeLabel, /Bona vacantia/);
});
