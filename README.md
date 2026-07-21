# Land Opportunity Finder — Project Atlas

Atlas is an evidence-led land and property acquisition intelligence platform. The first operating territory is Hertsmere.

## Release 0.3 capabilities

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

For an existing Release 0.2 database, run:

```text
supabase/migrations/003_hertsmere_intelligence.sql
```

Set these variables in Vercel:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ATLAS_INGESTION_SECRET`

The service-role and ingestion keys are server-only. Never expose them in browser code, GitHub, screenshots, logs or chat.

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
