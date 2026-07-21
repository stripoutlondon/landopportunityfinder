import assert from "node:assert/strict";
import test from "node:test";
import { buildConstraintUrl, fetchPlanningConstraints } from "../lib/atlas/enrichment/constraints";

test("builds a Planning Data point query for every Atlas constraint dataset", () => {
  const url = new URL(buildConstraintUrl(51.65, -0.27));
  assert.equal(url.searchParams.get("latitude"), "51.65");
  assert.equal(url.searchParams.getAll("dataset").length, 9);
  assert.ok(url.searchParams.getAll("dataset").includes("green-belt"));
});

test("normalises constraint entities and calculates a capped penalty", async () => {
  const fetcher = async () => new Response(JSON.stringify({ entities: [
    { dataset: "green-belt", entity: 626169, name: "London Area Green Belt" },
    { dataset: "conservation-area", entity: 100, name: "Old Town" },
    { dataset: "irrelevant", entity: 9 },
  ] }), { status: 200 });
  const result = await fetchPlanningConstraints(51.65, -0.27, { fetcher: fetcher as typeof fetch, now: new Date("2026-07-21T12:00:00Z") });
  assert.equal(result.status, "flagged");
  assert.equal(result.constraints.length, 2);
  assert.equal(result.penalty, 42);
  assert.equal(result.checkedAt, "2026-07-21T12:00:00.000Z");
});

test("records a completed clear screen without claiming proof of no constraints", async () => {
  const fetcher = async () => new Response(JSON.stringify({ entities: [] }), { status: 200 });
  const result = await fetchPlanningConstraints(51.65, -0.27, { fetcher: fetcher as typeof fetch });
  assert.equal(result.status, "clear");
  assert.equal(result.penalty, 0);
  assert.match(result.disclaimer, /not proof/i);
});
