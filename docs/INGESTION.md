# Hertsmere ingestion

Atlas treats imported records as evidence, not verified acquisition opportunities.

## Pipeline

`CSV → source normaliser → stable lead key → opportunity score → Supabase upsert → evidence upsert → ingestion audit`

Planning keys are based on the planning reference. Brownfield keys are based on the register site reference. Evidence has a second stable key scoped to the opportunity, making repeated imports safe.

The import response reports records seen, accepted, rejected, opportunities upserted, evidence upserted and grouped rejection reasons.

British National Grid eastings and northings are retained in raw evidence but are not mislabelled as WGS84 longitude and latitude. Coordinate conversion should be introduced as a separate, tested geospatial step.
