# First findings — September 21, 2026

First findings researches the location the user selects. There is no chosen city, municipality allowlist, or hard-coded zoning rule pack. Individual locations used during verification are test cases only. This replaces the rejected user-input-only reflection and three-question screen.

## What the user receives

- Parcel identifier and mapped area where a usable public polygon is found. The parcel outline is shown separately from the user's blue exploration outline. Multiple parcel matches require a choice.
- Intersecting zoning designations and retrieved municipal-code provisions. Split zoning, incomplete map coverage and differing corner jurisdictions remain explicit blockers to a single site interpretation.
- A conditional Gloo interpretation with source passages, when a parcel, one district and code provisions are available. Source passages are attached by the server from their IDs, not composed by the model.
- Local housing-cost context: ACS 2020–2024 renter cost burden and median gross rent, with geography, period, calculation and available rent margin of error. These are historical area estimates, not site demand or an affordable-rent proposal.
- Consequential gaps, suggested verification steps, publisher/source links, retrieval dates, codification banners and partial-section warnings. Technical request logs are not part of the user journey.

The screen replaces the map workspace. Back to map and Edit priorities preserve the user's work. Public records begin loading after Use this area, while priorities are completed. Available records appear before Gloo finishes; a Gloo failure cannot erase them.

## Connected sources and limits

| Stage | Current provider | Coverage and safeguards |
| --- | --- | --- |
| Geographic lookup | U.S. Census geographic API | U.S. jurisdictions; center and four corners checked. It does not establish global coverage or independently settle legal planning authority. |
| Parcel and zoning | ArcGIS public catalogue and published polygon services | Dynamic discovery using locality names and selection bounds. Government-hosted services or geographically matched, publicly authoritative government organizations are required. Specialized/historic/draft datasets are filtered. Catalogue absence does not prove no records or no zoning. |
| Published provisions | Municode public library | Exact state/client match, current published job, source-linked chapters or bounded search and table-of-contents traversal. Actual section content is retrieved; search snippets are never evidence. Other code publishers are not yet connected. A bounded collection is not an exhaustive legal review. |
| Housing context | Census Reporter distribution of Census ACS | Explicit ACS 2024 five-year release; city geography when available, otherwise county. No inference from imagery or church names. |
| Interpretation | Gloo guarded v2 Responses API | Server-only key, retrieved code passages and unresolved gaps. No native web-search assumption. |

Parcel and zoning polygons are intersected geometrically, including holes and disjoint parts. A nearby bounding box or a zoning feature's internal numeric ID is not a match. Mapping measures are approximate and separate from recorded survey/assessor areas. Owner names and contact information are not requested as findings.

Catalogue and publisher metadata improve provenance but do not guarantee dataset completeness, currency or legal applicability. Government GIS availability varies. Provider failures and unsupported coverage are normal explicit outcomes; do not replace them with model memory. The runtime currently uses U.S. geography and these connected publishers, not worldwide coverage.

## Feasibility boundary

The implemented assessment concerns a preliminary land-use route and its unresolved conditions. It does not verify church ownership, vacant status, authority to act, deed restrictions, legal lot boundaries, frontage classification, utility capacity, environmental clearance, funding or organizational agreement. Existing overlay/historic/contract flags in matched zoning attributes are surfaced, but independent environmental/overlay coverage is not comprehensive.

No home count or financial feasibility is generated. A selected polygon's area alone is insufficient. Reproducible capacity calculations, supported possibilities, the requested structure simulation, and presentation exports remain subsequent work. Do not add a decorative simulation button that pretends these exist.

## Runtime and costs

`POST /api/property-evidence` runs public-record retrieval; `POST /api/first-look` adds Gloo interpretation when eligible. Both require same-origin loopback JSON and validated geometry. Public-source calls have a 12-second per-fetch limit and a 60-second lookup deadline, bounded response sizes, disabled redirects and adapter-owned HTTPS targets. Retrieved sources carry content hashes and timestamps. Successful source responses cache in memory; cases deduplicate and cache for up to 15 minutes, partial cases for 30 seconds. No persistent evidence database exists yet.

Gloo has a 45-second timeout, no automatic paid retries, 3,500 output tokens, identical-request deduplication and 15-minute cache. Limits are four new Gloo calls per minute and 30 per day per process, plus 12 new public-record cases per minute. These reset on restart and are not durable billing controls. Browser request cancellation prevents stale results replacing another step; server work can finish within its existing bounds.

Only input geometry, query and priorities persist in browser storage. Research results and credentials do not. This remains a local development server; public deployment needs authentication and durable quotas.

## Implementation references

- `scripts/records.mjs`: jurisdiction, catalogue, spatial, code and housing retrieval.
- `scripts/evidence-client.mjs`: bounded provider requests and provenance.
- `scripts/site-geometry.mjs`: polygon intersection and mapped area.
- `scripts/gloo.mjs`: guarded interpretation and evidence passage validation.
- `findings.js`, `land.js`, `land.css`: sequential interface and safe text rendering.
- `cheerio@1.2.0` parses code HTML; `polygon-clipping@0.15.7` preserves multipart geometry. Install with `npm ci`.

Official/provider references: [Census geocoder](https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html), [ArcGIS search](https://developers.arcgis.com/rest/users-groups-and-items/search/), [ArcGIS authoritative items](https://doc.arcgis.com/en/arcgis-online/administer/manage-items.htm), [Municode Library](https://library.municode.com/), [Census Reporter API](https://github.com/censusreporter/census-api/blob/master/API.md), [Gloo Responses](https://docs.gloo.com/api-guides/responses). Public library endpoints are subject to publisher changes; failures must remain explicit.
