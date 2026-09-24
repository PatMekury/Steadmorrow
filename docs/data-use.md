# Steadmorrow data use

Updated September 21, 2026. This is the implemented prototype's data declaration, not a claim of privacy certification or perfect detection.

## Challenge alignment

The original **2026 Challenge Summary.pdf**, page 9, prohibits building on scraped congregational, donor, counseling or minor data and asks builders to identify synthetic or properly consented data. Pages 18–19 require protecting donor/beneficiary privacy while using public parcel records and zoning codes for Sacred Spaces, Safe Homes. This implementation keeps that distinction: public property research remains real and cited; private people's records are outside the product's scope.

## What the application uses

| Data | Origin and purpose |
| --- | --- |
| Selected outline and property query | User-provided property location; coordinates guide public-source research. Google receives permitted place searches; Gloo receives the selected area, property query and permitted priorities when research is requested. A selected outline is not a legal parcel boundary. |
| Property and planning evidence | Real public GIS records, Census geographic references, published codes and planning guidance, with source URLs, timestamps and hashes. Public availability is not consent to collect people's unrelated records. |
| Housing context | Published aggregate ACS estimates, with geography and period. No individual household files. |
| Starting priorities | Optional, nonpersonal land-use goals and the two approved choice chips. No personal story, roster or donation history is needed. |
| Privacy tests | Synthetic people/contact/private-record examples in tests/privacy.test.mjs and tests/records.test.mjs. These are intentionally rejected inputs, not live congregational data or factual findings. Browser testing used the synthetic reserved-domain address fictional@example.invalid and restored the user's original property goal. |

No actual membership, donor, counseling, prayer-request, child or beneficiary records are used to build or demonstrate this feature. There is no personal-record import, consent-collection workflow or people-data connector. A consent checkbox, user assertion or "synthetic" label does not bypass the prototype's input restrictions. Any future feature requiring personal records needs a separate purpose-specific consent, minimization, access, retention and deletion design; organizational access alone must not be treated as an individual's consent.

## Implemented boundaries

- **Before browser persistence:** shared local screening checks priorities and property search text for common private-record/contact signals. Flagged fields are omitted from the saved state, while the text remains editable in the current field. Existing saves are checked on load; detected private fields are cleared before rendering or research. Geometry, safe priorities and approved choice chips are retained.
- **Before Google requests:** autocomplete and manual property search reject text with detected private information. This does not undo queries already sent before a later keystroke makes the text recognizably sensitive.
- **Before Gloo or tools:** the server independently validates both research endpoints before constructing a tool session, creating the request cache key, emitting diagnostics or requesting any upstream research/model call. Client-side validation cannot be the only boundary. Errors do not echo the flagged content. Screening itself makes no external call.
- **Public-record minimization:** private field names and aliases are excluded from feature requests, identifier selection and returned attributes. Unrequested feature attributes are discarded before source evidence is constructed. Public statutory text and publisher metadata are still used as source material and can contain public official names/contact details; this is not a general anonymizer for every document.
- **Agent scope:** Gloo is instructed to research property/land-use records and aggregate housing statistics, omit incidental personal details and avoid private people's records or fabricated beneficiary stories. Technical source/argument restrictions remain in place; prompt wording alone is not the privacy boundary.
- **Storage and logs:** permitted inputs are stored in this browser, not an account. Successful research is temporarily cached in server memory; the server does not persist cases to a database. Production diagnostics record tool names/outcomes and counts, not submitted text. Restarting the local server cleared its pre-change in-memory cache. The application cannot retract earlier provider requests or change Google/Gloo retention policies.

## Limits and review

The deterministic checks recognize common email/phone/identifier patterns and explicit sensitive-record language. They can miss names, context-dependent disclosures, other languages and obfuscated content, and may flag benign wording. They are not a certified PII detector, anonymization system or proof of consent. The interface therefore asks for property goals only and discloses Gloo processing. Do not claim that every sensitive detail is automatically removed or that the app can safely accept private records.

The next simulation/presentation stages must inherit this restricted evidence contract. Real property facts stay sourced; any future illustrative person/story must be explicitly synthetic and must never masquerade as a real beneficiary or community endorsement. Expert review remains required for consequential planning, legal and financial decisions.
