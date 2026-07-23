import assert from "node:assert/strict";
import test from "node:test";
import { assessOpportunityVerification } from "../lib/atlas/verification";
import type { Opportunity } from "../lib/types";

const opportunity = (overrides: Partial<Opportunity> = {}): Opportunity => ({
  id: "verification-test",
  name: "Former depot, Borehamwood",
  address: "Depot Road",
  locality: "Borehamwood",
  postcode: "WD6 1AA",
  latitude: 51.66,
  longitude: -0.27,
  area_sqm: 4400,
  source_type: "brownfield",
  source_reference: "BR-100",
  ownership_status: "not-owned-by-a-public-authority",
  proprietor_name: null,
  company_number: null,
  company_status: null,
  title_number: null,
  vacancy_signal: 78,
  planning_signal: 82,
  access_signal: 40,
  assembly_signal: 65,
  constraint_penalty: 0,
  evidence_confidence: 82,
  opportunity_score: 70,
  acquisition_route: null,
  rationale: "Underused brownfield site",
  status: "review",
  raw_evidence: {
    "planning-permission-status": "not permissioned",
    "planning-permission-history": "https://example.test/planning",
    "minimum-net-dwellings": "25",
    "maximum-net-dwellings": "35",
    atlas_constraints: { checkedAt: "2026-07-23T09:00:00Z", constraints: [], status: "clear" },
  },
  created_at: "2026-07-23T00:00:00Z",
  ...overrides,
});

test("promotes a screened, commercially strong lead for investigation", () => {
  const assessment = assessOpportunityVerification(opportunity());
  assert.equal(assessment.decision, "investigate");
  assert.equal(assessment.stage, "screened");
  assert.equal(assessment.shortlistEligible, true);
  assert.ok(assessment.commercialPotential >= 70);
  assert.match(assessment.nextBestAction, /Land Registry/);
});

test("recognises a candidate when title, planning and constraints evidence are present", () => {
  const assessment = assessOpportunityVerification(opportunity({
    title_number: "HD123456",
    proprietor_name: "ATLAS LAND LIMITED",
    company_number: "01234567",
    company_status: "active",
    raw_evidence: {
      "planning-permission-status": "not permissioned",
      "planning-permission-history": "https://example.test/planning",
      "minimum-net-dwellings": "25",
      "maximum-net-dwellings": "35",
      atlas_constraints: { checkedAt: "2026-07-23T09:00:00Z", constraints: [], status: "clear" },
      atlas_verification: {
        title: { checkedAt: "2026-07-23T10:00:00Z", sourceUrl: "https://example.test/title" },
        planning: { checkedAt: "2026-07-23T10:00:00Z", sourceUrl: "https://example.test/planning", status: "not permissioned" },
        access: { checkedAt: "2026-07-23T10:00:00Z", sourceUrl: "https://example.test/access", status: "confirmed" },
      },
    },
  }));
  assert.equal(assessment.stage, "candidate");
  assert.ok(assessment.acquisitionClarity >= 80);
  assert.ok(assessment.strengths.includes("Registered title and proprietor have been matched"));
});

test("holds a lead with a material environmental constraint", () => {
  const assessment = assessOpportunityVerification(opportunity({
    constraint_penalty: 25,
    raw_evidence: {
      "planning-permission-status": "not permissioned",
      "planning-permission-history": "https://example.test/planning",
      "maximum-net-dwellings": "35",
      atlas_constraints: {
        checkedAt: "2026-07-23T09:00:00Z",
        constraints: [{ dataset: "ancient-woodland", entity: "1", name: "Ancient woodland", reference: null }],
        status: "flagged",
      },
    },
  }));
  assert.equal(assessment.decision, "hold");
  assert.equal(assessment.shortlistEligible, false);
  assert.ok(assessment.risks.some((risk) => risk.severity === "material"));
});

test("keeps an unscreened lead in monitoring rather than presenting it as verified", () => {
  const assessment = assessOpportunityVerification(opportunity({
    raw_evidence: {
      "planning-permission-status": "not permissioned",
      "maximum-net-dwellings": "35",
    },
  }));
  assert.equal(assessment.stage, "lead");
  assert.equal(assessment.decision, "monitor");
  assert.equal(assessment.shortlistEligible, false);
});
