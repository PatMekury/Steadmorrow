# Spatial First findings — September 26, 2026

The user authorized building the previously planned spatial First findings experience with “now start building.” Work was installed in the existing Steadmorrow application, preserving earlier uncommitted work and the removed daily Gloo cap.

## Challenge and scope

The original Challenge Summary PDF pages 18–20 were reread for this build. Page 19's preliminary, understandable housing assessment and professional next conversation remain the purpose. Page 20's visual massing is now a user-requested enhancement. The implementation provides an illustrative detached-block study, not parcel-specific legal capacity, architecture, engineering, affordable delivery or a complete challenge submission.

## Implemented

- Desktop: measures on the left, a dominant paper site workspace, and a concise assessment/evidence inspector on the right. Mobile: assessment, model, measures, consequential next step and evidence. Existing Outfit, paper, green and matte model language retained.
- Source parcel, selected outline and zoning geography stay separate. Before choosing a parcel, all returned candidate boundaries and each candidate's selected-area overlap share are shown. No automatic merging or inferred legal lot.
- User-triggered simulation within First findings. Gloo interprets arbitrary free-text priorities, selects relevant public-source follow-ups and geometric tests, sees errors and measurements, reviews tested alternatives and selects a result. No keyword map or deterministic research fallback.
- Every priority interpretation must include an exact excerpt of user-supplied text. AI-chosen dimensions and typology are disclosed assumptions, not invented user preferences. Clickable callouts highlight related geometry; whole-site priorities do not imply ownership or legal control. Keyboard focus, Escape dismissal and reduced-motion CSS are included.
- Projected metric geometry with polygon clipping tests complete padded footprints against both the selected area and matched parcel. Holes and concave boundaries are preserved. Parking, maneuvering strips and blocks are allocated without overlap. One block is one assumed dwelling; additional storeys increase gross floor area, not dwelling count.
- Four measures: homes drawn, parking drawn with the requirement separately unresolved, land outside buildings (including other uses), and assumed height. A no-fit arrangement can be selected and displayed; it does not prove that no other design works.
- SVG oblique massing and north-up plan, rotate/focus/reset, stable camera across refinements. No invented surrounding buildings, terrain, sunlight study or façade detail.
- Refinement keeps a previous concept visible while Gloo runs; failures retain it. Source/assessment/scenario versions are bound. The server retains the scenario with its cached assessment for reload; expired server evidence requires refreshed findings rather than accepting browser-supplied records.
- An editable HTML discussion brief includes the same model, quantities, assumptions, next conversation, source links and versions. This is not yet a verified paginated one-pager or slide export.

## Verification

- Existing tests plus geometry, privacy, evidence trust, tool-loop recovery, user-excerpt grounding, invalid clarification, and earlier-variant review regressions pass. See `tests.txt` and `syntax.txt` for the final run.
- Browser checked at desktop 1440 × 1000 and mobile 390 × 844. No horizontal overflow. Mobile outcome precedes model and measures. Twelve rendered blocks and eight parking bays matched the deterministic synthetic UI fixture. Plan/3D controls, callout highlights, Escape focus return and the actual HTML download were checked.
- `Synthetic_UI_discussion_brief.html` is the downloaded **synthetic interface fixture**, not a property assessment. The content is editable and the geometric counts match that fixture. Actual saved-PDF pagination has not been verified.
- The main page's hidden hero had computed display `none` and its video was paused during First findings. The user's selected area remained 91 m² throughout the live checks.
- First live scenario attempts exposed excessive clarification and lost review receipts. Those failures were not passed off as success. Tool availability now depends on valid state; reviewed alternatives keep their receipts; a failed geometric test cannot delegate dimension selection to the user. Dedicated regressions cover these failures.
- `live-retained-evidence.json`: live Gloo over retained, previously retrieved Houston evidence (not a fresh property lookup). It selected a measured no-fit result in **28.782 s**, five model/tool calls, after correcting a rejected rationale. The retained selection/parcel intersection was 17.457 m². This is not the user's current 91 m² browser selection.
- `live-synthetic-geometry.json`: live Gloo over explicitly synthetic geometry. It interpreted free text, chose dimensions, calculated/reviewed and selected **12 blocks and 6 parking bays** in **15.767 s**, four model rounds and five tool calls. A redundant clarification in the same batch was rejected. This confirms the live tool/calculation path, not any real property's capacity.
- An earlier fresh main-page property research run reached first evidence at **8.499 s** and final assessment at **60.112 s**; another took **7.000 / 54.497 s**. These do not establish consistent nationwide timing or legal accuracy.
- Final installed main-page run: first property evidence **13.046 s**, final research **52.351 s**. The subsequent actual `/api/scenario` interaction completed in **37.670 s**, six model/tool calls. Gloo corrected a rejected invented priority excerpt, interpreted the actual saved affordable-housing goal, tested an arrangement and selected its reviewed **no-fit** result on the retained **91.1 m²** study area. It drew zero homes and zero parking bays; required parking remains unknown. The six-home target was an AI test assumption, not the user's requested count or a capacity estimate. Reload retained the completed scenario and kept the hero hidden/paused.

## Finch documentation used

These are design/architecture references; Finch is not integrated, and no vendor API entitlement is assumed.

- [Interface and key figures](https://docs.finch3d.com/courses/finch-101/finch-101-finch-interface): selection-linked detail rather than a wall of findings.
- [Massing Studio](https://docs.finch3d.com/courses/finch-101/finch-101-massing-studio) and [calculate data](https://docs.finch3d.com/docs/projects-and-variants/massing-studio/calculate-data): explicit geometry, storeys, programs and assumptions behind quantities.
- [Floor-plate algorithms](https://docs.finch3d.com/courses/finch-101/finch-101-generate-floor-plate-algorithms), [corridors](https://docs.finch3d.com/courses/finch-101/finch-101-generate-corridor), and [unit mix](https://docs.finch3d.com/docs/projects-and-variants/story-editor/generate-unit-mix-around-circulation): why gross area alone cannot establish dwelling count, accessibility or safe egress. Those capabilities are **not implemented** in this detached-block tool.
- [Algorithm theory](https://docs.finch3d.com/docs/projects-and-variants/story-editor/algorithm-theory): distinguish hard constraints from preferences. Here, geometric containment is enforced; regulatory compliance is not inferred.
- [Variants](https://docs.finch3d.com/docs/projects-and-variants/iterate-with-variants): consistent measures and camera; every selected scenario retains its own version.
- [Archie](https://docs.finch3d.com/readme/news/ai-agent-archie): agent actions on structured project data, not an AI paragraph appended to a fixed pipeline.

## Material remaining boundaries

The prototype does not derive enforceable setbacks, FAR, density or residual whole-parcel rights, certify current code applicability, place internal rooms/cores/corridors, solve access/egress, establish survey/title/easements/utilities/environmental suitability, prove affordability, or optimize all possible designs. Its spacing is expressly not a legal setback. The existing research assessment still needs continued source-applicability and concise-language evaluation; a valid citation does not prove a legal conclusion. The user-selected area is never treated as a legal parcel or zoning lot.

Apartment/rowhouse typologies, accessible parking and circulation, calibrated regulatory constraints, financial/delivery feasibility, editable slides/talking points and verified PDF pagination remain outstanding. The discussion brief is a bounded initial export, not completion of the core presentation journey. No national coverage, expert certification, winning probability or “legally supports twelve units” claim is made.
