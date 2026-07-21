-- Secure, repeat-safe Hertsmere intelligence ingestion.

create unique index if not exists investigations_opportunity_unique
  on public.investigations(opportunity_id);

create unique index if not exists verification_tasks_opportunity_type_unique
  on public.verification_tasks(opportunity_id, task_type);

update public.data_sources
set source_url = 'https://www.planning.data.gov.uk/dataset/brownfield-land',
    licence = 'Open Government Licence v3.0',
    configuration = jsonb_build_object(
      'provider', 'Planning Data',
      'dataset', 'brownfield-land',
      'geometry_entity', '626169',
      'geometry_relation', 'within'
    ),
    status = 'configured',
    updated_at = now()
where slug = 'hertsmere-brownfield';

update public.data_sources
set source_url = 'https://www.hertsmere.gov.uk/planning-building-control/planning-applications/weekly-planning-application-lists',
    licence = 'Council website terms apply',
    configuration = jsonb_build_object('mode', 'authorised_csv_upload'),
    status = 'configured',
    updated_at = now()
where slug = 'hertsmere-planning';
