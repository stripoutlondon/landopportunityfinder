import assert from "node:assert/strict";
import test from "node:test";
import { matchCorporateOwnership, parseCorporateOwnershipRecord } from "../lib/atlas/enrichment/hmlr-corporate";

const row = (overrides: Record<string, string> = {}) => parseCorporateOwnershipRecord({
  "Title Number": "HD12345", Tenure: "Freehold", "Property Address": "Kemp Place Car Park, Bushey, WD23 1DW",
  District: "HERTSMERE", Postcode: "WD23 1DW", "Proprietor name (1)": "EXAMPLE PROPERTY LIMITED",
  "Company Registration No. (1)": "01234567", "Date Proprietor added": "2018-01-03", ...overrides,
})!;

test("parses current HM Land Registry corporate ownership headings", () => {
  const record = row();
  assert.equal(record.titleNumber, "HD12345");
  assert.equal(record.postcode, "WD231DW");
  assert.equal(record.companyNumber, "01234567");
});

test("matches only a strong address within an exact postcode", () => {
  const opportunities = [{ id: "one", name: "Kemp Place Car Park", address: "Kemp Place, Bushey", postcode: "WD23 1DW" }];
  const result = matchCorporateOwnership(opportunities, [row()]);
  assert.equal(result.matched.length, 1);
  assert.equal(result.matched[0].record.titleNumber, "HD12345");
  assert.ok(result.matched[0].confidence >= 55);
});

test("does not turn similarly scored titles into a verified match", () => {
  const opportunities = [{ id: "one", name: "Kemp Place Car Park", address: "Kemp Place, Bushey", postcode: "WD23 1DW" }];
  const result = matchCorporateOwnership(opportunities, [row(), row({ "Title Number": "HD67890", "Property Address": "Car Park, Kemp Place, Bushey, WD23 1DW" })]);
  assert.equal(result.matched.length, 0);
  assert.equal(result.ambiguous.length, 1);
});

test("rejects a plausible address in a different postcode", () => {
  const opportunities = [{ id: "one", name: "Kemp Place Car Park", address: "Kemp Place, Bushey", postcode: "WD23 2AA" }];
  const result = matchCorporateOwnership(opportunities, [row()]);
  assert.equal(result.unmatched.length, 1);
});
