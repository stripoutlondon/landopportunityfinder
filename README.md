# Land Opportunity Finder — Project Atlas

Atlas is an evidence-led land and property acquisition intelligence platform. The first operating territory is Hertsmere.

## Release 0.8 capabilities

- Protected verification-evidence ingestion for official title, planning and access research
- HTTPS-only evidence-source validation and repeat-safe evidence updates
- Automatic completion of the matching human verification task
- Verified evidence gates on every Atlas case file
- Candidate status reserved for sites with evidenced title, live planning position, access and initial constraints

Release 0.7 also provides:

- Independent verification scoring across commercial potential, deliverability, acquisition clarity and evidence quality
- Explainable `investigate`, `monitor` and `hold` decisions
- Candidate, screened and lead stages that prevent incomplete research being presented as verified
- Constraint-aware shortlist ranking and decision filters
- Investment committee case file with reasons to progress, risks, unknowns and a next-best action

Release 0.6 also provides:

- Protected Planning Data screening for Green Belt, flood, heritage, trees and environmental designations
- Explicit pending, clear and flagged constraint states without treating missing results as proof of no constraints
- Constraint evidence, penalties and analyst filters integrated into every Hertsmere case file
- Licensed HM Land Registry corporate ownership matching using exact postcode plus explainable address similarity
- Ambiguity protection that holds competing title matches for human review

Release 0.5 also provides:

- Atlas analyst queue with planning-status-check, direct-planning-link, title-gap and evidence-readiness filters
- Planning-age analysis that flags old permissions requiring an implementation or lapse check
- Planning-reference extraction from official source notes
- Evidence-readiness scoring, explicit evidence gaps and ordered human next actions
- Official site-plan and planning-history evidence persisted on subsequent Hertsmere synchronisations
- Protected Companies House company-profile enrichment for future corporate-title leads

Release 0.4 also provides:

- Interactive Hertsmere opportunity map with official OpenStreetMap context
- Developer acquisition filters for patch, planning position, ownership and dwelling capacity
- Explainable research-priority ranking combining source score, capacity, planning position, underuse and ownership classification
- Derived brownfield intelligence for stated capacity, planning position, source links, location and likely site type
- Mobile-ready opportunity explorer and upgraded investigation pages

Release 0.3 also provides:

- Direct official Planning Data brownfield synchronisation for Hertsmere
- National brownfield-field and WKT coordinate normalisation
- Ranked opportunity dashboard and evidence-led investigation workspace
- Evidence timeline and human verification checklist
- Repeat-safe Supabase ingestion with accurate created/updated counts
- Automatic investigations and ownership/planning verification tasks
- Protected CSV and official-data ingestion endpoints
- Transparent opportunity scoring and source registry

## Local development

```bash
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

## Supabase setup

For a new Supabase project, run only:

```text
supabase/000_atlas_foundation.sql
```

For an existing Release 0.2 database, run these in order:

```text
supabase/migrations/003_hertsmere_intelligence.sql
supabase/migrations/004_evidence_upsert_compatibility.sql
```

Set these variables in Vercel:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ATLAS_INGESTION_SECRET`
- `COMPANIES_HOUSE_API_KEY` (required only for protected corporate enrichment)

The service-role and ingestion keys are server-only. Never expose them in browser code, GitHub, screenshots, logs or chat.

## Companies House enrichment

When an Atlas lead has a verified `company_number`, send an authorised `POST` request to:

```text
/api/enrichment/companies-house/<company-number>
```

with `Authorization: Bearer <ATLAS_INGESTION_SECRET>`. Atlas fetches the official company profile using the server-only Companies House key, updates the matched lead and stores traceable evidence. It does not search for or infer a private owner.

## Analyst verification evidence

Send an authorised `POST` request to:

```text
/api/enrichment/verification/<opportunity-id>
```

with one or more `title`, `planning` or `access` sections. Every section requires an HTTPS source URL. Atlas updates the existing lead, stores traceable evidence, recalculates the score and completes the matching verification task. Never use an inferred owner or an unverified mapping observation as verified evidence.

## Indicative Hertsmere constraints sync

Send an authorised `POST` request to:

```text
/api/enrichment/constraints/hertsmere
```

Atlas checks each geocoded Hertsmere lead against official Planning Data point-query datasets, persists the returned evidence and recalculates the constraint penalty. The result is an initial screen only: dataset coverage varies and an empty result is not proof that a site has no constraints.

## Licensed HMLR corporate ownership matching

Send authorised `multipart/form-data` to `POST /api/enrichment/hmlr/corporate` with a `file` containing the account holder's licensed UK corporate ownership CSV. Atlas only writes a match where the postcode is exact and the property-address similarity is strong and unambiguous. Every result still requires a current official title register and plan.

## Official Hertsmere brownfield sync

Send an authorised `POST` request to:

```text
/api/ingestion/hertsmere/sync
```

with `Authorization: Bearer <ATLAS_INGESTION_SECRET>`. Atlas downloads Hertsmere brownfield entities from the official [Planning Data brownfield dataset](https://www.planning.data.gov.uk/dataset/brownfield-land), normalises them, stores evidence, scores each lead and creates verification work.

## Hertsmere CSV ingestion

Send authorised `multipart/form-data` to `POST /api/ingestion/hertsmere` with:

- `source`: `planning` or `brownfield`
- `file`: the source CSV

Rows without a traceable source reference or address are rejected and counted. Re-importing a source record updates the existing opportunity and evidence.

## Legal positioning

Atlas surfaces leads and evidence. It must not label land ownerless or imply a right to enter or occupy it. Unregistered land is not necessarily unowned, and apparent map gaps require formal verification.
