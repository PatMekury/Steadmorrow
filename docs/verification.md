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
