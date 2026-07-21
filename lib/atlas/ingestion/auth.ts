import { timingSafeEqual } from "node:crypto";

export function authorizeIngestion(request: Request): { ok: true } | { ok: false; status: number; error: string } {
  const secret = process.env.ATLAS_INGESTION_SECRET;
  if (!secret) return { ok: false, status: 503, error: "Atlas ingestion is not configured" };
  const header = request.headers.get("authorization");
  const supplied = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  if (expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) {
    return { ok: false, status: 401, error: "Invalid ingestion credentials" };
  }
  return { ok: true };
}
