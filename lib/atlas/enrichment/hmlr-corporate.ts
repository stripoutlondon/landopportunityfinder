export type CorporateOwnershipRecord = {
  titleNumber: string;
  tenure: string | null;
  propertyAddress: string;
  district: string | null;
  postcode: string | null;
  proprietorName: string;
  companyNumber: string | null;
  proprietorAddedAt: string | null;
};

export type OwnershipCandidate = { id: string; name: string; address: string | null; postcode: string | null };
export type OwnershipMatch = { opportunity: OwnershipCandidate; record: CorporateOwnershipRecord; confidence: number };

const canonicalKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

function value(row: Record<string, unknown>, aliases: string[]): string | null {
  const keys = new Map(Object.keys(row).map((key) => [canonicalKey(key), key]));
  for (const alias of aliases) {
    const key = keys.get(canonicalKey(alias));
    if (!key) continue;
    const result = String(row[key] ?? "").trim();
    if (result) return result;
  }
  return null;
}

export function normalisePostcode(postcode: string | null | undefined): string | null {
  const result = postcode?.toUpperCase().replace(/\s+/g, "").trim();
  return result || null;
}

export function parseCorporateOwnershipRecord(row: Record<string, unknown>): CorporateOwnershipRecord | null {
  const titleNumber = value(row, ["Title Number", "TITLE_NO"]);
  const propertyAddress = value(row, ["Property Address", "PROPERTY_ADDRESS"]);
  const proprietorName = value(row, ["Proprietor name (1)", "Proprietor Name", "PROPRIETOR_NAME"]);
  if (!titleNumber || !propertyAddress || !proprietorName) return null;
  return {
    titleNumber,
    tenure: value(row, ["Tenure"]),
    propertyAddress,
    district: value(row, ["District"]),
    postcode: normalisePostcode(value(row, ["Postcode"])),
    proprietorName,
    companyNumber: value(row, ["Company Registration No. (1)", "Company Registration Number", "CO_REG_NO"]),
    proprietorAddedAt: value(row, ["Date Proprietor added", "DATE_PROPRIETOR_ADDED"]),
  };
}

const STOP_WORDS = new Set(["the", "and", "land", "at", "to", "of", "on", "side", "lying", "site", "hertfordshire"]);
function tokens(value: string): Set<string> {
  return new Set(value.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((token) => token.length > 1 && !STOP_WORDS.has(token)));
}

export function addressSimilarity(left: string, right: string): number {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return intersection / union;
}

export function matchCorporateOwnership(
  opportunities: OwnershipCandidate[],
  records: CorporateOwnershipRecord[],
  threshold = 0.55,
): { matched: OwnershipMatch[]; ambiguous: OwnershipCandidate[]; unmatched: OwnershipCandidate[] } {
  const matched: OwnershipMatch[] = [];
  const ambiguous: OwnershipCandidate[] = [];
  const unmatched: OwnershipCandidate[] = [];
  for (const opportunity of opportunities) {
    const postcode = normalisePostcode(opportunity.postcode);
    if (!postcode) { unmatched.push(opportunity); continue; }
    const candidates = records
      .filter((record) => record.postcode === postcode)
      .map((record) => ({ record, confidence: addressSimilarity(`${opportunity.name} ${opportunity.address ?? ""}`, record.propertyAddress) }))
      .filter((candidate) => candidate.confidence >= threshold)
      .sort((a, b) => b.confidence - a.confidence);
    if (!candidates.length) { unmatched.push(opportunity); continue; }
    if (candidates.length > 1 && candidates[0].confidence - candidates[1].confidence < 0.1) { ambiguous.push(opportunity); continue; }
    matched.push({ opportunity, record: candidates[0].record, confidence: Math.round(candidates[0].confidence * 100) });
  }
  return { matched, ambiguous, unmatched };
}
