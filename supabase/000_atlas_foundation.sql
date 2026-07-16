-- Project Atlas fresh-database foundation.
-- Run once in a new Supabase project. Future schema changes should use numbered migrations.

create extension if not exists pgcrypto;

create table if not exists public.territories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  authority_name text,
  country_code text not null default 'GB-ENG',
  status text not null default 'pilot',
  boundary_geojson jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.data_sources (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid references public.territories(id) on delete set null,
  slug text not null unique,
  name text not null,
  category text not null,
  authority text,
  source_url text,
  licence text,
  refresh_cadence text,
  status text not null default 'configured',
  trust_score integer not null default 70 check (trust_score between 0 and 100),
  configuration jsonb not null default '{}'::jsonb,
  last_success_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid references public.territories(id) on delete set null,
  external_key text not null unique,
  name text not null,
  address text,
  locality text,
  postcode text,
  latitude double precision,
  longitude double precision,
  area_sqm numeric,
  source_type text not null,
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
  status text not null default 'lead',
  raw_evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists opportunities_score_idx on public.opportunities(opportunity_score desc);
create index if not exists opportunities_postcode_idx on public.opportunities(postcode);
create index if not exists opportunities_company_idx on public.opportunities(company_number);
create index if not exists opportunities_title_idx on public.opportunities(title_number);

create table if not exists public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.data_sources(id) on delete cascade,
  status text not null default 'queued',
  started_at timestamptz,
  completed_at timestamptz,
  records_seen integer not null default 0,
  records_created integer not null default 0,
  records_updated integer not null default 0,
  records_rejected integer not null default 0,
  error_summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.evidence_items (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  source_id uuid references public.data_sources(id) on delete set null,
  evidence_key text not null,
  evidence_type text not null,
  title text not null,
  summary text,
  source_reference text,
  source_url text,
  observed_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  confidence integer not null default 50 check (confidence between 0 and 100),
  verification_status text not null default 'unverified',
  valid_from timestamptz,
  valid_to timestamptz,
  supersedes_id uuid references public.evidence_items(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id, evidence_key)
);

create table if not exists public.relationships (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid references public.territories(id) on delete set null,
  subject_type text not null,
  subject_id text not null,
  predicate text not null,
  object_type text not null,
  object_id text not null,
  evidence_item_id uuid references public.evidence_items(id) on delete set null,
  confidence integer not null default 50 check (confidence between 0 and 100),
  valid_from timestamptz,
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  unique (subject_type, subject_id, predicate, object_type, object_id)
);

create table if not exists public.investigations (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  status text not null default 'open',
  priority text not null default 'normal',
  thesis text,
  analyst_summary text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.verification_tasks (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  investigation_id uuid references public.investigations(id) on delete cascade,
  task_type text not null,
  title text not null,
  instructions text,
  status text not null default 'open',
  priority text not null default 'normal',
  due_at timestamptz,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.opportunity_outcomes (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  outcome_type text not null,
  outcome_reason text,
  value_estimate numeric,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.territories (name, slug, authority_name, status)
values ('Hertsmere', 'hertsmere', 'Hertsmere Borough Council', 'pilot')
on conflict (slug) do update set authority_name = excluded.authority_name;

insert into public.data_sources (territory_id, slug, name, category, authority, refresh_cadence, status, trust_score)
select t.id, source.slug, source.name, source.category, source.authority, source.refresh_cadence, 'configured', source.trust_score
from public.territories t
cross join (values
  ('hertsmere-planning', 'Hertsmere planning applications', 'planning', 'Hertsmere Borough Council', 'daily', 85),
  ('hertsmere-brownfield', 'Hertsmere brownfield register', 'public-assets', 'Hertsmere Borough Council', 'quarterly', 95)
) as source(slug, name, category, authority, refresh_cadence, trust_score)
where t.slug = 'hertsmere'
on conflict (slug) do update set name = excluded.name, authority = excluded.authority, refresh_cadence = excluded.refresh_cadence;

alter table public.territories enable row level security;
alter table public.data_sources enable row level security;
alter table public.opportunities enable row level security;
alter table public.ingestion_runs enable row level security;
alter table public.evidence_items enable row level security;
alter table public.relationships enable row level security;
alter table public.investigations enable row level security;
alter table public.verification_tasks enable row level security;
alter table public.opportunity_outcomes enable row level security;

-- Atlas currently accesses these tables only through server routes using the service-role key.
-- Do not expose that key to browser code. Add user-facing RLS policies when authentication is introduced.
