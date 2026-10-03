import clipping from 'polygon-clipping';

const radians = Math.PI / 180, radius = 6371008.8;
export function signedArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) sum += (ring[i + 1][0] - ring[i][0]) * radians * (2 + Math.sin(ring[i][1] * radians) + Math.sin(ring[i + 1][1] * radians));
  return sum * radius * radius / 2;
}
export function multiArea(multi) {
  return multi.reduce((sum, polygon) => sum + Math.max(0, Math.abs(signedArea(polygon[0])) - polygon.slice(1).reduce((s, r) => s + Math.abs(signedArea(r)), 0)), 0);
}
function contains(point, ring) {
  let inside = false;
  for (let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[i], b=ring[j];
    if ((a[1]>point[1]) !== (b[1]>point[1]) && point[0] < (b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
  }
  return inside;
}
// ArcGIS may contain disjoint exterior rings and interior holes. Preserve both.
export function fromRings(rings) {
  if (!Array.isArray(rings) || !rings.length || rings.flat().length > 25000) throw new Error('Unsupported source geometry');
  const valid = rings.map(ring => {
    if (ring.length < 4 || ring.some(p=>!Array.isArray(p)||p.length<2||!Number.isFinite(p[0])||!Number.isFinite(p[1])||Math.abs(p[0])>180||Math.abs(p[1])>90)) throw new Error('Invalid source geometry');
    const copy=ring.map(([x,y])=>[x,y]);
    if (copy[0][0]!==copy.at(-1)[0]||copy[0][1]!==copy.at(-1)[1]) copy.push([...copy[0]]);
    return copy;
  }).sort((a,b)=>Math.abs(signedArea(b))-Math.abs(signedArea(a)));
  const polygons=[];
  for (let i=0;i<valid.length;i++) {
    const containers=valid.slice(0,i).filter(r=>contains(valid[i][0],r));
    if (containers.length%2===0) polygons.push([valid[i]]);
    else {
      const parent=polygons.filter(p=>contains(valid[i][0],p[0])).at(-1);
      if (!parent) throw new Error('Unmatched interior ring');
      parent.push(valid[i]);
    }
  }
  return polygons;
}
export function selectedGeometry(points) {
  const ring=points.map(p=>[p.lng,p.lat]); ring.push([...ring[0]]); return [[ring]];
}
export const intersect = (a,b) => clipping.intersection(a,b);
export const union = polys => polys.length ? clipping.union(...polys) : [];
export const ringsOf = multi => multi.flat();
export function overlapArea(a,b) { return multiArea(intersect(a,b)); }
