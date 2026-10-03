# Study state and context repair — September 29, 2026

The user authorized implementing the diagnosed fix. This repairs the scenario agent's context overflow and repeated evidence handling. It does not certify property feasibility or resolve every assessment-writing error.

## Cause and implemented repair

The prior diagnostic reproduction returned HTTP 400 `CONTEXT_LENGTH_EXCEEDED`, `retryable: false`. Detailed road rendering data was repeatedly included in route receipts and evidence reviews. The rejected request was 825,576 characters. Removing only duplicated route street geometry made the same request succeed, but the model still selected another evidence review. Both data separation and progress state therefore needed repair.

- `scripts/study-context.mjs` projects model-facing data without mutating the full server/UI evidence. Geometry and rendering arrays stay available to calculation, routing, the scene and exports. Measurement values, receipt IDs, original concerns, source passages and qualifications remain in the model view.
- The scenario rebuilds one current state each round: original user text, completed assessment and housing analysis, current evidence, interpreted priorities and attached answers, current concepts, reviewed IDs and action outcomes. Only the last two complete tool-call/result exchanges are retained. Earlier results that matter remain in the current state.
- Interpretation is required before research/layout choices. A completed sourced assessment is handed over explicitly. Reviews of unchanged evidence and already reviewed concepts retire from the offered tools; changed evidence reopens review and invalidates stale concepts. Already attempted no-argument discovery is not repeated. Complete site context is retained. Once factual questions are answered, nearby-place tools retire until relevant unanswered priorities exist.
- Identical research calls against the same evidence state cannot execute repeatedly. Targeted searches and new source reads remain available. Gloo still chooses interpretations, research, forms, dimensions, alternatives, review and selection; no canned layout or keyword pipeline was introduced.
- Typed upstream diagnostics now preserve status, error code, trace ID and retryability without saving credentials or arbitrary provider error text. Request-size and per-round token/timing diagnostics are logged. Context overflow receives a specific message rather than an unexplained generic service error.

No model upgrade, increased limit, daily cap, legal gate relaxation, route shortcut or geometry-engine change was made.

## Verification

193 tests and the full syntax check pass in the installed app. New regressions cover unchanged source/receipt qualifications, nonmutation of display geometry, bounded conversation history with paired tool calls/results, retirement/reopening of evidence review, completed assessment handoff, continuing availability of targeted research and layout choices, and safe typed upstream errors. The stale-concept regression now changes evidence via distinct source searches, instead of pretending repeated `review_evidence` calls retrieve new sources.

### Retained supported property case

Real retained Jerusalem Baptist Church evidence: parcel 0190560000004, roughly 697 m² selected, housing purpose and police proximity. The final focused study used the same repaired code and original geometry. Its first two successful Gloo outputs (priority interpretation and police receipt attachment) were replayed locally from the earlier focused attempt, saving repeat calls. Six new Gloo requests then tested, reviewed and selected a result. There were eight logical model/tool steps; 47.692 seconds measures the continuation including local replay, not eight fresh calls.

Gloo tested an assumed apartment mass and then attached rows. Both measured no-fit. One initial selection rationale failed the existing numeric/legal wording guard; Gloo then tested the alternative, reviewed it and selected a valid no-fit result. This is not proof of no capacity: other dimensions, orientations and arrangements remain untested. No homes were invented. Peak input was 19,240 tokens, compared with 249,690 on the last successful request before the original overflow.

Two earlier focused attempts stopped when Gloo requested research outside the replay harness (wider site context and planning guidance). They are not successful completions. Their requests exposed already completed tasks that still appeared as available; the final readiness handling retires those tasks. These harness stops did not change the app or establish that public records were unavailable.

### Installed browser flow

One complete refresh was necessary because the previous diagnostic cleanup had lost the original in-memory session. New property research reached first evidence in 5.617 seconds, but its assessment was unavailable after 114.252 seconds and 11 model / 16 tool calls. The writer failed numeric-capacity and operative-support validation. This is a separate outstanding assessment issue; this repair does not loosen those checks or describe that run as successful research.

The automatic study then completed in 17.166 seconds with three model/tool calls: interpret priorities, attach the 836 m walking police receipt, finish unresolved study. Input stayed between 8,521 and 12,367 tokens. No context error or repeated evidence loop occurred. The installed UI retained the matched parcel, both priorities and full routed detail. It correctly showed that the housing approval path remained unresolved, without proposing a housing layout. The earlier supported-case no-fit result was not substituted into this new assessment.

The server remains running on port 5173, process 34672 at verification. Browser reload and saved-state results are recorded in the workspace verification report.

## Challenge alignment and remaining work

Original Challenge Summary pages 18–20 were read. This is a necessary dependency for the page-19 objective: a non-expert church leader obtaining a credible property snapshot and presentation in minutes. Stable assessment quality, complete applicable constraints, affordable delivery, expert review and the unfinished presentation deliverables remain separate work. Neither passing tests nor a completed conceptual no-fit study establishes legal capacity, national coverage or challenge completion.

Detailed evidence: workspace `output/verification/study-root-cause-2026-09-29/README.md` (diagnosis) and `output/verification/study-state-repair-2026-09-29/README.md` (implementation). Captured requests omit authorization headers and credentials.
Final browser reload retained the completed unresolved study, selected parcel, both priorities and the routed police receipt without new Gloo calls. The route detail opened correctly; this is not a new visual-design acceptance pass.
