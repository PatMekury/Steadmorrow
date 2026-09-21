import { validatePolygon, areaSquareMeters, polygonCenter } from './geometry.js';
import { renderFindings } from './findings.js';

const $ = id => document.getElementById(id);
const storageKey = 'steadmorrow.land.v1';
const initialView = { lat: 39.5, lng: -98.35 };
const copy = value => value.map(point => ({ ...point }));
const literal = value => ({ lat: typeof value.lat === 'function' ? value.lat() : value.lat, lng: typeof value.lng === 'function' ? value.lng() : value.lng });
const priorityChoices = ['Retain ownership', 'Understand local housing needs'];
let priorities = { purpose: '', preserve: '', exploring: false, choices: [], saved: false };
let mapView;
let findingsOpen = false, findingsController, findingsSequence = 0, lastFindings = null;
let parcelKey = null, parcelShape = '', evidenceRequest = null;
let points = [], undoStack = [], mode = 'polygon', confirmed = false;
let map, polygon, line, AdvancedMarkerElement, markers = [];
let started = false, ready = false, searchSequence = 0, queryLabel = '', matchedLabel = '';
let pendingQuery = '', pendingMatched = '', pendingLocation = null;
let storageAvailable = true, dragging = false, keyboardActive = false;
let suggestionTimer, autocompleteSession = null, activeSuggestion = -1, composing = false;

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (!saved || saved.version !== 1 || !Array.isArray(saved.points) || saved.points.length > 4) return;
    if (!saved.points.every(p => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 85 && Math.abs(p.lng) <= 180)) return;
    points = copy(saved.points);
    mode = saved.mode === 'click' ? 'click' : 'polygon';
    confirmed = saved.confirmed === true && validatePolygon(points).valid;
    queryLabel = typeof saved.query === 'string' ? saved.query.slice(0, 240) : '';
    const input = saved.priorities || {};
    priorities = {
      purpose: typeof input.purpose === 'string' ? input.purpose.slice(0, 600) : '',
      preserve: typeof input.preserve === 'string' ? input.preserve.slice(0, 600) : '',
      exploring: input.exploring === true,
      choices: priorityChoices.filter(choice => Array.isArray(input.choices) && input.choices.includes(choice)),
      saved: input.saved === true,
    };
    const retired = Array.isArray(input.choices) ? input.choices.filter(choice => ['Keep open space', 'Limit the initial commitment'].includes(choice)) : [];
    if (retired.length) priorities.preserve = [priorities.preserve, ...retired].filter(Boolean).join(' · ').slice(0, 600);
    pendingQuery = queryLabel;
    undoStack = mode === 'click' ? (points.length ? [{ points: [], mode, queryLabel, matchedLabel: '' }] : [])
      : points.map((_, index) => ({ points: copy(points.slice(0, index)), mode, queryLabel, matchedLabel: '' }));
    $('property-query').value = queryLabel;
    if (points.length) $('place-label').textContent = queryLabel ? `Saved selection · ${queryLabel}` : 'Your saved selection';
  } catch { storageAvailable = false; }
}

function persist() {
  try {
    // Save only user input and user-drawn geometry, not Google Places results.
    localStorage.setItem(storageKey, JSON.stringify({ version: 1, points, mode, confirmed, query: queryLabel, priorities }));
    storageAvailable = true;
  } catch { storageAvailable = false; }
  $('save-status').textContent = storageAvailable
    ? 'Saved in this browser.'
    : 'Kept for this visit. Browser storage is unavailable; refreshing will lose your work.';
}

function remember() {
  const snapshot = { points: copy(points), mode, queryLabel, matchedLabel };
  if (JSON.stringify(undoStack.at(-1)) !== JSON.stringify(snapshot)) undoStack.push(snapshot);
  if (undoStack.length > 30) undoStack.shift();
}

function areaLabel() {
  if (!validatePolygon(points).valid) return 'No area selected';
  const squareMeters = areaSquareMeters(points);
  const acres = squareMeters / 4046.8564224;
  return `About ${acres < .01 ? '< 0.01' : acres.toLocaleString(undefined, { maximumFractionDigits: 2 })} acres · ${Math.round(squareMeters).toLocaleString()} m²`;
}

function render() {
  const valid = validatePolygon(points);
  const closeEnough = map && map.getZoom() >= 16;
  $('experience').dataset.hasSelection = String(points.length > 0);
  $('experience').dataset.step = confirmed ? (findingsOpen ? 'findings' : 'priorities') : 'map';
  document.querySelector('.land-map-heading').hidden = !points.length && !pendingMatched;
  $('area-measure').hidden = !points.length;
  document.querySelector('.land-selection-footer').hidden = !points.length || confirmed;
  document.querySelector('.selection-actions').hidden = false;
  $('corner-progress').hidden = !points.length || confirmed;
  $('place-label').textContent = points.length
    ? (matchedLabel || (queryLabel ? `Your selection · ${queryLabel}` : 'Your selected exploration area'))
    : (pendingMatched || 'Find a property or explore the map');
  $('mode-polygon').setAttribute('aria-pressed', String(mode === 'polygon'));
  $('mode-click').setAttribute('aria-pressed', String(mode === 'click'));
  $('corner-progress').textContent = confirmed ? 'Area selected' : points.length === 4 ? 'Drag corners to adjust' : `${points.length} of 4 corners`;
  $('selection-help').textContent = confirmed ? 'Your selected area is ready to revisit.'
    : !ready ? 'Find the property, then choose how to select the land.'
    : !closeEnough && points.length < 4 ? 'Search for a property or zoom in to see the land clearly.'
    : points.length === 4 ? 'Is this the area you want to explore? Drag any corner to adjust it.'
    : mode === 'click' ? 'Click a point on the land. Then move the corners to fit the area.'
    : 'Select four corners around the vacant land.';
  $('selection-error').textContent = points.length === 4 && !valid.valid ? valid.message : '';
  $('selection-error').hidden = points.length !== 4 || valid.valid;
  $('area-measure').textContent = valid.valid ? areaLabel() : points.length ? 'Selection in progress' : 'No area selected';
  $('use-area').disabled = !ready || !valid.valid;
  $('use-area').hidden = confirmed || !points.length;
  $('undo-area').disabled = !ready || !undoStack.length || confirmed;
  $('clear-area').disabled = !ready || !points.length || confirmed;
  $('fit-area').disabled = !ready || !points.length;
  $('keyboard-place').disabled = !ready || !closeEnough || points.length === 4 || confirmed;
  $('keyboard-place').textContent = mode === 'click' ? 'Select area at map center' : `Place corner ${Math.min(points.length + 1, 4)} at map center`;
  $('corner-adjust').hidden = !points.length || confirmed;
  for (const option of $('keyboard-corner').options) option.disabled = Number(option.value) >= points.length;
  if (Number($('keyboard-corner').value) >= points.length) $('keyboard-corner').value = '0';
  document.querySelector('.land-workbench').hidden = confirmed;
  $('priorities-step').hidden = !confirmed || findingsOpen;
  $('findings-step').hidden = !confirmed || !findingsOpen;
  $('back-to-map').hidden = !confirmed;
  $('experience-title').textContent = confirmed ? (findingsOpen ? 'First findings' : 'What matters here?') : 'Start with the land.';
  $('priority-area').textContent = `Selected area · ${areaLabel()}`;
  renderPriorities();
  $('map-crosshair').hidden = !keyboardActive || !ready || confirmed || points.length === 4;
  document.querySelector('.map-stage').classList.toggle('is-selecting', ready && !confirmed && points.length < 4 && closeEnough);
  if (map) map.setOptions({ draggableCursor: !confirmed && points.length < 4 && closeEnough ? 'crosshair' : null });
  if (polygon) {
    polygon.setPath(points);
    polygon.setVisible(points.length === 4);
    polygon.setOptions({ fillOpacity: valid.valid ? .24 : .08 });
    line.setPath(points);
    line.setVisible(points.length > 0 && points.length < 4);
    syncMarkers();
  }
}

function syncMarkers() {
  while (markers.length > points.length) markers.pop().map = null;
  points.forEach((position, index) => {
    if (!markers[index]) {
      const marker = new AdvancedMarkerElement({ map, position, title: `Corner ${index + 1}. Drag to adjust.`, gmpDraggable: true, anchorLeft: '-50%', anchorTop: '-50%', zIndex: 10 + index });
      const handle = document.createElement('div');
      handle.className = 'corner-marker';
      const dot = document.createElement('span');
      dot.className = 'corner-handle';
      handle.append(dot);
      marker.append(handle);
      marker.addEventListener('gmp-dragstart', () => { remember(); dragging = true; });
      marker.addEventListener('gmp-drag', () => {
        points[index] = literal(marker.position);
        confirmed = false;
        render();
      });
      marker.addEventListener('gmp-dragend', () => {
        points[index] = literal(marker.position);
        dragging = false;
        render();
        persist();
      });
      markers[index] = marker;
    }
    if (!dragging) markers[index].position = position;
    markers[index].gmpDraggable = !confirmed;
    markers[index].title = confirmed ? `Corner ${index + 1}` : `Corner ${index + 1}. Drag to adjust.`;
  });
}

function selected(point) {
  if (!ready || confirmed || points.length >= 4) return;
  if (map.getZoom() < 16) {
    $('search-status').textContent = 'Zoom in to select an area.';
    return;
  }
  const center = literal(point);
  if (Math.abs(center.lat) > 85) return;
  if (mode === 'click' && !map.getProjection()) return;
  remember();
  if (!points.length) {
    // A search result is context, not proof that a distant sketch belongs to it.
    const nearSearch = pendingLocation && Math.hypot(
      (center.lat - pendingLocation.lat) * 111320,
      (center.lng - pendingLocation.lng) * 111320 * Math.cos(center.lat * Math.PI / 180)
    ) < 500;
    queryLabel = nearSearch ? pendingQuery : '';
    matchedLabel = nearSearch ? `Near ${pendingMatched}` : '';
  }
  if (mode === 'click') {
    // Start with a modest screen-sized quadrilateral, never an inferred parcel.
    const projection = map.getProjection();
    const world = projection.fromLatLngToPoint(new google.maps.LatLng(center));
    const pixels = Math.min($('land-map').clientWidth, $('land-map').clientHeight) * .18;
    const delta = pixels / 2 ** map.getZoom();
    points = [[-1,-1], [1,-1], [1,1], [-1,1]].map(([x, y]) => literal(projection.fromPointToLatLng(new google.maps.Point(world.x + x * delta, world.y + y * delta))));
  } else points.push(center);
  render();
  persist();
}

function fitSelection() {
  if (!map || !points.length) return;
  if (points.length === 1) { map.setCenter(points[0]); map.setZoom(18); return; }
  const bounds = new google.maps.LatLngBounds();
  points.forEach(point => bounds.extend(point));
  map.fitBounds(bounds, 95);
}

function changeMode(nextMode) {
  mode = nextMode;
  if (confirmed) confirmed = false;
  // Preserve the current outline when switching tools; Clear starts another area.
  render();
  persist();
}

function showMapFailure(message) {
  ready = false;
  dismissSearch({ endSession: true });
  $('map-message').hidden = false;
  $('map-message').classList.add('is-error');
  $('map-message-text').textContent = message;
  $('map-retry').hidden = false;
  $('find-property').disabled = true;
  render();
}

async function loadMaps() {
  const response = await fetch('/api/maps-config', { cache: 'no-store' });
  if (!response.ok) throw new Error('config');
  const config = await response.json();
  if (!config.configured || !config.apiKey) throw new Error('missing-key');
  await new Promise((resolve, reject) => {
    let timer;
    const finish = callback => value => { clearTimeout(timer); callback(value); };
    window.steadmorrowMapsReady = finish(resolve);
    window.gm_authFailure = () => { finish(reject)(new Error('authorization')); showMapFailure('Google Maps is unavailable. The demo key may have reached its daily limit. Your selection is kept.'); };
    const script = document.createElement('script');
    const params = new URLSearchParams({ key: config.apiKey, v: 'weekly', loading: 'async', callback: 'steadmorrowMapsReady' });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = finish(() => reject(new Error('network')));
    timer = setTimeout(() => reject(new Error('timeout')), 25000);
    document.head.append(script);
  });
}

async function initialize() {
  if (started) return;
  started = true;
  try {
    await loadMaps();
    const [{ Map, Polygon, Polyline }, markerLibrary] = await Promise.all([google.maps.importLibrary('maps'), google.maps.importLibrary('marker')]);
    AdvancedMarkerElement = markerLibrary.AdvancedMarkerElement;
    map = new Map($('land-map'), {
      center: polygonCenter(points) || initialView, zoom: points.length ? 18 : 4,
      mapId: 'DEMO_MAP_ID', mapTypeId: 'roadmap', tilt: 0,
      streetViewControl: false, fullscreenControl: false, mapTypeControl: false,
      rotateControl: false, cameraControl: false, zoomControl: true, scaleControl: true,
      clickableIcons: false, gestureHandling: 'greedy', minZoom: 3,
    });
    polygon = new Polygon({ map, paths: points, strokeColor: '#2b61ff', strokeWeight: 2, strokeOpacity: 1, fillColor: '#2b61ff', fillOpacity: .24, editable: false, clickable: false });
    line = new Polyline({ map, path: points, strokeColor: '#2b61ff', strokeWeight: 2, clickable: false });
    ready = true;
    $('map-message').hidden = true;
    $('find-property').disabled = false;
    if (document.activeElement === $('property-query')) queueSuggestions();
    map.addListener('click', event => { if (event.latLng) selected(event.latLng); });
    map.addListener('zoom_changed', () => {
      if ($('search-status').textContent === 'Zoom in to select an area.' && map.getZoom() >= 16) $('search-status').textContent = '';
      render();
    });
    if (points.length > 1) fitSelection();
    render();
  } catch (error) {
    showMapFailure(error.message === 'missing-key' ? 'The map is not connected yet. Your saved area will stay here.' : 'We couldn’t load Google Maps. Check your connection or try again later. Your selection is kept.');
  }
}

function dismissSearch({ endSession = false } = {}) {
  clearTimeout(suggestionTimer);
  ++searchSequence;
  activeSuggestion = -1;
  if (endSession) autocompleteSession = null;
  $('search-results').hidden = true;
  $('result-list').replaceChildren();
  $('property-query').setAttribute('aria-expanded', 'false');
  $('property-query').removeAttribute('aria-activedescendant');
  $('search-status').textContent = '';
  $('result-announcement').textContent = '';
  $('find-property').disabled = !ready;
}

function highlightSuggestion(index) {
  const options = [...$('result-list').children];
  if (!options.length) return;
  activeSuggestion = (index + options.length) % options.length;
  options.forEach((option, i) => option.setAttribute('aria-selected', String(i === activeSuggestion)));
  const active = options[activeSuggestion];
  $('property-query').setAttribute('aria-activedescendant', active.id);
  active.scrollIntoView({ block: 'nearest' });
}

async function choosePlace(match, query, requestSequence) {
  if (requestSequence !== searchSequence || !ready) return;
  // Close immediately; a later query also invalidates an in-flight place lookup.
  $('property-query').focus({ preventScroll: true });
  dismissSearch({ endSession: true });
  const sequence = searchSequence;
  $('find-property').disabled = true;
  $('search-status').textContent = 'Finding location…';
  try {
    const place = match.prediction ? match.prediction.toPlace() : match.place;
    if (match.prediction) await place.fetchFields({ fields: ['formattedAddress', 'location'] });
    if (sequence !== searchSequence || !ready) return;
    if (!place.location) throw new Error('missing-location');
    pendingMatched = place.formattedAddress || match.name || query;
    pendingQuery = query;
    pendingLocation = literal(place.location);
    $('property-query').value = pendingMatched;
    if (!points.length) queryLabel = query;
    map.setCenter(place.location);
    map.setZoom(18);
    $('mode-' + mode).focus({ preventScroll: true });
    $('search-status').textContent = points.length ? 'Existing area kept. Clear it to start another.' : '';
    render(); persist();
  } catch {
    if (sequence === searchSequence) $('search-status').textContent = 'Couldn’t find that location. Try again.';
  } finally {
    if (sequence === searchSequence) $('find-property').disabled = !ready;
  }
}

function showSuggestions(matches, query, sequence) {
  if (sequence !== searchSequence || !ready) return;
  activeSuggestion = -1;
  $('result-list').replaceChildren();
  $('property-query').removeAttribute('aria-activedescendant');
  for (const [index, match] of matches.entries()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'result-option';
    button.id = `place-option-${sequence}-${index}`;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', 'false');
    button.tabIndex = -1;
    const name = document.createElement('span');
    name.className = 'result-name'; name.textContent = match.name;
    const address = document.createElement('span');
    address.className = 'result-address'; address.textContent = match.address;
    button.append(name, address);
    // Keep the typing caret in the field until the suggestion is chosen.
    button.addEventListener('pointerdown', event => event.preventDefault());
    button.addEventListener('click', () => { void choosePlace(match, query, sequence); });
    $('result-list').append(button);
  }
  $('search-results').hidden = !matches.length;
  $('property-query').setAttribute('aria-expanded', String(matches.length > 0));
  $('result-announcement').textContent = matches.length ? `${matches.length} address suggestions available.` : 'No matching suggestions.';
}

async function suggest(query, sequence) {
  try {
    const { AutocompleteSuggestion, AutocompleteSessionToken } = await google.maps.importLibrary('places');
    if (sequence !== searchSequence || !ready) return;
    autocompleteSession ||= new AutocompleteSessionToken();
    const request = { input: query, sessionToken: autocompleteSession };
    if (map.getZoom() >= 10 && map.getBounds()) request.locationBias = map.getBounds();
    const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
    if (sequence !== searchSequence) return;
    const matches = suggestions.filter(suggestion => suggestion.placePrediction).slice(0, 5).map(({ placePrediction }) => ({
      prediction: placePrediction,
      name: placePrediction.mainText?.toString() || placePrediction.text.toString(),
      address: placePrediction.secondaryText?.toString() || '',
    }));
    showSuggestions(matches, query, sequence);
  } catch {
    if (sequence === searchSequence) $('search-status').textContent = 'Suggestions unavailable. Try Find property.';
  }
}

function queueSuggestions() {
  const query = $('property-query').value.trim();
  if (!ready || query.length < 2 || composing) return;
  const sequence = searchSequence;
  suggestionTimer = setTimeout(() => { void suggest(query, sequence); }, 200);
}

async function search(event) {
  event.preventDefault();
  if (composing) return;
  const query = $('property-query').value.trim();
  if (!query || !ready) return;
  const option = $('result-list').children[activeSuggestion];
  if (option && !$('search-results').hidden) { option.click(); return; }
  dismissSearch({ endSession: true });
  const sequence = searchSequence;
  $('find-property').disabled = true;
  $('search-status').textContent = 'Finding matching places…';
  try {
    const { Place } = await google.maps.importLibrary('places');
    if (sequence !== searchSequence || !ready) return;
    const { places } = await Place.searchByText({ textQuery: query, fields: ['displayName', 'formattedAddress', 'location'], maxResultCount: 5 });
    if (sequence !== searchSequence) return;
    const matches = places.filter(place => place.location).map(place => ({ place, name: place.displayName || place.formattedAddress, address: place.formattedAddress || '' }));
    $('property-query').focus({ preventScroll: true });
    showSuggestions(matches, query, sequence);
    $('search-status').textContent = matches.length ? '' : 'No matches found. Try a fuller address.';
  } catch {
    if (sequence === searchSequence) $('search-status').textContent = 'Search is unavailable. Try again later.';
  } finally {
    if (sequence === searchSequence) $('find-property').disabled = !ready;
  }
}

function queryChanged(event) {
  dismissSearch();
  const query = $('property-query').value.trim();
  if (!query) autocompleteSession = null;
  if (query !== pendingQuery) { pendingQuery = ''; pendingMatched = ''; pendingLocation = null; }
  if (!points.length) queryLabel = query;
  render(); persist();
  if (!event?.isComposing && !composing) queueSuggestions();
}

$('property-search').addEventListener('submit', search);
$('property-query').addEventListener('input', queryChanged);
$('property-query').addEventListener('compositionstart', () => { composing = true; dismissSearch(); });
$('property-query').addEventListener('compositionend', () => { composing = false; queryChanged(); });
$('property-query').addEventListener('keydown', event => {
  if (event.isComposing || composing) return;
  const count = $('result-list').children.length;
  if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && count) {
    event.preventDefault();
    highlightSuggestion(activeSuggestion < 0 ? (event.key === 'ArrowDown' ? 0 : count - 1) : activeSuggestion + (event.key === 'ArrowDown' ? 1 : -1));
  } else if (event.key === 'Enter' && activeSuggestion >= 0 && count) {
    event.preventDefault();
    $('result-list').children[activeSuggestion].click();
  } else if (event.key === 'Escape' || event.key === 'Tab') {
    dismissSearch({ endSession: true });
    if (event.key === 'Escape') event.preventDefault();
  }
});
document.addEventListener('pointerdown', event => {
  if (!document.querySelector('.property-finder').contains(event.target)) dismissSearch({ endSession: true });
});
document.querySelector('.property-finder').addEventListener('focusout', event => {
  if (!event.currentTarget.contains(event.relatedTarget)) dismissSearch({ endSession: true });
});

$('mode-polygon').addEventListener('click', () => changeMode('polygon'));
$('mode-click').addEventListener('click', () => changeMode('click'));
$('clear-area').addEventListener('click', () => { remember(); points = []; confirmed = false; render(); persist(); });
$('undo-area').addEventListener('click', () => {
  const previous = undoStack.pop();
  if (!previous) return;
  points = previous.points; mode = previous.mode; confirmed = false;
  queryLabel = previous.queryLabel; matchedLabel = previous.matchedLabel;
  render(); persist();
});
$('fit-area').addEventListener('click', fitSelection);
for (const [id, type] of [['view-map', 'roadmap'], ['view-satellite', 'hybrid']]) {
  $(id).addEventListener('click', () => {
    if (!map) return;
    map.setMapTypeId(type);
    $('view-map').setAttribute('aria-pressed', String(type === 'roadmap'));
    $('view-satellite').setAttribute('aria-pressed', String(type === 'hybrid'));
  });
}
$('map-retry').addEventListener('click', () => { persist(); location.reload(); });
function focusStep() {
  $('experience-title').focus({ preventScroll: true });
  $('experience').scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}

function renderPriorities() {
  $('priorities-form').hidden = false;
  $('priorities-review').hidden = true;
  const lines = [
    [priorities.purpose.trim(), priorities.exploring ? 'We’re still exploring' : ''].filter(Boolean).join(' · '),
    priorities.preserve.trim(),
    priorities.choices.join(' · '),
  ].filter(Boolean);
  $('priorities-summary').replaceChildren(...lines.map(text => {
    const item = document.createElement('li');
    item.textContent = text;
    return item;
  }));
}

function readPriorities() {
  priorities.purpose = $('priority-purpose').value;
  priorities.preserve = $('priority-preserve').value;
  priorities.exploring = $('priority-exploring').checked;
  priorities.choices = [...document.querySelectorAll('[name="priority-choice"]:checked')].map(input => input.value);
  priorities.saved = false;
  persist();
}

$('priorities-form').addEventListener('input', readPriorities);
$('priorities-form').addEventListener('submit', event => {
  event.preventDefault();
  readPriorities();
  if (!priorities.purpose.trim() && !priorities.preserve.trim() && !priorities.choices.length) {
    priorities.exploring = true;
    $('priority-exploring').checked = true;
  }
  priorities.saved = true;
  renderPriorities(); persist();
  void showFindings();
});
$('edit-priorities').addEventListener('click', () => {
  priorities.saved = false;
  renderPriorities(); persist();
  $('priority-purpose').focus({ preventScroll: true });
});
$('use-area').addEventListener('click', () => {
  if (!ready || !validatePolygon(points).valid) return;
  dismissSearch({ endSession: true });
  mapView = { center: map.getCenter(), zoom: map.getZoom() };
  confirmed = true;
  render(); persist(); focusStep();
  void prepareEvidence(findingsInput());
});
$('back-to-map').addEventListener('click', () => {
  leaveFindings();
  confirmed = false;
  render(); persist(); focusStep();
  if (!started) void initialize();
  else if (map && mapView) requestAnimationFrame(() => {
    map.setCenter(mapView.center);
    map.setZoom(mapView.zoom);
  });
});
function leaveFindings() {
  findingsOpen = false;
  ++findingsSequence;
  findingsController?.abort();
  $('findings-step').setAttribute('aria-busy', 'false');
  $('findings-progress').hidden = true;
}

function displayFindings(result) {
  renderFindings($('findings-content'), result, {onParcel: key => {
    parcelKey = key; parcelShape = JSON.stringify(points); lastFindings = null;
    void showFindings();
  }});
  $('findings-content').hidden = false;
  $('findings-announcement').textContent = result.narrativeStatus === 'ready' ? 'Your preliminary findings are ready.' : 'The available property records are ready.';
}

function findingsInput() {
  if (parcelShape !== JSON.stringify(points)) parcelKey = null;
  return {points: copy(points), query: queryLabel, parcelKey, priorities: {purpose: priorities.purpose, matters: priorities.preserve, choices: priorities.choices, exploring: priorities.exploring}};
}
function prepareEvidence(input, retry = false) {
  const key = JSON.stringify({points: input.points, parcelKey: input.parcelKey});
  if (!retry && evidenceRequest?.key === key && Date.now() - evidenceRequest.time < 15 * 60 * 1000) return evidenceRequest.promise;
  const promise = fetch('/api/property-evidence', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(input), signal: AbortSignal.timeout(90000)})
    .then(async response => {const result = await response.json(); if (!response.ok) throw new Error(result.error || 'The records lookup is unavailable.'); return result;})
    .catch(error => ({lookupError: error.message}));
  evidenceRequest = {key, promise, time: Date.now()};
  return promise;
}
async function showFindings(retry = false) {
  if (!confirmed || !validatePolygon(points).valid) return;
  findingsController?.abort();
  const sequence = ++findingsSequence;
  const controller = new AbortController();
  findingsController = controller;
  const input = findingsInput();
  const signature = JSON.stringify(input);
  findingsOpen = true;
  $('findings-announcement').textContent = '';
  $('findings-step').setAttribute('aria-busy', 'false');
  $('findings-loading').hidden = true;
  $('findings-error').hidden = true;
  $('findings-progress').hidden = true;
  $('findings-content').hidden = true;
  render(); focusStep();
  if (!retry && lastFindings?.signature === signature && Date.now() - lastFindings.time < 15 * 60 * 1000) { displayFindings(lastFindings.result); return; }
  $('findings-loading').hidden = false;
  $('findings-step').setAttribute('aria-busy', 'true');
  const timer = setTimeout(() => controller.abort(), 140000);
  try {
    const records = await prepareEvidence(input, retry);
    if (sequence !== findingsSequence || !findingsOpen) return;
    if (records.lookupError) throw new Error(records.lookupError);
    if (records.schemaVersion !== 2 || !Array.isArray(records.sources)) throw new Error('We couldn’t read the property records. Please retry.');
    displayFindings(records);
    $('findings-loading').hidden = true;
    if (!records.code.length || !records.parcel || records.zones.length !== 1 || records.status === 'needs-parcel' || records.locality?.boundaryUncertain || records.gaps.some(g => g.id === 'zoning-coverage')) return;
    $('findings-progress').hidden = false;
    const response = await fetch('/api/first-look', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: signature, signal: controller.signal});
    const result = await response.json();
    if (sequence !== findingsSequence || !findingsOpen) return;
    if (!response.ok) throw new Error(result.error || 'The first-look service is unavailable. Please try again.');
    if (result.schemaVersion !== 2 || !Array.isArray(result.sources)) throw new Error('We couldn’t read these findings. Please try again.');
    lastFindings = {signature, result, time: Date.now()};
    displayFindings(result);
  } catch (error) {
    if (sequence !== findingsSequence || !findingsOpen) return;
    $('findings-error-message').textContent = error.name === 'AbortError' ? 'This is taking longer than expected. Try again; your work is saved.' : error instanceof SyntaxError || error instanceof TypeError ? 'We couldn’t connect. Please try again; your work is saved.' : error.message;
    $('findings-error').hidden = false;
  } finally {
    clearTimeout(timer);
    if (sequence === findingsSequence) {
      $('findings-loading').hidden = true;
      $('findings-progress').hidden = true;
      $('findings-step').setAttribute('aria-busy', 'false');
    }
  }
}
$('see-findings').addEventListener('click', () => { void showFindings(); });
$('retry-findings').addEventListener('click', () => { void showFindings(true); });
$('refresh-findings').addEventListener('click', () => { void showFindings(true); });
$('back-to-priorities').addEventListener('click', () => { leaveFindings(); priorities.saved = false; render(); focusStep(); });

$('keyboard-place').addEventListener('focus', () => { keyboardActive = true; render(); });
$('keyboard-place').addEventListener('blur', () => { keyboardActive = false; render(); });
$('keyboard-place').addEventListener('click', () => { if (map) selected(map.getCenter()); });
$('keyboard-place').addEventListener('keydown', event => {
  if (!ready) return;
  const step = event.shiftKey ? 80 : 20;
  const delta = { ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] }[event.key];
  if (delta) {
    event.preventDefault();
    const projection = map.getProjection();
    if (!projection) return;
    const center = projection.fromLatLngToPoint(map.getCenter());
    const scale = 2 ** map.getZoom();
    map.setCenter(projection.fromPointToLatLng(new google.maps.Point(center.x + delta[0] / scale, center.y + delta[1] / scale)));
  }
});
document.querySelectorAll('[data-nudge]').forEach(button => button.addEventListener('click', () => {
  const index = Number($('keyboard-corner').value);
  if (!ready || confirmed || !points[index]) return;
  const delta = { north: [0, -4], south: [0, 4], west: [-4, 0], east: [4, 0] }[button.dataset.nudge];
  const projection = map.getProjection();
  if (!projection) return;
  const point = projection.fromLatLngToPoint(new google.maps.LatLng(points[index]));
  const scale = 2 ** map.getZoom();
  remember();
  points[index] = literal(projection.fromPointToLatLng(new google.maps.Point(point.x + delta[0] / scale, point.y + delta[1] / scale)));
  render(); persist();
}));

restore();
$('priority-purpose').value = priorities.purpose;
$('priority-preserve').value = priorities.preserve;
$('priority-exploring').checked = priorities.exploring;
document.querySelectorAll('[name="priority-choice"]').forEach(input => { input.checked = priorities.choices.includes(input.value); });
render();
persist();
const observer = new IntersectionObserver(entries => {
  if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); if (!confirmed) initialize(); }
}, { rootMargin: '250px' });
observer.observe($('experience'));
