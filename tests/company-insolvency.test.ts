import assert from "node:assert/strict";
import test from "node:test";
import {
  companyChargesEvidence,
  companyInsolvencyEvidence,
  fetchCompanyInsolvencyIntelligence,
  insolvencyVerificationTasks,
} from "../lib/atlas/enrichment/company-insolvency";

test("fetches insolvency practitioners and outstanding company charges", async () => {
  const requests: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push(url);
    const authorization = new Headers(init?.headers).get("authorization");
    assert.equal(authorization, `Basic ${Buffer.from("test-key:").toString("base64")}`);
    if (url.endsWith("/insolvency")) {
      return new Response(JSON.stringify({
        status: "liquidation",
        cases: [{
          number: "1",
          type: "creditors-voluntary-liquidation",
          dates: [{ type: "wound-up-on", date: "2026-04-01" }],
          practitioners: [
            { name: "A PRACTITIONER", role: "final-liquidator", appointed_on: "2026-04-02" },
            { name: "FORMER PRACTITIONER", role: "practitioner", ceased_to_act_on: "2026-05-01" },
          ],
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({
      items: [
        {
          id: "charge-one",
          status: "outstanding",
          created_on: "2024-01-01",
          persons_entitled: [{ name: "ATLAS BANK PLC" }],
          classification: [{ description: "Legal charge" }],
        },
        {
          id: "charge-two",
          status: "fully-satisfied",
          persons_entitled: [{ name: "OLD BANK PLC" }],
        },
      ],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const result = await fetchCompanyInsolvencyIntelligence("10963682", {
    apiKey: "test-key",
    fetcher,
    now: new Date("2026-07-23T12:00:00Z"),
  });

  assert.equal(requests.length, 2);
  assert.equal(result.cases[0].type, "creditors-voluntary-liquidation");
  assert.equal(result.activePractitioners.length, 1);
  assert.equal(result.activePractitioners[0].name, "A PRACTITIONER");
  assert.equal(result.outstandingCharges.length, 1);
  assert.deepEqual(result.outstandingCharges[0].personsEntitled, ["ATLAS BANK PLC"]);
  assert.equal(result.observedAt, "2026-07-23T12:00:00.000Z");
});

test("treats missing insolvency and charge resources as an empty checked record", async () => {
  const fetcher: typeof fetch = async () => new Response("", { status: 404 });
  const result = await fetchCompanyInsolvencyIntelligence("10963682", {
    apiKey: "test-key",
    fetcher,
  });
  assert.deepEqual(result.cases, []);
  assert.deepEqual(result.charges, []);
});

test("builds traceable insolvency evidence and property-specific verification tasks", async () => {
  const fetcher: typeof fetch = async (input) => String(input).endsWith("/insolvency")
    ? new Response(JSON.stringify({
      status: "liquidation",
      cases: [{
        type: "compulsory-liquidation",
        practitioners: [{ name: "JANE OFFICEHOLDER", role: "final-liquidator" }],
      }],
    }), { status: 200 })
    : new Response(JSON.stringify({
      items: [{
        id: "charge-one",
        status: "part-satisfied",
        persons_entitled: [{ name: "SECURED LENDER PLC" }],
      }],
    }), { status: 200 });
  const intelligence = await fetchCompanyInsolvencyIntelligence("13057522", {
    apiKey: "test-key",
    fetcher,
    now: new Date("2026-07-23T13:00:00Z"),
  });

  const insolvencyEvidence = companyInsolvencyEvidence(intelligence, "site-one");
  const chargesEvidence = companyChargesEvidence(intelligence, "site-one");
  const tasks = insolvencyVerificationTasks(intelligence, "site-one");

  assert.equal(insolvencyEvidence.evidence_type, "company_insolvency");
  assert.match(insolvencyEvidence.summary, /JANE OFFICEHOLDER/);
  assert.equal(chargesEvidence.evidence_type, "company_charges");
  assert.match(chargesEvidence.summary, /SECURED LENDER PLC/);
  assert.deepEqual(tasks.map((task) => task.task_type), [
    "insolvency_authority",
    "secured_creditors",
    "insolvency_asset",
  ]);
  assert.match(tasks[0].instructions, /JANE OFFICEHOLDER/);
  assert.match(tasks[1].instructions, /SECURED LENDER PLC/);
});
