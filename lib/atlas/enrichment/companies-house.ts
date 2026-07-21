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

export function normaliseCompanyNumber(value: string): string {
  const normalised = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z0-9]{6,8}$/.test(normalised)) throw new Error("Invalid Companies House number");
  return normalised.padStart(8, "0");
}

export async function fetchCompanyProfile(companyNumber: string, options: {
  apiKey?: string;
  fetcher?: typeof fetch;
  now?: Date;
} = {}): Promise<CompanyProfile> {
  const normalised = normaliseCompanyNumber(companyNumber);
  const apiKey = options.apiKey ?? process.env.COMPANIES_HOUSE_API_KEY;
  if (!apiKey) throw new Error("Companies House enrichment is not configured");
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(`https://api.company-information.service.gov.uk/company/${normalised}`, {
    headers: {
      accept: "application/json",
      authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
      "user-agent": "LandOpportunityFinder/0.5",
    },
    cache: "no-store",
  });
  if (response.status === 404) throw new Error("Company was not found at Companies House");
  if (!response.ok) throw new Error(`Companies House API returned ${response.status}`);
  const body = await response.json() as CompaniesHouseResponse;
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
