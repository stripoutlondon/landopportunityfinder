# Atlas data-access setup

## Companies House

1. Register or sign in at the [Companies House developer hub](https://developer.company-information.service.gov.uk/get-started).
2. Create a live application for Land Opportunity Finder.
3. From the application overview, select **Create new key**.
4. Select the ordinary **API key** client type, not a stream key or OAuth client.
5. Save the generated key in Vercel as `COMPANIES_HOUSE_API_KEY` for Production and Preview.
6. Redeploy after saving the variable.

Do not put the key in GitHub, browser code, screenshots, logs or chat.

## HM Land Registry dataset API

1. Sign in to Use land and property data.
2. Accept the licences for every dataset Atlas will access.
3. Save the account API key in Vercel as `HMLR_DATA_API_KEY` for Production and Preview.
4. Never use a `NEXT_PUBLIC_` prefix or expose the key in browser code.

The API key provides dataset metadata and secure download links. It does not
make a national 1.5 GB uncompressed CCOD file suitable for a Vercel request.
Use `scripts/prepare-hmlr-data.ps1` to create a district-only CSV locally and
`scripts/import-hmlr-ccod.ps1` to send the smaller licensed subset to Atlas.

The preparation step also validates and extracts the Hertsmere INSPIRE GML,
records its polygon count, coordinate reference system and SHA-256 digest, and
keeps all generated licensed files under the Git-ignored `work/` directory.

Run `scripts/import-hmlr-inspire.ps1` against the extracted GML after the
corresponding Atlas deployment is live. The script keeps the source geometry
local, retrieves the small set of geocoded Atlas candidates through a protected
endpoint, and uploads only match identifiers, areas, provenance and ambiguity
status. The source SHA-256 digest is stored with the run so results can be
traced back to the exact monthly file.

## HM Land Registry bulk data

1. Create an account at [Use land and property data](https://use-land-property-data.service.gov.uk/).
2. Accept the applicable licence terms.
3. Download **UK companies that own property in England and Wales**. This is the dataset formerly known as CCOD.
4. Download Hertsmere's monthly **INSPIRE Index Polygons** GML file.
5. Keep the original files unchanged. Atlas imports from working copies so the source can be audited.

The corporate-ownership dataset is useful only for corporate proprietors. It does not establish ownership of privately held titles and does not replace a current title register and title plan.

## Selected title verification

For the strongest Atlas leads, use the official [Search for land and property information](https://www.gov.uk/search-property-information-land-registry) service:

1. Search by map where the site does not have a normal postal address.
2. Download the title register and title plan.
3. Read them together.
4. Record the title number, proprietor and source URL in the protected Atlas verification endpoint.

Online copies are suitable for research but are not official proof of ownership. Obtain official copies and professional legal advice when required.

## Never treat these as proof

- an INSPIRE polygon gap
- an address match by itself
- an old brownfield-register ownership description
- Companies House company status without a matched title
- an empty online search result
- physical occupation or an abandoned appearance
