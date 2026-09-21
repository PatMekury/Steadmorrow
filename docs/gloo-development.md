# Gloo first-look integration

Implemented September 18, 2026. This is the first live Gloo connection, not a property-record retrieval pipeline.

## Configuration and request

- `GLOO_API_KEY` stays in Git-ignored `.env.local` or the server environment. `GLOO_MODEL` defaults to `gloo-openai-gpt-5-mini`. The browser receives neither setting.
- `POST /api/first-look` validates a four-corner area and bounded user priorities. It sends the approximate area, centroid, user-entered search query and starting priorities to Gloo. It does not send Google Places response data or imagery.
- The server calls `https://platform.ai.gloo.com/ai/v2/guarded/responses` with Bearer authentication, a 2,200 output-token ceiling, a 45-second timeout and no automatic retries. JSON output is validated before display and inserted as text, never HTML.
- Same-origin JSON and loopback Host validation protect this local endpoint. This is not ready for public deployment without user authentication and durable per-user limits.
- Identical inputs share one in-flight call and a 15-minute server cache. The browser reuses its last unchanged result. The server permits four new requests/minute and 30/day per process. These limits reset on server restart; they are not a durable billing cap. No billing settings were changed.

## Experience and evidence

The second prompt is now **What matters most as you explore?** Suggestions are **Retain ownership** and **Understand local housing needs**. Previously selected retired chips are preserved as editable text; they are no longer offered as suggestions.

**See first findings** opens a sequential first-look screen. Gloo reflects the user's aim, proposes three questions and suggests one next conversation. Expandable details explain why each question matters and who or what could help. Back to map and Review priorities retain the user's work. Changes to inputs invalidate the last result when requesting another review; stale replies cannot replace a different step.

The visible scope says property records have not been checked. Result metadata is always `user-input-only`, with Gloo attribution. User preferences do not establish organizational agreement. The prompt prohibits invented sources, local statistics, ownership, vacancy, zoning permission, feasibility, capacity, costs or developer recommendations. Output validation checks structure, lengths and URLs/HTML; it does not prove semantic correctness. AI guidance still needs human review.

Property/parcel records, zoning, local housing statistics, licensed retrieval, a source-backed evidence store, multi-agent orchestration, scenarios and exports remain future work. Do not call this grounded property research. Gloo's grounded endpoints require supplied/ingested content and evidence validation; the shared dataset cannot be assumed to contain this property's records.

## Verified official references

- [Responses API](https://docs.gloo.com/api-guides/responses): current guarded v2 endpoint, request/response fields, model IDs and bearer authentication.
- [API keys](https://docs.gloo.com/studio/manage-api-credentials): key lifecycle and secret handling.
- [Models](https://docs.gloo.com/api-guides/supported-models): current model catalog.
- [Grounded Responses](https://docs.gloo.com/api-guides/grounded-responses): publisher content and grounding limitations for the later evidence phase.

All checked September 18, 2026. Do not substitute deprecated OAuth client credentials or assume native web search/parcel lookup exists.
