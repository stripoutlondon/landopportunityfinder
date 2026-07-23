import { timingSafeEqual } from "node:crypto";

export function authorizePropertyIdentity(request: Request) {
  const secret = process.env.PROPERTY_IDENTITY_API_KEY;
  if (!secret) {
    return { ok: false as const, status: 503, error: "Property Identity adapter is not configured" };
  }
  const header = request.headers.get("authorization");
  const supplied = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  if (
    expectedBuffer.length !== suppliedBuffer.length ||
    !timingSafeEqual(expectedBuffer, suppliedBuffer)
  ) {
    return { ok: false as const, status: 401, error: "Invalid adapter credentials" };
  }
  return { ok: true as const };
}

export function scorePropertyIdentityMatch(input: {
  requestedAddress: string;
  requestedPostcode?: string;
  candidateAddress?: string | null;
  candidatePostcode?: string | null;
  evidenceConfidence?: number | null;
  titleNumber?: string | null;
  companyNumber?: string | null;
}) {
  const requestedPostcode = normalizePostcode(input.requestedPostcode);
  const candidatePostcode = normalizePostcode(input.candidatePostcode);
  const addressSimilarity = tokenSimilarity(
    input.requestedAddress,
    input.candidateAddress ?? "",
  );
  let score = Math.round(addressSimilarity * 65);
  if (requestedPostcode && requestedPostcode === candidatePostcode) {
    score += 25;
  }
  if (input.titleNumber) {
    score += 4;
  }
  if (input.companyNumber) {
    score += 3;
  }
  score += Math.round(Math.max(0, Math.min(100, input.evidenceConfidence ?? 0)) * 0.03);
  return Math.max(0, Math.min(100, score));
}

function tokenSimilarity(left: string, right: string) {
  const leftTokens = new Set(tokens(left));
  const rightTokens = new Set(tokens(right));
  if (!leftTokens.size || !rightTokens.size) {
    return 0;
  }
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return overlap / new Set([...leftTokens, ...rightTokens]).size;
}

function tokens(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function normalizePostcode(value?: string | null) {
  return value?.toUpperCase().replace(/\s+/g, "") ?? "";
}
