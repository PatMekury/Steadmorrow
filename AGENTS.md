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

`land.js`, `land.css`, and `geometry.js` implement live Google Maps, deliberate-submit property/address search using `Place.searchByText`, Map/Satellite views, selection, and confirmation. Maps loads lazily as `#experience` approaches the viewport; search is not triggered for every keystroke.

Keep both user-requested selection modes:

- **Polygon:** exactly four points placed in perimeter order, closing after point four. Support irregular quadrilaterals, with a blue outline, translucent blue fill, and four white circular handles with dark borders.
- **Click to select:** a click creates a four-corner starting area around the selected point. The user adjusts its corners; it does not detect or verify parcel boundaries.

Corners remain draggable while editing. Preserve Undo, Clear, selection framing, keyboard placement at the map center and directional corner adjustment. Crossed edges, duplicate corners, and zero/degenerate areas must prevent **Use this area**. Confirmation retains an **Adjust area** path. Search, view changes, and recoverable errors must not silently discard the current outline.

Persist only user-entered query text, user-drawn geometry, selection mode, and confirmation state in browser storage. Do not persist Google Places result content. If storage is unavailable, explain that the selection lasts only for the visit. The approximate area and outline do not establish parcel boundaries, ownership, permission, buildability, or housing capacity.

Confirmation is the current endpoint. Starting priorities, research, Gloo agents, accounts, and later decision/export stages are not implemented. Do not present concept documents or this selected area as completed research.

### Maps configuration

The no-billing demo key is stored in Git-ignored `.env.local` as `GOOGLE_MAPS_API_KEY`, with `GOOGLE_MAPS_KEY_MODE=demo`. Never print or document its value. `scripts/serve.mjs` reads only those two settings, lets process environment values override them, and exposes only the browser Maps configuration through `/api/maps-config` with `Cache-Control: no-store`. Restart the local server after changing configuration.

The static server allowlist serves the browser app files and assets, not dotfiles, documentation, tests, package files, or scripts. The Maps browser key is necessarily sent to the browser; this endpoint must never expose unrelated environment settings. No paid upgrade was performed. See `docs/maps-development.md` for the distinction between the general console Demo Key guide and the AI Studio quota figure.


### Required visual reference — corrected September 18, 2026

The user requires adherence to `C:\Users\patmekury\Documents\Gloo hackathon\output\pdf\Website_Design_Reference_and_Style_Guide.pdf`. The first land-selection workbench was explicitly rejected for departing from it. Read the relevant pages and inspect the reference screenshots before styling new UI; compare actual desktop and mobile renders against them. Generic frontend skill suggestions cannot replace this reference.

The corrected land section uses a 1280px content maximum, white/paper and neutral colors, Outfit 600 headings (64/64 desktop, 40/44 mobile), a 64px paper input with 12px corners and green focus, solid green selected pills, black primary actions, and a standalone 24px rounded map. The previous enclosing bordered workbench, sage-tinted rows, pale blue active controls, and small input treatment are rejected. Preserve the user's blue polygon and white/dark corner handles. See `docs/design-reference.md` for page mappings and adaptations.
