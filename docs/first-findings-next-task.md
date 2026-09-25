# Prompt for the next Steadmorrow task

Rebuild Steadmorrow's First findings into a fast, clear, visually thoughtful property assessment for a non-expert church leader exploring affordable housing. Implement and verify the work in the actual application; do not stop at a proposal, a cosmetic rewrite or a mockup.

Application: `C:\Users\patmekury\Downloads\Gloo hackathon 2026\Steadmorrow`.
Document workspace: `C:\Users\patmekury\Documents\Gloo hackathon`.

Read both AGENTS.md files, then these sources before making changes:

1. Original `C:\Users\patmekury\Downloads\Gloo hackathon 2026\Challenge brief\2026 Challenge Summary.pdf`, pages 18–20. Read the hackathon rules if making judging/submission claims.
2. `C:\Users\patmekury\Documents\Gloo hackathon\output\strategy\First_Findings_Correction_2026-09-24.md` — the latest mandatory correction, overriding conflicting historical designs.
3. `C:\Users\patmekury\Documents\Gloo hackathon\output\pdf\Website_Design_Reference_and_Style_Guide.pdf`, including its reference screenshots.
4. Rejected saved result: `C:\Users\patmekury\Downloads\Steadmorrow — A closer look at the land.pdf`.
5. Actual app architecture, `docs/gloo-agent.md`, `docs/public-source-recovery.md`, latest `docs/verification.md`, and relevant code. Establish current behavior from the implementation rather than historical status notes.

The current experience lists records, warnings and research gaps instead of answering the user's question. The required outcome is: “I understand what this property could become, what supports that possibility, what could prevent it, and the next useful step.” Keep the challenge's affordable-housing purpose central. Ground conclusions in original parcel records and applicable operative provisions. Never fabricate permission, unit counts, dimensions, affordability, ownership or completeness.

Deliver these corrections:

- Remove **Housing pressure nearby**, **Some information is still missing**, equivalent generic banners, and the repeated survey/title/feasibility boilerplate identified in the correction file. Keep a specific qualification beside the conclusion it affects; do not hide material uncertainty or replace the removed prose with more boilerplate. Preserve the approved priority choices.
- Hide the landing-page hero, large heading and video throughout First findings: loading, success, partial/error, reload and print/save-to-PDF. Pause the hidden video, preserve the opening landing page, and keep Back navigation and user input intact.
- Lead with an understandable property view and a concise, sourced housing assessment. Use Finch/Delve-inspired spatial explanation to show how supported constraints affect possibilities, without assuming a vendor integration or generating decorative buildings. Keep the selected area distinct from the mapped parcel. Use the existing brand and sequential workspace; avoid a dashboard full of cards, another permanent column or a long report. Put evidence detail behind deliberate disclosure.
- Resolve the research deficiencies, not just the prose. Audit the New York report's **MN** parcel identifier, **631 5 AVENUE**, **8,129 m²** parcel, **122 m²** selection and **C5-3 / C5-2.5** district overlap against original sources. Establish which rules apply to the intended area and their practical consequences. Use this as a regression case, never a pilot-city restriction. Where an authoritative source is inaccessible, retain useful facts and explain the specific effect on the conclusion without handing the user a generic research checklist.
- Diagnose the reported five-minute wait. Baseline end-to-end and model/tool timings; optimize independent work, caching, source relevance and unnecessary model round trips while retaining Gloo's control of research. Stream verified useful findings as available, protect against stale updates and preserve them if later lookups fail. Do not claim speed improvements solely from a shorter timeout or a faster empty answer.

Gloo must choose lookups, inspect results/errors, decide follow-ups and produce the sourced interpretation. Do not replace this with a fixed fetch pipeline plus an AI summary. Keep credentials server-side, durable call budgets intact, and existing public-source/people-data safeguards. Regrid stays deferred; do not activate paid services. Keep nationwide location-driven scope without claiming universal coverage. Do not spawn other agents unless separately authorized.

Before coding, briefly state the church leader's decision, the evidence needed and observable acceptance criteria. Then carry out the implementation. Keep the next stages coherent: user-triggered **Simulate structure**, then editable presentation materials from the same evidence/scenario version. Do not build unrelated features or pretend later stages are complete. Any capacity calculation introduced must be reproducible and account for the relevant parcel, existing development and applicable constraints.

Verify the actual app on desktop and mobile and inspect print/save-to-PDF behavior. Check the reported New York case plus other locations and an unavailable-source case; distinguish fixtures from live checks. Test source/citation integrity, geometry, Gloo tool calling, partial results, navigation, cancellation and budgets as relevant. Compare cold/warm time to first useful evidence and final assessment against the baseline, including result quality. Report honestly what now meets the challenge, the measured timings and any material gaps. Do not call this outstanding, complete or competition-ready merely because it looks better or passes tests.
