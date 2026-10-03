# Agency repair implementation — October 2, 2026

The user authorized all thirteen agency repairs, mixed concerns in first findings, open-ended factual answers, broader surrounding effects and community restrictions, and the four supplied review items. Presentation-package work remains deferred.

## Implemented contracts

| Repair | Behavior and implementation |
|---|---|
| 1. Complete concern coverage | Stable input IDs, exact original spans and a required coverage map. Gloo interprets mixed goals, requirements, reported facts and questions separately before research and again for the study. Up to 32 concerns; no four-card truncation. `concern-contract.mjs`, `agent-tools.mjs`, `scenario-agent.mjs`. |
| 2. Factual answers beyond routes | `submit_priority_answer` accepts any research topic with exact passage or typed measurement references, explicit applicability, status and remaining checks. Answered/partial submissions receive independent source review. Public official documents can be retained without becoming legal evidence. Existing route receipts remain mandatory for route questions. |
| 3. Clarification continuity | Server-held clarification ID binds the original input, initiating refinement, question and evidence version to the reply. Browser reload retains that context; stale or unrelated replies are rejected. |
| 4. Actual layout critique | A review needs already observed receipts, current plan/evidence versions, a verdict, one judgment per original priority including the housing purpose, limitations and next action. Same-response unseen tests cannot be reviewed. Revised priority answers invalidate earlier critiques. |
| 5. Decision rationale | Post-test choice rationale, pre-test dimension basis and overall rationale are separate. The recommended concept remains distinct from the locally active concept. Legacy missing rationale is explicitly not recorded. |
| 6. Explicit alternative versions | Every planned option has an explicit concept/review/rationale selection or an unresolved use disposition. Only placed, currently reviewed alternatives enter the selector. No implicit latest-version choice. |
| 7. Justified replanning | `revise_housing_plan` requires an observed outcome and current plan ID, then renewed source review. It does not reset the cumulative test, time or inference budget. |
| 8. Failed-test history | Current-format explorations, interrupted attempts and intermediate versions survive refinements. Archived geometry/evidence retains original versions but cannot become a current selectable alternative. |
| 9. Compact observations | Research and study share `studyView`; rendering arrays stay on the host. Exact facts, uncertainty, source references and version identities remain in model observations. |
| 10. Source completeness | Content hashes, parser/read scope, word ranges and explicit omitted passage ranges accompany retained sources. HTML/code text is not silently cut at the previous 14/16 KB limit. Truly truncated evidence cannot establish the positive housing basis. PDF page-limited evidence retains its scope. |
| 11. Complete source inventory | Every retained source stays discoverable; `read_source_passages` retrieves a bounded requested window. No insertion-order 65 KB cutoff hides late decisive sources. |
| 12. Durable decision trace | Local append-only `.runtime/decision-traces/*.jsonl` records run/parent IDs, code/prompt/input hashes, model IDs, returned usage, tool arguments, compact observations and hashes, validations, critiques and decisions. Credentials, raw provider responses and hidden reasoning are excluded; numeric reasoning-token usage is retained. Missing usage is null. |
| 13. Honest execution modes | Explicit fresh findings bypass completed-result and session-checkpoint reuse; normal cache reads, shared-run rejoin and checkpoint continuation remain distinct. Cache/rejoin accesses have their own linked trace and cache age. Browser detachment is not represented as cancelling server computation. |

The host supplies validation and the list of unfinished dependencies, not a preset design. Gloo still chooses relevant investigations, one to three useful options, assumptions, tests, critiques, revisions and selected versions. Stable completed answers are not repeatedly rewritten without new evidence. No daily cap was added.

## Supplied review items

- Housing-analysis-only support IDs are explicitly included in assessment audit sources and valid issue source IDs. The installed baseline already flattened this support correctly; the clearer expression and a focused regression protect it rather than claiming a reproduced omission in that baseline.
- A failed Add a concern retry submits `simulationState.refinement`, preserving the requested change.
- Route selection, highlighting and framing use the exact measurement receipt ID. Walking, driving and later routes to the same destination cannot substitute one another's geometry.
- The browser's explicit findings refresh sends `executionIntent: fresh`; server tests prove fresh inference occurs while ordinary cache reads do not infer again.

## Broad effects and restrictions

Questions are free text with open research topics, not an allowlist of questions. A broad effects question stays broad. Gloo can retrieve relevant public evidence, calculate placed-massing comparisons and identify a precise unsupported check.

`assess_surroundings` binds to the exact placed concept and evidence version. It measures mapped structure separation, height assumptions, proposed footprint and optional ground-shadow samples at up to eight explicit UTC instants. The local solar calculation uses the [NOAA general solar-position equations](https://gml.noaa.gov/grad/solcalc/solareqns.PDF). Shadow sweeps are solid vertical masses on level ground. They do not establish facade or indoor daylight, overlooking, structural safety, runoff, ecology, wind, noise, construction effects or infrastructure capacity. Missing data stays visible. Another selected option is marked as needing its own effects check when the retained answer concerns a different concept.

Public planning overlays, recorded instruments, easements, covenants and association rules require actual applicable documents. Community preferences are distinguished from binding restrictions. There is no new title-record, private-association or document-upload connector; inaccessible private records remain unresolved with an identified check. Missing records never establish no restrictions.

## Verification

All 248 tests and syntax checks pass. See workspace `output/verification/agency-repairs-2026-10-02/README.md` for full synthetic live history and the browser screenshot. The new tests exercise production validators and agent transitions. Legacy scripted agent fixtures were updated to supply the new required critique/selection fields; adversarial tests call the unwrapped production agent.

A wholly fictional Gloo run completed in 55.065 seconds using 10 model calls including one option audit and one factual-answer audit, and nine tools. It split the mixed input into four concerns, tested one apartment arrangement, measured surroundings, accepted a partial physical-effects answer, retained unresolved private restrictions, re-reviewed after the answer changed and explicitly selected the reviewed concept. This demonstrates the contract, not engineering correctness or general performance. The model's courtyard/design prose is an interpretation; the measured massing does not solve a courtyard, landscape, circulation or interior plan.

Six synthetic development attempts used 96 model requests in total. Five earlier attempts failed and remain documented. They exposed evidence-reference ambiguity, overreaching review instructions, missing housing-purpose critiques and repeated completed-answer work; each led to a targeted correction. No retained real church parcel, priorities, routes or study records were transmitted. The prior approval block on that real-data test is not bypassed or resolved by these fictional tests.

No new full property research, real-parcel Gloo validation, mobile-device certification, security certification, expert approval, legal/affordable feasibility or whole-challenge completion is claimed. Presentation creation/export work remains deferred.

## Persistence and retention

Decision traces survive server restart. Agent checkpoints and active runs remain process-memory state, with the existing expiry; a durable trace is not resumable execution. Saved browser evidence/geometry is retained locally and version checked. Server restart can require a fresh findings check before new study actions. `.runtime` is ignored by Git and refused by the HTTP file server. Traces are local records under the same study-data retention responsibility; do not publish them without review.


## Further acceptance testing

Workspace `output/verification/agency-acceptance-2026-10-02/README.md` records the complete matrix and failed attempts. Live interpretation found duplicate whole-sentence cards and re-merging during the research-to-study handoff. The contract now rejects duplicate excerpts, preserves research-separated spans in study coverage, and uses medium reasoning plus generic atomicity guidance during interpretation only. Two new regressions exercise rejection and recovery.

Final fictional prompts separated eight and seven concerns; a held-out research-to-study check preserved all eight concerns, including separate access and repair questions and one broad environmental-effects question. This phase used thirteen successful model responses and one harness HTTP 422. Earlier semantic failures remain documented. Initial interpretation is still model-dependent, not an exhaustive natural-language guarantee.

The installed frontend passed a full-page fictional HTTP journey: automatic study, all seven concerns, route detail, keyboard alternatives, saved reload without new requests, failed refinement retry after reload, clarification after reload, source quote expansion and explicit fresh findings. Desktop and 390 CSS-pixel DOM/layout checks had no horizontal overflow. Screenshot capture timed out; no physical-device visual pass is claimed. Real church evidence was not sent or replaced. Existing real-data approval limits and presentation deferral remain.
