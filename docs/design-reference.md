# Visual reference implementation

Source: `C:\Users\patmekury\Documents\Gloo hackathon\output\pdf\Website_Design_Reference_and_Style_Guide.pdf`.

The guide is required. The user rejected the first land-selection layout on September 18, 2026. The correction followed reading all 18 pages and inspecting the relevant palette, typography, layout, form, component, map-callout, and application images.

| Guide or user decision | Current land selection treatment |
| --- | --- |
| p3, p17 palette | White, #F6F6F6 paper, #0E0E0E ink, #636363 muted, brand green #57CC7E. |
| p5, p15, p17 typography | Outfit 600; user-refined compact heading 48/52 desktop, 40/44 mobile; 16px reading copy and 14px support labels. |
| p6 layout, latest user refinement | 1280px maximum; compact map-left/finder-right desktop grid; 48px desktop section-top padding. Mobile uses 20px sides and stacks search, modes, map, and summary. |
| p13 form | Address entry in the right column; 64px paper field, 12px corners, persistent label, green focus border. |
| p14 controls, latest user refinement | Light paper selector, brand-green active segment, green land actions, and green-outlined secondary actions. The dark selector is rejected. |
| p2, p12, p16 composition | Standalone 24px rounded map with nearby working controls; no enclosing dashboard card or tinted divider strips. |
| Latest user copy and search refinement | No visible introductory or keyboard-help paragraph. Keyboard controls appear on focus. Chosen search results dismiss all alternatives; query edits and Escape clear them and invalidate stale requests. |

The map-left/finder-right arrangement, compact scale, light selector, and green land actions are explicit user refinements of the guide's visual language. They supersede the earlier centered form and charcoal selector. The source video does not contain this land-selection screen. The approved hero remains unchanged. The blue polygon and white/dark corner handles follow the separate `map selection.png` and explicit user decisions. Google imagery provides geographic context; no parcel detection or feasibility claim is implied.

The guide normalizes green variants for the product; field focus retains source #56CC7E. Controls expose selection, retain keyboard operation, and respect reduced motion. Later research stages remain unimplemented.

Latest interaction refinement: Undo/Clear sit under the selection modes in the right column, using 56px-high paper buttons with 16px labels. A compact attributed suggestion list opens directly under the address field while typing; it overlays surrounding controls and dismisses after a choice. Existing guide colors, fonts, field size, map corners, and blue selection are preserved.


## Sequential priorities step

The user requested the next step replace the map workspace, with a back arrow preserving the selection. What matters here? therefore occupies a single 840px-wide content area within the existing 1280px section; the map and finder are hidden together. This is a product adaptation. It retains Outfit headings, white surfaces, paper fields with 12px corners and green focus, green selected pills, and concise optional prompts from the solution foundation. Desktop and mobile browser renders were inspected.


## First-look screen

Gloo guidance replaces the priorities workspace with a single 840px content column. It reuses the compact Outfit heading, white surfaces, green actions and existing back arrow. Supporting explanations sit behind native disclosure controls; the missing property-record evidence remains visible. Desktop and mobile live renders were reviewed. This layout is a Steadmorrow adaptation, not an observed reference-video flow.
