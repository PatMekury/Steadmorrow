# Opening section verification

Checked September 18, 2026 against the app running locally at http://127.0.0.1:5173.

- JavaScript syntax: `node --check app.js` and `node --check scripts/serve.mjs` passed.
- Approved 8-second animation: installed at 1600×1000; the optimized MP4 decoded fully with ffmpeg without errors. Frequent keyframes support seeking. Size: 4,021,719 bytes.
- Media range request: HTTP 206, 100 bytes returned for `bytes=100-199`, with correct Content-Range.
- Local Outfit loaded successfully (`document.fonts.check`); green live brand color resolves to rgb(87, 204, 126).
- Actual browser visual review: desktop 1440×900, tablet 768×1024, mobile 390×844, and short mobile 320×480. No horizontal overflow. The short mobile stage and parent both measure 500px and no longer overlap the next section.
- Get started: URL becomes #experience, the heading receives keyboard focus, and the section aligns at viewport top on the tested mobile layout.
- Updated autoplay: after reload, autoplay=true, paused=false, currentTime>0, and Pause is exposed. The headline stays visible, and the concept caption is absent. The user subsequently enabled continuous looping; replay, pause, and the correct Play label were checked. Get started still reaches sectionY=0 and focuses its heading.
- Standalone SVG logo opens correctly, with embedded Outfit font and editable text.
- Browser console: no errors or warnings observed during the reviewed flow.

The in-app browser reported a reduced-motion preference. Following the user’s explicit follow-up, the video now autoplays muted regardless of that preference, with a persistent pause control; interface transitions and smooth scrolling continue to respect it. Scroll-driven playback has been removed. This is a first-section implementation, not a completed product or public deployment.

Review fixes: shared minimum stage height on short displays, correct pause state after scrolling, next-section height sufficient for anchor alignment, and keeping the headline and Get started visible throughout autoplay.

## Land selection verification — September 18, 2026

- Live saved Maps Demo Key: Google Maps tiles, Places text search, and satellite imagery loaded successfully. No billing upgrade was made. The numeric quota remains unverified.
- Click to select: one map click produced exactly four white/dark handles and a translucent blue quadrilateral. Actual pointer dragging changed the outline and area measurement.
- Invalid shape: dragging a corner across the opposite edge produced the visible crossing error and disabled Use this area. Undo restored valid geometry and enabled confirmation.
- Use this area showed Area selected, moved focus to its heading, and persisted the selection and confirmation across a browser reload. Adjust area reopened editing. Clear and mode changes worked.
- Polygon: keyboard-only placement with arrow keys and Enter progressed to 3 of 4 corners with confirmation disabled, then closed on corner four. Directional corner adjustment changed the area while retaining four handles.
- Responsive review: default desktop, 768×1024 tablet, 390×844 mobile, and 320×480 narrow mobile. No horizontal document overflow. The map and toolbars fit; mobile confirmation remained usable. Tablet heading layout was refined to keep the introduction together. Temporary viewport overrides were reset.
- Get started still focuses the land-section heading. The original hero files, brand, animation, and autoplay behavior are unchanged.
- Browser console: no errors or warnings during the tested Maps flow.
- Automated checks: all application/server JavaScript syntax checks pass; all 15 geometry/server tests pass. Tests cover both windings, concavity, dateline geometry, duplicates, crossings/touching, degenerate points, area/centroid calculations, no mutation, Maps config isolation, HEAD/range requests, and blocked private/traversal paths.
- Local draft storage contains user input and user-selected points only. Google Places result objects and addresses are not persisted. History retains selection labels with geometry, so Undo does not attach a later search label to an earlier outline.

Limits: this stage selects an approximate exploration area. No recorded parcel, ownership, vacancy, zoning, feasibility research, priorities, or Gloo agents are implemented. Confirmation does not trigger research or a cloud save. Network/quota failures use visible recovery states; a real demo quota exhaustion was not forced during testing. Storage-denied behavior is implemented but not exercised in a browser with storage disabled.

## Style-guide correction — September 18, 2026

The first land-section styling was rejected by the user. It was rebuilt against the supplied PDF; mappings are in `docs/design-reference.md`. The enclosing card and tinted rows were removed. Typography, form dimensions, palette, selected controls, and map presentation now follow the guide.

- Rendered desktop comparison and computed values: Outfit 600 at 64/64; 64px field; active green rgb(87, 204, 126). At 1440px viewport, the content measures 1280px.
- Mobile visual comparison at 390px and 320px: 40/44 heading, 20px outer inset, no horizontal overflow, usable map and expanded keyboard controls.
- Five search results displayed on mobile; Tab reached the fifth. Selecting a result closed the panel and kept the map usable.
- One click produced four handles; keyboard corner adjustment changed the geometry; Use this area displayed the saved confirmation. The temporary test selection was cleared afterward.
- JavaScript syntax check passed after markup/state changes. Geometry and server modules were unchanged by this visual revision; the earlier 15-test result applies to them.
- Visuals were compared with actual rendered guide pages. The working composition is an adaptation, not a claim of a pixel-identical reference screen.

## Compact map-and-finder refinement — September 18, 2026

This revision supersedes the preceding centered-form visual checks. The map is on the left and the address finder/selection controls are on the right on desktop. The user requested less visible instruction, a light selector, and immediate dismissal of unused address matches. Working controls now use paper and brand green; the approved hero is unchanged.

- Actual default desktop render: map and finder align side by side in one compact view, with no introductory paragraph or visible keyboard-help panel. The active selection pill is green on a paper background.
- Actual mobile renders at 390×844 and 320×780: search, selection modes, map, and summary stack without horizontal document overflow. Map tools and controls fit within the viewport.
- Live Places search returned five matches. Choosing one immediately hid the result container, removed all result buttons from the DOM, and reset aria-expanded to false. The selected address remained as concise context.
- Submitting a search and then changing the query left zero result options, kept the panel closed, and left Find property enabled after the request settled. Request tokens are invalidated on editing, selection, Escape, and map failure. Escape behavior was reviewed in code, not separately exercised in this browser pass.
- Click to select created four handles. Pointer dragging changed the area from about 2.51 acres to about 2.1 acres. Use this area showed the compact confirmation; Adjust area reopened editing.
- Keyboard focus revealed the otherwise clipped adjustment controls. Moving a corner north changed the area; Undo restored it. Arrow keys and Enter placed four polygon corners and enabled Use this area. The controls disappeared again on leaving their focus. Clear retains Undo access even with an empty outline.
- Test geometry was cleared and the original Houston, TX search text and Click to select mode were restored. Reload showed the empty selection state. Browser error log was empty.
- npm run check passed; all 15 existing geometry/server tests passed. No new tests were added for the styling change. The temporary mobile viewport override was reset.

The local preview server had stopped before this pass; it was restarted at http://127.0.0.1:5173. A stale in-app error tab was replaced for verification. No cloud, billing, key, parcel lookup, or research integration changed.

## Live suggestions and larger editing controls — September 18, 2026

- Address suggestions from AutocompleteSuggestion loaded with the saved demo key for the partial inputs `7120 Grand` and `7120 Grand Bou`, without submitting the form. Five options appeared and typing focus remained in the input.
- ArrowDown highlighted an option; Enter fetched its location and moved the map. Pointer selection also worked on mobile. Both immediately removed the alternatives. Escape dismissed the dropdown/pending debounce. Request-sequence guards cover stale suggestions and pending place-detail lookups.
- Undo and Clear are in the right-hand column under selection modes. Desktop measurements: 164px wide, 56px high, 16px text; their left edges are beyond the map's right edge. Clear removed the test outline; Undo restored it.
- Real wheel input over the map changed zoom from 18 to 19 while pageY stayed at 590.4px. Wheel input over the right panel changed pageY to 374.4px while zoom stayed at 19. No Ctrl modifier was used.
- Actual desktop and 390x844 mobile renders were reviewed, including the suggestion dropdown and larger controls. The dropdown has its own scrollable list and visible Google Maps attribution. The temporary mobile viewport was reset.
- Test geometry was cleared and the original Houston, TX query restored before reloading the preview.
- npm run check and git diff --check passed. Geometry and server code were unchanged; the previous 15-test result remains applicable. No billing or key settings changed.
