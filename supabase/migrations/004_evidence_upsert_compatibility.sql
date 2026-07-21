-- Align databases created from the original Atlas migrations with Release 0.3.
-- The original evidence dedupe index was partial, so PostgREST could not use it
-- for ON CONFLICT (opportunity_id, evidence_key).

alter table public.evidence_items
  add column if not exists title text,
  add column if not exists summary text,
  add column if not exists source_reference text,
  add column if not exists updated_at timestamptz not null default now();

update public.evidence_items
set title = coalesce(title, evidence_type, 'Evidence')
where title is null;

alter table public.evidence_items
  alter column title set not null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'evidence_items'
      and column_name = 'source_name'
  ) then
    alter table public.evidence_items alter column source_name drop not null;
  end if;
end $$;

create unique index if not exists evidence_items_opportunity_key_unique
  on public.evidence_items(opportunity_id, evidence_key);

notify pgrst, 'reload schema';
