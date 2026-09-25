# First findings: mandatory user correction — September 24, 2026

Status: accepted product requirements and implementation handoff, not completed application changes. This correction supersedes conflicting earlier findings designs and disclaimer requirements. The original challenge remains the authority for challenge claims.

## The failure to correct

The user rejected the current First findings experience after reviewing `C:\Users\patmekury\Downloads\Steadmorrow — A closer look at the land.pdf`. Retrieving records and listing unresolved checks is not the intended outcome. The audience is a non-expert church leader exploring affordable housing on church-owned vacant land. The product must lower the intimidation barrier and help that person understand what the property could support, why, what could prevent it, and the next useful decision.

Read the original `C:\Users\patmekury\Downloads\Gloo hackathon 2026\Challenge brief\2026 Challenge Summary.pdf`, pages 18–20, at the start of substantive work. Page 19 requires a credible preliminary feasibility read, likely obstacles and supported responses, plus usable presentation materials. Page 20 names Finch 3D and Delve as inspiration. Use their site/planning relationship as inspiration for explaining possibilities and constraints visually; do not treat this as an instruction to integrate either vendor or a license to fabricate a scheme. Read the rules before making judging or submission claims.

## Explicit changes requested

- Remove the **Housing pressure nearby** section from First findings. Affordable housing remains the purpose; removing this section does not remove that purpose. Do not silently remove the approved **Understand local housing needs** priority option.
- Remove **Some information is still missing** and equivalent generic missing-information banners. Replace them with the specific consequential issue only where it affects the answer.
- Remove the repeated copy **Mapping is not a survey**, **It is not a surveyed boundary or proof of title**, and **Preliminary research for discussion. Home count, buildability and financial feasibility have not been established.** Do not replace them with differently worded boilerplate. Retain honest, concise, property-specific qualifications alongside the affected claim and access to its sources.
- The landing-page hero, large heading and background video must not be visible during First findings, including loading, result, partial/error, reload and print/save-to-PDF states. Pause hidden video playback. Keep the hero on the opening page; retain a deliberate route back and preserve the user's work.
- The user reports waits of up to five minutes. Diagnose actual end-to-end latency; do not dispute the observation based on a configured server timeout. Improve the underlying research and progressively reveal verified useful results. Shortening a timeout to return less evidence does not solve the problem.

## Experience and research standard

Lead with the actual property and a concise evidence-backed answer about its affordable-housing potential. Use a purposeful site visual to connect land, the relevant area and supported constraints. Present only the few findings that change a church leader's decision; reveal records, dates, passages and technical detail on demand. Use familiar language rather than district codes and research-status terminology without explanation. Do not make the church act as a developer or return routine retrieval work as generic assignments.

The reported New York case is a regression case, not a geographic scope restriction. Verify the displayed parcel identifier **MN**, address **631 5 AVENUE**, mapped area **8,129 m²**, selected area **122 m²**, and districts **C5-3 / C5-2.5** against original evidence. These are values printed in the rejected report, not validated facts. Determine which rules affect the selected area versus the entire parcel. Do not infer permission from a district label or allocate the whole parcel's capacity to the selected corner.

Preserve Gloo-directed tool calling: Gloo chooses research, sees failures, chooses alternatives and interprets retrieved evidence. Deterministic tools execute requests, verify geometry, calculate supported quantities and enforce provenance. Improve scheduling, independent tool concurrency, caching, relevant source selection and payload size based on measurements. Preserve durable budgets and source-access controls. Regrid remains deferred. There is no city allowlist and no complete-national-coverage claim.

Design with the supplied Website Design Reference and Style Guide: Outfit, restrained white/paper surfaces, brand green and compact sequential navigation. The user's Apple-level quality expectation means deliberate hierarchy, clarity, continuity and rigorous verification, not Apple imitation, decorative effects or an award guarantee.

Keep the journey coherent: findings → user-triggered **Simulate structure** → editable one-pager, slides and talking points. A site-specific conceptual massing view must follow retrieved constraints and explicit assumptions. Do not substitute the marketing city animation or invented unit counts for feasibility. Later deliverables must consume the same evidence/scenario version.

## Acceptance evidence before claiming completion

1. A first-time church user can identify the property, the supported housing conclusion, the decisive constraint and next action without opening technical records. Until tested with such a user, describe this as a design acceptance target, not validated usability.
2. The rejected section, generic missing-data banner, repeated disclaimers and hero/video are absent in every findings state and saved/printed output. Back navigation, keyboard access and saved selections still work.
3. The New York parcel identifier and zoning-applicability issue are checked against original records. Ambiguous or failed lookups cannot produce invented permission, capacity or an empty result disguised as success.
4. Measure cold and warm runs across multiple locations, including a failure case: time to first useful evidence, time to final assessment, model/tool timings and retained evidence. Report before/after results, not an unmeasured speed claim.
5. Review actual desktop/mobile renders against the design guide and inspect saved/printed output. Run meaningful regressions on source citation, geometry, Gloo agency, partial recovery, cancellation/stale responses and budgets.
6. State what challenge outcomes now work and what remains incomplete. Passing tests, a polished mock, a successful fetch or an attractive concept do not establish completed feasibility.

