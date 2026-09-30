## Daily call cap removed — September 25, 2026

The user explicitly requested removal of Steadmorrow's local daily Gloo call limit. This supersedes all earlier instructions to retain the 480-call cap and all historical budget-block messages below. The live research service no longer reads, writes or enforces the daily ledger, and `GLOO_MAX_DAILY_CALLS` is no longer a supported setting. Existing ledger files are retained as historical files and do not block requests. Do not reintroduce a daily cap without a new user request.

Per investigation, the existing 20 model rounds / 32 tool calls / 180-second duration remain, along with two concurrent runs, four starts per minute, cache/deduplication, source/citation validation, privacy protections and server-only credentials. This removes the artificial daily wait from the challenge's fast, credible property-read journey (Challenge Summary page 19); it does not establish completeness of any assessment or change Gloo account limits. Simulation, affordable-delivery verification and presentation work remain unfinished.

# First findings: performance and evidence verification

Measured September 24–25, 2026. These are individual live runs during development, not statistically representative latency percentiles or a coverage guarantee.

## Comparable measurements and result quality

| Case | Baseline: first visible / final | Rebuilt: first visible / final | What the result actually established |
| --- | --- | --- | --- |
| Original New York outline | 49.382 / 49.382 s | 17.868 / 59.435 s | Baseline incorrectly used borough `MN` as parcel ID and retrieved incompatible residence-district provisions. Latest adapter run (`final11`) returned BBL `1012860001`, both C5 districts, operative 32-121 residential-use table and 34-112 bulk-equivalence table. Landmark and Special Midtown effects remain unresolved. |
| Houston | 52.555 / 52.555 s | 6.633 / 58.168 s | Corrected parcel ID from street address to `0011490000001`. Official no-zoning guidance and development provisions retained; no automatic housing permission. Latest Houston run (`final9`) is partial. |
| Beverly, New Jersey | 30.821 / 30.821 s | 10.564 / 26.648 s | Both runs leave multiple parcels for the user to choose. The revised run (`final2`, an intermediate revision) streamed candidate evidence sooner; neither is a completed property assessment. |

Warm repeats of these exact inputs returned the same cached results in 0–1 ms inside the service, with no additional model requests. This excludes browser rendering, HTTP transport and process restart; it is not a claim of an instant fresh investigation. Partial results have a shorter cache lifetime than ready results.

The original New York outline was recovered from the app's eight-decimal coordinate disclosure. Its benchmark uses the same priorities but an empty search-query string, unlike the user's `church new york` browser input. Earlier `NewYork` benchmarks used a reconstructed square and are listed separately below. Do not compare them as byte-identical original inputs.

“First visible” means receipt of a verified evidence snapshot (including a parcel candidate needing choice), not a completed housing interpretation. Baseline did not stream evidence; facts acquired earlier remained invisible until completion. Baseline first acquisition was 19.531 s for the original New York outline and 14.356 s for Houston.

## Diagnosis and implemented changes

The reproduced baseline did not take five minutes. We have not established the precise cause of that reported browser wait. Repeated model turns, irrelevant full-text code matches, duplicated chapter downloads, expanding conversation context, source failures and output-validation recovery all contributed to measured latency. Intermediate revised runs reached the unchanged 180-second bound. Reducing the timeout was not used as a speed fix.

The final11 New York adapter run spent 42.860 s across 15 complete model responses; recorded tools totaled 17.288 s. Houston final9 spent 51.413 s across 14 responses; tools totaled 9.746 s. Tool totals can overlap and must not be added blindly to model time. Earlier baseline fetch wrappers measured time to response headers, not full model-response consumption, so they are not labeled equivalent model timings.

Implemented optimizations: overlap independent calls selected by Gloo; share public responses and in-flight requests; reuse one chapter download for separate section anchors while retaining citation identities; expose genuine chapter headings with district context; remove incidental search matches from housing-use searches; condense duplicate conversation history from sourced state; make housing statistics optional; stream/replay actual verified evidence; retain it after interruption. Gloo continues to choose every research action and interpretation. No fixed prefetch pipeline replaces it.

A trial of medium reasoning effort increased response time and produced incomplete/context-failed or timeout runs, so the original low effort was restored. The existing rolling-day 480-call ledger and per-case 20-round/32-tool/180-second bounds remain. The final11 clean table-of-contents correction reached the governing use table, but a single successful run does not prove stable retrieval. Before it, final9/final10 New York runs took 147.750/126.649 s and still lacked the operative allowance. These results remain in the audit.

**Observed improvement is earlier useful evidence and corrected source handling. Consistent faster final assessments are not yet established.** The latest comparable final times are slightly slower than the flawed baseline, and an accepted `ready` status does not establish all parcel-specific conditions or affordable delivery.

## Evidence integrity and live failure coverage

The source audit and original links are in [first-findings-rebuild.md](first-findings-rebuild.md). BBL, parcel/selection areas and separate district intersections reconcile with original records. Every displayed citation is an exact server-attached passage of a retained source. That prevents invented quotations but does not guarantee semantic applicability: an unrelated conditional section can still be selected by the model. The latest output guidance requires plain-language consequences, the decisive obstacle first and a distinction between housing use and an affordable delivery plan.

The New York successful run retrieved 32-121, not merely a zoning label or a bulk table. It did not establish the selected corner's landmark designation scope, all Special Midtown modifications, available development rights, new-building capacity, or affordability terms. A search for special controls is not the same as resolving them.

Houston tests official no-zoning rules. Beverly tests parcel ambiguity; a separate live request to its original eCode360 publication returned HTTP 403 and was not bypassed. That separate publisher test is not misrepresented as a completed unavailable-source property run. Deterministic fixtures additionally verify blocked sources and later model failures retaining earlier evidence.

## App verification

All 93 automated tests pass, as do `npm run check` and `git diff --check`. They cover original source IDs/passages, table column integrity, exact chapter sections, parcel fields, intersections, tool choice and ordering, progressive subscribers, partial-result retention, model recovery, origin/private-network/people-data safeguards and persistent budgets. Tests are fixtures unless explicitly identified as live above.

Desktop and a real-app 390×844 iframe were visually checked, with no horizontal overflow. The browser viewport override did not change Chrome's measured viewport and was not counted as a mobile verification. Reload into findings hides the hero immediately and pauses its video. Back navigation, retained outline/priorities, and ignoring late updates after leaving an active run were exercised. Landmark context and the second consequential condition remain visible outside collapsed evidence.

Print styles were inspected with the actual renderer/styles and retained live evidence, including interrupted results. Hero/video/navigation are suppressed, and cited-source links print even with evidence disclosures closed. Native Chrome Save-to-PDF is not supported through the available browser export controls; an actual PDF and page-break layout remain unverified. A print-style replay is not a PDF export test or a presentation generator.

## All live development runs

These runs used evolving code and are not a single-version benchmark cohort. `ready` below is the program's historical status, not our endorsement of legal or product completeness; intermediate false-positive assessments prompted later guards. All records are retained to avoid selecting only fast/successful results. The `final11` run precedes the last copy-only prompt refinement; final installed-browser verification is recorded separately in the implementation report.

| Run | First visible (s) | Final (s) | Model calls | Original code sections | Status |
| --- | ---: | ---: | ---: | ---: | --- |
| after-NewYork-cold | 96.164 | 96.164 | 20 | 0 | not-ready |
| after2-Houston-cold | 10.789 | 54.153 | 13 | 4 | ready |
| after2-NewYork-cold | 18.104 | 88.904 | 13 | 0 | partial |
| baseline-exact-Beverly-cold | 30.821 | 30.821 | 11 | 0 | not-ready |
| baseline-exact-NewYorkOriginal-cold | 49.382 | 49.382 | 12 | 2 | ready |
| baseline-Houston-cold | 52.555 | 52.555 | 11 | 3 | ready |
| baseline-NewYork-cold | 83.556 | 83.556 | 14 | 2 | ready |
| final-NewYorkOriginal-cold | 19.553 | 28.154 | 7 | 0 | unavailable |
| final10-NewYorkOriginal-cold | 17.887 | 126.649 | 18 | 3 | partial |
| final11-NewYorkOriginal-cold | 17.868 | 59.435 | 15 | 2 | ready |
| final2-Beverly-cold | 10.564 | 26.648 | 8 | 0 | not-ready |
| final2-NewYorkOriginal-cold | 15.389 | 92.632 | 11 | 0 | partial |
| final3-NewYorkOriginal-cold | 17.404 | 59.042 | 11 | 1 | ready |
| final4-NewYorkOriginal-cold | 31.753 | 129.005 | 12 | 3 | ready |
| final5-Houston-cold | 12.390 | 109.040 | 12 | 7 | unavailable |
| final5-NewYorkOriginal-cold | 30.861 | 117.653 | 9 | 5 | unavailable |
| final6-Houston-cold | 6.623 | 180.015 | 20 | 6 | unavailable |
| final6-NewYorkOriginal-cold | 16.124 | 135.793 | 16 | 7 | ready |
| final7-Houston-cold | 18.578 | 165.493 | 20 | 10 | unavailable |
| final7-NewYorkOriginal-cold | 14.184 | 144.128 | 20 | 6 | partial |
| final8-Houston-cold | 11.614 | 180.012 | 16 | 4 | unavailable |
| final8-NewYorkOriginal-cold | 24.585 | 104.790 | 15 | 5 | ready |
| final9-Houston-cold | 6.633 | 58.168 | 14 | 3 | partial |
| final9-NewYorkOriginal-cold | 15.275 | 147.750 | 20 | 4 | partial |
| verified-NewYorkOriginal-cold | 19.765 | 158.699 | 20 | 2 | unavailable |

Raw cold/warm inputs, metrics and retained public evidence are saved under `C:\Users\patmekury\Documents\Gloo hackathon\output\verification\first-findings-2026-09-25`. The harness reads the existing server key privately and saves no credential or private model reasoning. Preserve that separation when rerunning it. The service-call harness uses the actual application's modules and durable budget; paths and run labels are recorded in `measure.mjs`.

Later user-triggered simulation and editable one-pager/slides/talking-points remain unimplemented. The version contract is retained for those stages. This work does not complete the challenge or establish nationwide coverage.

## Final installed-browser check and remaining live-test block

After the clean navigation correction, a separate run with the user's actual saved browser input acquired evidence at 19.220 s but ended at 143.615 s with nine retrieved provisions and no assessment. Its 20 model rounds included repeated editorial-length rejections (headline 102/114 characters versus a 100-character hard limit, and summary 530 versus 450). This failed run is not hidden by the successful 59.435-second service benchmark.

The final fix separates short prompt copy targets from bounded hard payload limits (headings 160, assessment summary 700, other paragraphs 500 characters). It retains complete qualifications rather than truncating them. Citation, original use-provision, unsupported-capacity, field and total-response validation remain. A regression test verifies that a modest overrun returns the complete cited assessment without another model round, while hard limits still reject excessive content. All **93** fixture tests now pass.

The next live attempt reached the existing rolling-day **480-call local Gloo budget** before completing property research. The ledger was not cleared and the cap was not raised. Final live verification of the editorial-length fix is therefore blocked; it is verified by regression tests and retained-live-result UI rendering, not a new completed Gloo assessment. At the check on September 25 at 07:06 CDT, the first reservation was due to age out at 18:47 CDT and the twentieth by 19:01 CDT. These are rolling availability times, not a full reset or a promise of enough calls for every case. Subsequent use changes availability.

The visible budget state now distinguishes paused research from unavailable public records. No claim is made that this final change has already improved live end-to-end time. An unchanged 180-second limit, faster cached response, or successful test is not evidence that the reported five-minute wait is fully solved.

Final UI check: the installed desktop budget-pause state showed the saved 122 m² outline, an explicit paused-research explanation, no horizontal overflow, hidden hero and paused video. The current renderer was also checked against retained final11 live evidence at a 390-pixel frame width: local Outfit loaded, no horizontal overflow, and pressing Enter on C5-3 selected the district and reported 5,215 m² of parcel / 93 m² of selected land. The second consequential condition and print citation links remained visible. Retained-result rendering does not count as a successful new Gloo run.
