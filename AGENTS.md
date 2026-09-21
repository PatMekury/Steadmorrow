# Steadmorrow application

## Mandatory challenge alignment — September 20, 2026

This is a competition project. The assistant is responsible for keeping it aligned; do not make the user repeatedly rediscover drift. A working API, polished screen, extra agent, or impressive animation is not evidence that the challenge has been met.

**Primary brief:** `C:\Users\patmekury\Downloads\Gloo hackathon 2026\Challenge brief\2026 Challenge Summary.pdf`, especially PDF pages 18–20, **Challenge 3: Ministry Resourcing → 1. Sacred Spaces, Safe Homes**. Read the relevant original pages at the start of every substantive planning, design, implementation or review task. Do not substitute this file, memory, an earlier summary or a speculative feature list for the source. Read `2026 Hackathon Rules.pdf` when prioritizing against judging criteria or making rule/submission claims.

Before building or recommending a feature, establish:

1. The exact challenge objective/requirement it serves and the relevant source page.
2. The concrete outcome it enables for a non-expert church leader.
3. The required evidence/data and what remains unverified.
4. An observable acceptance test and the next missing part of the address-to-presentation journey.
5. Whether it is core delivery, a necessary dependency, a user-requested enhancement, or a bonus. Do not spend the next work block on optional polish while the core outcome is missing without a task-specific reason.

Before declaring completion, compare the actual application and checks with those criteria. Report completed requirements and material gaps candidly. A proposal, mock, successful API call or passing syntax/unit tests must never be described as a completed feasibility feature. Recheck alignment when the scope changes. If an improvement cannot demonstrate contribution to the challenge outcome, defer it.

**Affordable housing remains the purpose.** Distinguish a physically possible housing concept from supported affordability conditions, commitments and delivery. Do not let generic building generation replace the challenge's affordable-housing outcome.

**Current replacement brief:** `C:\Users\patmekury\Documents\Gloo hackathon\output\strategy\Steadmorrow_Challenge_Aligned_Experience.md` records the September 20 audit, recommended findings/simulation/presentation design, dependencies and acceptance gates. Read it for this replacement work, while retaining the original challenge PDF as the authority. It is a plan, not implemented functionality; the pilot jurisdiction is a recommendation, not a user-selected location.

**Core success chain:** church address and optional parcel details → retrieve relevant public parcel data and zoning provisions → preliminary plain-language feasibility with sources and uncertainty → likely obstacles with supported, mission-aligned responses → editable one-pager, slides and talking points. The brief's test is a non-expert leader obtaining a credible snapshot and presentation in minutes. Treat that timing as a target until measured. Preserve expert review and human authority over legal, financial and published decisions. Do not invent zoning provisions, approvals, costs, unit counts, sources, community support or Scripture.

**User's revised build order:**

1. Replace **See first findings** with parcel records, applicable zoning/rules and an evidence-backed preliminary feasibility assessment. The current user-input-only reflection/questions endpoint is a rejected implementation of this stage, not an acceptable fallback presented as findings.
2. Provide a user-triggered **Simulate structure** step grounded in the retrieved constraints and explicitly identified design assumptions. It is conceptual massing, not structural engineering, an approved plan or certified capacity. Use recorded parcel boundaries for rules that apply to them; never substitute the user's four-point exploration area.
3. Produce presentation materials as the final user-facing stage. Generate them from the same findings/scenario version so citations, figures, limitations and illustrations remain consistent. Required presentation content must be developed and tested in parallel with the underlying data contract; "last" must not mean discovering at the deadline that export cannot work.

Maintain the user's vacant-land focus and sequential, back-navigable experience. Do the research and explain its consequences; do not turn the church into a developer or return routine research work as a generic list of questions. Ask only about information that cannot responsibly be resolved from the available evidence or materially affects the user's intent.

**Regression checks:** no empty evidence list accepted as parcel/zoning research; no inferred legal parcel from a sketch; no legal allowance inferred from a zoning label alone; no uncited physical/financial capacity; no invented national coverage; no research-completion label for generic advice. A failed lookup returns an honest partial result, the missing check and a targeted recovery path.

The supplied brief makes visual massing, an illustrative financing sketch and one-click slide export bonus items; one-pager/slides/talking-points generation itself is core. The user has now explicitly requested structure simulation, so include it after the evidence-backed assessment without displacing the core presentation deliverables. Do not claim a concept will win or is unique without supporting evidence.


This is the application folder selected by the user. Keep integration code and runtime assets here.

Read the project context at `C:\Users\patmekury\Documents\Gloo hackathon\AGENTS.md` and the relevant source documents before expanding scope.

- Challenge/rules: `C:\Users\patmekury\Downloads\Gloo hackathon 2026\Challenge brief`.
- Gloo docs: `C:\Users\patmekury\Downloads\Gloo hackathon 2026\Documentatation` (spelling intentional).
- Solution design: `C:\Users\patmekury\Downloads\Gloo hackathon 2026\Solution design`.

## Current implementation — September 18, 2026

The opening section and **Start with the land** section are implemented in vanilla HTML/CSS/JavaScript with a dependency-free Node development server. Run `npm run dev` with Node.js 20 or later; preview at `http://127.0.0.1:5173`. `npm run check` checks syntax and `npm test` runs geometry/server tests. Consult `README.md` and `docs/verification.md` for checked behavior and remaining verification.

### Preserve the opening section

The hero contains a green editable icon/wordmark, the selected headline “Could this church land become housing?”, the approved city animation, and Get started scrolling to `#experience`. The headline uses two lines on desktop and three on small screens. No Request a demo action should be added.

Preserve the reference composition: green icon + italic wordmark at upper left, a bold centered headline, small black pill action, and the city filling the opening view. Preserve the animation's approved density, shared ground/building material, and exposure. Do not swap in the earlier conversation-note prototype from the research workspace.

Brand color is centralized in `styles.css` as `--brand-color`. The user requested muted autoplay, continuous looping, removal of the Concept illustration caption, and a slightly smaller headline (about 11% reduction). Keep the headline and Get started visible during playback and retain the pause control. The black “For Churches” descriptor remains centered beneath the full icon-and-wordmark at a readable 18–22px. The approved animation is a concept, not a map or feasibility result.

### Land selection

`land.js`, `land.css`, and `geometry.js` implement live Google Maps, address suggestions while typing using `AutocompleteSuggestion`, Map/Satellite views, selection, and confirmation. Maps loads lazily as `#experience` approaches the viewport. Suggestions start after two characters with a 200ms debounce, use session tokens, and preserve typing focus. Arrow keys highlight a suggestion; Enter chooses the highlighted option and Escape dismisses. Find property retains a `Place.searchByText` fallback. Ignore stale suggestion and place-details responses; keep Google Maps attribution in the dropdown.

Keep both user-requested selection modes:

- **Polygon:** exactly four points placed in perimeter order, closing after point four. Support irregular quadrilaterals, with a blue outline, translucent blue fill, and four white circular handles with dark borders.
- **Click to select:** a click creates a four-corner starting area around the selected point. The user adjusts its corners; it does not detect or verify parcel boundaries.

Corners remain draggable while editing. Preserve Undo, Clear, selection framing, keyboard placement at the map center and directional corner adjustment. Crossed edges, duplicate corners, and zero/degenerate areas must prevent **Use this area**. Use this area opens the next priorities screen; its **Back to map** arrow reopens editing without losing the outline or answers. Search, view changes, and recoverable errors must not silently discard the current outline.

Persist only user-entered query text, user-drawn geometry, selection mode, confirmation state, and user-entered starting priorities in browser storage. Do not persist Google Places result content. If storage is unavailable, explain that the selection lasts only for the visit. The approximate area and outline do not establish parcel boundaries, ownership, permission, buildability, or housing capacity.

Starting priorities are implemented as the next screen replacing the map workbench, never another column. The two optional prompts, selectable suggestions, local autosave, and editable Starting priorities summary are implemented. Back to map remains available throughout. A server-side Gloo first-look connection now produces initial questions and next-conversation guidance. Property-record retrieval, Gloo agent orchestration, accounts, and later decision/export stages are not implemented. See docs/gloo-development.md. Do not present concept documents or this selected area as completed research.

### Maps configuration

The no-billing demo key is stored in Git-ignored `.env.local` as `GOOGLE_MAPS_API_KEY`, with `GOOGLE_MAPS_KEY_MODE=demo`. Never print or document its value. `scripts/serve.mjs` reads the Maps settings plus server-only GLOO_API_KEY and GLOO_MODEL, lets process environment values override them, and exposes only the browser Maps configuration through `/api/maps-config` with `Cache-Control: no-store`. Restart the local server after changing configuration.

The static server allowlist serves the browser app files and assets, not dotfiles, documentation, tests, package files, or scripts. The Maps browser key is necessarily sent to the browser; this endpoint must never expose unrelated environment settings. No paid upgrade was performed. See `docs/maps-development.md` for the distinction between the general console Demo Key guide and the AI Studio quota figure.


### Required visual reference — corrected September 18, 2026

The user requires adherence to `C:\Users\patmekury\Documents\Gloo hackathon\output\pdf\Website_Design_Reference_and_Style_Guide.pdf`. The first land-selection workbench was explicitly rejected for departing from it. Read the relevant pages and inspect the reference screenshots before styling new UI; compare actual desktop and mobile renders against them. Generic frontend skill suggestions cannot replace this reference.

The user's subsequent refinement requires a compact desktop layout with the map on the left and address finder on the right. The selector uses a light paper surface with a brand-green active segment; land-section actions use green. The dark selector and earlier centered form are superseded. Remove visible introductory and Keyboard controls prose; retain keyboard placement and corner adjustment through controls that appear on keyboard focus. Selecting a search result must remove its alternatives. Editing the query or pressing Escape also clears them, and stale responses must not reopen dismissed results.

Keep the guide's 1280px maximum, neutral surfaces, Outfit 600, 64px paper field with 12px corners and green focus, and 24px rounded map. The compact land heading is 48/52 desktop and 40/44 mobile, with 48px desktop top padding. Mobile stacks search, selection modes, map, and summary. These explicit user refinements override the previous land layout while retaining the guide as the visual reference. Preserve the approved hero, its black Get started action, and the blue four-corner selection. See `docs/design-reference.md` for the distinction between source values and product adaptations.

The user subsequently requested larger Undo and Clear controls in the right-hand panel. They now sit below the selection modes with 56px height and 16px labels. Keep scroll-wheel zoom over the map without Ctrl (`gestureHandling: greedy`), and normal page scrolling outside it. Do not intercept wheel events on the page.

Undo and Clear must remain visible beneath the right-hand selection modes even before drawing. Disable unavailable actions instead of hiding the control group; hide the empty corner-progress label. This corrects the user's inability to find the controls.


### First Gloo phase — rejected as the findings solution on September 20

The user rejected developer-oriented preference suggestions. Use **What matters most as you explore?** and **Understand local housing needs**; Retain ownership remains. Do not reintroduce Keep open space or Limit the initial commitment as suggestions.

Use scripts/gloo.mjs for server-only Gloo requests. /api/first-look returns preliminary guidance based only on user input, not retrieved records. Keep the scope statement visible, factual area calculations deterministic, and Gloo output out of innerHTML. The next step replaces the workspace and preserves back navigation. Never expose the key through /api/maps-config. Consult docs/gloo-development.md and verification.md before expanding into evidence retrieval.
