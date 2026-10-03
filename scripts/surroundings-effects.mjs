import clipping from 'polygon-clipping';
import {evidenceId} from './concern-contract.mjs';
const rad=Math.PI/180;
const area=m=>m.reduce((sum,p)=>sum+p.reduce((a,r,i)=>a+(i?-1:1)*Math.abs(r.reduce((s,c,j)=>j?s+r[j-1][0]*c[1]-c[0]*r[j-1][1]:s,0)/2),0),0);
const map=(m,f)=>m.map(p=>p.map(r=>r.map(f)));
const union=m=>m.length?clipping.union(...m):[];
// Approximate geometric solar position, NOAA General Solar Position equations.
// https://gml.noaa.gov/grad/solcalc/solareqns.PDF
export function solarPosition(instant,lat,lng){
  const date=new Date(instant),year=date.getUTCFullYear(),days=(Date.UTC(year+1,0,1)-Date.UTC(year,0,1))/86400000;
  const hour=date.getUTCHours()+date.getUTCMinutes()/60+date.getUTCSeconds()/3600;
  const day=Math.floor((date-Date.UTC(year,0,1))/86400000)+1,g=2*Math.PI/days*(day-1+(hour-12)/24);
  const eq=229.18*(.000075+.001868*Math.cos(g)-.032077*Math.sin(g)-.014615*Math.cos(2*g)-.040849*Math.sin(2*g));
  const decl=.006918-.399912*Math.cos(g)+.070257*Math.sin(g)-.006758*Math.cos(2*g)+.000907*Math.sin(2*g)-.002697*Math.cos(3*g)+.00148*Math.sin(3*g);
  const h=((hour*60+eq+4*lng)/4-180)*rad,phi=lat*rad;
  const altitude=Math.asin(Math.max(-1,Math.min(1,Math.sin(phi)*Math.sin(decl)+Math.cos(phi)*Math.cos(decl)*Math.cos(h))));
  const azimuth=(Math.atan2(Math.sin(h),Math.cos(h)*Math.sin(phi)-Math.tan(decl)*Math.cos(phi))+Math.PI+2*Math.PI)%(2*Math.PI);
  return {altitudeDegrees:altitude/rad,azimuthDegrees:azimuth/rad};
}
export function shadowFootprint(footprint,height,sun){
  if(sun.altitudeDegrees<=3)return null; // Long horizon shadows exceed this local approximation.
  const length=height/Math.tan(sun.altitudeDegrees*rad),dx=-Math.sin(sun.azimuthDegrees*rad)*length,dy=-Math.cos(sun.azimuthDegrees*rad)*length;
  const pieces=[footprint,map(footprint,([x,y])=>[x+dx,y+dy])];
  for(const p of footprint)for(const r of p)for(let i=1;i<r.length;i++){const a=r[i-1],b=r[i];pieces.push([[[a,b,[b[0]+dx,b[1]+dy],[a[0]+dx,a[1]+dy],a]]]);}
  return union(pieces);
}
const pointSegment=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
function separation(a,b){if(area(clipping.intersection(a,b))>.001)return 0;let best=Infinity;for(const [first,second]of [[a,b],[b,a]])for(const p of first.flat(2))for(const r of second.flat())for(let i=1;i<r.length;i++)best=Math.min(best,pointSegment(p,r[i-1],r[i]));return best;}
export function measureSurroundings({evidence,concept,priority,sampleTimes=[]}){
  if(!concept?.buildings?.length||concept.evidenceVersion!==evidence.caseId||concept.contextVersion!==(evidence.siteContext?.geometryVersion??null))throw new Error('Choose a current placed concept before assessing its surroundings.');
  if(!priority||!Array.isArray(sampleTimes)||sampleTimes.length>8||sampleTimes.some(t=>typeof t!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(t)||!Number.isFinite(Date.parse(t))))throw new Error('Use up to eight explicit UTC instants, and a current concern.');
  const origin=evidence.selectedArea.geometry[0][0][0],mx=111195*Math.cos(origin[1]*rad),my=111195;
  if(mx<10000)throw new Error('Local projection is unsupported at this latitude.');
  const project=([x,y])=>[(x-origin[0])*mx,(y-origin[1])*my];
  const proposed=concept.buildings.map(b=>({...b,shape:map(b.geometry,project)}));
  const nearby=(evidence.siteContext?.buildings??[]).filter(b=>b.geometry?.length).map(b=>({...b,shape:map(b.geometry,project),height:b.heightMeters??(b.levels?b.levels*3:null)}));
  const structures=nearby.map(b=>({id:b.id,name:b.name??'Mapped structure',sourceUrl:b.sourceUrl,minimumSeparationMeters:Math.round(Math.min(...proposed.map(p=>separation(p.shape,b.shape)))*10)/10,existingHeightMeters:b.height,heightBasis:b.heightMeters!=null?b.heightBasis??'mapped':b.levels?'assumed three metres per mapped storey':'unknown',proposedHeightMeters:Math.max(...proposed.map(p=>p.height)),ownershipAndUse:'unverified'})).sort((a,b)=>a.minimumSeparationMeters-b.minimumSeparationMeters);
  const shadows=sampleTimes.map(instant=>{
    const sun=solarPosition(instant,origin[1],origin[0]);if(sun.altitudeDegrees<=3)return {instant,sun,status:'unresolved',reason:'Sun below or too close to the horizon for the bounded ground-shadow approximation.'};
    const cast=union(proposed.map(b=>shadowFootprint(b.shape,b.height,sun))),baseline=union(nearby.filter(b=>b.height!==null).map(b=>shadowFootprint(b.shape,b.height,sun)));
    const additional=baseline.length?clipping.difference(cast,baseline):cast;
    return {instant,sun,status:'partial',proposedGroundShadowSquareMeters:area(cast),additionalGroundShadowBeyondKnownBaselineSquareMeters:area(additional),groundProjectionOverlaps:nearby.map(b=>({structureId:b.id,squareMeters:area(clipping.intersection(cast,b.shape))})).filter(b=>b.squareMeters>.01)};
  });
  const receipt={kind:'surroundings-effects',status:'partial',originalExcerpt:priority.originalExcerpt,conceptId:concept.id,evidenceVersion:evidence.caseId,contextVersion:concept.contextVersion,structures,shadows,proposalGroundFootprintSquareMeters:concept.metrics.footprintSquareMeters,coverage:evidence.siteContext?.coverage??null,
    limitations:['Mapped buildings may be missing; this inventory does not establish ownership or residential use.','Separation and height comparisons do not establish overlooking: openings, orientation, boundary treatments and occupied rooms are not mapped.','Shadows approximate solid vertical masses on level ground at the stated instants. Ground projection over a building is not a facade or indoor daylight assessment. Terrain, roof shape, trees and unknown heights remain unmodelled.','Ground footprint is not net added impervious area: existing surfaces, drainage, ecology, noise, wind, infrastructure capacity and construction effects need relevant records or specialist investigation.','Community views are distinct from binding controls. Applicable overlays, recorded covenants, easements and association rules need original documents; missing records do not establish an absence of restrictions.'],method:'local-massing-effects-v1',methodSource:'https://gml.noaa.gov/grad/solcalc/solareqns.PDF'};
  return {id:'effects-'+evidenceId(receipt),...receipt};
}
