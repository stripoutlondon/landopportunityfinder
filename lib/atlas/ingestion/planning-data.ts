import type { AtlasRawRecord } from "./types";

const API_URL = "https://www.planning.data.gov.uk/entity.json";
const HERTSMERE_GEOMETRY_ENTITY = "626169";

type PlanningDataResponse = {
  entities?: AtlasRawRecord[];
  data?: AtlasRawRecord[];
  links?: { next?: string | null };
};

export async function fetchHertsmereBrownfieldRecords(options: { maxPages?: number; signal?: AbortSignal } = {}): Promise<AtlasRawRecord[]> {
  const maxPages = options.maxPages ?? 20;
  const records: AtlasRawRecord[] = [];
  let nextUrl: string | null = `${API_URL}?dataset=brownfield-land&geometry_entity=${HERTSMERE_GEOMETRY_ENTITY}&geometry_relation=within&limit=100`;

  for (let page = 0; nextUrl && page < maxPages; page += 1) {
    const response = await fetch(nextUrl, { headers: { accept: "application/json", "user-agent": "LandOpportunityFinder/0.3" }, cache: "no-store", signal: options.signal });
    if (!response.ok) throw new Error(`Planning Data API returned ${response.status}`);
    const body = await response.json() as PlanningDataResponse;
    const pageRecords = body.entities ?? body.data ?? [];
    records.push(...pageRecords);
    nextUrl = body.links?.next ? new URL(body.links.next.replace(/^http:/, "https:"), API_URL).toString() : null;
    if (pageRecords.length === 0) break;
  }

  return records;
}
