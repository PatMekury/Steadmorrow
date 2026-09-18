# Google Maps development

Updated September 18, 2026. A no-billing Google Maps Demo Key is configured locally and has been validated with live Maps loading and property search in **Start with the land**. No paid upgrade or paid billing-account attachment was performed.

## Local configuration

The key is stored in `.env.local` as `GOOGLE_MAPS_API_KEY`, with `GOOGLE_MAPS_KEY_MODE=demo`. The file is excluded from Git and blocked by the local server. Never put the key value in documentation or commit it. `.env.example` contains only placeholders.

Demo project: `gmp-demo-project-298225590` (Maps Platform Demo Project). The user completed Google's terms flow before the key was copied and saved locally.

The dependency-free server in `scripts/serve.mjs` reads only these two settings from `.env.local`; process environment values take precedence, including an explicitly empty key. Restart the server after changing the settings. With Node.js 20 or later, run `npm run dev`, then open <http://127.0.0.1:5173>.

`GET /api/maps-config` returns `{ apiKey, mode, configured }` with `Cache-Control: no-store`; `HEAD` returns the corresponding headers without a body. This intentionally supplies the browser Maps key. It does not expose the full environment or unrelated secrets. The static allowlist serves the approved browser app files and `/assets/`; documentation, scripts, tests, package files, and dotfiles are not served.

## Runtime behavior

- `land.js` requests the configuration and loads Google Maps when the land section approaches the viewport. The existing hero's fonts and video remain local.
- Address suggestions use `AutocompleteSuggestion.fetchAutocompleteSuggestions` after two characters and a 200ms pause. An `AutocompleteSessionToken` spans typing; choosing a prediction calls `toPlace().fetchFields()` for its address/location and starts a fresh session next time. Suggestions and pending place lookups are invalidated when the query changes or the list is dismissed. Find property retains `Place.searchByText` as a fallback. Choosing a result centers the map and preserves the current outline.
- Map uses `gestureHandling: greedy`: wheel scrolling over it zooms without Ctrl, while scrolling outside it moves the page. Map/Satellite controls provide geographic context. Polygon mode closes after exactly four points. Click to select creates a four-corner starting shape around the clicked point. Neither mode infers a cadastral parcel.
- Draggable handles and keyboard controls refine the outline. Geometry validation blocks invalid confirmation. Undo, Clear, **Use this area**, and **Adjust area** support the selection flow.
- Browser storage retains user-created geometry, mode, confirmation state, and the user's associated query text. Google Places result content is not persisted. This is local browser storage, not an account or cloud database.
- Map/search errors preserve existing user work where possible and provide recovery guidance. Demo limits can make Maps or search unavailable until access resets.

The key is for testing and prototyping, not production. No priorities, research, Gloo-agent integration, ownership lookup, parcel verification, or feasibility result is implemented by this Maps flow.

## Demo quota

Google documents **100 calls per day per API for Maps Demo Keys provided through AI Studio**. The general console Demo Key guide says daily limits can change and exhausted usage pauses until the next day without charges, but does not publish a numeric quota. Do not present the AI Studio figure as a verified quota for this console-created key.

The demo project's Quotas link opened an upgrade prompt rather than a numeric quota view. No upgrade was performed. Live Maps and search calls succeeded during implementation; that validates access, not an exact daily allowance.

Official sources:

- [Maps JavaScript API Demo Key guide](https://developers.google.com/maps/documentation/javascript/demo-key)
- [Google Maps in AI Studio](https://developers.google.com/maps/ai/ai-studio)

## Verification

`npm run check` covers application/server syntax. `npm test` covers geometry and the development server; all 15 tests passed during the September 18 implementation check. Server tests use temporary fake credentials and cover missing/present configuration, environment precedence, GET/HEAD, no-store, static media ranges, and denied private/traversal paths.

Live browser checks covered Maps loading, search, four-corner placement, dragging, crossed-outline rejection, undo, confirmation, and restoring the selection after reload. Keyboard selection and tablet/mobile layouts were also verified, with no horizontal overflow at the tested widths. Consult `docs/verification.md` for the current combined verification record.

Autocomplete and place-details access were verified live with the saved demo key on September 18, 2026. This establishes current access, not a numeric quota guarantee. Implementation references: [Autocomplete Data API](https://developers.google.com/maps/documentation/javascript/place-autocomplete-data), [map gestures](https://developers.google.com/maps/documentation/javascript/interaction), and [attribution](https://developers.google.com/maps/documentation/javascript/policies).
