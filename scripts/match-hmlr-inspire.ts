import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import proj4 from "proj4";
import {
  extractGmlMembers,
  parseInspireMember,
  parcelAreaSqm,
  pointInParcel,
  type InspireCandidate,
  type InspireCandidateMatch,
  type ProjectedCandidate,
} from "../lib/atlas/enrichment/hmlr-inspire";

const BRITISH_NATIONAL_GRID = "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.1502,0.247,0.8421,-20.4894 +units=m +no_defs";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing required argument ${name}`);
  return value;
}

async function main() {
  const gmlPath = argument("--gml");
  const candidatesPath = argument("--candidates");
  const outputPath = argument("--output");
  const input = JSON.parse((await readFile(candidatesPath, "utf8")).replace(/^\uFEFF/, "")) as { candidates?: InspireCandidate[] };
  if (!Array.isArray(input.candidates)) throw new Error("Candidates file does not contain a candidates array");

  const candidates: ProjectedCandidate[] = input.candidates.map((candidate) => {
    const [easting, northing] = proj4("WGS84", BRITISH_NATIONAL_GRID, [candidate.longitude, candidate.latitude]);
    return { ...candidate, easting, northing };
  });
  const results = new Map<string, InspireCandidateMatch>(
    candidates.map((candidate) => [candidate.id, { opportunityId: candidate.id, matches: [] }]),
  );
  const hash = createHash("sha256");
  let polygonCount = 0;
  let buffer = "";

  for await (const rawChunk of createReadStream(gmlPath)) {
    const chunk = rawChunk as Buffer;
    hash.update(chunk);
    buffer += chunk.toString("utf8");
    const extracted = extractGmlMembers(buffer);
    buffer = extracted.remainder;
    for (const member of extracted.members) {
      const parcel = parseInspireMember(member);
      if (!parcel) continue;
      polygonCount += 1;
      for (const candidate of candidates) {
        if (!pointInParcel([candidate.easting, candidate.northing], parcel)) continue;
        results.get(candidate.id)!.matches.push({
          inspireId: parcel.inspireId,
          label: parcel.label,
          nationalCadastralReference: parcel.nationalCadastralReference,
          validFrom: parcel.validFrom,
          areaSqm: Math.round(parcelAreaSqm(parcel)),
        });
      }
    }
  }

  for (const result of results.values()) {
    result.matches.sort((left, right) => left.areaSqm - right.areaSqm);
  }
  await writeFile(outputPath, JSON.stringify({
    polygonCount,
    coordinateReferenceSystem: "EPSG:27700",
    sourceSha256: hash.digest("hex"),
    matches: [...results.values()],
  }, null, 2), "utf8");
  process.stdout.write(`Matched ${candidates.length} Atlas candidates against ${polygonCount} INSPIRE polygons.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
