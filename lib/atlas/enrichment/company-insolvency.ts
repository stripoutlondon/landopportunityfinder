import { normaliseCompanyNumber } from "@/lib/atlas/enrichment/companies-house";

export type InsolvencyPractitioner = {
  name: string;
  role: string | null;
  appointedOn: string | null;
  ceasedToActOn: string | null;
  isActing: boolean;
};

export type InsolvencyCase = {
  caseNumber: string | null;
  type: string;
  dates: Array<{ type: string; date: string }>;
  notes: string[];
  practitioners: InsolvencyPractitioner[];
};

export type CompanyCharge = {
  id: string;
  chargeCode: string | null;
  status: string;
  createdOn: string | null;
  satisfiedOn: string | null;
  personsEntitled: string[];
  classification: string[];
};

export type CompanyInsolvencyIntelligence = {
  companyNumber: string;
  status: string | null;
  cases: InsolvencyCase[];
  activePractitioners: InsolvencyPractitioner[];
  charges: CompanyCharge[];
  outstandingCharges: CompanyCharge[];
  observedAt: string;
  insolvencySourceUrl: string;
  chargesSourceUrl: string;
};

type CompaniesHouseInsolvencyResponse = {
  status?: string;
  cases?: Array<{
    number?: string;
    type?: string;
    dates?: Array<{ type?: string; date?: string }>;
    notes?: string[];
    practitioners?: Array<{
      name?: string;
      role?: string;
      appointed_on?: string;
      ceased_to_act_on?: string;
    }>;
  }>;
};

type CompaniesHouseChargesResponse = {
  items?: Array<{
    id?: string;
    charge_code?: string;
    charge_number?: number;
    status?: string;
    created_on?: string;
    satisfied_on?: string;
    persons_entitled?: Array<{ name?: string }>;
    classification?: Array<{ description?: string }> | { description?: string };
  }>;
};

const companiesHouseHeaders = (apiKey: string) => ({
  accept: "application/json",
  authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
  "user-agent": "LandOpportunityFinder/0.9",
});

async function getCompaniesHouseJson<T>(
  path: string,
  options: { apiKey?: string; fetcher?: typeof fetch },
): Promise<T | null> {
  const apiKey = (options.apiKey ?? process.env.COMPANIES_HOUSE_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("Companies House enrichment is not configured");
  const response = await (options.fetcher ?? fetch)(
    `https://api.company-information.service.gov.uk${path}`,
    { headers: companiesHouseHeaders(apiKey), cache: "no-store" },
  );
  if (response.status === 404) return null;
  const responseText = await response.text();
  if (!response.ok) {
    let detail = "";
    try {
      const body = JSON.parse(responseText) as { error?: string; message?: string };
      detail = body.message ?? body.error ?? "";
    } catch {
      detail = responseText.trim();
    }
    throw new Error(`Companies House API returned ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ""}`);
  }
  return JSON.parse(responseText) as T;
}

export async function fetchCompanyInsolvencyIntelligence(
  companyNumber: string,
  options: { apiKey?: string; fetcher?: typeof fetch; now?: Date } = {},
): Promise<CompanyInsolvencyIntelligence> {
  const normalised = normaliseCompanyNumber(companyNumber);
  const [insolvencyBody, chargesBody] = await Promise.all([
    getCompaniesHouseJson<CompaniesHouseInsolvencyResponse>(
      `/company/${normalised}/insolvency`,
      options,
    ),
    getCompaniesHouseJson<CompaniesHouseChargesResponse>(
      `/company/${normalised}/charges`,
      options,
    ),
  ]);
  const cases: InsolvencyCase[] = (insolvencyBody?.cases ?? [])
    .filter((item) => Boolean(item.type))
    .map((item) => ({
      caseNumber: item.number ?? null,
      type: item.type!,
      dates: (item.dates ?? [])
        .filter((date): date is { type: string; date: string } => Boolean(date.type && date.date))
        .map((date) => ({ type: date.type, date: date.date })),
      notes: (item.notes ?? []).filter(Boolean),
      practitioners: (item.practitioners ?? [])
        .filter((practitioner): practitioner is NonNullable<typeof practitioner> & { name: string } =>
          Boolean(practitioner.name),
        )
        .map((practitioner) => ({
          name: practitioner.name,
          role: practitioner.role ?? null,
          appointedOn: practitioner.appointed_on ?? null,
          ceasedToActOn: practitioner.ceased_to_act_on ?? null,
          isActing: !practitioner.ceased_to_act_on,
        })),
    }));
  const charges: CompanyCharge[] = (chargesBody?.items ?? []).map((item, index) => ({
    id: item.id ?? item.charge_code ?? String(item.charge_number ?? index + 1),
    chargeCode: item.charge_code ?? null,
    status: item.status ?? "unknown",
    createdOn: item.created_on ?? null,
    satisfiedOn: item.satisfied_on ?? null,
    personsEntitled: (item.persons_entitled ?? [])
      .map((person) => person.name?.trim())
      .filter((name): name is string => Boolean(name)),
    classification: (Array.isArray(item.classification)
      ? item.classification
      : item.classification
        ? [item.classification]
        : [])
      .map((entry) => entry.description?.trim())
      .filter((description): description is string => Boolean(description)),
  }));
  const activePractitioners = cases
    .flatMap((item) => item.practitioners)
    .filter((practitioner) => practitioner.isActing);
  const outstandingCharges = charges.filter((charge) =>
    ["outstanding", "part-satisfied"].includes(charge.status),
  );
  const observedAt = (options.now ?? new Date()).toISOString();

  return {
    companyNumber: normalised,
    status: insolvencyBody?.status ?? null,
    cases,
    activePractitioners,
    charges,
    outstandingCharges,
    observedAt,
    insolvencySourceUrl: `https://find-and-update.company-information.service.gov.uk/company/${normalised}/insolvency`,
    chargesSourceUrl: `https://find-and-update.company-information.service.gov.uk/company/${normalised}/charges`,
  };
}

export function companyInsolvencyEvidence(
  intelligence: CompanyInsolvencyIntelligence,
  opportunityId: string,
) {
  const caseTypes = [...new Set(intelligence.cases.map((item) => item.type))];
  const practitionerNames = [...new Set(intelligence.activePractitioners.map((item) => item.name))];
  return {
    opportunity_id: opportunityId,
    evidence_key: `companies-house:${intelligence.companyNumber}:insolvency`,
    evidence_type: "company_insolvency",
    title: `Company ${intelligence.companyNumber} — insolvency case record`,
    summary: `${intelligence.cases.length} case${intelligence.cases.length === 1 ? "" : "s"} (${caseTypes.join(", ") || "type not supplied"}); ${practitionerNames.length} currently acting practitioner${practitionerNames.length === 1 ? "" : "s"}${practitionerNames.length ? `: ${practitionerNames.join(", ")}` : ""}.`,
    source_reference: intelligence.companyNumber,
    source_url: intelligence.insolvencySourceUrl,
    observed_at: intelligence.observedAt,
    payload: intelligence,
    confidence: 100,
    verification_status: "source_verified",
    updated_at: intelligence.observedAt,
  };
}

export function companyChargesEvidence(
  intelligence: CompanyInsolvencyIntelligence,
  opportunityId: string,
) {
  const chargeHolders = [...new Set(intelligence.outstandingCharges.flatMap((item) => item.personsEntitled))];
  return {
    opportunity_id: opportunityId,
    evidence_key: `companies-house:${intelligence.companyNumber}:charges`,
    evidence_type: "company_charges",
    title: `Company ${intelligence.companyNumber} — registered charges`,
    summary: `${intelligence.outstandingCharges.length} outstanding or part-satisfied company charge${intelligence.outstandingCharges.length === 1 ? "" : "s"}${chargeHolders.length ? `; persons entitled: ${chargeHolders.join(", ")}` : ""}. Company-level charges do not prove that a particular title is charged.`,
    source_reference: intelligence.companyNumber,
    source_url: intelligence.chargesSourceUrl,
    observed_at: intelligence.observedAt,
    payload: {
      companyNumber: intelligence.companyNumber,
      charges: intelligence.charges,
      outstandingCharges: intelligence.outstandingCharges,
      observedAt: intelligence.observedAt,
    },
    confidence: 100,
    verification_status: "source_verified",
    updated_at: intelligence.observedAt,
  };
}

export function insolvencyVerificationTasks(
  intelligence: CompanyInsolvencyIntelligence,
  opportunityId: string,
) {
  const practitionerNames = [...new Set(intelligence.activePractitioners.map((item) => item.name))];
  const chargeHolders = [...new Set(intelligence.outstandingCharges.flatMap((item) => item.personsEntitled))];
  return [
    {
      opportunity_id: opportunityId,
      task_type: "insolvency_authority",
      title: "Confirm insolvency practitioner authority",
      instructions: practitionerNames.length
        ? `Confirm that ${practitionerNames.join(", ")} currently has authority to deal with this specific property and identify the correct contact route.`
        : "No currently acting practitioner was returned. Review the latest filings, Gazette notices and official insolvency record to identify the authorised office-holder.",
      status: "open",
      priority: "high",
    },
    {
      opportunity_id: opportunityId,
      task_type: "secured_creditors",
      title: "Reconcile company charges with the property title",
      instructions: chargeHolders.length
        ? `Check whether the title is subject to security benefiting ${chargeHolders.join(", ")} and establish whether lender consent is required.`
        : "No outstanding company charge was returned, but the current official title register must still be checked for registered charges and restrictions.",
      status: "open",
      priority: "high",
    },
    {
      opportunity_id: opportunityId,
      task_type: "insolvency_asset",
      title: "Confirm the property remains an insolvency asset",
      instructions: "Obtain the current title register and confirm the property remains owned by the company, has not been sold, disclaimed or transferred, and is within the office-holder's control.",
      status: "open",
      priority: "high",
    },
  ];
}
