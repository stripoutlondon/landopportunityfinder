import assert from "node:assert/strict";
import test from "node:test";
import {
  extractGmlMembers,
  matchProjectedCandidates,
  parseInspireMember,
  pointInRing,
} from "../lib/atlas/enrichment/hmlr-inspire";

const member = `<wfs:member><LR:PREDEFINED><LR:INSPIREID>GB123</LR:INSPIREID><LR:LABEL>Parcel 123</LR:LABEL><LR:NATIONALCADASTRALREFERENCE>NCR-123</LR:NATIONALCADASTRALREFERENCE><LR:VALIDFROM>2026-07-01</LR:VALIDFROM><LR:GEOMETRY><gml:Polygon srsName="urn:ogc:def:crs:EPSG::27700"><gml:exterior><gml:LinearRing><gml:posList>0 0 10 0 10 10 0 10 0 0</gml:posList></gml:LinearRing></gml:exterior></gml:Polygon></LR:GEOMETRY></LR:PREDEFINED></wfs:member>`;

test("parses an INSPIRE GML parcel and its audit fields", () => {
  const parcel = parseInspireMember(member);
  assert.ok(parcel);
  assert.equal(parcel.inspireId, "GB123");
  assert.equal(parcel.nationalCadastralReference, "NCR-123");
  assert.equal(parcel.rings[0].length, 5);
});

test("matches projected Atlas points without treating outside points as parcels", () => {
  const parcel = parseInspireMember(member)!;
  assert.equal(pointInRing([5, 5], parcel.rings[0]), true);
  assert.equal(pointInRing([15, 5], parcel.rings[0]), false);
  const matches = matchProjectedCandidates([
    { id: "inside", name: "Inside", latitude: 0, longitude: 0, easting: 5, northing: 5 },
    { id: "outside", name: "Outside", latitude: 0, longitude: 0, easting: 15, northing: 5 },
  ], [parcel]);
  assert.equal(matches[0].matches.length, 1);
  assert.equal(matches[0].matches[0].areaSqm, 100);
  assert.equal(matches[1].matches.length, 0);
});

test("extracts complete GML members and preserves an incomplete tail", () => {
  const input = `header${member}<wfs:member><LR:PREDEFINED>`;
  const extracted = extractGmlMembers(input);
  assert.equal(extracted.members.length, 1);
  assert.match(extracted.remainder, /^<wfs:member>/);
});
