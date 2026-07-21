import type { AtlasRawRecord } from "./types";

const canonical = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

export function readField(record: AtlasRawRecord, aliases: string[]): string | null {
  const keys = new Map(Object.keys(record).map((key) => [canonical(key), key]));
  for (const alias of aliases) {
    const key = keys.get(canonical(alias));
    if (!key) continue;
    const value = record[key];
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

export function readNumber(record: AtlasRawRecord, aliases: string[]): number | null {
  const value = readField(record, aliases);
  if (!value) return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function plausibleCoordinate(value: number | null, axis: "latitude" | "longitude"): number | null {
  if (value === null) return null;
  if (axis === "latitude" && value >= 49 && value <= 61) return value;
  if (axis === "longitude" && value >= -9 && value <= 3) return value;
  return null;
}

export function parseWktPoint(value: string | null): { latitude: number; longitude: number } | null {
  if (!value) return null;
  const match = value.trim().match(/^POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/i);
  if (!match) return null;
  const longitude = plausibleCoordinate(Number(match[1]), "longitude");
  const latitude = plausibleCoordinate(Number(match[2]), "latitude");
  return latitude === null || longitude === null ? null : { latitude, longitude };
}

export function normalisePostcode(value: string | null): string | null {
  if (!value) return null;
  const compact = value.toUpperCase().replace(/\s+/g, "");
  return compact.length > 3 ? `${compact.slice(0, -3)} ${compact.slice(-3)}` : compact;
}

export function postcodeFromText(value: string | null): string | null {
  if (!value) return null;
  const match = value.toUpperCase().match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/);
  return match ? normalisePostcode(match[1]) : null;
}

export function stableKey(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
