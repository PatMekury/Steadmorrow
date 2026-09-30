# Assessment writer and general destination searches — September 29, 2026

## Scope and challenge alignment

The user authorized fixing the separate assessment-writing failure and made clear that police proximity was only a test. Original Challenge Summary PDF pages 18–20 were read for this work. This repairs a necessary dependency in the address → sourced preliminary affordable-housing assessment → presentation journey. It does not establish legal capacity or affordable delivery, and does not complete the outstanding editable presentation deliverables.

## Observed causes and correction

The retained failed Houston case contained original section 42-237, not the section 42-22 used in an earlier successful investigation. Passage splitting separated the residential performance-standard introduction from its operative requirements. The sentence-based admissibility filter rejected that actual pathway passage while accepting later parking-only passages. That encouraged an invalid citation/correction loop. Separately, generation instructions allowed statutory thresholds while the narrative validator rejected numeric unit counts.

The corrected candidate check recognizes the original residential-performance introduction and its operative site rules across sentence boundaries. Purpose-only, parking-only, subdivision waiver, conflicting authority and prohibited-use cases remain rejected. The structured housing-analysis citation enum now offers actual eligible operative passages when present; the other narrative fields retain the complete relevant source choices. The writer is explicitly instructed to describe dwelling thresholds in words in narrative and leave exact numbers in original citations. Numeric site capacity is still forbidden. The independent Gloo source review remains; eligibility is not proof of parcel applicability or expert approval.

Regression fixture `tests/fixtures/residential-performance.json` preserves the actual source metadata and original failed-case section text. This change is not a Houston product allowlist or a legal rule encoded for every state.

## Live assessment verification

`live-writer.json` records a fresh Gloo writer and separate source review over the exact retained failed evidence, with no model-response replay and no repeated public property investigation. It completed with narrativeStatus ready, housingRoute supported, in 22.751 seconds and three model calls. No draft validation failure occurred. The result cites section 42-237's operative residential standards, says frontage/depth/site-area applicability still needs confirmation, and states affordability commitments are not established. 'Supported' permits preliminary exploration; no particular number of dwellings, approved plan or affordable delivery is established.

This is focused backend verification, not a fresh end-to-end browser property investigation. The new accepted result was not substituted into the browser's older saved failed finding. A normal new/Retry findings run uses the installed correction.

## General proximity implementation

Gloo can supply a free-form destination category with structured OSM tag groups, or a literal name/brand/operator query. The seven historical kinds remain compatibility shorthand only. Tag groups allow AND within groups and OR between groups; a bounded compiler constructs Overpass queries and independently checks returned tags. Raw query code and arbitrary upstream URLs are not accepted. Named queries escape regular-expression syntax.

Cache and receipt identity include the complete search definition, mode, radius and original question. Results from different names cannot share a cached answer merely because their category is identical. Scenario attachment requires the exact original priority excerpt. Existing receipts without that binding must be requested again through the current tool. Gloo still selects destinations, mode, filters, follow-ups and attaches actual receipts; no category keyword router or canned answer pipeline was added.

Walking, driving and cycling still use Valhalla street/path geometry. Candidate discovery accepts a 0.5–50 km search radius; at most three geographically nearby candidates are routed, and the shortest successful route is reported. This is not an exhaustive nearest guarantee. Missing mapping, unusable endpoints, failed network routing or provider failure remain unresolved with no numerical direct-line substitute. Large polygon destinations use mapped representative points: entrances and within-property connections remain unverified. Linear geographic features and street-address geocoding are not established by this change. No promise that every conceivable destination is mapped or routable is made.

## Live proximity check and approval limitation

`live-proximity.json` records four fresh Gloo calls: it interpreted both a library-category question and a named Emancipation Park question, chose structured filters and walking, made both real public lookups, attached their unresolved receipts and finished the unresolved housing study. Both Overpass reads timed out in the restricted shell. This verifies model tool use and honest failure behavior, NOT successful new-category street routes.

Automatic approval review rejected the attempted unrestricted-network route-only verification because it would disclose selected property coordinates and destination queries to public mapping/routing services. That attempted escalation did not execute. The user was informed and asked for explicit permission; no workaround or additional location disclosure was attempted after rejection. Successful live arbitrary-destination routing remains unverified pending that response.

The official Overpass language reference used for query construction is https://wiki.openstreetmap.org/wiki/OverpassQL . Public OSM and Valhalla remain prototype dependencies without established production availability or exhaustive coverage.

## Installation and checks

198 installed tests pass and all configured syntax checks pass. Tests cover the exact failed citation case, waiver/parking/foreign-scope rejection, new category filters and conjunctions, literal named searches, rejected unrelated returned places, distinct search caches, no direct-line fallback and wrong-question receipt rejection. Existing study context-size protection remains. No daily Gloo cap was added.

Changed application files: scripts/regulatory-path.mjs, scripts/gloo.mjs, scripts/place-query.mjs (new), scripts/place-routes.mjs, scripts/agent-tools.mjs, scripts/scenario-agent.mjs, package.json and related tests/fixture. Originals were backed up under workspace tmp/assessment-proximity-fix/backup.

The temporary backend inspector was closed. Steadmorrow was restarted with the installed changes as PID 30020 and returned HTTP 200 on http://127.0.0.1:5173/. Startup does not begin research. Browser-saved selection/results remain browser-owned; restarting loses the old in-memory retry checkpoint, whose evidence was retained in the verification workspace. No new browser research, UI redesign, mobile visual test or export check was performed in this correction.

## Authorized live-route continuation — September 29, 2026

The user then explicitly instructed completion of the blocked routing verification. The original-provider escalation was approved and executed. Both authorized library and named Emancipation Park searches still timed out after about 15 seconds each. This demonstrates that the prior failure cannot be attributed solely to the restricted shell or approval block.

Further bounded diagnosis against the original provider observed HTTP 429 from the application HTTPS client, HTTP 406 from a separate fetch comparison, an available /api/status endpoint, and HTTP 504 for a minimal library query. A later named-park request with an explicit JSON Accept header timed out after 20 seconds. No fabricated route or straight-line distance was substituted. The remaining live failure is at the public place-query service; these observations do not establish a failure of Valhalla routing, which was not reached.

The OSM public-instance documentation identifies Private.coffee as an alternative global Overpass service (https://wiki.openstreetmap.org/wiki/Overpass_API). One exact same-query test against that alternate service was prepared, but automatic approval review rejected its execution because it introduces a different recipient for the selected property location. The user was informed and asked specifically for permission to send those coordinates and destination queries to overpass.private.coffee. No request to that mirror executed, and no workaround was attempted. The alternate provider has not been installed or silently enabled in the application.

Original-provider authorization is now resolved. Successful live routing for the new categories remains outstanding because primary place discovery failed; the optional alternate-provider test awaits its specific approval. No Gloo calls, new paid property investigation, application code changes or additional server restart occurred in this continuation. Steadmorrow still returned HTTP 200. Previous 198-test result is unchanged, not a newly repeated suite.

## Alternate provider authorized and tested — September 29, 2026

The user explicitly answered **Allow Private.coffee route verification**. The alternate-provider escalation was then approved and executed. There is no remaining permission request for these original-provider and mirror verification calls.

Both complete route-function checks against Private.coffee failed during destination discovery after approximately 15 seconds, before any Valhalla request. Its status endpoint and a standard POST of the same approved park query also timed out at approximately 18 seconds. A final standard POST to the original Overpass endpoint likewise timed out. `live-mirror-route-check.json`, `mirror-transport-check.json` and `primary-post-check.json` retain these observations. The initial attempt to run the earlier rejected script found no file, because the rejected command had never created it; the actual executed test is `live-mirror-route-check.mjs`.

**Current result:** the approval block is cleared, but successful live routing for the new category/name searches remains unverified because destination discovery requests are failing. The original service explicitly returned 429 and 504 in diagnostics; mirror timeouts alone do not distinguish a provider outage from a connection-path issue. Valhalla was not reached. Do not claim a verified route, a library/park absence, or a defect in the routing calculation based on these results.

No application code or provider default was changed on this evidence. No Gloo calls or additional paid property research were used. No further permission is pending for these same verification destinations. Steadmorrow continues to return HTTP 200 at localhost:5173. A reliable reachable map-data source or recovery of the approved services is needed to finish successful live route verification; this external dependency remains unresolved, rather than a reason to fabricate measurements or continually retry.
