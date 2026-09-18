// Geometry for the four corners of a user-selected exploration area.
// These measurements describe the selection, not a surveyed parcel boundary.
const EARTH_RADIUS_METERS = 6371008.8;
const RADIANS = Math.PI / 180;
const MIN_CORNER_DISTANCE_METERS = 0.05;
const MIN_AREA_SQUARE_METERS = 0.01;
const INTERSECTION_TOLERANCE_METERS = 0.0001;

function isCoordinate(point) {
  return point !== null && typeof point === 'object'
    && Number.isFinite(point.lat) && Number.isFinite(point.lng)
    && Math.abs(point.lat) <= 85 && Math.abs(point.lng) <= 180;
}

function hasCoordinates(points, minimum = 1) {
  return Array.isArray(points) && points.length >= minimum && points.every(isCoordinate);
}

function wrapLongitude(longitude) {
  return ((longitude + 180) % 360 + 360) % 360 - 180;
}

// Keep neighboring points in the same local longitude interval at the dateline.
function unwrap(points) {
  let previous = points[0].lng;
  return points.map((point, index) => {
    const lng = index === 0 ? previous : previous + wrapLongitude(point.lng - previous);
    previous = lng;
    return { lat: point.lat, lng };
  });
}

function project(points) {
  const unwrapped = unwrap(points);
  const origin = unwrapped[0];
  const latitude = unwrapped.reduce((total, point) => total + point.lat, 0) / points.length;
  const longitudeScale = EARTH_RADIUS_METERS * RADIANS * Math.cos(latitude * RADIANS);
  const latitudeScale = EARTH_RADIUS_METERS * RADIANS;
  return {
    origin,
    longitudeScale,
    latitudeScale,
    points: unwrapped.map(point => ({
      x: (point.lng - origin.lng) * longitudeScale,
      y: (point.lat - origin.lat) * latitudeScale,
    })),
  };
}

function signedDoubleArea(points) {
  return points.reduce((total, point, index) => {
    const next = points[(index + 1) % points.length];
    return total + point.x * next.y - next.x * point.y;
  }, 0);
}

function orientation(a, b, point) {
  const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
  const tolerance = INTERSECTION_TOLERANCE_METERS * Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
  return Math.abs(cross) <= tolerance ? 0 : Math.sign(cross);
}

function onSegment(a, b, point) {
  const tolerance = INTERSECTION_TOLERANCE_METERS;
  return point.x >= Math.min(a.x, b.x) - tolerance
    && point.x <= Math.max(a.x, b.x) + tolerance
    && point.y >= Math.min(a.y, b.y) - tolerance
    && point.y <= Math.max(a.y, b.y) + tolerance;
}

function segmentsIntersect(a, b, c, d) {
  const abc = orientation(a, b, c);
  const abd = orientation(a, b, d);
  const cda = orientation(c, d, a);
  const cdb = orientation(c, d, b);
  return (abc !== 0 && abd !== 0 && cda !== 0 && cdb !== 0 && abc !== abd && cda !== cdb)
    || (abc === 0 && onSegment(a, b, c))
    || (abd === 0 && onSegment(a, b, d))
    || (cda === 0 && onSegment(c, d, a))
    || (cdb === 0 && onSegment(c, d, b));
}

/** Validate a quadrilateral without changing its points or their order. */
export function validatePolygon(points) {
  if (!Array.isArray(points) || points.length !== 4) {
    return { valid: false, message: 'Select four corners around the vacant land.' };
  }
  if (!points.every(isCoordinate)) {
    return { valid: false, message: 'Choose a valid location for each corner.' };
  }
  const projected = project(points).points;
  for (let first = 0; first < projected.length; first += 1) {
    for (let second = first + 1; second < projected.length; second += 1) {
      if (Math.hypot(projected[first].x - projected[second].x, projected[first].y - projected[second].y)
          < MIN_CORNER_DISTANCE_METERS) {
        return { valid: false, message: 'Move the corners farther apart.' };
      }
    }
  }
  if (segmentsIntersect(projected[0], projected[1], projected[2], projected[3])
      || segmentsIntersect(projected[1], projected[2], projected[3], projected[0])) {
    return { valid: false, message: 'Move the corners so the edges do not cross or touch.' };
  }
  if (Math.abs(signedDoubleArea(projected)) / 2 < MIN_AREA_SQUARE_METERS) {
    return { valid: false, message: 'Spread the corners out to enclose an area.' };
  }
  return { valid: true, message: '' };
}

/** Approximate spherical area in m²; invalid or incomplete coordinates return 0. */
export function areaSquareMeters(points) {
  if (!hasCoordinates(points, 3)) return 0;
  // Subtract a shared latitude baseline before summing to reduce cancellation
  // for small plots. The closed longitude differences sum to zero locally.
  const baseline = Math.sin(points[0].lat * RADIANS);
  const sphericalSum = points.reduce((total, point, index) => {
    const next = points[(index + 1) % points.length];
    const deltaLongitude = wrapLongitude(next.lng - point.lng) * RADIANS;
    return total + deltaLongitude * (Math.sin(point.lat * RADIANS) - baseline
      + Math.sin(next.lat * RADIANS) - baseline);
  }, 0);
  return Math.abs(sphericalSum) * EARTH_RADIUS_METERS ** 2 / 2;
}

/** Local area centroid; incomplete/degenerate selections use their mean. */
export function polygonCenter(points) {
  if (!hasCoordinates(points)) return null;
  const projection = project(points);
  const planar = projection.points;
  const doubleArea = signedDoubleArea(planar);
  let x;
  let y;
  if (planar.length < 3 || Math.abs(doubleArea) < MIN_AREA_SQUARE_METERS * 2) {
    x = planar.reduce((total, point) => total + point.x, 0) / planar.length;
    y = planar.reduce((total, point) => total + point.y, 0) / planar.length;
  } else {
    let xTotal = 0;
    let yTotal = 0;
    planar.forEach((point, index) => {
      const next = planar[(index + 1) % planar.length];
      const cross = point.x * next.y - next.x * point.y;
      xTotal += (point.x + next.x) * cross;
      yTotal += (point.y + next.y) * cross;
    });
    x = xTotal / (3 * doubleArea);
    y = yTotal / (3 * doubleArea);
  }
  return {
    lat: projection.origin.lat + y / projection.latitudeScale,
    lng: wrapLongitude(projection.origin.lng + x / projection.longitudeScale),
  };
}
