## Daily call cap removed — September 25, 2026

The user explicitly requested removal of Steadmorrow's local daily Gloo call limit. This supersedes all earlier instructions to retain the 480-call cap and all historical budget-block messages below. The live research service no longer reads, writes or enforces the daily ledger, and `GLOO_MAX_DAILY_CALLS` is no longer a supported setting. Existing ledger files are retained as historical files and do not block requests. Do not reintroduce a daily cap without a new user request.

Per investigation, the existing 20 model rounds / 32 tool calls / 180-second duration remain, along with two concurrent runs, four starts per minute, cache/deduplication, source/citation validation, privacy protections and server-only credentials. This removes the artificial daily wait from the challenge's fast, credible property-read journey (Challenge Summary page 19); it does not establish completeness of any assessment or change Gloo account limits. Simulation, affordable-delivery verification and presentation work remain unfinished.

# First findings implementation and verification

Verified September 24–25, 2026. This records implemented work and remaining limitations; it is not a feasibility certification or a claim that the whole challenge is complete.

## Decision and challenge alignment

The original Challenge Summary, PDF pages 18–20, remains the authority. First findings should help a non-expert church leader decide whether the selected land merits a focused affordable-housing conversation, understand the evidence and decisive constraint, and identify the next useful decision. This is core assessment work in the address → findings → user-triggered simulation → editable presentation journey. No home count, financing estimate, ownership conclusion or approval was introduced.

Acceptance criteria: distinguish the selected area from recorded parcels; derive the diagram from retrieved geometry; cite an operative housing-use provision before suggesting an underlying use allowance; explain consequential uncertainty beside the affected finding; show useful verified evidence before interpretation finishes; retain it through failures; hide and pause the landing hero/video in every findings state; preserve selection and priorities; retain source/version information for later stages.

## What changed

- Replaced the record-heavy screen with a single property plan, selected-land/parcel legend, interactive district highlighting, concise assessment, reasons, and next-step discussion. Source text, record fields and retrieval details open deliberately. Removed the housing-pressure section and generic missing-information/feasibility banners. Approved priority choices remain.
- Parcel and district polygons are clipped/intersected deterministically. The plan reports zoning on the selected land separately from zoning elsewhere on the parcel. No decorative buildings, inferred legal parcels or simulation capacity are used. A recorded landmark flag stays visible beside the property view.
- First findings toggles a dedicated document state. CSS and the actual `hidden` property suppress the hero; video start/play guards pause it. A session marker hides the hero before reload rendering. Back, priorities and Home retain the user's work.
- Gloo still chooses source/tool calls, sees errors and decides follow-ups. A scheduler overlaps only its independently chosen operations, keeping geometry operations ordered and evidence review behind a barrier. There is no scripted retrieval fallback presented as an agent.
- Verified snapshots stream over the existing NDJSON response. Duplicate subscribers receive the latest evidence immediately. Sequence checks ignore results after leaving the screen or starting a different request. Acquired records survive later model/source errors. Leaving the screen cancels the browser subscription; an already running, bounded server investigation may finish for cache reuse.
- Recognized identifiers cannot be overridden by a borough, address or generic object field. Unknown identifiers still require an explicit Gloo choice from real field metadata.
- Code extraction respects exact section anchors, section bodies and table row/column spans. Publisher navigation supplies district context alongside search hits. Chapter navigation is not legal evidence. The NYC connection uses the verified current official publication hostname. Different anchors share one downloaded chapter but retain different citation identities.
- Source-scope checks reject conflicting district tables and supported housing claims backed only by bulk/height/conversion/general-purpose sections. These are conservative checks, not a general proof of legal applicability or semantic correctness. Special/historic/landmark flags trigger a targeted original-source attempt. Official no-zoning systems are exempt from a search for a nonexistent use table.
- Model history is condensed from retained sourced state, avoiding duplicated passages and navigation. Incomplete output has one bounded recovery. Validation feedback names the failing field. The original low reasoning setting is retained after a medium-effort trial made latency worse. Existing 180-second research bounds, server-only credentials, origin checks, people-data restrictions and durable 480-call rolling-day ledger remain.

## New York source audit

The original user's four selected corners were recovered through the app's coordinate disclosure (eight decimal places, sub-millimetre rounding). The initial benchmark used a reconstructed square; that earlier square is a separate test and must not be treated as the original selection.

| Item | Verified result | Consequence |
| --- | --- | --- |
| `MN` | Manhattan borough abbreviation, not the parcel identifier | Reject it as a replacement for a recognized BBL. |
| BBL | `1012860001` | Correct identifier from the original MAPPLUTO record. |
| Address | `631 5 AVENUE` | Attribute of the matched mapped tax parcel; no ownership conclusion. |
| Mapped geometry | 8,128.85 m² | Approximately 8,129 m²; separate from the source's `LotArea` attribute and its units. |
| Selected outline | 122.01 m², wholly within the matched geometry | The outline is about 1.5% of the mapped parcel, not a separate legal lot. |
| C5-3 | 93.19 m² of selection; 5,214.96 m² of parcel | Applies to part of the selected land. |
| C5-2.5 | 28.82 m² of selection; 2,913.88 m² of parcel | The original selection itself crosses the district boundary. |
| Recorded conditions | `SPDist1=MiD`, `INDIVIDUAL LANDMARK`, four buildings, building area on the whole parcel | Do not infer that the selected corner is occupied or needs demolition. Do not allocate unused whole-parcel floor area to it. |

Primary sources: [MAPPLUTO catalogue](https://www.arcgis.com/home/item.html?id=1564ace0b4f44318ac39920737f9bd07), [original parcel service](https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/MAPPLUTO/FeatureServer/0), [NYC zoning districts](https://www.arcgis.com/home/item.html?id=788dcf4c61e34757bad1e015cb5f4111), and [PLUTO data dictionary](https://s-media.nyc.gov/agencies/dcp/assets/files/pdf/data-tools/bytes/pluto_datadictionary.pdf). Results retain request URLs, retrieval dates, source hashes, attribution and update metadata.

The operative [32-121 residential-use table](https://zoningresolution.planning.nyc.gov/article-iii/chapter-2/32-121) includes C5 allowances. Its conditional mark in the C4 column must not shift into C5 when transcribed. [34-112](https://zoningresolution.planning.nyc.gov/article-iii/chapter-4/34-112) establishes residential-equivalent bulk rules; it does not independently establish use permission or site capacity. Special Midtown modifications and landmark scope remain consequential. A conditional cross-reference to another special district does not establish that the parcel lies within that district. In particular, do not confuse a parking/transit-area attribute with proof of a Special Transit Land Use District.

The underlying residential-use allowance is evidence for exploring a housing route. Affordable delivery terms, the exact effect of landmark/special-district controls, building footprints on the selected corner and capacity are not established. These remain limitations of the current assessment, not approvals or calculations.

## Verification boundaries

All 93 automated tests pass. Automated tests cover geometry, source ownership and URL restrictions, table/section integrity, citations, field selection, independent tool scheduling, partial results, progress replay, budgets, cancellation-related stale responses and output recovery. These use fixtures; see [the performance report](first-findings-performance.md) for live runs. Live New York citation strings were checked against retained original source text, and district-intersection areas reconcile to the selected outline.

Actual app checks used the user's existing Chrome tab and saved selection. Back to map retained the 122 m² outline and `church new york` search; priorities retained `affordable housing`. Leaving an active run returned to priorities and ignored later screen updates. Reload resumed findings with the hero hidden and video paused. A second view of the actual app in a 390×844 iframe verified the mobile breakpoint; the browser viewport-override command did not alter Chrome's measured viewport, so it was reset and not counted as a mobile test. There was no horizontal overflow. The diagram was enlarged after visual inspection of the first mobile render.

Print CSS suppresses hero, video, navigation, loading marks and closed disclosures, and includes compact cited-source links even with details closed. Print rules were replayed in a local QA page using the actual renderer/styles and retained live results, including an interrupted assessment. Native Chrome Save-to-PDF could not be operated/exported through the available browser backend. **An actual saved PDF and final pagination have not been verified.** Do not describe CSS inspection as that check.

Live Beverly testing returned multiple parcel candidates without choosing one on the user's behalf. A separate live request to its connected eCode360 publication returned HTTP 403; no bypass was attempted. This is distinct from fixture tests of failure recovery. Houston exercises the official no-zoning/development-regulation path. These are test locations, never a product city allowlist; public-source coverage remains incomplete.

## Version contract and next missing work

Every completed result has `version.evidence`, `version.assessment` and `version.scenario` (currently null). Evidence identity includes selected coordinates, parcel identity, source IDs, URLs and hashes in a stable order. Assessment identity additionally includes priorities and generated assessment/findings/obstacles. Later user-triggered simulation must bind assumptions and geometry to these versions and recorded parcel constraints. Later editable one-pager, slides and talking points must use the same evidence/assessment/scenario versions and source references. These stages are not implemented by this change; print CSS is not a presentation generator.

The application now provides a clearer property view, earlier useful evidence, corrected identifiers and stronger source handling. It still cannot claim comprehensive parcel-specific feasibility, consistent final response latency, complete semantic/legal applicability validation, verified affordable delivery, simulation or the required presentation deliverables. Passing tests and a sourced use table do not complete the challenge.

## Final installed-browser check and remaining live-test block

After the clean navigation correction, a separate run with the user's actual saved browser input acquired evidence at 19.220 s but ended at 143.615 s with nine retrieved provisions and no assessment. Its 20 model rounds included repeated editorial-length rejections (headline 102/114 characters versus a 100-character hard limit, and summary 530 versus 450). This failed run is not hidden by the successful 59.435-second service benchmark.

The final fix separates short prompt copy targets from bounded hard payload limits (headings 160, assessment summary 700, other paragraphs 500 characters). It retains complete qualifications rather than truncating them. Citation, original use-provision, unsupported-capacity, field and total-response validation remain. A regression test verifies that a modest overrun returns the complete cited assessment without another model round, while hard limits still reject excessive content. All **93** fixture tests now pass.

The next live attempt reached the existing rolling-day **480-call local Gloo budget** before completing property research. The ledger was not cleared and the cap was not raised. Final live verification of the editorial-length fix is therefore blocked; it is verified by regression tests and retained-live-result UI rendering, not a new completed Gloo assessment. At the check on September 25 at 07:06 CDT, the first reservation was due to age out at 18:47 CDT and the twentieth by 19:01 CDT. These are rolling availability times, not a full reset or a promise of enough calls for every case. Subsequent use changes availability.

The visible budget state now distinguishes paused research from unavailable public records. No claim is made that this final change has already improved live end-to-end time. An unchanged 180-second limit, faster cached response, or successful test is not evidence that the reported five-minute wait is fully solved.

Final UI check: the installed desktop budget-pause state showed the saved 122 m² outline, an explicit paused-research explanation, no horizontal overflow, hidden hero and paused video. The current renderer was also checked against retained final11 live evidence at a 390-pixel frame width: local Outfit loaded, no horizontal overflow, and pressing Enter on C5-3 selected the district and reported 5,215 m² of parcel / 93 m² of selected land. The second consequential condition and print citation links remained visible. Retained-result rendering does not count as a successful new Gloo run.
