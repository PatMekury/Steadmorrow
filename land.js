import { validatePolygon, areaSquareMeters, polygonCenter } from './geometry.js';

const $ = id => document.getElementById(id);
const storageKey = 'steadmorrow.land.v1';
const initialView = { lat: 39.5, lng: -98.35 };
const copy = value => value.map(point => ({ ...point }));
const literal = value => ({ lat: typeof value.lat === 'function' ? value.lat() : value.lat, lng: typeof value.lng === 'function' ? value.lng() : value.lng });
let points = [], undoStack = [], mode = 'polygon', confirmed = false;
let map, polygon, line, AdvancedMarkerElement, markers = [];
let started = false, ready = false, searchSequence = 0, queryLabel = '', matchedLabel = '';
let pendingQuery = '', pendingMatched = '', pendingLocation = null;
let storageAvailable = true, dragging = false, keyboardActive = false;

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (!saved || saved.version !== 1 || !Array.isArray(saved.points) || saved.points.length > 4) return;
    if (!saved.points.every(p => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 85 && Math.abs(p.lng) <= 180)) return;
    points = copy(saved.points);
    mode = saved.mode === 'click' ? 'click' : 'polygon';
    confirmed = saved.confirmed === true && validatePolygon(points).valid;
    queryLabel = typeof saved.query === 'string' ? saved.query.slice(0, 240) : '';
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
    localStorage.setItem(storageKey, JSON.stringify({ version: 1, points, mode, confirmed, query: queryLabel }));
    storageAvailable = true;
  } catch { storageAvailable = false; }
  $('save-status').textContent = storageAvailable
    ? 'Saved in this browser. You can return and adjust it.'
    : 'Kept for this visit. Browser storage is unavailable; refreshing will lose this selection.';
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
  document.querySelector('.land-map-heading').hidden = !points.length && !pendingMatched;
  $('area-measure').hidden = !points.length;
  $('place-label').textContent = points.length
    ? (matchedLabel || (queryLabel ? `Your selection · ${queryLabel}` : 'Your selected exploration area'))
    : (pendingMatched || 'Find a property or explore the map');
  $('mode-polygon').setAttribute('aria-pressed', String(mode === 'polygon'));
  $('mode-click').setAttribute('aria-pressed', String(mode === 'click'));
  $('corner-progress').textContent = confirmed ? '4 corners · area selected' : points.length === 4 ? '4 corners · drag to refine' : `${points.length} of 4 corners`;
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
  $('area-confirmation').hidden = !confirmed;
  if (confirmed) $('confirmation-detail').textContent = `${matchedLabel || queryLabel || 'Your selected location'} · ${areaLabel()}. This is the area you marked for exploration.`;
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
    $('selection-help').textContent = 'Zoom in a little more before selecting the land.';
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
      clickableIcons: false, gestureHandling: 'cooperative', minZoom: 3,
    });
    polygon = new Polygon({ map, paths: points, strokeColor: '#2b61ff', strokeWeight: 2, strokeOpacity: 1, fillColor: '#2b61ff', fillOpacity: .24, editable: false, clickable: false });
    line = new Polyline({ map, path: points, strokeColor: '#2b61ff', strokeWeight: 2, clickable: false });
    ready = true;
    $('map-message').hidden = true;
    $('find-property').disabled = false;
    map.addListener('click', event => { if (event.latLng) selected(event.latLng); });
    map.addListener('zoom_changed', render);
    if (points.length > 1) fitSelection();
    render();
  } catch (error) {
    showMapFailure(error.message === 'missing-key' ? 'The map is not connected yet. Your saved area will stay here.' : 'We couldn’t load Google Maps. Check your connection or try again later. Your selection is kept.');
  }
}

async function search(event) {
  event.preventDefault();
  const query = $('property-query').value.trim();
  if (!query || !ready) return;
  const sequence = ++searchSequence;
  $('find-property').disabled = true;
  $('search-status').textContent = 'Finding matching places…';
  $('search-results').hidden = true;
  try {
    const { Place } = await google.maps.importLibrary('places');
    const { places } = await Place.searchByText({ textQuery: query, fields: ['displayName', 'formattedAddress', 'location', 'viewport'], maxResultCount: 5 });
    if (sequence !== searchSequence) return;
    const matches = places.filter(place => place.location);
    $('result-list').replaceChildren();
    $('search-status').textContent = matches.length ? 'Choose the place you have in mind.' : 'No matches found. Try a fuller address, or find the location on the map.';
    $('search-results').hidden = !matches.length;
    for (const place of matches) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'result-option';
      const name = document.createElement('span'); name.className = 'result-name'; name.textContent = place.displayName || place.formattedAddress;
      const address = document.createElement('span'); address.className = 'result-address'; address.textContent = place.formattedAddress || '';
      button.append(name, address);
      button.addEventListener('click', () => {
        pendingMatched = place.formattedAddress || place.displayName || query;
        pendingQuery = query;
        pendingLocation = literal(place.location);
        $('place-label').textContent = pendingMatched;
        $('search-results').hidden = true;
        $('search-status').textContent = 'Location found. The outline remains yours to choose.';
        map.setCenter(place.location);
        map.setZoom(18);
        // Searching never discards a previously drawn area.
        if (points.length) $('search-status').textContent = 'Location found. Your existing outline is kept; use Clear to select a new area.';
        $('mode-' + mode).focus({ preventScroll: true });
        render(); persist();
      });
      $('result-list').append(button);
    }
    if (matches.length) $('result-list').firstElementChild.focus({ preventScroll: true });
  } catch {
    if (sequence === searchSequence) $('search-status').textContent = 'Search is unavailable right now. Try again later, or find the location directly on the map. The demo may have reached its daily limit.';
  } finally {
    if (sequence === searchSequence) $('find-property').disabled = !ready;
  }
}

$('property-search').addEventListener('submit', search);
$('property-query').addEventListener('input', () => {
  if (!points.length) {
    queryLabel = $('property-query').value.trim();
    if (!queryLabel) { pendingQuery = ''; pendingMatched = ''; pendingLocation = null; }
    render(); persist();
  }
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
$('use-area').addEventListener('click', () => {
  if (!ready || !validatePolygon(points).valid) return;
  confirmed = true;
  render(); persist();
  $('confirmation-title').focus({ preventScroll: true });
  $('area-confirmation').scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
});
$('edit-area').addEventListener('click', () => { confirmed = false; render(); persist(); fitSelection(); $('mode-' + mode).focus({ preventScroll: true }); });
$('keyboard-help').addEventListener('toggle', () => { keyboardActive = $('keyboard-help').open; render(); });
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
render();
persist();
const observer = new IntersectionObserver(entries => {
  if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); initialize(); }
}, { rootMargin: '250px' });
observer.observe($('experience'));
