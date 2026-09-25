## Current First findings implementation — September 25, 2026

See [rebuild and evidence audit](first-findings-rebuild.md) and [measured performance](first-findings-performance.md). Verified snapshots now stream before the final interpretation; independent Gloo-selected tools can overlap. Publication navigation, exact section extraction, span-aware tables, identifier guards, partial retention and bounded history/output recovery are implemented. No scripted retrieval fallback was introduced. Current limits remain 20 rounds / 32 tools / 180 seconds and a durable rolling-day 480-call ledger; historical process-only descriptions below are superseded. The 93-test suite passes; parcel-specific legal applicability, reliable final latency and later simulation/presentation remain unfinished.

# Gloo property research agent — September 21, 2026



The live First findings path is now a **Gloo tool-using agent**. It does not run the old fixed retrieval pipeline before asking Gloo for prose. The model receives the user's selected area/priorities and tool definitions; it chooses calls, sees results/errors, requests follow-ups, reviews the evidence, and writes a source-linked assessment.



## What controls what



- Gloo chooses source-discovery hints, which published map source to query, code-search phrases, which sections to read, and follow-up actions when evidence is missing or rejected.

- Server tools perform HTTPS requests, publisher verification, polygon intersection, factual calculations and original-document parsing. They accept discovered IDs instead of arbitrary URLs. The model cannot change the selected area or create records by assertion.

- The server retains source timestamps/hashes, separates mapped parcels from the drawn outline, rejects unknown source/passage IDs, enforces partial/site scope, and keeps material ambiguities visible.

- Multiple parcel matches need the user's choice. An agent cannot select a convenient parcel on their behalf or declare permission, capacity, ownership, vacancy or funding from model memory.



## Tools available to Gloo



`resolve_location`, `discover_map_sources`, `read_map_source`, `read_planning_guidance`, `search_code_sections`, `list_chapter_sections`, `read_code_sections`, `read_housing_context`, `review_evidence`.



These are granular actions. In particular, original code sections are selected by Gloo from published search/TOC results rather than automatically choosing a fixed set. A failed section ID cannot become evidence; the error is returned so Gloo can correct the selection. Tool definitions offer only discovered source/section IDs. Minimum evidence checks reject a premature final answer that skipped connected research; repeated evidence reviews are removed from the offered actions until missing research attempts are completed. Truncated chapter listings require targeted search before completion. The agent chooses the actual sequence and queries within those acceptance conditions.



## Gloo API and Studio



The implementation uses the existing server-only key and `gloo-openai-gpt-5-mini` through `https://platform.ai.gloo.com/ai/v2/guarded/responses`. Gloo's current [tool-use guide](https://docs.gloo.com/api-guides/tool-use) documents nested function schemas and multi-turn `function_call` / `function_call_output` items with matching call IDs. Live verification found that replaying provider-specific reasoning items caused a 400 response; the implementation follows the documented tool-item replay format instead.



The agent runtime and tools are hosted by Steadmorrow's Node server. **No Studio-hosted agent object was created.** The available Studio tab redirected to sign-in. Current public documentation establishes API tool calling; a Studio-only builder for hosting these custom retrieval tools was not verified. Studio login is not required for the running server to use its existing API credential. No new key, subscription or billing setting was created.



## API and interface



`POST /api/first-look` runs the complete agent. Ordinary JSON clients receive the final evidence/assessment. The browser requests NDJSON and receives actual research-stage progress followed by one final result. It does not display raw internal tool logs. The previous `/api/property-evidence` route is retained only as an alias to the same agent run, not a scripted fallback.



Research begins when the user selects **See first findings** after setting priorities. The earlier automatic fixed prefetch on **Use this area** has been removed. Back/Edit retain geometry and priorities; stale streamed events cannot replace another step. Cached identical requests share a run, including when reached through the compatibility route.



The result's `research` object records mode, model, model-call count, tool-call count, action arguments, outcomes and timings. It stores observable actions, not private reasoning. Source passages remain server-attached. This audit is available for verification; the main interface shows findings and concise progress.



## Bounds and remaining limitations



At most 16 model turns and 24 tool calls per run; 180 seconds overall; 45 seconds per Gloo call; existing bounded public-source requests. Two concurrent runs and four new runs/minute are allowed. The local daily model-call limit is 480 per process (30 maximum-length, 16-round runs) and counts every model round, not just completed assessments. It resets on server restart and is not a durable billing cap. No automatic transport retry spends another model call; an agent may choose a different lookup or correct rejected output within its existing budget.



Complete results cache for 15 minutes; partial results for 30 seconds. No persistent account/case database exists. A browser cancellation protects the UI; bounded server work may finish after the tab leaves. Missing Gloo credentials cannot silently switch back to non-agentic retrieval.



The agent uses connected U.S. geography, discoverable verified GIS, official planning navigation, Municode, connected official code publications and ACS. Verified catalogue connections supplement discovery; they are not a location allowlist. Agent autonomy does not create missing records, access paid databases, or establish universal coverage. Numeric capacity, comprehensive title/environmental/utility checks, structure simulation and presentation exports remain separate unfinished work.



## Verification



See `verification.md` for live results and failure cases. Current deterministic tests cover the actual tool loop, error-directed follow-up, source-ID controls, citation validation, budgets, stream/origin checks, source/geometry safeguards and preservation of partial evidence.



### Multi-property correction



The prior 30-model-call cap was inherited from the earlier one-response feature and stopped normal agent use after two or three properties. It is now 480 calls per rolling 24 hours per process, with the same 16-round/24-tool per-run bounds, concurrency limits and caching. A fully exhausted budget is rejected before any lookup and explicitly identified as a research pause, not missing property records. This local limit resets on restart and does not change the Gloo subscription or act as a durable billing cap.



Verified catalogue connections use state/place GEOIDs solely to select applicable public providers. General discovery remains active everywhere. Geometry must still intersect the selected area. Connected code pages are selected by opaque IDs, originals are distinct from tables of contents, and blocked publication responses remain visible. The new official HTML adapter supports the NYC Zoning Resolution's section markup; it is not a universal web scraper or proof of complete code coverage. Beverly's city-linked eCode360 publication returns HTTP 403 from this server; its content is not manufactured or bypassed.





### Nationwide discovery recovery



`discover_map_sources` now accepts optional `search_scope: local | regional`. Regional search adds catalogue pagination and a wider search while retaining the user's resolved locality. The response contains bounded search diagnostics, field metadata, recognized identifier fields and candidate parcel fields. `read_map_source` accepts optional `identifier_field` from the returned source metadata. Gloo makes the choice; the server checks it against the selected source and prevents generic object IDs/private fields or a zoning internal ID from becoming a district. Failed local discovery/no matches require a regional attempt before finalizing a missing map result. The tools accept no model-generated fetch URL or substitute coordinates.



`jurisdiction.mjs` retains active town/township identifiers and functional status. Code lookup uses that authority, with name-order aliases, rather than always choosing the county outside an incorporated city. Statistical census areas are not treated as governments. These changes improve public-source discovery, not the availability of every U.S. property record or original legal provision.





## Public-source recovery — September 24, 2026



Regrid is deferred. Gloo-selected official-website/PDF research, linked GIS discovery, recovery and shared public-response caching are implemented. See docs/public-source-recovery.md (public-source-recovery.md from this docs folder) for exact behavior and bounds. The production server now persists 480 rolling-24-hour model-call reservations, with 20 model rounds / 32 tools / 180 seconds per case. Historical process-only budget descriptions are superseded. Complete national coverage, OCR, record uploads, numeric feasibility, simulation and presentation exports remain unimplemented.
