# Gloo agent development

The former retrieve-then-interpret integration has been replaced by the [Gloo property research agent](gloo-agent.md). Read that document for the actual tool loop, Studio distinction, limits and verification.

Keep `GLOO_API_KEY` and `GLOO_MODEL` on the server; the existing key remains in Git-ignored `.env.local`. Neither reaches browser settings. The guarded Responses endpoint receives nested function definitions; model calls are executed through the bounded server tool registry and their results returned under matching call IDs.

`/api/first-look` and the compatibility `/api/property-evidence` route use the same agent. A missing key returns an explicit unavailable state. There is no automatic scripted research fallback. User/source text is untrusted data; no network targets, source identities, parcel choices, geometry changes, shell commands or publications can be authorized by retrieved content.

Model output is rendered as text. Citation validation verifies identity and original passage text; it does not certify legal or semantic correctness. Legal, financial and published decisions require human review.

Official references: [Gloo tool use](https://docs.gloo.com/api-guides/tool-use), [Responses](https://docs.gloo.com/api-guides/responses), [Studio playground](https://docs.gloo.com/studio/playground-chat).
