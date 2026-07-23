export type GridPoint = [easting: number, northing: number];

export type InspireParcel = {
  inspireId: string;
  label: string | null;
  nationalCadastralReference: string | null;
  validFrom: string | null;
  rings: GridPoint[][];
};

export type InspireCandidate = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

export type ProjectedCandidate = InspireCandidate & {
  easting: number;
  northing: number;
};

export type InspireParcelSummary = {
  inspireId: string;
  label: string | null;
  nationalCadastralReference: string | null;
  validFrom: string | null;
  areaSqm: number;
};

export type InspireCandidateMatch = {
  opportunityId: string;
  matches: InspireParcelSummary[];
};

function decodeXml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function tagValue(fragment: string, localName: string): string | null {
  const pattern = new RegExp(`<(?:[A-Za-z0-9_-]+:)?${localName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_-]+:)?${localName}>`, "i");
  const match = fragment.match(pattern);
  return match ? decodeXml(match[1].trim()) : null;
}

export function parseCoordinateList(value: string): GridPoint[] {
  const numbers = value.trim().split(/\s+/).map(Number);
  if (numbers.length < 6 || numbers.length % 2 !== 0 || numbers.some((number) => !Number.isFinite(number))) {
    throw new Error("Invalid INSPIRE polygon coordinates");
  }
  const points: GridPoint[] = [];
  for (let index = 0; index < numbers.length; index += 2) {
    points.push([numbers[index], numbers[index + 1]]);
  }
  return points;
}

export function parseInspireMember(fragment: string): InspireParcel | null {
  const inspireId = tagValue(fragment, "INSPIREID");
  if (!inspireId) return null;
  const rings = [...fragment.matchAll(/<(?:[A-Za-z0-9_-]+:)?posList(?:\s[^>]*)?>([\s\S]*?)<\/(?:[A-Za-z0-9_-]+:)?posList>/gi)]
    .map((match) => parseCoordinateList(match[1]));
  if (!rings.length) return null;
  return {
    inspireId,
    label: tagValue(fragment, "LABEL"),
    nationalCadastralReference: tagValue(fragment, "NATIONALCADASTRALREFERENCE"),
    validFrom: tagValue(fragment, "VALIDFROM"),
    rings,
  };
}

export function pointInRing(point: GridPoint, ring: GridPoint[]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x, y] = ring[index];
    const [previousX, previousY] = ring[previous];
    const crosses = (y > point[1]) !== (previousY > point[1])
      && point[0] < ((previousX - x) * (point[1] - y)) / (previousY - y) + x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function pointInParcel(point: GridPoint, parcel: InspireParcel): boolean {
  if (!pointInRing(point, parcel.rings[0])) return false;
  return !parcel.rings.slice(1).some((hole) => pointInRing(point, hole));
}

export function ringAreaSqm(ring: GridPoint[]): number {
  let area = 0;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    area += ring[previous][0] * ring[index][1] - ring[index][0] * ring[previous][1];
  }
  return Math.abs(area / 2);
}

export function parcelAreaSqm(parcel: InspireParcel): number {
  return Math.max(0, ringAreaSqm(parcel.rings[0]) - parcel.rings.slice(1).reduce((sum, ring) => sum + ringAreaSqm(ring), 0));
}

export function matchProjectedCandidates(
  candidates: ProjectedCandidate[],
  parcels: InspireParcel[],
): InspireCandidateMatch[] {
  return candidates.map((candidate) => ({
    opportunityId: candidate.id,
    matches: parcels
      .filter((parcel) => pointInParcel([candidate.easting, candidate.northing], parcel))
      .map((parcel) => ({
        inspireId: parcel.inspireId,
        label: parcel.label,
        nationalCadastralReference: parcel.nationalCadastralReference,
        validFrom: parcel.validFrom,
        areaSqm: Math.round(parcelAreaSqm(parcel)),
      }))
      .sort((left, right) => left.areaSqm - right.areaSqm),
  }));
}

export function extractGmlMembers(buffer: string): { members: string[]; remainder: string } {
  const members: string[] = [];
  const endTag = "</wfs:member>";
  let cursor = 0;
  while (true) {
    const start = buffer.indexOf("<wfs:member", cursor);
    if (start === -1) return { members, remainder: buffer.slice(Math.max(0, buffer.length - 128)) };
    const end = buffer.indexOf(endTag, start);
    if (end === -1) return { members, remainder: buffer.slice(start) };
    members.push(buffer.slice(start, end + endTag.length));
    cursor = end + endTag.length;
  }
}

export const INSPIRE_DISCLAIMER = "Indicative HM Land Registry INSPIRE Index Polygon spatial match only. It is not a legal boundary, does not prove ownership and must be checked against the current title register and title plan.";
