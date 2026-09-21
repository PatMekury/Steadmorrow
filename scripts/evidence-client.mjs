import { createHash } from 'node:crypto';

export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');

// Only adapter-owned URLs are accepted. No user-supplied fetch targets or credentials.
const hosts = new Set(['www.arcgis.com', 'geocoding.geo.census.gov', 'api.censusreporter.org', 'api.municode.com', 'library.municode.com']);
export function isSourceUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') &&
      (hosts.has(u.hostname) || /^services\d*\.arcgis\.com$/.test(u.hostname) || u.hostname.endsWith('.gov') || /\.(?:state\.[a-z]{2}|(?:co|ci)\.[a-z-]+\.[a-z]{2})\.us$/.test(u.hostname));
  } catch { return false; }
}
export function createEvidenceClient({ fetchImpl = fetch, now = Date.now, timeoutMs = 12000 } = {}) {
  const cache = new Map(), pending = new Map();
  return async function read(url, { format = 'json', maxBytes = 4_000_000, ttl = 900_000, signal } = {}) {
    signal?.throwIfAborted();
    const target = new URL(url);
    if (!isSourceUrl(url)) throw new Error('Unsupported source');
    const key = `${format}:${url}`;
    const saved = cache.get(key);
    if (saved && now() - saved.time < ttl) return saved.value;
    if (pending.has(key)) return pending.get(key);
    const task = (async () => {
      const response = await fetchImpl(url, { redirect: 'error', signal: signal?AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)]):AbortSignal.timeout(timeoutMs), headers: { Accept: format === 'json' ? 'application/json' : '*/*', 'User-Agent':'Steadmorrow/0.1 (local housing research prototype)', ...(target.hostname.includes('municode.com') ? {'X-CSRF':'1'} : {}) } });
      if (!response.ok) { await response.body?.cancel(); throw new Error(`Source returned ${response.status}`); }
      const reader = response.body.getReader(), chunks = []; let size = 0;
      while (true) {
        const {done, value} = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > maxBytes) { await reader.cancel(); throw new Error('Source response exceeded the limit'); }
        chunks.push(value);
      }
      const buffer = Buffer.concat(chunks);
      const data = format === 'json' ? JSON.parse(buffer.toString('utf8')) : format === 'bytes' ? buffer : buffer.toString('utf8');
      if (format === 'json' && data.error) throw new Error('Source query failed');
      const value = { data, retrievedAt: new Date(now()).toISOString(), hash: digest(buffer), url };
      cache.set(key, {time: now(), value});
      if (cache.size > 160) cache.delete(cache.keys().next().value);
      return value;
    })();
    pending.set(key, task);
    try { return await task; } finally { pending.delete(key); }
  };
}

export async function queryFeatures(read, layer, rings, fields = '*') {
  const url = new URL(`${layer}/query`);
  url.search = new URLSearchParams({ f:'json', where:'1=1', geometry:JSON.stringify({rings,spatialReference:{wkid:4326}}), geometryType:'esriGeometryPolygon', spatialRel:'esriSpatialRelIntersects', inSR:'4326', outSR:'4326', outFields:fields, returnGeometry:'true', resultRecordCount:'100' });
  const result = await read(url.href);
  if (!Array.isArray(result.data.features) || result.data.exceededTransferLimit || result.data.features.length >= 100) throw new Error('Incomplete spatial results');
  return result;
}
