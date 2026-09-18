# Steadmorrow

The first landing-page section, using the approved Blender animation and the supplied Deed website reference. This is the actual application repository.

## Run locally

With Node.js 20 or later, run `npm run dev` or `node scripts/serve.mjs`, then open <http://127.0.0.1:5173>. There are no runtime packages to install. The local server supports byte ranges so the video can seek reliably.

## What is implemented

- The opening section: original green Steadmorrow plot icon and italic wordmark, two-line headline, one primary Get started action, and the approved city animation.
- The 8-second video autoplays muted when the page opens, then holds its final frame. The headline and Get started remain visible. The small video control offers play, pause, and replay; offscreen or hidden-tab playback pauses.
- Get started scrolls directly to `#experience` and moves keyboard focus to its heading.
- Responsive desktop/mobile layout, keyboard focus, a static image fallback, and reduced-motion support. The user explicitly requested video autoplay; the visible pause control is always available. Reduced motion disables interface transitions and smooth scrolling.
- Local Outfit font with its license; no external font or media requests.

The following section is intentionally only a reserved heading. Property search, Google Maps, polygon input, agents, APIs, sign-in, and the rest of the experience have not been implemented. No demo request exists.

## Change the design

- Brand color: change `--brand-color` in `styles.css`. Both the live icon and wordmark inherit it. The initial value is `#57cc7e`, from the reference guide.
- Exported assets: `assets/brand/steadmorrow-icon.svg` and `steadmorrow-logo.svg`. Edit their `#57cc7e` fallback value to recolor standalone exports. The logo includes its font and editable SVG text.
- Wordmark: editable text in `index.html`, using Outfit with a CSS slant. It is a Steadmorrow adaptation, not the original Deed lettering.
- Headline: change the two lines in `index.html`. The selected headline is “Could this church land become housing?”; previous alternatives are preserved in `docs/headline-options.md`.
- Animation: `assets/media/steadmorrow-city.mp4` and `city-opening.webp`. The web video is re-encoded from the approved export with more frequent keyframes for scrolling; the scene content is unchanged.

## Source assets

Editable Blender source: `C:\Users\patmekury\Documents\Gloo hackathon\output\animation\Steadmorrow_City_Animation.blend`.

Reference video: `C:\Users\patmekury\Downloads\Gloo hackathon 2026\Website design.mp4`.

The city is an illustrative concept. It is not a surveyed parcel, verified housing capacity, or a feasibility determination. The user requested removing the on-page concept caption; this limitation remains documented here.

## Checks

`npm run check` checks JavaScript syntax. Browser validation is recorded in `docs/verification.md`.
