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
