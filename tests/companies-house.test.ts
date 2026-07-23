import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyCompanyStatus,
  companyLookupGapEvidence,
  companyProfileEvidence,
  findCompanyProfileByExactName,
  fetchCompanyProfile,
  groupOpportunitiesByCompany,
  isDissolvedCompanyStatus,
  isInsolvencyCompanyStatus,
  normaliseCompanyNumber,
} from "../lib/atlas/enrichment/companies-house";

test("normalises Companies House numbers without losing alphabetic prefixes", () => {
  assert.equal(normaliseCompanyNumber("1234567"), "01234567");
  assert.equal(normaliseCompanyNumber("sc 123456"), "SC123456");
  assert.throws(() => normaliseCompanyNumber("12"), /Invalid/);
});

test("fetches and structures a company profile with server-side basic authentication", async () => {
  let authorization = "";
  const fetcher: typeof fetch = async (_input, init) => {
    authorization = new Headers(init?.headers).get("authorization") ?? "";
    return new Response(JSON.stringify({
      company_number: "01234567",
      company_name: "ATLAS LAND LIMITED",
      company_status: "active",
      type: "ltd",
      jurisdiction: "england-wales",
      date_of_creation: "2010-05-01",
      has_charges: true,
      has_insolvency_history: false,
      registered_office_address: { postal_code: "WD6 1WA" },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const profile = await fetchCompanyProfile("1234567", { apiKey: "test-key", fetcher, now: new Date("2026-07-21T12:00:00Z") });
  assert.equal(authorization, `Basic ${Buffer.from("test-key:").toString("base64")}`);
  assert.equal(profile.companyNumber, "01234567");
  assert.equal(profile.companyStatus, "active");
  assert.equal(profile.hasCharges, true);
  assert.equal(profile.observedAt, "2026-07-21T12:00:00.000Z");
});

test("reports missing configuration and missing companies safely", async () => {
  await assert.rejects(() => fetchCompanyProfile("12345678", { apiKey: "" }), /not configured/);
  const notFound: typeof fetch = async () => new Response("", { status: 404 });
  await assert.rejects(() => fetchCompanyProfile("12345678", { apiKey: "key", fetcher: notFound }), /not found/);
});

test("trims a copied API key before building the Companies House header", async () => {
  let authorization = "";
  const fetcher: typeof fetch = async (_input, init) => {
    authorization = new Headers(init?.headers).get("authorization") ?? "";
    return new Response(JSON.stringify({
      company_number: "01234567",
      company_name: "ATLAS LAND LIMITED",
      company_status: "active",
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  await fetchCompanyProfile("01234567", { apiKey: "  copied-key\r\n", fetcher });
  assert.equal(authorization, `Basic ${Buffer.from("copied-key:").toString("base64")}`);
});

test("includes a safe Companies House error message for configuration diagnosis", async () => {
  const badRequest: typeof fetch = async () => new Response(
    JSON.stringify({ error: "Invalid Authorization header" }),
    { status: 400, headers: { "content-type": "application/json" } },
  );
  await assert.rejects(
    () => fetchCompanyProfile("01234567", { apiKey: "key", fetcher: badRequest }),
    /400: Invalid Authorization header/,
  );
});

test("groups Atlas opportunities by a normalised company number", () => {
  const grouped = groupOpportunitiesByCompany([
    { id: "one", company_number: "1234567" },
    { id: "two", company_number: "01234567" },
    { id: "three", company_number: "12" },
    { id: "four", company_number: null },
  ]);
  assert.deepEqual([...grouped.entries()], [["01234567", ["one", "two"]]]);
});

test("classifies dissolved statuses and builds traceable evidence", () => {
  assert.equal(isDissolvedCompanyStatus("dissolved"), true);
  assert.equal(isDissolvedCompanyStatus("active"), false);
  const evidence = companyProfileEvidence({
    companyNumber: "01234567",
    companyName: "ATLAS LAND LIMITED",
    companyStatus: "dissolved",
    companyType: "ltd",
    jurisdiction: "england-wales",
    incorporatedOn: "2010-05-01",
    hasCharges: false,
    hasInsolvencyHistory: true,
    registeredOffice: null,
    sourceUrl: "https://find-and-update.company-information.service.gov.uk/company/01234567",
    observedAt: "2026-07-23T09:00:00.000Z",
  }, "opportunity-one");
  assert.equal(evidence.evidence_key, "companies-house:01234567:profile");
  assert.equal(evidence.verification_status, "source_verified");
  assert.match(evidence.summary, /dissolved/);
});

test("classifies insolvency and unmatched corporate signals separately", () => {
  assert.equal(isInsolvencyCompanyStatus("liquidation"), true);
  assert.equal(isInsolvencyCompanyStatus("administration"), true);
  assert.equal(isInsolvencyCompanyStatus("active"), false);
  assert.equal(classifyCompanyStatus("liquidation"), "insolvency");
  assert.equal(classifyCompanyStatus("dissolved"), "dissolved");
  assert.equal(classifyCompanyStatus("not-found"), "unmatched");
});

test("uses an exact proprietor-name match to correct an invalid company number", async () => {
  const requests: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    if (url.includes("/search/companies")) {
      return new Response(JSON.stringify({ items: [
        { company_number: "07654321", title: "ATLAS PROPERTY LIMITED" },
        { company_number: "11111111", title: "ATLAS PROPERTY HOLDINGS LIMITED" },
      ] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({
      company_number: "07654321",
      company_name: "ATLAS PROPERTY LIMITED",
      company_status: "liquidation",
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const profile = await findCompanyProfileByExactName("Atlas Property Ltd", { apiKey: "key", fetcher });
  assert.equal(profile?.companyNumber, "07654321");
  assert.equal(profile?.companyStatus, "liquidation");
  assert.equal(requests.length, 2);
});

test("does not guess when an exact proprietor-name search is ambiguous", async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify({ items: [
    { company_number: "07654321", title: "ATLAS PROPERTY LIMITED" },
    { company_number: "08654321", title: "ATLAS PROPERTY LTD" },
  ] }), { status: 200, headers: { "content-type": "application/json" } });
  const profile = await findCompanyProfileByExactName("Atlas Property Limited", { apiKey: "key", fetcher });
  assert.equal(profile, null);
});

test("creates explicit evidence when a corporate identifier cannot be matched", () => {
  const evidence = companyLookupGapEvidence("00058224", "ATLAS PROPERTY LIMITED", "site-one", "2026-07-23T12:00:00Z");
  assert.equal(evidence.evidence_type, "company_lookup_gap");
  assert.equal(evidence.payload.matchStatus, "not-found");
  assert.match(evidence.summary, /official title register/);
});
