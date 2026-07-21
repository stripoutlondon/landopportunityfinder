export const PLANNING_CONSTRAINT_DATASETS = [
  "green-belt",
  "flood-risk-zone",
  "conservation-area",
  "article-4-direction-area",
  "tree-preservation-zone",
  "listed-building-outline",
  "scheduled-monument",
  "site-of-special-scientific-interest",
  "ancient-woodland",
] as const;

export type PlanningConstraint = {
  dataset: string;
  entity: string;
  name: string;
  reference: string | null;
};

export type ConstraintScreen = {
  checkedAt: string;
  sourceUrl: string;
  constraints: PlanningConstraint[];
  penalty: number;
  status: "clear" | "flagged";
  disclaimer: string;
};

const WEIGHTS: Record<string, number> = {
  "green-belt": 30,
  "flood-risk-zone": 25,
  "listed-building-outline": 25,
  "scheduled-monument": 30,
  "site-of-special-scientific-interest": 25,
  "ancient-woodland": 25,
  "conservation-area": 12,
  "article-4-direction-area": 12,
  "tree-preservation-zone": 10,
};

type PlanningEntity = Record<string, unknown> & { dataset?: string; entity?: string | number; name?: string; reference?: string };

export function buildConstraintUrl(latitude: number, longitude: number): string {
  const url = new URL("https://www.planning.data.gov.uk/entity.json");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  for (const dataset of PLANNING_CONSTRAINT_DATASETS) url.searchParams.append("dataset", dataset);
  url.searchParams.set("limit", "100");
  return url.toString();
}

export async function fetchPlanningConstraints(
  latitude: number,
  longitude: number,
  options: { fetcher?: typeof fetch; now?: Date } = {},
): Promise<ConstraintScreen> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error("Valid coordinates are required");
  const sourceUrl = buildConstraintUrl(latitude, longitude);
  const response = await (options.fetcher ?? fetch)(sourceUrl, { headers: { accept: "application/json", "user-agent": "LandOpportunityFinder/0.6" } });
  if (!response.ok) throw new Error(`Planning Data constraint lookup failed (${response.status})`);
  const payload = await response.json() as { entities?: PlanningEntity[]; data?: PlanningEntity[] };
  const entities = payload.entities ?? payload.data ?? [];
  const constraints = entities
    .filter((entity) => entity.dataset && PLANNING_CONSTRAINT_DATASETS.includes(entity.dataset as typeof PLANNING_CONSTRAINT_DATASETS[number]))
    .map((entity) => ({
      dataset: String(entity.dataset),
      entity: String(entity.entity ?? "unknown"),
      name: String(entity.name ?? entity.reference ?? entity.dataset),
      reference: entity.reference ? String(entity.reference) : null,
    }));
  const uniqueDatasets = new Set(constraints.map((constraint) => constraint.dataset));
  const penalty = Math.min(60, [...uniqueDatasets].reduce((total, dataset) => total + (WEIGHTS[dataset] ?? 5), 0));
  return {
    checkedAt: (options.now ?? new Date()).toISOString(),
    sourceUrl,
    constraints,
    penalty,
    status: constraints.length ? "flagged" : "clear",
    disclaimer: "Indicative Planning Data screen only. Coverage varies and no result is not proof that a site has no constraints. Verify against authoritative records before relying on it.",
  };
}

export function constraintLabel(dataset: string): string {
  return dataset.split("-").map((part) => part === "sssi" ? "SSSI" : `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" ");
}
