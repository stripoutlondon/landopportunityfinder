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

alter table public.evidence_items
  add column if not exists source_id uuid references public.data_sources(id) on delete set null,
  add column if not exists evidence_key text,
  add column if not exists verification_status text not null default 'unverified',
  add column if not exists valid_from timestamptz,
  add column if not exists valid_to timestamptz,
  add column if not exists supersedes_id uuid references public.evidence_items(id) on delete set null;

create unique index if not exists evidence_items_dedupe_idx
  on public.evidence_items(opportunity_id, evidence_key)
  where evidence_key is not null;

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
  created_at timestamptz not null default now()
);

create index if not exists relationships_subject_idx on public.relationships(subject_type, subject_id);
create index if not exists relationships_object_idx on public.relationships(object_type, object_id);

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
on conflict (slug) do nothing;

alter table public.territories enable row level security;
alter table public.data_sources enable row level security;
alter table public.ingestion_runs enable row level security;
alter table public.relationships enable row level security;
alter table public.investigations enable row level security;
alter table public.verification_tasks enable row level security;
alter table public.opportunity_outcomes enable row level security;
