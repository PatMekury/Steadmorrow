# Public-source retrieval and recovery — September 24, 2026

Regrid is deferred by the user. No Regrid key, trial, subscription, billing change or provider call is part of this implementation.

## Challenge contribution

Original Challenge Summary PDF pages 18–20, especially page 19: retrieve public parcel data and original zoning provisions so a non-expert leader can obtain a credible preliminary affordable-housing assessment. This work is a necessary dependency for that core outcome. It does not complete numeric feasibility, simulation, or one-pager/slides/talking-points generation.

Acceptance: Gloo chooses the new tools; government provenance is retained; an official link can yield a queryable parcel service; geometry rather than a page title establishes the parcel match; multiple parcels still need confirmation; blocked sources preserve earlier evidence; original PDF pages receive traceable citations; government guidance does not become a municipal housing allowance merely because it contains “must”; repeated requests reuse fresh public data; restarting the server cannot reset the new model-call ledger.

## Implemented behavior

- `discover_official_sources` locates municipality/township and county websites using CISA's current .gov directory and the existing exact-authority publisher directory. State and government names are checked; contact fields are not passed to Gloo. This is directory discovery, not unrestricted internet search or complete government-website coverage.
- `read_official_source` follows actual published links selected by Gloo. It respects HTML base URLs, removes duplicate/irrelevant navigation, follows verified government redirects, and supports linked ArcGIS items/services and service directories. Links returned by a county for the selected municipality can establish another official discovery root. No model-generated URL is accepted.
- Government-linked parcel/zoning services are inspected for polygon geometry and suitable fields, then exposed as source IDs to the existing `read_map_source` tool. Original map geometry is intersected with the selected area; owner/contact attributes are filtered as before. Cross-source corroboration checks geometry, not assumed universal parcel identifiers. Close geometry agreement is not title or survey proof.
- HTML extraction preserves table rows. PDF.js extracts at most four physical file pages per call, with page URLs, source hash, retrieval time and publication-currency caveat. A worker enforces a 10-second parsing timeout and 192 MB old-generation limit. Downloads are bounded (6 MB web, 16 MB PDF links). Scanned/unreadable or oversized PDFs remain explicit gaps; OCR is not implemented. Text table layout can be ambiguous and must not support invented permission.
- A directory/TOC is not law. Generic planning guidance and county guidance for a municipality remain guidance. A code-provision candidate needs an original code/ordinance marker, section marker and operative text; drafts remain guidance. This classification is conservative but is not legal validation. Gloo still must establish applicable use, qualifications and exceptions; amendments/currentness are unverified.
- Failures distinguish access denial, rate limiting, timeouts, missing sources and oversized responses. Details expand in First findings. Existing facts remain available. Access controls are not bypassed. Minimum recovery attempts are bounded; further tool selection stays with Gloo.

## Caching and usage

One public API client and one public website client are shared across research cases. Successful responses retain original hashes/timestamps and are cloned for each consumer. Default freshness is 15 minutes, government-directory freshness one day; memory is capped at 24 MB per client plus transient requests/parser work. No stale-on-error facts are silently substituted. Failures are not cached as empty records. Changing priorities can reuse source responses; the full case narrative still depends on the input.

`GLOO_MAX_DAILY_CALLS` defaults to 480 model calls per rolling 24 hours. The server reserves each call before dispatch in Git-ignored `.runtime/research-usage.json`, using an exclusive lock and atomic replacement. The cap survives restarts. Failed/uncertain calls count. Corrupt or locked ledgers fail closed. It is a local call cap, not an account-wide spending/token cap; other applications/keys/hosts are outside it. Do not delete the ledger to reset usage. A crash can leave a lock requiring operator inspection after ensuring no process uses it. Pre-installation calls are not reconstructed from Gloo billing history.

Per run: 20 model rounds, 32 tools, 180 seconds; two concurrent runs/four starts per minute. No automatic model transport retry. Cached public requests are shared, so abandoning one case cannot cancel another's request. These bounds can yield honest partial findings.

Requires Node >=22.13.0 for pinned PDF.js 6.3.289. Run `npm ci`, then restart the application server. Server-only configuration and `.runtime` are excluded by the static-file allowlist.

## Remaining coverage gaps

This does not guarantee records for every location. Some authorities have no matching directory entry, inaccessible GIS, scripts-only viewers, blocked publishers, very large/scanned PDFs, missing boundaries or conflicting records. Assessor record upload, OCR, a paid national provider and unrestricted web search are not implemented. The selected four-point area never replaces a recorded parcel. A creek/water selection remains subject to unresolved environmental, access, title and authority checks.

## Sources

- CISA government domain directory: https://github.com/cisagov/dotgov-data
- Gloo function calling: https://docs.gloo.com/api-guides/tool-use
- PDF.js: https://mozilla.github.io/pdf.js/getting_started/

See `verification.md` for observed outcomes rather than interpreting the architecture as proof of nationwide completeness.
