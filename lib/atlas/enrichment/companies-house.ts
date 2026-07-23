export type CompanyProfile = {
  companyNumber: string;
  companyName: string;
  companyStatus: string;
  companyType: string | null;
  jurisdiction: string | null;
  incorporatedOn: string | null;
  hasCharges: boolean;
  hasInsolvencyHistory: boolean;
  registeredOffice: Record<string, string> | null;
  sourceUrl: string;
  observedAt: string;
};

export type CompanyOpportunity = {
  id: string;
  company_number: string | null;
  proprietor_name?: string | null;
};

type CompaniesHouseResponse = {
  company_number?: string;
  company_name?: string;
  company_status?: string;
  type?: string;
  jurisdiction?: string;
  date_of_creation?: string;
  has_charges?: boolean;
  has_insolvency_history?: boolean;
  registered_office_address?: Record<string, string>;
};

type CompaniesHouseSearchResponse = {
  items?: Array<{
    company_number?: string;
    title?: string;
  }>;
};

export type CorporateStatusSignal =
  | "active"
  | "insolvency"
  | "dissolved"
  | "unmatched"
  | "other"
  | "pending";

export class CompanyNotFoundError extends Error {
  constructor() {
    super("Company was not found at Companies House");
    this.name = "CompanyNotFoundError";
  }
}

const canonicalCompanyName = (value: string) => value
  .toUpperCase()
  .replace(/\bLTD\b/g, "LIMITED")
  .replace(/&/g, "AND")
  .replace(/[^A-Z0-9]/g, "");

const companiesHouseHeaders = (apiKey: string) => ({
  accept: "application/json",
  authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
  "user-agent": "LandOpportunityFinder/0.8",
});

export function normaliseCompanyNumber(value: string): string {
  const normalised = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z0-9]{6,8}$/.test(normalised)) throw new Error("Invalid Companies House number");
  return normalised.padStart(8, "0");
}

export function groupOpportunitiesByCompany(
  opportunities: CompanyOpportunity[],
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const opportunity of opportunities) {
    if (!opportunity.company_number) continue;
    try {
      const companyNumber = normaliseCompanyNumber(opportunity.company_number);
      grouped.set(companyNumber, [...(grouped.get(companyNumber) ?? []), opportunity.id]);
    } catch {
      // Invalid source values remain available for human review but are never
      // submitted to Companies House.
    }
  }
  return grouped;
}

export function isDissolvedCompanyStatus(status: string): boolean {
  return ["dissolved", "converted-closed", "closed"].includes(status.toLowerCase());
}

export function isInsolvencyCompanyStatus(status: string): boolean {
  const value = status.toLowerCase();
  return [
    "liquidation",
    "administration",
    "receivership",
    "voluntary-arrangement",
    "insolvency-proceedings",
  ].some((signal) => value.includes(signal));
}

export function classifyCompanyStatus(status: string | null | undefined): CorporateStatusSignal {
  if (!status) return "pending";
  if (status.toLowerCase() === "not-found") return "unmatched";
  if (isDissolvedCompanyStatus(status)) return "dissolved";
  if (isInsolvencyCompanyStatus(status)) return "insolvency";
  if (status.toLowerCase() === "active") return "active";
  return "other";
}

export function companyProfileEvidence(profile: CompanyProfile, opportunityId: string) {
  return {
    opportunity_id: opportunityId,
    evidence_key: `companies-house:${profile.companyNumber}:profile`,
    evidence_type: "company_profile",
    title: `${profile.companyName} — Companies House profile`,
    summary: `Company status: ${profile.companyStatus}; charges recorded: ${profile.hasCharges ? "yes" : "no"}; insolvency history flag: ${profile.hasInsolvencyHistory ? "yes" : "no"}.`,
    source_reference: profile.companyNumber,
    source_url: profile.sourceUrl,
    observed_at: profile.observedAt,
    payload: profile,
    confidence: 100,
    verification_status: "source_verified",
    updated_at: profile.observedAt,
  };
}

export function companyLookupGapEvidence(
  companyNumber: string,
  proprietorName: string | null,
  opportunityId: string,
  observedAt = new Date().toISOString(),
) {
  return {
    opportunity_id: opportunityId,
    evidence_key: `companies-house:${companyNumber}:not-found`,
    evidence_type: "company_lookup_gap",
    title: `${proprietorName ?? companyNumber} — Companies House record not matched`,
    summary: `No company profile was found for ${companyNumber}, including an exact-name fallback search${proprietorName ? ` for ${proprietorName}` : ""}. Verify the company identifier against the current official title register.`,
    source_reference: companyNumber,
    source_url: `https://find-and-update.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(proprietorName ?? companyNumber)}`,
    observed_at: observedAt,
    payload: { companyNumber, proprietorName, matchStatus: "not-found" },
    confidence: 100,
    verification_status: "source_verified",
    updated_at: observedAt,
  };
}

export async function fetchCompanyProfile(companyNumber: string, options: {
  apiKey?: string;
  fetcher?: typeof fetch;
  now?: Date;
} = {}): Promise<CompanyProfile> {
  const normalised = normaliseCompanyNumber(companyNumber);
  const apiKey = (options.apiKey ?? process.env.COMPANIES_HOUSE_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("Companies House enrichment is not configured");
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(`https://api.company-information.service.gov.uk/company/${normalised}`, {
    headers: companiesHouseHeaders(apiKey),
    cache: "no-store",
  });
  const responseText = await response.text();
  if (response.status === 404) throw new CompanyNotFoundError();
  if (!response.ok) {
    let detail = "";
    try {
      const errorBody = JSON.parse(responseText) as { error?: string; message?: string };
      detail = errorBody.message ?? errorBody.error ?? "";
    } catch {
      detail = responseText.trim();
    }
    throw new Error(`Companies House API returned ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ""}`);
  }
  const body = JSON.parse(responseText) as CompaniesHouseResponse;
  if (!body.company_number || !body.company_name || !body.company_status) throw new Error("Companies House returned an incomplete company profile");
  return {
    companyNumber: normaliseCompanyNumber(body.company_number),
    companyName: body.company_name,
    companyStatus: body.company_status,
    companyType: body.type ?? null,
    jurisdiction: body.jurisdiction ?? null,
    incorporatedOn: body.date_of_creation ?? null,
    hasCharges: Boolean(body.has_charges),
    hasInsolvencyHistory: Boolean(body.has_insolvency_history),
    registeredOffice: body.registered_office_address ?? null,
    sourceUrl: `https://find-and-update.company-information.service.gov.uk/company/${normalised}`,
    observedAt: (options.now ?? new Date()).toISOString(),
  };
}

export async function findCompanyProfileByExactName(companyName: string, options: {
  apiKey?: string;
  fetcher?: typeof fetch;
  now?: Date;
} = {}): Promise<CompanyProfile | null> {
  const apiKey = (options.apiKey ?? process.env.COMPANIES_HOUSE_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("Companies House enrichment is not configured");
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(
    `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(companyName)}&items_per_page=20`,
    { headers: companiesHouseHeaders(apiKey), cache: "no-store" },
  );
  if (!response.ok) throw new Error(`Companies House search returned ${response.status}`);
  const body = await response.json() as CompaniesHouseSearchResponse;
  const expected = canonicalCompanyName(companyName);
  const matches = (body.items ?? []).filter((item) =>
    item.company_number
    && item.title
    && canonicalCompanyName(item.title) === expected,
  );
  if (matches.length !== 1 || !matches[0].company_number) return null;
  return fetchCompanyProfile(matches[0].company_number, options);
}
