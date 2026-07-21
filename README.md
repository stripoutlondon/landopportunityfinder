# Land Opportunity Finder — Project Atlas

Atlas is an evidence-led land and property acquisition intelligence platform. The first operating territory is Hertsmere.

## Release 0.2 capabilities

- Ranked opportunity dashboard and investigation pages
- Transparent opportunity scoring
- Source registry for the Hertsmere pilot
- Tolerant planning and brownfield CSV normalisers
- Repeat-safe Supabase ingestion using stable external and evidence keys
- Ingestion-run audit trail with rejection reasons
- One fresh-database Supabase setup file

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

The older files under `supabase/migrations` are retained as historical migrations for databases that already used Release 0.1. Do not run them after the fresh-database setup file.

Set these variables in Vercel:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

The service-role key is server-only and must never be exposed in browser code or committed.

## Hertsmere ingestion API

Send `multipart/form-data` to `POST /api/ingestion/hertsmere` with:

- `source`: `planning` or `brownfield`
- `file`: the source CSV

The normalisers accept common variations of Hertsmere and national brownfield-register headings. Rows without a traceable source reference or address are rejected and counted in the ingestion report. Re-importing the same source record updates the existing opportunity and evidence rather than creating duplicates.

## Legal positioning

Atlas surfaces leads and evidence. It must not label land ownerless or imply a right to enter or occupy it. Unregistered land is not necessarily unowned, and apparent map gaps require formal verification.
