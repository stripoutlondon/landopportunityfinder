export type AtlasSource = {
  slug: string;
  name: string;
  category: "planning" | "ownership" | "corporate" | "public-assets" | "constraints";
  territory: string;
  refreshCadence: string;
  authority: string;
  status: "configured" | "manual" | "connected";
  description: string;
};

export const hertsmereSources: AtlasSource[] = [
  { slug: "hertsmere-planning", name: "Hertsmere planning applications", category: "planning", territory: "Hertsmere", refreshCadence: "Weekly upload", authority: "Hertsmere Borough Council", status: "manual", description: "Authorised application and decision exports used to identify stalled, refused, withdrawn and nearby precedent signals." },
  { slug: "hertsmere-brownfield", name: "Hertsmere brownfield register", category: "public-assets", territory: "Hertsmere", refreshCadence: "Quarterly check", authority: "Planning Data / Hertsmere Borough Council", status: "connected", description: "Official brownfield entities inside Hertsmere, synchronised from the national Planning Data API." },
  { slug: "hmlr-inspire-hertsmere", name: "HMLR INSPIRE title polygons", category: "ownership", territory: "Hertsmere", refreshCadence: "Monthly", authority: "HM Land Registry", status: "configured", description: "Indicative registered freehold polygon coverage used for parcel matching and gap investigation." },
  { slug: "hmlr-corporate-proprietors", name: "Corporate proprietor data", category: "ownership", territory: "Hertsmere", refreshCadence: "Monthly", authority: "HM Land Registry", status: "configured", description: "Corporate-owned titles enriched against company status and ownership history." },
  { slug: "companies-house", name: "Companies House company status", category: "corporate", territory: "United Kingdom", refreshCadence: "Daily for watched companies", authority: "Companies House", status: "configured", description: "Company status, dissolution and filing signals for corporate proprietors." },
  { slug: "environment-constraints", name: "Planning and environmental constraints", category: "constraints", territory: "Hertsmere", refreshCadence: "Monthly", authority: "Multiple public authorities", status: "configured", description: "Green Belt, flood, heritage and environmental evidence used to reduce false positives." }
];
