# Opening section verification

Checked September 18, 2026 against the app running locally at http://127.0.0.1:5173.

- JavaScript syntax: `node --check app.js` and `node --check scripts/serve.mjs` passed.
- Approved 8-second animation: installed at 1600×1000; the optimized MP4 decoded fully with ffmpeg without errors. Frequent keyframes support seeking. Size: 4,021,719 bytes.
- Media range request: HTTP 206, 100 bytes returned for `bytes=100-199`, with correct Content-Range.
- Local Outfit loaded successfully (`document.fonts.check`); green live brand color resolves to rgb(87, 204, 126).
- Actual browser visual review: desktop 1440×900, tablet 768×1024, mobile 390×844, and short mobile 320×480. No horizontal overflow. The short mobile stage and parent both measure 500px and no longer overlap the next section.
- Get started: URL becomes #experience, the heading receives keyboard focus, and the section aligns at viewport top on the tested mobile layout.
- Updated autoplay: after reload, autoplay=true, paused=false, currentTime>0, and Pause is exposed. The headline stays visible, and the concept caption is absent. The user subsequently enabled continuous looping; replay, pause, and the correct Play label were checked. Get started still reaches sectionY=0 and focuses its heading.
- Standalone SVG logo opens correctly, with embedded Outfit font and editable text.
- Browser console: no errors or warnings observed during the reviewed flow.

The in-app browser reported a reduced-motion preference. Following the user’s explicit follow-up, the video now autoplays muted regardless of that preference, with a persistent pause control; interface transitions and smooth scrolling continue to respect it. Scroll-driven playback has been removed. This is a first-section implementation, not a completed product or public deployment.

Review fixes: shared minimum stage height on short displays, correct pause state after scrolling, next-section height sufficient for anchor alignment, and keeping the headline and Get started visible throughout autoplay.

## Land selection verification — September 18, 2026

- Live saved Maps Demo Key: Google Maps tiles, Places text search, and satellite imagery loaded successfully. No billing upgrade was made. The numeric quota remains unverified.
- Click to select: one map click produced exactly four white/dark handles and a translucent blue quadrilateral. Actual pointer dragging changed the outline and area measurement.
- Invalid shape: dragging a corner across the opposite edge produced the visible crossing error and disabled Use this area. Undo restored valid geometry and enabled confirmation.
- Use this area showed Area selected, moved focus to its heading, and persisted the selection and confirmation across a browser reload. Adjust area reopened editing. Clear and mode changes worked.
- Polygon: keyboard-only placement with arrow keys and Enter progressed to 3 of 4 corners with confirmation disabled, then closed on corner four. Directional corner adjustment changed the area while retaining four handles.
- Responsive review: default desktop, 768×1024 tablet, 390×844 mobile, and 320×480 narrow mobile. No horizontal document overflow. The map and toolbars fit; mobile confirmation remained usable. Tablet heading layout was refined to keep the introduction together. Temporary viewport overrides were reset.
- Get started still focuses the land-section heading. The original hero files, brand, animation, and autoplay behavior are unchanged.
- Browser console: no errors or warnings during the tested Maps flow.
- Automated checks: all application/server JavaScript syntax checks pass; all 15 geometry/server tests pass. Tests cover both windings, concavity, dateline geometry, duplicates, crossings/touching, degenerate points, area/centroid calculations, no mutation, Maps config isolation, HEAD/range requests, and blocked private/traversal paths.
- Local draft storage contains user input and user-selected points only. Google Places result objects and addresses are not persisted. History retains selection labels with geometry, so Undo does not attach a later search label to an earlier outline.

Limits: this stage selects an approximate exploration area. No recorded parcel, ownership, vacancy, zoning, feasibility research or Gloo agents are implemented. Confirmation does not trigger research or a cloud save. Network/quota failures use visible recovery states; a real demo quota exhaustion was not forced during testing. Storage-denied behavior is implemented but not exercised in a browser with storage disabled.

## Style-guide correction — September 18, 2026

The first land-section styling was rejected by the user. It was rebuilt against the supplied PDF; mappings are in `docs/design-reference.md`. The enclosing card and tinted rows were removed. Typography, form dimensions, palette, selected controls, and map presentation now follow the guide.

- Rendered desktop comparison and computed values: Outfit 600 at 64/64; 64px field; active green rgb(87, 204, 126). At 1440px viewport, the content measures 1280px.
- Mobile visual comparison at 390px and 320px: 40/44 heading, 20px outer inset, no horizontal overflow, usable map and expanded keyboard controls.
- Five search results displayed on mobile; Tab reached the fifth. Selecting a result closed the panel and kept the map usable.
- One click produced four handles; keyboard corner adjustment changed the geometry; Use this area displayed the saved confirmation. The temporary test selection was cleared afterward.
- JavaScript syntax check passed after markup/state changes. Geometry and server modules were unchanged by this visual revision; the earlier 15-test result applies to them.
- Visuals were compared with actual rendered guide pages. The working composition is an adaptation, not a claim of a pixel-identical reference screen.

## Compact map-and-finder refinement — September 18, 2026

This revision supersedes the preceding centered-form visual checks. The map is on the left and the address finder/selection controls are on the right on desktop. The user requested less visible instruction, a light selector, and immediate dismissal of unused address matches. Working controls now use paper and brand green; the approved hero is unchanged.

- Actual default desktop render: map and finder align side by side in one compact view, with no introductory paragraph or visible keyboard-help panel. The active selection pill is green on a paper background.
- Actual mobile renders at 390×844 and 320×780: search, selection modes, map, and summary stack without horizontal document overflow. Map tools and controls fit within the viewport.
- Live Places search returned five matches. Choosing one immediately hid the result container, removed all result buttons from the DOM, and reset aria-expanded to false. The selected address remained as concise context.
- Submitting a search and then changing the query left zero result options, kept the panel closed, and left Find property enabled after the request settled. Request tokens are invalidated on editing, selection, Escape, and map failure. Escape behavior was reviewed in code, not separately exercised in this browser pass.
- Click to select created four handles. Pointer dragging changed the area from about 2.51 acres to about 2.1 acres. Use this area showed the compact confirmation; Adjust area reopened editing.
- Keyboard focus revealed the otherwise clipped adjustment controls. Moving a corner north changed the area; Undo restored it. Arrow keys and Enter placed four polygon corners and enabled Use this area. The controls disappeared again on leaving their focus. Clear retains Undo access even with an empty outline.
- Test geometry was cleared and the original Houston, TX search text and Click to select mode were restored. Reload showed the empty selection state. Browser error log was empty.
- npm run check passed; all 15 existing geometry/server tests passed. No new tests were added for the styling change. The temporary mobile viewport override was reset.

The local preview server had stopped before this pass; it was restarted at http://127.0.0.1:5173. A stale in-app error tab was replaced for verification. No cloud, billing, key, parcel lookup, or research integration changed.

## Live suggestions and larger editing controls — September 18, 2026

- Address suggestions from AutocompleteSuggestion loaded with the saved demo key for the partial inputs `7120 Grand` and `7120 Grand Bou`, without submitting the form. Five options appeared and typing focus remained in the input.
- ArrowDown highlighted an option; Enter fetched its location and moved the map. Pointer selection also worked on mobile. Both immediately removed the alternatives. Escape dismissed the dropdown/pending debounce. Request-sequence guards cover stale suggestions and pending place-detail lookups.
- Undo and Clear are in the right-hand column under selection modes. Desktop measurements: 164px wide, 56px high, 16px text; their left edges are beyond the map's right edge. Clear removed the test outline; Undo restored it.
- Real wheel input over the map changed zoom from 18 to 19 while pageY stayed at 590.4px. Wheel input over the right panel changed pageY to 374.4px while zoom stayed at 19. No Ctrl modifier was used.
- Actual desktop and 390x844 mobile renders were reviewed, including the suggestion dropdown and larger controls. The dropdown has its own scrollable list and visible Google Maps attribution. The temporary mobile viewport was reset.
- Test geometry was cleared and the original Houston, TX query restored before reloading the preview.
- npm run check and git diff --check passed. Geometry and server code were unchanged; the previous 15-test result remains applicable. No billing or key settings changed.


## Sequential starting priorities — September 18, 2026

Supersedes the earlier Area selected / Adjust area confirmation endpoint.

- Use this area hides the map/finder workbench and opens What matters here? in the same section. No extra column is created. The back arrow remains available during editing and summary review.
- Live browser checks at 1440×1000 and 390×844: neutral paper fields, green selected suggestions/actions, Outfit typography, no horizontal overflow.
- Typed a temporary purpose and selected Keep open space; Back to map retained all four marker coordinates and the measured 10,133 m² outline. Advancing again retained both answers.
- Saved priorities and reloaded: the summary and back arrow restored. Maps did not initialize while the priorities step was restored; Back to map then loaded the saved four-corner outline successfully.
- Empty optional answers saved as We're still exploring. The summary received focus after saving; editing restored the fields. Temporary test input/geometry was cleared and viewport overrides reset.
- Syntax check and all 15 existing geometry/server tests passed. Research/Gloo integration and cloud persistence remain unimplemented. Storage-denied recovery remains untested in a browser with storage disabled.


## First live Gloo phase — September 18, 2026

- Updated the second prompt to What matters most as you explore? Replaced Keep open space / Limit the initial commitment with Understand local housing needs; retained Retain ownership. Checked the rendered mobile form.
- All 22 automated tests passed: existing geometry/server coverage plus Gloo request validation, key isolation, duplicate/cached requests, changed inputs and cache expiry, request limits, provider failure handling, malformed output, timeout and same-origin HTTP restrictions. No live calls are made by the tests.
- Live browser request using a temporary Houston-area quadrilateral and the local-housing-needs preference succeeded through the actual Gloo endpoint. Returned three questions and a next conversation. No local property findings or citations were claimed.
- A second live run after prompt refinement succeeded. Left the findings step while the request was active; its late response did not replace the priorities screen. Reopening returned the completed result promptly from server cache.
- Desktop 1440×1000 and mobile 390×844 renders inspected against the guide's white/paper surfaces, Outfit hierarchy and green actions. Mobile had no horizontal overflow. Expandable question details worked. The findings step reserves viewport height so content does not jump below the hero while loading.
- Reload retained the selected area and priorities and returned to the saved starting view. Returning from findings to map restored all four coordinates and the same approximate 10,133 m² measurement. Priority review/edit paths remained available.
- Removed temporary test geometry and the selected test preference; reset viewport overrides. Final syntax and diff whitespace checks passed.
- Limits: no independent property records, parcel verification, zoning retrieval or housing-statistics integration; output is explicitly user-input-only guidance. Error cases are covered with deterministic mocked-provider tests, not by causing real credit exhaustion. The AI output validator does not guarantee semantic accuracy. Gloo key and billing configuration remain private; no billing changes were made.
# First findings replacement — September 21, 2026

This section supersedes the historical user-input-only findings limits below. See `first-findings.md` for current coverage and outstanding work.

- `npm run check` passes. All **33 tests** pass without live network calls. Added cases cover unknown source/passage IDs, altered quotations, unsupported home counts, source-host restrictions, bounded bodies, cache/deduplication, provider failures, exact municipality matching, actual code content versus search snippets, chapter-child traversal, unofficial GIS mirrors, polygon holes/disjoint parts, multiple-parcel choice, partial zoning coverage, and the ACS denominator.
- Live public-source checks exercised locations in Seattle, Austin and Houston. These are test locations only. Results varied: a Seattle sample yielded a parcel and zoning; Austin yielded a CS designation, code candidates and housing estimates without a reliable parcel match; Houston yielded housing context and code candidates without a matched parcel/zoning layer. Missing matches were not silently substituted or described as permission. These checks do not establish complete coverage in any city.
- The final full `/api/first-look` request returned HTTP 200, `preliminary`, and `narrativeStatus: ready` in **28.7 seconds**. It included a matched parcel, full mapped zoning coverage and a Gloo interpretation linked to original server-attached source passages. Earlier live checks exposed fabricated/shortened quotations and overly tight prose-length limits; quotation generation was replaced by passage-ID selection, and bounded prose validation was adjusted. This is not proof of legal or semantic correctness.
- Live browser: manual property search, keyboard result selection, four-corner Click to select, Use this area, optional priorities and First findings were exercised. Search alternatives disappeared after selection. The demo autocomplete provider initially returned unavailable; manual text-search fallback succeeded. No paid Maps upgrade was performed.
- A live selection resolved to a mapped parcel spanning three zoning districts. The final screen prominently states **This site crosses zoning districts** and withholds a single Gloo site interpretation. Parcel outlines are separate from the selected blue area. Code disclosures exposed source publisher, retrieval date, codification banner and original-section link.
- Inspected desktop 1440×1000 and mobile 390×844 renders against the previously reviewed guide screenshots (white/paper surfaces, Outfit hierarchy, restrained green actions). The narrow viewport had equal document/client widths (375px usable width) and no horizontal overflow. Supporting sections expand while the main screen remains a single reading column.
- Edit priorities and Back to map retained the entered purpose, selected priority and the same **6,109 m²** four-corner outline. Reload retained the area and answers, and returned to the priorities step. Research resumed successfully. Maps initialized only when returning to map from a restored priorities step.
- Removed the temporary test outline and purpose/priority, restored the pre-test search text, reset the viewport override, and left the updated local preview available. No user property was chosen as a product default.
- `git diff --check` passes. Pinned dependencies were installed with zero vulnerabilities reported by the install audit. The Node minimum is 20.18.1, matching Cheerio's requirement; actual verification used Node 25.8.0.

Remaining limits: no comprehensive environmental/title/utility assessment, verified ownership/vacancy, numeric capacity, cost/funding analysis, structure simulation, presentation exports, durable evidence store, or public deployment. Code retrieval currently uses Municode and geographic lookup currently covers U.S. jurisdictions. A source gap is visible instead of a fabricated finding. Live outage recovery was not induced deliberately; failure cases are tested with mocked providers.

---


## Retrieval corrections — September 21, 2026

The reported Houston empty-parcel/unresolved-zoning result was reproduced in the actual in-app browser. Several independent defects were corrected: rejection of verified non-.gov public providers, missing full catalogue-item metadata, unsupported common property-ID fields, overly broad code-section ranking, and a Gloo gate that required a zoning district even where official sources explicitly establish no zoning.

- The user's retained **93 m²** selection now resolves to parcel **0190560000003**, approximately **688 m²** mapped parcel area. The actual First findings screen returned a ready Gloo interpretation, official planning guidance, retrieved development provisions and ACS housing context. The selection and priorities were preserved.
- A separate Houston source check retrieved parcel **0011480000019** plus eight provisions covering development plats, building lines, residential lot size, parking and conditional floodplain permit requirements. These provisions do not establish that the parcel is in a floodplain or that all sections apply. Parking-meter/conduct provisions no longer crowd out housing-relevant sections.
- A live Austin regression exposed the common `PROP_ID` / `Property ID` mapping issue. After the generic field fix, the same selection resolves to parcel **441802**, with CS and UNZ polygons across the mapped parcel. It stays partial/local-rules; no single-site permission is inferred.
- A Seattle regression retained parcel **1978201335** and two intersecting zoning districts. Local provisions remain available with split-zoning limitations. These are verification samples, not configured product defaults or proof of comprehensive coverage.
- All **42 tests**, syntax checks and whitespace checks pass. New cases exercise verified endpoint boundaries, full publisher metadata, identifier/address aliases, provider fallback, a failed corner lookup, official no-zoning statements, chapter ancestor resolution, exclusion of unrelated parking rules, and scoped Gloo interpretation.
- The actual findings render was inspected in the in-app browser. This change retains the existing white/paper, Outfit and green interface; no layout redesign was made. The development server was restarted for the new retrieval modules.

Current limitations remain explicit: U.S. geographic coverage, discoverable public GIS and the connected code publisher; no guarantee of every parcel or record, comprehensive title/environmental/utility research, numeric feasibility, simulation or exports. No paid data subscription, cloud service, billing setting or credential was changed. Citation validation does not guarantee semantic/legal correctness.

## Gloo-directed research agent — September 21, 2026

The production First findings path now uses Gloo function calls to direct retrieval and interpretation. It no longer calls the fixed records service before invoking the model. See `gloo-agent.md` for the exact API protocol, tools, budgets and Studio distinction.

- Re-read the original Challenge Summary PDF pages 18–20 and solution responsibilities. This change serves the required address-to-parcel/rules-to-preliminary-assessment chain; simulation and presentation deliverables remain unfinished.
- Live guarded Responses API accepted the nested function schema with `gloo-openai-gpt-5-mini`. Replaying provider-specific reasoning items caused HTTP 400; replaying documented function-call/output items fixed the protocol. No key value was exposed.
- A separate live case retrieved parcel 0011480000019, official no-zoning guidance, four original provisions and a validated cited assessment in 74.5 seconds. Its audit contained 16 model calls and 13 tools, including a rejected invented section ID followed by a successful corrected selection. This location is a test case, not a product default.
- Browser testing exposed premature completion and repeated evidence reviews while code sections remained unread. The loop now supplies missing research actions, removes repeated review choices, narrows actions when the budget is running down and offers discovered IDs directly in schemas. A subsequent run on the user's retained 93 m² outline retrieved parcel 0190560000003 (688 m² mapped area), official guidance, housing estimates and original provisions, with a ready Gloo assessment in seven model rounds/eight tools. No area or priorities were changed.
- Manual citation inspection also found over-generalization of conditional construction rules. Instructions now require the triggering conditions, distinguish definitions from operative provisions, and prevent specialized driveway/fire requirements being presented as universal property requirements. Truncated chapter listings require targeted follow-up search. Citation validation establishes source identity/text, not automatic legal correctness.
- Final browser run after the interpretation correction returned four original code provisions, a ready assessment and an audit of 11 model rounds/nine tools. The agent followed a truncated chapter listing with a code search and read original application requirements. The displayed Sec. 42-230 citation was expanded and checked against its attached original passage. Edit priorities retained the same 93 m² outline, purpose and Retain ownership selection; returning to findings used the cached result.
- All 47 deterministic tests and syntax checks pass. Tests cover real tool-call replay, agent-selected recovery, lazy retrieval, original geometry binding, ambiguous parcels, discovered-ID schemas, missing-research/repeated-review protection, citations, input/network/secret restrictions, call budgets, partial-result retention and streamed progress.
- Studio was signed out. No Studio-hosted agent was created. The app hosts the runtime and retrieval tools; Gloo directs the research through its documented API using the existing server-only credential.

Coverage remains bounded by connected U.S. geographic/public-source providers. A real agent does not guarantee missing records exist, establish legal permission, or complete capacity, affordability, environmental/title checks, simulation or presentation export. No paid Maps/cloud settings were changed.

## New Jersey / New York failure correction — September 21, 2026

The reported selections were reproduced in the actual user browser tabs, preserving geometry and priorities. The in-app selection is near 116 Broad St, Beverly, NJ (412 m²); the Chrome selection is near Fifth Avenue, New York (122 m²).

Root causes and corrections:
- Beverly had exhausted the app's 30-model-call process limit after earlier multi-turn runs. The budget was originally sized for one-response requests. The default is now 480 calls per rolling day/process, with the existing per-run, concurrent and per-minute limits retained. An already exhausted budget is rejected before retrieval and identified as a research pause rather than a missing-record result. This is not a change to Gloo's account billing or a durable spending cap.
- Parcel discovery admitted county-boundary layers and specialized grouped-parcel products, consumed source slots with duplicate endpoints, missed BBL/PAMS identifiers, and could replace verified connection metadata with a duplicate search summary. Discovery now validates the identifier before accepting a layer, excludes unsuitable group products, deduplicates endpoints, retains verified connection metadata and requests the chosen address field.
- Verified source connections supplement generic location-driven discovery: NJ Office of GIS's current statewide composite; NYC Department of City Planning's MapPLUTO and zoning district services. Connections are chosen using official Census identifiers, not a product city allowlist. Sources: https://www.nj.gov/njgin/edata/parcels/ and the NYC DCP Mapping Portal organisation plus authoritative items 1564ace0b4f44318ac39920737f9bd07 / 788dcf4c61e34757bad1e015cb5f4111.
- Code retrieval no longer assumes every authority publishes through Municode. Gloo can navigate the connected NYC official Zoning Resolution using discovered page IDs. Tables of contents are discovery only; original selected section bodies become citation evidence. Arbitrary URLs, other authorities and made-up IDs remain unavailable.
- A live New York run exposed a sequencing defect: zoning queried before the parcel was matched was invalidated without making the source eligible for another query. Parcel changes now clear zoning-query status and change the per-tool cache key, forcing a fresh query against the recorded parcel.

Observed live results:
- Beverly returned two intersecting mapped records: 100–102 Broad St, 0302_949_1 (approximately 564 m²), and 114 Broad Street, 0302_949_12 (approximately 783 m²), plus ACS housing context. No parcel was chosen for the user. Its current city-linked eCode360 publication returns HTTP 403 to the server; this is an explicit source-access limitation and has not been bypassed. The zoning map/permission remains unresolved. A fresh browser run displayed both addresses and the source-access link within What the rules say; the 412 m² outline and priorities survived reload.
- New York returned the parcel at 631 5 Avenue (approximately 8,129 m²), original code provisions and ACS context. The saved outline remained 122 m². The initial live agent result led to the sequencing fix above, rather than being accepted as successful parcel-level zoning research. A subsequent live run detected multiple C5 districts across the recorded parcel and retained a local-rules scope. Its conversion-focused explanation also triggered a prompt correction to preserve the mandatory vacant-land focus.
- 53 deterministic tests cover the previous safeguards plus identifier/layer filtering, selected property-address fields, discovery-versus-original code text, blocked publication behavior, budgets across multiple properties, and zoning cache invalidation after a parcel change. Syntax checks pass. No new dependency, account key, billing subscription or Maps upgrade was introduced.

These corrections improve the core address-to-records requirement on Challenge Summary PDF page 19. They do not establish universal coverage, a complete legal feasibility assessment, simulation, numeric capacity or presentation delivery.

Final browser verification after all corrections: the retained New York selection returned MapPLUTO parcel 1012860001 at 631 5 Avenue, approximately 8,129 m² mapped area, intersecting C5 districts, local housing context and a cited new-construction/bulk-rules explanation referencing original ZR 34-112 and 34-221. It explicitly retains local-rules scope and the split-district/applicability gap; no capacity or housing approval is asserted. Beverly shows the two address-labelled choices and an expandable link to the code publisher whose automatic retrieval is blocked. Both original selections/priorities were retained.


## U.S. discovery regression matrix — September 21, 2026

Challenge alignment: PDF page 19's address-to-public-records requirement. The observable acceptance target for this correction is coordinate-driven authority discovery, agent-selected source/identifier recovery, actual parcel/zoning intersections and explicit partial results when original law is unavailable. No municipality becomes a pilot or product scope restriction.

Six small coordinate-only outlines exercised the shared public-source adapters; none was added to a city-specific registry. These are representative samples, not all-state or nationwide coverage certification.

| Test location | Observed evidence | Material gap |
| --- | --- | --- |
| Woodstock town, NY | Active town identified; NYS parcel records 27.55-1-31 / 27.55-4-3 / 27.55-4-2.100 intersect; municipal zoning HC | Multiple parcels require a user choice; original code not retrieved |
| Meridian charter township, MI | Active township correctly identified; state parcel sources discovered | No usable parcel/zoning match; connected publisher lookup unavailable |
| Hilo area, HI | Statistical CCD correctly routes authority discovery to Hawaii County; parcel 324056022; zoning RS-10 | Original housing provisions unavailable |
| Rural Fairbanks North Star Borough, AK | Statistical subdivision correctly routes to borough; zoning GU-1 | Adapter-only probe cannot choose unknown PAN; actual Gloo run below resolves it; original code unavailable |
| Rural Granite County, MT | Statewide cadastral record 46167011101010000 | Zoning and original code remain unresolved; no inference of no zoning |
| Phoenix, AZ | City parcel identifier 430295; zoning DTC-BCORE | Original code not retrieved in this matrix |

Two actual Gloo API runs then exercised the production HTTP endpoint using empty address text and the selected coordinates. Alaska returned parcel 494895, GU-1 and borough ACS context; Gloo explicitly selected the publisher's PAN field. Hawaii returned parcel 324056022, RS-10 and county ACS context. Each completed 11 model requests and 10 tool calls with no failed tool events after the corrections. Both returned honest partial findings, with no code provisions, legal allowance or generated home count. The live run exposed and led to fixing rejection of an explicitly supplied known zoning field; it was not dismissed as a provider outage.

61 deterministic tests pass, including active-versus-statistical geography, subdivision boundary consistency, authority-name matching, statewide discovery, paginated recovery, registered-source survival during catalogue outage, deep service layers, tax-map-key and agent-selected identifiers, rejected arbitrary/private fields, and non-planning-zone/PLSS rejection. Syntax checks and git whitespace checks pass. Existing selection geometry, saved priorities and UI styling were not changed. No Gloo key, Maps key, billing account or paid provider was exposed or modified.

Remaining challenge gaps: broad public-provider coverage and original-code access are still incomplete (the Meridian test demonstrates this directly). This is not a nationwide feasibility completion. Numeric capacity, environmental/title/utility verification, structure simulation and version-consistent presentation generation remain separate unfinished work. Reproduction artifacts and raw public-source/agent results are in the document workspace's tmp/nationwide-retrieval directory; they contain no API credentials.


## Privacy guardrail implementation — September 21, 2026

Source alignment rechecked against the original Challenge Summary PDF pages 9 and 18–20: real public property research remains required, while scraped/private people records are excluded. The application data declaration is docs/data-use.md; privacy-test identities and contact details are synthetic. No new data provider, AI classifier call or consent bypass was introduced.

67 tests pass after adding shared client/server screening, saved-draft migration, common-field alias filtering and feature-response minimization. Negative inputs exercise email/phone/identifier patterns, explicit membership/donor/counseling/child records and split-field contact text. Both HTTP research paths return generic errors without echoing input. Tests assert zero model calls, zero tool-session construction and zero diagnostics for rejected requests. Ordinary collective housing goals and public property addresses remain accepted. Source-query checks prove owner aliases are not requested and unexpected personal attributes do not enter evidence.

Actual in-app browser verification: the existing Beverly selection retained its 412 m² outline and Retain ownership choice. Pasting fictional@example.invalid into the purpose field showed the inline warning and an explicit not-saved status. See first findings stayed on the form; reloading showed an empty purpose field, establishing that the blocked value was not saved. The original purpose, "Explore affordable homes while retaining ownership.", was restored afterward. The address finder rejected the same synthetic email in both autocomplete and deliberate Find property paths. Its original query, "baptist church new jersey", was restored, and the user was returned to the priorities view. The short privacy notice uses existing typography/colors; no CSS or map-selection styling changed. Server logging after the browser checks contained no agent-completed event, so these checks did not start paid Gloo research.

Known limitation: this is deterministic detection of common signals, not perfect PII recognition. Names or sensitive narratives can evade it, and partial text typed before a signal becomes recognizable may already have been saved or sent as an autocomplete query. The notice and restricted feature/data-source scope remain necessary. Existing upstream disclosures cannot be retracted by this change. Future presentation/simulation work must preserve the same data boundary.
