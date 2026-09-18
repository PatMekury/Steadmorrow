# Steadmorrow application

This is the application folder selected by the user. Keep integration code and runtime assets here.

Read the project context at `C:\Users\patmekury\Documents\Gloo hackathon\AGENTS.md` and the relevant source documents before expanding scope.

- Challenge/rules: `C:\Users\patmekury\Downloads\Gloo hackathon 2026\Challenge brief`.
- Gloo docs: `C:\Users\patmekury\Downloads\Gloo hackathon 2026\Documentatation` (spelling intentional).
- Solution design: `C:\Users\patmekury\Downloads\Gloo hackathon 2026\Solution design`.

## Current implementation — September 18, 2026

Only the first page section is implemented: a green editable icon/wordmark, the selected headline “Could this church land become housing?”, the approved city animation, and Get started scrolling to the reserved `#experience` section. The headline uses two lines on desktop and three on small screens. No Request a demo action should be added. The section below and actual property experience are intentionally deferred until the user asks.

The implementation is vanilla HTML/CSS/JavaScript with a small dependency-free Node development server. No framework, backend, Google Maps, or Gloo integration has been implemented yet. The approved animation is a concept, not a map or feasibility result. Brand color is centralized in `styles.css` as `--brand-color`. The user requested muted autoplay and removal of the Concept illustration caption. Keep the headline and Get started visible during playback.

Preserve the reference composition: green icon + italic wordmark at upper left, a bold centered two-line headline, small black pill action, and the city filling the opening view. Preserve the animation's approved density, shared ground/building material, and exposure. Do not swap in the earlier conversation-note prototype from the research workspace.
