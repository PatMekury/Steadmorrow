# Gloo evidence interpretation

Updated September 21, 2026. The original reflection/three-question phase has been replaced by [location-driven First findings](first-findings.md).

- Keep `GLOO_API_KEY` in Git-ignored `.env.local` or the server environment. The default model is `gloo-openai-gpt-5-mini`. Neither setting is sent to the browser.
- `/api/property-evidence` retrieves public records. `/api/first-look` interprets retrieved provisions only after a parcel, one zoning district, usable coverage and a stable jurisdiction are available. User priorities guide the discussion but never establish facts.
- Calls use `https://platform.ai.gloo.com/ai/v2/guarded/responses`, Bearer authentication, 3,500 output tokens and a 45-second timeout. No automatic paid retries. The model receives identified source passages and explicit gaps; it returns passage IDs. The server attaches the original text and rejects unknown references, invalid output and unsupported numeric home counts.
- Validation establishes citation identity and output structure, not legal or semantic correctness. Every interpretation remains preliminary. Table columns, footnotes, exceptions and later amendments need human review.
- Identical requests share an in-flight call and a 15-minute cache. Four new calls/minute and 30/day per process are local development limits, reset on restart. They are not a durable billing cap. No billing configuration was changed.
- Missing credentials, failures, timeouts or invalid output leave retrieved records available. No invented fallback findings are displayed. Same-origin JSON, loopback Host checks and bounded request bodies protect the local endpoints.
- Google Places response contents and imagery are not supplied to Gloo. Model output is inserted as text, never HTML. Secrets remain outside browser routes and static files.

See [First findings](first-findings.md) for exact source coverage and outstanding feasibility/simulation/export work, and [verification](verification.md) for checks.

Official references: [Responses API](https://docs.gloo.com/api-guides/responses), [API credentials](https://docs.gloo.com/studio/manage-api-credentials), [models](https://docs.gloo.com/api-guides/supported-models). Do not infer that Gloo supplies native web search or automatically knows the property's records.
