# Steadmorrow application

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

Starting priorities are implemented as the next screen replacing the map workbench, never another column. The two optional prompts, selectable suggestions, local autosave, and editable Starting priorities summary are implemented. Back to map remains available throughout. Research, Gloo agents, accounts, and later decision/export stages are not implemented. Do not present concept documents or this selected area as completed research.

### Maps configuration

The no-billing demo key is stored in Git-ignored `.env.local` as `GOOGLE_MAPS_API_KEY`, with `GOOGLE_MAPS_KEY_MODE=demo`. Never print or document its value. `scripts/serve.mjs` reads only those two settings, lets process environment values override them, and exposes only the browser Maps configuration through `/api/maps-config` with `Cache-Control: no-store`. Restart the local server after changing configuration.

The static server allowlist serves the browser app files and assets, not dotfiles, documentation, tests, package files, or scripts. The Maps browser key is necessarily sent to the browser; this endpoint must never expose unrelated environment settings. No paid upgrade was performed. See `docs/maps-development.md` for the distinction between the general console Demo Key guide and the AI Studio quota figure.


### Required visual reference — corrected September 18, 2026

The user requires adherence to `C:\Users\patmekury\Documents\Gloo hackathon\output\pdf\Website_Design_Reference_and_Style_Guide.pdf`. The first land-selection workbench was explicitly rejected for departing from it. Read the relevant pages and inspect the reference screenshots before styling new UI; compare actual desktop and mobile renders against them. Generic frontend skill suggestions cannot replace this reference.

The user's subsequent refinement requires a compact desktop layout with the map on the left and address finder on the right. The selector uses a light paper surface with a brand-green active segment; land-section actions use green. The dark selector and earlier centered form are superseded. Remove visible introductory and Keyboard controls prose; retain keyboard placement and corner adjustment through controls that appear on keyboard focus. Selecting a search result must remove its alternatives. Editing the query or pressing Escape also clears them, and stale responses must not reopen dismissed results.

Keep the guide's 1280px maximum, neutral surfaces, Outfit 600, 64px paper field with 12px corners and green focus, and 24px rounded map. The compact land heading is 48/52 desktop and 40/44 mobile, with 48px desktop top padding. Mobile stacks search, selection modes, map, and summary. These explicit user refinements override the previous land layout while retaining the guide as the visual reference. Preserve the approved hero, its black Get started action, and the blue four-corner selection. See `docs/design-reference.md` for the distinction between source values and product adaptations.

The user subsequently requested larger Undo and Clear controls in the right-hand panel. They now sit below the selection modes with 56px height and 16px labels. Keep scroll-wheel zoom over the map without Ctrl (`gestureHandling: greedy`), and normal page scrolling outside it. Do not intercept wheel events on the page.

Undo and Clear must remain visible beneath the right-hand selection modes even before drawing. Disable unavailable actions instead of hiding the control group; hide the empty corner-progress label. This corrects the user's inability to find the controls.
