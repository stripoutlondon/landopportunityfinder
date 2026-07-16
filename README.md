# Land Opportunity Finder - Project Atlas

A deployable Next.js and Supabase foundation for an evidence-led land and property acquisition intelligence platform. The first operating territory is Hertsmere.

## Release 0.1 capabilities

- Ranked opportunity dashboard and investigation pages
- Transparent scoring API
- CSV opportunity ingestion
- Atlas source registry
- Supabase schema for territories, sources, ingestion runs, evidence, relationships, investigations, verification tasks and outcomes
- Demo records that are clearly labelled as demonstrations

## Local development

```bash
cp .env.example .env.local
npm install
npm run build
npm run dev
```

## Supabase setup

Run these migrations in order in the Supabase SQL editor:

1. `supabase/migrations/001_initial.sql`
2. `supabase/migrations/002_atlas_core.sql`

Set the following environment variables in Vercel:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Never expose the service-role key in browser code or commit it to GitHub.

## API

- `GET /api/sources` - configured Hertsmere source registry
- `POST /api/opportunities/score` - deterministic, explainable score
- `POST /api/opportunities/import` - multipart CSV import using field name `file`

## Documentation

- `docs/VISION.md`
- `docs/ARCHITECTURE.md`
- `docs/ROADMAP.md`

## Legal positioning

The product surfaces leads and evidence. It must not label land ownerless or imply a right to enter or occupy it. Unregistered is not the same as unowned, and apparent map gaps require formal verification.
