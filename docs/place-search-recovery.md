# Public place-search recovery — September 29, 2026

## Authorized purpose and acceptance

The user instructed fixing the remaining failed proximity verification, with prior approval for the church-location checks against OpenStreetMap, Private.coffee and Valhalla. The original Challenge Summary PDF pages 18–20 was read again. This is a necessary reliability dependency for a non-expert leader's stated place-access question in the affordable-housing exploration. It does not decide housing legality, capacity, affordability, safety or presentation completion.

Acceptance: actual library and named-park candidates must be sourced, verified against the requested tags/name and locally bounded to the selected area; real Valhalla street geometry must produce the displayed distance; no direct-line substitution. Proximity is not a police-only product feature. Preserve Gloo tool selection, original question bindings, housing purpose and source/version gates.

## Diagnosed cause

Connection timing isolated successful DNS/TCP/TLS to both prior providers. The original Overpass service returned HTTP 504 with an explicit Dispatcher_Client::request_read_and_idx::timeout database error even for the minimal public query `node(1)`. IPv4 reproduced it, so forcing address family was not a fix. Private.coffee connected over HTTPS but failed to produce query responses within the bounded deadlines. This is not evidence of missing destinations or failed routing mathematics. The old path depended entirely on Overpass place discovery and therefore never reached Valhalla when discovery failed.

## Installed change

`scripts/place-search.mjs` adds a bounded Nominatim/OpenStreetMap search-index recovery. `scripts/place-routes.mjs` uses it when Overpass fails or returns incomplete data. The original provider remains usable when it succeeds; no hardcoded demo destinations or city allowlist were added. The deterministic recovery executes the category/name search already chosen by Gloo. All returned objects must have a valid original OSM identity, coordinates and matching category/tag conjunctions and literal name if requested. Nonmatching path/street results are rejected even if a name contains library.

The recovery sends an outward-rounded bounded search window, not the user's selected outline or exact origin point. Its ranked collection is limited to ten matches. All candidates are still checked against the actual local radius and at most three are routed. The shortest successfully routed candidate wins. This is not an exhaustive nearest guarantee or verification of a destination's current opening hours, public access or entrance. Polygon/way representative points remain qualified rather than relabelled as doors.

Source URLs identify the provider that actually answered; the failed original source, failure type and ranked-index limitations remain in the receipt. A 30-second cooldown per shared map reader avoids repeatedly calling the failing Overpass service. On the recovery path, optional surrounding street-mesh retrieval is skipped because it would immediately hit the same failed provider. The real route polyline remains. Existing site/context geometry is retained; recovery does not manufacture surrounding roads or buildings.

The public search client has one application-wide serialized queue, at least 1.1 seconds between starts, one-hour cached responses, request deduplication and a 128-entry bound. There is no autocomplete, periodic polling, systematic POI collection or new daily Gloo cap. Cancelling one caller does not cancel another shared caller. Server environment variable `STEADMORROW_PLACE_SEARCH_ENDPOINT` can select a different HTTPS search endpoint or `disabled` without a software update; configure it in the server process environment, not the current restricted `.env.local` parser. Existing public-URL/DNS/size safeguards remain.

The deliberate prototype provider choice follows Nominatim's requirements: https://operations.osmfoundation.org/policies/nominatim/ and bounded best-match search documentation https://nominatim.org/release-docs/develop/api/Search/ . Use is suitable only for modest user-triggered searches under the public service's limits, with OSM attribution, caching and provider switchability. This is not a production SLA or a scalable national data-coverage guarantee.

## Live results

`live-recovered-routes.json` contains unmocked public network lookups and Valhalla routes through the repaired default code. No model calls were used for these two route-function checks.

- Library: HPL Express, original OSM node/4322627983. 2,395 m walking, estimated 1,714 seconds, 100 route coordinates. All three attempted library candidates routed successfully out of 18 discovered candidates within the bounded search. Overpass happened to succeed on this run. Route endpoint gaps were 16 m at origin and 8 m at destination. Optional route street context contained 1,296 mapped ways. Completed in 3.090 seconds.
- Named park: Emancipation Park, original OSM way/375124933. 264 m walking, estimated 187 seconds, 18 route coordinates. Overpass returned 429; actual Nominatim recovery found the matching park and Valhalla routed it. Endpoint gaps were 16 m and 14 m. Optional street mesh was omitted on this recovery path rather than asking the failed provider again. Completed in 10.899 seconds.

This verifies both a category outside the old seven-kind list and a named destination, with an actual live fallback. It does not verify every possible category/name, comprehensive nearest coverage, access rights or safe walking conditions. The tests did not replace the user's saved property assessment or priorities.

## Gloo integration verification boundary

A proposed fresh Gloo test carrying retained housing/property context was rejected by automatic approval review. A minimized version excluding all retained property records, exact selected coordinates, parcel IDs, boundaries and query URLs was also rejected because route names/distances are derived from the property. Neither model test executed. The user was informed and asked for explicit permission for the minimized question/route-summary test. The preexisting live Gloo interpretation of these two public-place questions and earlier receipt-binding regressions remain valid, but do not describe them as a newly successful full agent round trip for this recovery.

The mapping fix is independently verified and installed. Only the additional focused model test is pending that reply. The prepared minimal script checks outgoing payloads locally for retained-case identifiers before any send.

## Installation and verification

201 installed tests and all configured syntax checks pass. New tests cover bounded search URLs, OSM category/name/identity rejection, cache isolation, deduplication, one-second global spacing, a failed primary provider followed by a real-shaped routed receipt, 30-second cooldown and retained unresolved output when actual routing fails.

Installed files: scripts/place-search.mjs (new), scripts/place-routes.mjs, tests/place-search-recovery.test.mjs (new), package.json. Previous files were backed up under workspace tmp/assessment-proximity-fix/recovery-backup. The local server was restarted as PID 17056 and returned HTTP 200 on localhost:5173. No interface redesign, full paid property investigation, housing assessment substitution or new browser/mobile/export acceptance test occurred.

## Authorized Gloo attachment test completed — September 29, 2026

The user replied **go ahead**, authorizing the minimal questions/route-summary test. Approval succeeded. No further permission remains pending for this verification. Retained property records, parcel IDs, exact selected coordinates, boundaries and source query URLs were excluded from Gloo. The deterministic local tools retained the selected geometry needed to make real public map/routing requests. Original challenge PDF pages 18–20 were read for this verification.

The first minimal run used three Gloo calls, then a local outgoing-payload guard stopped the next request: after answer attachment, the test harness snapshot had copied the full receipt into the brief. No guarded request was sent. The harness snapshot was corrected to use the same minimal receipt projection as its tool output/context. This was a test-harness privacy correction, not a production data-loss change.

The model also introduced a literal `Public library` name filter for a generic nearest-library question, excluding valid mapped libraries. The installed tool validation now requires a literal name/brand/operator filter to be quoted from the original concern and rejects a name that merely repeats a chosen category tag. The name_query schema accepts an explicit empty string for category-only questions; the query compiler normalizes it to no name filter. This fixes the optional-argument ambiguity without using a keyword router or picking a category on Gloo's behalf. The named Emancipation Park query remains valid.

An intermediate eight-call run finished in 46.577 seconds and attached both real receipts: 2,230 m walking to Robert James Terry Library via the ranked-index recovery and 264 m to Emancipation Park. Its remaining literal `library` category-word filter exposed the final contract refinement above. It is retained as intermediate evidence, not the clean final category verification.

The final generic-library check used four fresh Gloo calls in 21.330 seconds: interpret priorities → choose read_nearby_places with amenity=library and name_query empty → attach the actual route receipt → finish the study. It returned 2,395 m walking to mapped HPL Express, shortest among three successfully routed candidates out of 18 discovered. The final test deliberately contains a generic unresolved housing placeholder to avoid retransmitting property records; its needs-evidence completion is expected and is NOT a new live housing-assessment failure. The named-park answer attachment was verified in the prior completed two-question run and its contract was unchanged by the final category correction.

Across this authorized continuation, **15 Gloo calls total** were made (3 + 8 + 4). No full paid property investigation was repeated and no browser-saved assessment or original priorities were substituted. The result is a focused live agent/tool verification, not a new browser end-to-end feasibility or visual acceptance test. Different candidate sets/representative map points can return different bounded library results; none is a complete nearest-library guarantee or proof of public access/opening status.

Final installed files additionally include scripts/agent-tools.mjs, scripts/place-query.mjs and tests/destination-search.test.mjs. **202 installed tests and configured syntax checks pass.** The server was restarted as PID **33960**, returned HTTP **200** at localhost:5173, and its startup error log was empty. The former pending-permission descriptions in this report are historical and superseded by this completed verification.
