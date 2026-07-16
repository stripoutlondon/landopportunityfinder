# Atlas Core Architecture

Atlas follows a simple intelligence loop:

`discover -> remember -> reason -> recommend -> learn`

## Core domains

- **Territories** define geographic acquisition patches.
- **Sources** describe each upstream dataset and refresh policy.
- **Ingestion runs** record every attempt to collect or import data.
- **Assets** represent land, buildings or candidate parcels.
- **Evidence** stores atomic, sourced observations.
- **Relationships** connect assets, companies, planning records and neighbouring sites.
- **Opportunities** are hypotheses generated from accumulated evidence.
- **Investigations** are human research case files.
- **Verification tasks** capture the next evidence-gathering action.
- **Outcomes** record what happened and create the learning loop.

## Trust model

Atlas does not call land ownerless, abandoned or available without verified evidence. Every automated finding carries provenance, confidence and verification state.
