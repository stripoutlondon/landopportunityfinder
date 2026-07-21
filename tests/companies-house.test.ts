import assert from "node:assert/strict";
import test from "node:test";
import { fetchCompanyProfile, normaliseCompanyNumber } from "../lib/atlas/enrichment/companies-house";

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
