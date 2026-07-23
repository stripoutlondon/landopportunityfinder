import { z } from "zod";
import { scoreOpportunity } from "@/lib/scoring";
import type { Opportunity } from "@/lib/types";

const httpsUrl = z.string().url().refine((value) => new URL(value).protocol === "https:", "Evidence URLs must use HTTPS");
const checkedAt = z.string().datetime().optional();

const titleEvidenceSchema = z.object({
  titleNumber: z.string().trim().min(3).max(30),
  proprietorName: z.string().trim().min(2).max(300),
  companyNumber: z.string().trim().max(20).optional(),
  tenure: z.enum(["freehold", "leasehold", "other"]).optional(),
  sourceUrl: httpsUrl,
  checkedAt,
});

const planningEvidenceSchema = z.object({
  reference: z.string().trim().min(2).max(80),
  status: z.string().trim().min(2).max(160),
  decisionDate: z.string().date().optional(),
  implementationStatus: z.enum(["not-checked", "not-started", "started", "completed", "lapsed", "superseded", "unknown"]),
  sourceUrl: httpsUrl,
  checkedAt,
});

const accessEvidenceSchema = z.object({
  status: z.enum(["confirmed", "partial", "blocked", "unverified"]),
  description: z.string().trim().min(5).max(1000),
  sourceUrl: httpsUrl,
  checkedAt,
});

export const verificationPackSchema = z.object({
  title: titleEvidenceSchema.optional(),
  planning: planningEvidenceSchema.optional(),
  access: accessEvidenceSchema.optional(),
}).refine((value) => Boolean(value.title || value.planning || value.access), "At least one verification section is required");

export type VerificationPackInput = z.input<typeof verificationPackSchema>;
export type VerificationPack = z.output<typeof verificationPackSchema>;

export type VerificationEvidenceRow = {
  evidence_key: string;
  evidence_type: string;
  title: string;
  summary: string;
  source_reference: string | null;
  source_url: string;
  observed_at: string;
  payload: Record<string, unknown>;
  confidence: number;
  verification_status: "analyst_verified";
  updated_at: string;
};

export function normaliseVerificationPack(input: unknown, now = new Date()): VerificationPack {
  const pack = verificationPackSchema.parse(input);
  const fallback = now.toISOString();
  return {
    ...(pack.title ? { title: { ...pack.title, checkedAt: pack.title.checkedAt ?? fallback } } : {}),
    ...(pack.planning ? { planning: { ...pack.planning, checkedAt: pack.planning.checkedAt ?? fallback } } : {}),
    ...(pack.access ? { access: { ...pack.access, checkedAt: pack.access.checkedAt ?? fallback } } : {}),
  };
}

export function accessSignal(status: VerificationPack["access"] extends infer T ? T extends { status: infer S } ? S : never : never): number {
  if (status === "confirmed") return 85;
  if (status === "partial") return 50;
  if (status === "blocked") return 10;
  return 0;
}

export function buildVerificationEvidence(pack: VerificationPack): VerificationEvidenceRow[] {
  const rows: VerificationEvidenceRow[] = [];
  if (pack.title) rows.push({
    evidence_key: "analyst-verification:title",
    evidence_type: "title_verification",
    title: `Title ${pack.title.titleNumber} verified`,
    summary: `${pack.title.proprietorName}; tenure: ${pack.title.tenure ?? "not recorded"}.`,
    source_reference: pack.title.titleNumber,
    source_url: pack.title.sourceUrl,
    observed_at: pack.title.checkedAt!,
    payload: pack.title,
    confidence: 100,
    verification_status: "analyst_verified",
    updated_at: pack.title.checkedAt!,
  });
  if (pack.planning) rows.push({
    evidence_key: "analyst-verification:planning",
    evidence_type: "planning_verification",
    title: `Planning ${pack.planning.reference} verified`,
    summary: `${pack.planning.status}; implementation: ${pack.planning.implementationStatus}.`,
    source_reference: pack.planning.reference,
    source_url: pack.planning.sourceUrl,
    observed_at: pack.planning.checkedAt!,
    payload: pack.planning,
    confidence: 100,
    verification_status: "analyst_verified",
    updated_at: pack.planning.checkedAt!,
  });
  if (pack.access) rows.push({
    evidence_key: "analyst-verification:access",
    evidence_type: "access_verification",
    title: `Access ${pack.access.status}`,
    summary: pack.access.description,
    source_reference: null,
    source_url: pack.access.sourceUrl,
    observed_at: pack.access.checkedAt!,
    payload: pack.access,
    confidence: 95,
    verification_status: "analyst_verified",
    updated_at: pack.access.checkedAt!,
  });
  return rows;
}

export function applyVerificationPack(opportunity: Opportunity, pack: VerificationPack) {
  const access = pack.access ? accessSignal(pack.access.status) : opportunity.access_signal;
  const evidenceConfidence = Math.min(100, opportunity.evidence_confidence + Object.keys(pack).length * 4);
  const fields = {
    ...(pack.title ? {
      title_number: pack.title.titleNumber,
      proprietor_name: pack.title.proprietorName,
      company_number: pack.title.companyNumber ?? opportunity.company_number ?? null,
    } : {}),
    access_signal: access,
    evidence_confidence: evidenceConfidence,
    raw_evidence: {
      ...(opportunity.raw_evidence ?? {}),
      atlas_verification: {
        ...((opportunity.raw_evidence?.atlas_verification as Record<string, unknown> | undefined) ?? {}),
        ...pack,
      },
    },
  };
  return {
    ...fields,
    opportunity_score: scoreOpportunity({ ...opportunity, ...fields }),
    updated_at: [pack.title?.checkedAt, pack.planning?.checkedAt, pack.access?.checkedAt].filter(Boolean).sort().at(-1),
  };
}
