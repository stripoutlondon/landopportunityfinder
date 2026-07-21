create extension if not exists pgcrypto;
create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  locality text,
  postcode text,
  latitude double precision,
  longitude double precision,
  area_sqm numeric,
  source_type text not null default 'manual',
  source_reference text,
  ownership_status text,
  proprietor_name text,
  company_number text,
  company_status text,
  title_number text,
  vacancy_signal integer not null default 0 check (vacancy_signal between 0 and 100),
  planning_signal integer not null default 0 check (planning_signal between 0 and 100),
  access_signal integer not null default 0 check (access_signal between 0 and 100),
  assembly_signal integer not null default 0 check (assembly_signal between 0 and 100),
  constraint_penalty integer not null default 0 check (constraint_penalty between 0 and 100),
  evidence_confidence integer not null default 50 check (evidence_confidence between 0 and 100),
  opportunity_score integer not null default 0 check (opportunity_score between 0 and 100),
  acquisition_route text,
  rationale text,
  status text not null default 'new',
  raw_evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists opportunities_score_idx on public.opportunities(opportunity_score desc);
create index if not exists opportunities_company_idx on public.opportunities(company_number);
create index if not exists opportunities_title_idx on public.opportunities(title_number);
create table if not exists public.evidence_items (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  evidence_type text not null,
  source_name text not null,
  source_url text,
  observed_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  confidence integer not null default 50 check (confidence between 0 and 100),
  created_at timestamptz not null default now()
);
alter table public.opportunities enable row level security;
alter table public.evidence_items enable row level security;
