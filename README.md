# Steadmorrow

The Steadmorrow landing page and **Start with the land** experience, using the approved Blender animation and live Google Maps. This is the actual application repository.

## Run locally

With Node.js 20.18.1 or later, run `npm run dev` or `node scripts/serve.mjs`, then open <http://127.0.0.1:5173>. Run `npm ci` first to install the pinned HTML-parsing and polygon-intersection dependencies. Gloo calls run on the local server. The local server supports byte ranges so the video can seek reliably.

For Maps, copy `.env.example` to `.env.local` and set `GOOGLE_MAPS_API_KEY` and `GOOGLE_MAPS_KEY_MODE`. A demo key is already saved locally for this development environment. Never commit its value. Restart the server after changing configuration. See `docs/maps-development.md` for the demo key's limits and runtime behavior.

## What is implemented

### Opening section

- Original green Steadmorrow plot icon and italic wordmark, the headline “Could this church land become housing?”, one primary Get started action, and the approved city animation.
- The 8-second video autoplays muted and loops continuously. The headline and Get started remain visible. A small control offers play, pause, and replay; offscreen or hidden-tab playback pauses.
- Get started scrolls to `#experience` and moves keyboard focus to its heading.
- Responsive layout, keyboard focus, a static image fallback, and reduced-motion support. The explicit autoplay request governs the video; reduced motion disables interface transitions and smooth scrolling.
- Local Outfit font with its license. Hero fonts and media are hosted locally; the land experience makes Google Maps requests.
- A black “For Churches” descriptor is centered beneath the full icon-and-wordmark at 18–22px. The headline retains its smaller responsive scale, with two lines on desktop and three on small screens.

### Start with the land

- Live Google Maps loads when the section approaches the viewport. Address/place suggestions appear while typing. Use arrow keys and Enter, or click a suggestion; choosing one closes the dropdown and centers the map. Find property remains available for a submitted text search. Choose a result or explore the map directly.
- Switch between Map and Satellite views. Scroll over the map to zoom without Ctrl; scroll outside it to move the page. Search and view changes preserve an existing outline.
- **Polygon:** place four corners in perimeter order; the outline closes after the fourth. Its blue stroke, translucent blue fill, and four white circular handles with dark borders match the selected reference. Drag a corner to refine an irregular quadrilateral.
- **Click to select:** click the land to create a four-corner starting area around that point, then move its corners to fit. This is a convenient starting shape, not an inferred parcel boundary.
- Zoom in to land level before placing an area. Larger Undo and Clear buttons sit in the right-hand panel below the selection modes. Fit selection remains on the map. Crossed edges, duplicate corners, and degenerate areas cannot be confirmed.
- Keyboard controls place a corner or starting area at the map center. With the placement button focused, arrow keys move the center; Shift moves farther. A corner selector and directional controls adjust existing corners.
- **Use this area** opens **What matters here?** in the same workspace. **Back to map** returns to the outline and preserves the answers. Two optional prompts and suggested priorities lead directly to **First findings**. User-drawn geometry, the user's associated search text, mode, confirmation state, and starting priorities are saved only in this browser; Google Places result content is not persisted. A storage failure is reported without preventing selection during the visit.
- Loading, unavailable-map, search-failure, and empty-result states preserve the user's selection where possible.

The selected outline is an exploration area. It does not establish ownership, permission or buildability. **First findings** now retrieves location-driven public parcel/zoning records, published code provisions and housing estimates, then adds a conditional Gloo interpretation when the parcel and zoning match is sufficiently clear. Sources, split-zoning conflicts and missing checks remain visible. No city is hard-coded or selected as a pilot. Provider coverage varies; the current geographic adapter covers U.S. jurisdictions and municipal-code retrieval uses Municode.

Read [First findings](docs/first-findings.md) for the data chain, safeguards, coverage and limitations. Housing capacity calculations, structure simulation, presentation exports, accounts and public deployment remain unimplemented. No Request a demo action exists.

## Required design reference

Follow the supplied Website Design Reference and Style Guide. Read `docs/design-reference.md` before changing the interface. The user rejected the original land-section workbench. The corrected version uses the supplied typography, palette, form dimensions, pill controls, and open map composition.

## Change the design

- Brand color: change `--brand-color` in `styles.css`; both live brand elements inherit it. The initial value is `#57cc7e`.
- Exported assets: `assets/brand/steadmorrow-icon.svg` and `steadmorrow-logo.svg`. Edit their `#57cc7e` fallback value to recolor standalone exports. The logo includes its font and editable SVG text.
- Wordmark: editable text in `index.html`, using Outfit with a CSS slant. It is a Steadmorrow adaptation, not the original Deed lettering.
- Headline: change its lines in `index.html`. Previous alternatives are preserved in `docs/headline-options.md`.
- Animation: `assets/media/steadmorrow-city.mp4` and `city-opening.webp`. The web video is re-encoded from the approved export with more frequent keyframes; the scene content is unchanged.
- Land experience: markup in `index.html`, styles in `land.css`, Maps and interaction logic in `land.js`, geometry validation in `geometry.js`.

## Source assets

Editable Blender source: `C:\Users\patmekury\Documents\Gloo hackathon\output\animation\Steadmorrow_City_Animation.blend`.

Reference video: `C:\Users\patmekury\Downloads\Gloo hackathon 2026\Website design.mp4`.

Selection reference: `C:\Users\patmekury\Downloads\Gloo hackathon 2026\Solution design\map selection.png`.

The city animation is an illustrative concept. It is not a surveyed parcel, verified housing capacity, or feasibility determination. The user requested removing the on-page concept caption; this limitation remains documented here.

## Checks

Run `npm run check` for JavaScript syntax and `npm test` for geometry and local-server tests. The September 21 suite has 33 passing tests, including source validation, code retrieval, Gloo citations, multi-parcel selection and incomplete zoning coverage. Earlier map interaction checks were completed September 18. Live browser checks covered Maps loading, search, four-corner placement, dragging, blocked crossed outlines, undo, confirmation, and restoring a selection after reload. Keyboard selection and desktop, tablet (768×1024), and mobile (390×844 and 320×480) layouts also passed browser review. Details are recorded in `docs/verification.md`.

The local server exposes the approved browser files and assets plus `/api/maps-config` and the same-origin `POST /api/property-evidence` and `POST /api/first-look` endpoints. Documentation, tests, scripts, package files, and dotfiles are not publicly served. This is a local development application, not a public deployment.


For Gloo, set server-only `GLOO_API_KEY` in `.env.local`; an active development credential is already saved in this environment. Restart after configuration changes. See [Gloo development notes](docs/gloo-development.md) for scope, limits and verification.
