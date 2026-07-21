export type AtlasSourceKind = "planning" | "brownfield" | "ownership" | "constraints" | "council_assets";

export type AtlasRawRecord = Record<string, unknown>;

export type AtlasEvidenceDraft = {
  evidenceKey: string;
  evidenceType: string;
  title: string;
  summary: string;
  sourceReference?: string | null;
  sourceUrl?: string | null;
  observedAt?: string | null;
  confidence: number;
  payload: AtlasRawRecord;
};

export type AtlasLeadDraft = {
  externalKey: string;
  name: string;
  address?: string | null;
  locality?: string | null;
  postcode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  areaSqm?: number | null;
  sourceType: AtlasSourceKind;
  sourceReference?: string | null;
  ownershipStatus?: string | null;
  vacancySignal: number;
  planningSignal: number;
  accessSignal: number;
  assemblySignal: number;
  constraintPenalty: number;
  evidenceConfidence: number;
  acquisitionRoute: string;
  rationale: string;
  status: "lead" | "review";
  rawEvidence: AtlasRawRecord;
  evidence: AtlasEvidenceDraft[];
};

export type NormalizationResult =
  | { accepted: true; lead: AtlasLeadDraft }
  | { accepted: false; reason: string };

export interface AtlasNormalizer {
  readonly sourceKind: AtlasSourceKind;
  normalize(record: AtlasRawRecord): NormalizationResult;
}

export type IngestionSummary = {
  runId: string;
  seen: number;
  accepted: number;
  rejected: number;
  opportunitiesUpserted: number;
  evidenceUpserted: number;
  rejectionReasons: Record<string, number>;
};
