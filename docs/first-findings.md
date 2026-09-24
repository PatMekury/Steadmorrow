# First findings — September 21, 2026

First findings uses a Gloo tool-using agent to research the location the user selects. See [agent implementation](gloo-agent.md) for the control loop and Studio distinction. There is no chosen city, municipality allowlist, or hard-coded zoning rule pack. Individual locations used during verification are test cases only. This replaces the rejected user-input-only reflection and three-question screen.

## What the user receives

- Parcel identifier and mapped area where a usable public polygon is found. The parcel outline is shown separately from the user's blue exploration outline. Multiple parcel matches require a choice.
- Intersecting zoning designations and retrieved municipal-code provisions. Split zoning, incomplete map coverage and differing corner jurisdictions remain explicit blockers to a single site interpretation.
- A conditional Gloo interpretation of retrieved provisions, with an explicit scope: matched-site when the parcel and planning system are established, or local-rules when site applicability remains unresolved. Missing parcel or zoning data no longer discards useful local provisions. Ambiguous parcel choices and uncertain jurisdiction still pause interpretation. Source passages are attached by the server from their IDs, not composed by the model.
- Local housing-cost context: ACS 2020–2024 renter cost burden and median gross rent, with geography, period, calculation and available rent margin of error. These are historical area estimates, not site demand or an affordable-rent proposal.
- Consequential gaps, suggested verification steps, publisher/source links, retrieval dates, codification banners and partial-section warnings. Technical request logs are not part of the user journey.

The screen replaces the map workspace. Back to map and Edit priorities preserve the user's work. See first findings starts one Gloo research run after priorities are entered. Real tool-stage progress is streamed to the interface. A failure retains evidence already acquired during that run.

## Connected sources and limits

| Stage | Current provider | Coverage and safeguards |
| --- | --- | --- |
| Geographic lookup | U.S. Census geographic API | U.S. jurisdictions; center and four corners checked. It does not establish global coverage or independently settle legal planning authority. |
| Parcel and zoning | ArcGIS public catalogue and published polygon services | Dynamic discovery using locality names and selection bounds. Government-hosted services, narrowly verified government-provider endpoints on other domains, or geographically matched, publicly authoritative government organizations are required. Full catalogue-item metadata is fetched when search summaries omit publisher information. Duplicate service URLs are removed. Specialized/historic/draft datasets are filtered. Catalogue absence does not prove no records or no zoning. |
| Planning-system context | Official municipality website from the exact Municode client | Bounded traversal of published navigation. A no-zoning classification requires an explicit official statement naming the municipality; an empty zoning query never establishes it. Relevant published code links are retained. |
| Published provisions | Municode public library | Exact state/client match, current published job, source-linked chapters or bounded search and table-of-contents traversal. Official links into individual sections are resolved to their actual chapter ancestors when labelled as chapter links. Housing-related provisions are prioritized across chapters; generic parking-enforcement sections are excluded. Actual section content is retrieved; search snippets are never evidence. Other code publishers are not yet connected. A bounded collection is not an exhaustive legal review. |
| Housing context | Census Reporter distribution of Census ACS | Explicit ACS 2024 five-year release; city geography when available, otherwise county. No inference from imagery or church names. |
| Interpretation | Gloo guarded v2 Responses API | Server-only key, retrieved code passages and unresolved gaps. No native web-search assumption. |

Parcel and zoning polygons are intersected geometrically, including holes and disjoint parts. A nearby bounding box or a zoning feature's internal numeric ID is not a match. Mapping measures are approximate and separate from recorded survey/assessor areas. Owner names and contact information are not requested as findings.

Catalogue and publisher metadata improve provenance but do not guarantee dataset completeness, currency or legal applicability. Government GIS availability varies. Parcel source failures, unsupported sources/record formats and completed queries with no usable match have distinct statuses. A failed corner lookup preserves the center locality but leaves the whole-area authority unconfirmed. Provider failures and unsupported coverage are explicit outcomes; do not replace them with model memory. The runtime currently uses U.S. geography and these connected publishers, not worldwide coverage.

## Feasibility boundary

The implemented assessment concerns a preliminary land-use route and its unresolved conditions. It does not verify church ownership, vacant status, authority to act, deed restrictions, legal lot boundaries, frontage classification, utility capacity, environmental clearance, funding or organizational agreement. Existing overlay/historic/contract flags in matched zoning attributes are surfaced, but independent environmental/overlay coverage is not comprehensive.

No home count or financial feasibility is generated. A selected polygon's area alone is insufficient. Reproducible capacity calculations, supported possibilities, the requested structure simulation, and presentation exports remain subsequent work. Do not add a decorative simulation button that pretends these exist.

## Runtime and costs

`POST /api/first-look` runs agent-directed retrieval and interpretation; `/api/property-evidence` is an alias to the same agent, with no fixed prefetch path. Both require same-origin loopback JSON and validated geometry. Public-source calls have a 12-second per-fetch limit and a 180-second overall agent deadline, bounded response sizes, disabled redirects and adapter-owned HTTPS targets. Retrieved sources carry content hashes and timestamps. Successful source responses cache in memory; cases deduplicate and cache for up to 15 minutes, partial cases for 30 seconds. No persistent evidence database exists yet.

The agent has bounded tool/model rounds, timeouts, deduplication and process-local call limits. See [agent runtime limits](gloo-agent.md). Every model round counts toward the limit. Partial acquired evidence survives an interrupted run.

Only input geometry, query and priorities persist in browser storage. Research results and credentials do not. This remains a local development server; public deployment needs authentication and durable quotas.

## Implementation references

- `scripts/gloo.mjs`: Gloo agent loop, tool dispatch, evidence acceptance and interpretation.
- `scripts/agent-tools.mjs`: per-case tool registry, source/section IDs, evidence state and minimum research checks.
- `scripts/records.mjs`: low-level jurisdiction, catalogue, spatial and housing adapters. Its old fixed service is no longer imported by the production agent.
- `scripts/planning-context.mjs`: official planning navigation and confirmed planning-system distinctions.
- `scripts/source-providers.mjs`: exact verified service endpoints and provenance for government providers using non-government domains. This is a source trust registry, not a city/product allowlist. Current additional endpoints are the Harris appraisal district public parcel service and Harris County HCAD parcel service, linked to the official county/appraisal district. Additional endpoints require equivalent provenance checks.
- `scripts/evidence-client.mjs`: bounded provider requests and provenance.
- `scripts/site-geometry.mjs`: polygon intersection and mapped area.
- `findings.js`, `land.js`, `land.css`: sequential interface and safe text rendering.
- `cheerio@1.2.0` parses code HTML; `polygon-clipping@0.15.7` preserves multipart geometry. Install with `npm ci`.

Official/provider references: [Census geocoder](https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html), [ArcGIS search](https://developers.arcgis.com/rest/users-groups-and-items/search/), [ArcGIS authoritative items](https://doc.arcgis.com/en/arcgis-online/administer/manage-items.htm), [Municode Library](https://library.municode.com/), [Census Reporter API](https://github.com/censusreporter/census-api/blob/master/API.md), [Gloo Responses](https://docs.gloo.com/api-guides/responses). Public library endpoints are subject to publisher changes; failures must remain explicit.

### Location retrieval correction — September 21

The earlier correction filtered out polygon layers without a recognized parcel identifier before allocating source slots (extended below to agent-selected source fields), excludes grouped/specialized parcel products, deduplicates layer endpoints, and supports BBL, PAMS_PIN, GIS_PIN, NEWGISID and common cadastral aliases. Verified regional catalogue connections preserve their provenance when a duplicate search hit is returned. Current added connections are the NJ Office of GIS statewide composite and NYC Planning's MapPLUTO and zoning services, selected by Census identifiers; they do not restrict other locations.

The Gloo agent must attempt parcel and zoning discovery separately, and query a discovered zoning source unless official evidence establishes no zoning. It can navigate connected official code pages when the Municode publisher is unavailable. Source access failures and local agent-budget exhaustion are distinguished from an empty spatial match. These corrections do not promise nationwide/worldwide coverage.


## U.S. coordinate-driven retrieval — September 21, 2026

The user requires location-driven research throughout the United States, including rural land and creek areas, rather than city-by-city product scope. This is a coverage objective, not evidence of complete coverage. No new city rule pack or provider allowlist entry was added in this correction. Work remains on free/public sources; no paid provider account, subscription or credential was created.

- Census functional status now distinguishes an active town/township from a statistical county subdivision. Code-directory matching uses the selected authority and common directory name orderings (for example Town of X / X town), never a postal city. Statistical/nonfunctioning county areas do not become invented local governments. Active subdivision boundaries participate in corner consistency checks. Census geography remains a discovery clue; it cannot settle tribal/federal jurisdiction or exclusive planning authority.
- Gloo can request local or regional catalogue discovery. Regional discovery preserves the location-specific search, reads another result page and adds a wider spatial search. Search failure does not discard registered connections. Statewide authoritative publishers can be discovered; relevant layers are ranked across a service's leaf list rather than only its first eight layers. Search/failure/truncation diagnostics are returned to Gloo. Time, page, candidate and source bounds remain explicit.
- Gloo can inspect source-provided parcel fields and choose an unfamiliar identifier field. The server restricts that choice to this source's allowed metadata; owner/contact fields, generic object IDs, county boundaries, PLSS survey grids and non-parcel layers are not promoted to parcel records. Common tax-map-key fields also resolve automatically. A known zoning field supplied explicitly by Gloo is accepted; ZONING_ID cannot replace the district field.
- A failed local search or exhausted local source list triggers a regional-recovery requirement. Geometry queries still determine overlap; catalogue matches alone are not property findings.
- Flood, tsunami, enterprise, moisture, trade and other non-planning zone datasets are excluded from zoning discovery. A creek or water selection is not presumed vacant, ownerless, buildable or exempt from rules. Environmental, water, access, title, affordability and permission checks remain unresolved unless separately evidenced.

Reference for geographic government distinctions: https://www.census.gov/library/reference/code-lists/functional-status-codes.html . Actual official code provisions are still required before a housing-permission assessment; broader map discovery does not supply missing law.


### Input privacy boundary

See [Data use](data-use.md) for the challenge-aligned data declaration. User inputs are screened locally before persistence or Google requests and independently on the server before Gloo/tool activity. Flagged legacy drafts are cleaned on load. Source feature fields are minimized by name/alias, and unsolicited attributes are discarded. The checks address common patterns, not every possible name or personal disclosure. Only nonpersonal property goals belong in these fields; no consent/synthetic flag bypass is offered.
