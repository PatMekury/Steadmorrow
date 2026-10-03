import clipping from './assets/vendor/polygon-clipping/polygon-clipping.js';

// Display assumptions never modify source dimensions or the placement geometry.
export const CONTEXT_STOREY_METRES = 3;
export function buildingDisplayHeight(building) {
  const recorded = Number.isFinite(building.heightMeters) && building.heightMeters > 0 && building.heightMeters < 1000 && !['levels','unknown'].includes(building.heightBasis);
  const hasLevels = Number.isFinite(building.levels) && building.levels > 0 && building.levels <= 300;
  const basis = recorded ? (building.heightBasis === 'overture' ? 'overture' : 'mapped') : hasLevels ? 'levels' : 'unknown';
  let base = Number.isFinite(building.minHeightMeters) && building.minHeightMeters >= 0 ? building.minHeightMeters : Number.isFinite(building.minLevel) && building.minLevel >= 0 ? building.minLevel * CONTEXT_STOREY_METRES : 0;
  const top = recorded ? building.heightMeters : hasLevels ? building.levels * CONTEXT_STOREY_METRES : base + CONTEXT_STOREY_METRES;
  base = Math.min(base, Math.max(0, top - .15));
  const sourceNames = [...new Set((building.heightSources ?? []).map(s => s.dataset ?? s.provider).filter(Boolean))];
  const description = basis === 'overture' ? `Height from ${sourceNames.join(' and ') || 'a source linked by Overture Maps'}. This is context data, not a surveyed measurement.` : recorded ? 'Height from the mapped record.' : hasLevels ? `Approximate height: ${building.levels} mapped storeys × ${CONTEXT_STOREY_METRES} m per storey.` : 'One-storey context placeholder. The building height is not recorded.';
  return {basis, base, top, approximate:['levels','unknown'].includes(basis), placeholder:basis === 'unknown', description};
}
const ringArea = ring => { const origin=ring[0]??[0,0]; return Math.abs(ring.reduce((s,p,i)=>i ? s+((ring[i-1][0]-origin[0])*(p[1]-origin[1])-(p[0]-origin[0])*(ring[i-1][1]-origin[1])) : s,0)/2); };
const area = geometry => geometry.reduce((s,p)=>s+p.reduce((v,r,i)=>v+(i?-1:1)*ringArea(r),0),0);
const box = geometry => {const p=geometry.flat(2);return [Math.min(...p.map(p=>p[0])),Math.min(...p.map(p=>p[1])),Math.max(...p.map(p=>p[0])),Math.max(...p.map(p=>p[1]))];};
const containsBox = (a,b) => a[0]<=b[0]&&a[1]<=b[1]&&a[2]>=b[2]&&a[3]>=b[3];

/** Reconcile parent/part volumes, including older cached records, without erasing footprints. */
export function sceneBuildings(buildings = []) {
  const items = buildings.filter(b=>b.geometry?.length).map(b=>({...b,display:buildingDisplayHeight(b),volumes:[],bounds:box(b.geometry)}));
  const parents=items.filter(b=>!b.buildingPart), byId=new Map(items.map(b=>[b.id,b]));
  for (const part of items.filter(b=>b.buildingPart)) {
    let parent=byId.get(part.parentId);
    if(!parent || parent.buildingPart) {
      const candidates=parents.filter(p=>containsBox(p.bounds,part.bounds)).sort((a,b)=>area(a.geometry)-area(b.geometry));
      parent=candidates.find(p=>{try{return area(clipping.intersection(p.geometry,part.geometry))/Math.max(area(part.geometry),1e-20)>.98;}catch{return false;}});
    }
    if(parent){part.sceneParentId=parent.id;parent.sceneParts??=[];parent.sceneParts.push(part);}
  }
  for(const building of items) {
    const {base,top}=building.display;
    // An unmeasured part must not cover a parent's recorded volume with a guessed one.
    if(building.buildingPart && building.sceneParentId && building.display.placeholder)continue;
    const parts=(building.sceneParts??[]).filter(p=>!p.display.placeholder);
    if(!parts.length){building.volumes.push({geometry:building.geometry,base,top});continue;}
    // Preserve parent mass below elevated parts and on all uncovered ground.
    const cuts=[...new Set([base,top,...parts.map(p=>p.display.base).filter(h=>h>base&&h<top)])].sort((a,b)=>a-b);
    try {
      for(let i=0;i<cuts.length-1;i++) {
        const active=parts.filter(p=>p.display.base<=cuts[i]);
        const geometry=active.length?clipping.difference(building.geometry,...active.map(p=>p.geometry)):building.geometry;
        if(geometry.length)building.volumes.push({geometry,base:cuts[i],top:cuts[i+1]});
      }
    } catch {building.volumes=[{geometry:building.geometry,base,top}];}
  }
  return items;
}

// Keep the selected site legible. Context extents never determine this framing.
export function subjectFrame(projectedPoints, {aspect=1,padding=1.9,minSpan=24}={}) {
  const xs=projectedPoints.map(p=>p[0]),ys=projectedPoints.map(p=>p[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const width=Math.max(minSpan,(maxX-minX)*padding),height=Math.max(minSpan,(maxY-minY)*padding);
  return {width,height,vertical:Math.max(height,width/aspect),centerX:(minX+maxX)/2,centerY:(minY+maxY)/2};
}

// Parts and their remaining parent volume are one visual building. Culling just
// the part would expose the cut made in its parent's volume as an empty hole.
export function linkedBuildingIds(buildings, qualifies) {
  const ids=new Set(buildings.map(b=>b.id)),families=new Map();
  for(const building of buildings){
    const key=ids.has(building.sceneParentId)?building.sceneParentId:building.id;
    const members=families.get(key)??[];members.push(building);families.set(key,members);
  }
  return new Set([...families.values()].filter(members=>members.some(qualifies)).flatMap(members=>members.map(b=>b.id)));
}
