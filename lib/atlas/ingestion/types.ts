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
  payload: Record<string, unknown>;
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
 