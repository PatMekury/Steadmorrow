import osmtogeojson from 'osmtogeojson';
import {digest} from './evidence-client.mjs';
import {createPublicWebClient,sourceFailure} from './public-web.mjs';
import {polygonCenter} from '../geometry.js';
import clipping from 'polygon-clipping';
import {multiArea} from './site-geometry.mjs';
import {readOvertureHeights,applyHeightEnrichment} from './overture-heights.mjs';

const endpoint='https://overpass-api.de/api/interpreter';
const attribution='© OpenStreetMap contributors';
const defaultRead=createPublicWebClient({timeoutMs:18000});
const clean=value=>typeof value==='string'?value.replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim().slice(0,160):undefined;
const validPosition=p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
export const contextRenderVersion=buildings=>digest(buildings.map(b=>[b.id,b.geometry,b.heightMeters,b.heightBasis,b.levels,b.minLevel,b.minHeightMeters,b.roof,b.buildingPart,b.parentId,b.parentAssociation,b.partIds,b.partCoverage,b.partsCoverageComplete,b.heightSources,b.heightRelease,b.heightSourceUrl])).slice(0,20);
export function straightLineMeters(a,b){
  const r=Math.PI/180,dlat=(b[1]-a[1])*r,dlng=(b[0]-a[0])*r;
  const h=Math.sin(dlat/2)**2+Math.cos(a[1]*r)*Math.cos(b[1]*r)*Math.sin(dlng/2)**2;
  return 6371008.8*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
export function mappedHeight(value,{allowZero=false}={}){
  if(typeof value!=='string'&&typeof value!=='number')return null;
  const s=String(value).trim(),m=/^(\d+(?:\.\d+)?)\s*(m|meters?|metres?|ft|feet|')?$/i.exec(s);
  if(!m)return null;
  const n=Number(m[1])*(/ft|feet|'/i.test(m[2]??'')?.3048:1);
  return (allowZero?n>=0:n>0)&&n<1000?n:null;
}
function mappedLevels(value,{allowZero=false}={}){
  if(typeof value!=='string'&&typeof value!=='number')return null;
  const text=String(value).trim();if(!/^\d+(?:\.\d+)?$/.test(text))return null;
  const n=Number(text);return (allowZero?n>=0:n>0)&&n<=300?n:null;
}
const roofShapes=new Set(['flat','skillion','gabled','half-hipped','hipped','pyramidal','gambrel','mansard','dome','onion','round','saltbox']);
function mappedRoof(tags){
  const shape=roofShapes.has(tags['roof:shape'])?tags['roof:shape']:null;
  const heightMeters=mappedHeight(tags['roof:height'],{allowZero:true}),levels=mappedLevels(tags['roof:levels'],{allowZero:true});
  const direction=typeof tags['roof:direction']==='string'&&/^\d+(?:\.\d+)?$/.test(tags['roof:direction'].trim())?Number(tags['roof:direction']):null;
  const directionDegrees=direction!==null&&direction>=0&&direction<=360?direction:null;
  const orientation=['along','across'].includes(tags['roof:orientation'])?tags['roof:orientation']:null;
  return shape!==null||heightMeters!==null||levels!==null||directionDegrees!==null||orientation!==null?{shape,heightMeters,levels,directionDegrees,orientation,basis:'mapped-tags'}:null;
}

// Associations describe the source geometry. They never remove collision footprints
// or assert that the mapped parts form a complete, correctly dimensioned 3D model.
function associateBuildingParts(buildings,elements){
  const byId=new Map(buildings.map(b=>[b.id,b])),explicitParents=new Map();
  for(const relation of elements??[]){
    if(relation.type!=='relation'||relation.tags?.type!=='building')continue;
    const outlines=(relation.members??[]).filter(m=>m.role==='outline').map(m=>byId.get(`${m.type}/${m.ref}`)).filter(b=>b&&!b.buildingPart);
    if(outlines.length!==1)continue;
    for(const member of relation.members??[]){
      if(member.role!=='part')continue;
      const id=`${member.type}/${member.ref}`;if(!byId.get(id)?.buildingPart)continue;
      const list=explicitParents.get(id)??[];list.push({parent:outlines[0],sourceUrl:idUrl(`relation/${relation.id}`)});explicitParents.set(id,list);
    }
  }
  const box=geometry=>{const p=geometry.flat(2);return [Math.min(...p.map(v=>v[0])),Math.min(...p.map(v=>v[1])),Math.max(...p.map(v=>v[0])),Math.max(...p.map(v=>v[1]))];};
  const outlines=buildings.filter(b=>!b.buildingPart).map(b=>({b,bounds:box(b.geometry),area:multiArea(b.geometry)})).sort((a,b)=>a.area-b.area||a.b.id.localeCompare(b.b.id));
  for(const part of buildings.filter(b=>b.buildingPart)){
    const partArea=multiArea(part.geometry);if(partArea<=0)continue;
    const supplied=explicitParents.get(part.id)??[],parents=[...new Set(supplied.map(p=>p.parent.id))];
    let match=parents.length===1?{parent:byId.get(parents[0]),basis:'mapped-relation',sourceUrl:supplied[0].sourceUrl}:null;
    if(parents.length>1)continue; // Conflicting explicit relationships remain unresolved.
    if(!match){
      const pb=box(part.geometry);
      for(const {b,bounds:bb,area}of outlines){
        if(area<=0||pb[0]<bb[0]||pb[1]<bb[1]||pb[2]>bb[2]||pb[3]>bb[3])continue;
        try{if(multiArea(clipping.intersection(part.geometry,b.geometry))/partArea>=.98){match={parent:b,basis:'footprint-containment'};break;}}catch{/* Keep ambiguous geometry independent. */}
      }
    }
    if(!match)continue;
    let partCoverage=null;try{partCoverage=Math.max(0,Math.min(1,multiArea(clipping.intersection(part.geometry,match.parent.geometry))/partArea));}catch{}
    part.parentId=match.parent.id;part.parentAssociation={basis:match.basis,partCoverage,...(match.sourceUrl?{sourceUrl:match.sourceUrl}:{})};match.parent.partIds.push(part.id);
  }
  for(const {b,area}of outlines){
    if(!b.partIds.length||area<=0)continue;
    const parts=b.partIds.map(id=>byId.get(id).geometry);
    try{b.partCoverage=Math.max(0,Math.min(1,multiArea(clipping.intersection(b.geometry,clipping.union(...parts)))/area));b.partsCoverageComplete=b.partCoverage>=.995;}catch{b.partCoverage=null;}
  }
}
function polygonGeometry(geometry){
  const multi=geometry?.type==='Polygon'?[geometry.coordinates]:geometry?.type==='MultiPolygon'?geometry.coordinates:null;
  if(!multi?.length||multi.flat(2).length>25000)return null;
  for(const p of multi)for(const ring of p){if(ring.length<4||ring.some(c=>!validPosition(c))||ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1])return null;}
  return multi;
}
function featurePoint(geometry){
  if(geometry?.type==='Point')return validPosition(geometry.coordinates)?geometry.coordinates:null;
  const multi=polygonGeometry(geometry);if(!multi)return null;
  const ring=multi[0][0].slice(0,-1),p=polygonCenter(ring.map(([lng,lat])=>({lng,lat})));
  return [p.lng,p.lat];
}
function idUrl(id){return /^(node|way|relation)\/\d+$/.test(id)?'https://www.openstreetmap.org/'+id:null;}
function contextOrigin(points){const p=polygonCenter(points);return [p.lng,p.lat];}
function bounds(origin,radius){const dlat=radius/111195,dlng=radius/(111195*Math.max(.1,Math.cos(origin[1]*Math.PI/180)));return [origin[1]-dlat,origin[0]-dlng,origin[1]+dlat,origin[0]+dlng].map(n=>Number(n.toFixed(7))).join(',');}
async function query(read,queryText,signal){
  const url=endpoint+'?'+new URLSearchParams({data:queryText});
  const response=await read(url,{signal,maxBytes:6000000,ttl:900000});
  const data=response.data?.elements?response.data:JSON.parse(Buffer.from(response.data).toString('utf8'));
  if(!Array.isArray(data.elements)||data.remark)throw new Error('Incomplete contextual map response');
  if(data.elements.length>12000)throw new Error('Context response exceeded the limit');
  return {data,response,url};
}
// OSM is contextual cartography, never a parcel, zoning or safe-access source.
export function parseContext(data,{origin,radius,response,sourceUrl}){
  const features=osmtogeojson(data,{flatProperties:false}).features,buildings=[],roads=[],amenities=[];
  let rejected=0;
  for(const feature of features){
    const tags=feature.properties?.tags??{},id=String(feature.id??''),url=idUrl(id);if(!url)continue;
    if(feature.properties?.tainted){rejected++;continue;}
    const geometry=polygonGeometry(feature.geometry),name=clean(tags.name);
    if(tags.building&&tags.building!=='no'||tags['building:part']&&tags['building:part']!=='no'){
      if(!geometry){rejected++;continue;}
      const heightMeters=mappedHeight(tags.height),levels=mappedLevels(tags['building:levels']);
      const rawMinLevel=mappedLevels(tags['building:min_level'],{allowZero:true}),minLevel=rawMinLevel!==null&&(levels===null||rawMinLevel<levels)?rawMinLevel:null;
      const rawMinHeight=mappedHeight(tags.min_height,{allowZero:true}),minHeightMeters=rawMinHeight!==null&&(heightMeters===null||rawMinHeight<heightMeters)?rawMinHeight:null;
      buildings.push({id,geometry,heightMeters,heightBasis:heightMeters!==null?'mapped':levels!==null?'levels':'unknown',levels,minLevel,minHeightMeters,roof:mappedRoof(tags),buildingPart:Boolean(tags['building:part']&&tags['building:part']!=='no'),partIds:[],partCoverage:0,partsCoverageComplete:false,name,sourceUrl:url});
    }
    if(tags.highway&&feature.geometry?.type==='LineString'&&feature.geometry.coordinates.every(validPosition))roads.push({id,geometry:feature.geometry.coordinates,name,kind:clean(tags.highway),widthMeters:mappedHeight(tags.width),lanes:/^\d+$/.test(tags.lanes??'')?Number(tags.lanes):null,bridge:tags.bridge==='yes',tunnel:tags.tunnel==='yes',sourceUrl:url});
    if(['school','police','parking','place_of_worship'].includes(tags.amenity)){
      const coordinates=featurePoint(feature.geometry);if(coordinates)amenities.push({id,kind:tags.amenity,name: name??(tags.amenity==='school'?'Unnamed mapped school':tags.amenity==='parking'?'Mapped parking':'Place of worship'),coordinates,geometry,sourceUrl:url});
    }
  }
  // Keep the immediate site first if a dense district exceeds the display cap.
  const distance=b=>{const ring=b.geometry[0][0],p=polygonCenter(ring.slice(0,-1).map(([lng,lat])=>({lng,lat})));return straightLineMeters(origin,[p.lng,p.lat]);};
  buildings.sort((a,b)=>distance(a)-distance(b)||a.id.localeCompare(b.id));
  const truncated=buildings.length>800||roads.length>1000||amenities.length>150;
  const retainedBuildings=buildings.slice(0,800);
  associateBuildingParts(retainedBuildings,data.elements);
  const geometryVersion=digest(retainedBuildings.map(b=>[b.id,b.geometry])).slice(0,20);
  const renderVersion=contextRenderVersion(retainedBuildings);
  return {status:truncated||rejected?'partial':'ready',version:digest([response.hash,origin,radius]).slice(0,20),geometryVersion,renderVersion,origin,searchRadiusMeters:radius,buildings:retainedBuildings,roads:roads.slice(0,1000),amenities:amenities.slice(0,150),attribution,sourceUrl,retrievedAt:response.retrievedAt,mapTimestamp:data.osm3s?.timestamp_osm_base??null,coverage:{provider:'OpenStreetMap',complete:false,queryComplete:!truncated,rejectedGeometries:rejected,truncated,detail:'Mapped features may be missing or outdated. Source heights and storeys are retained separately; any display estimates are not surveyed dimensions. Roads do not establish a legal or accessible entrance.'}};
}
export async function readSiteContext(points,{radiusMeters=300,read=defaultRead,readHeights=readOvertureHeights,signal}={}){
  if(!Number.isInteger(radiusMeters)||radiusMeters<150||radiusMeters>500)throw new Error('Invalid context radius');
  const origin=contextOrigin(points),selectionRadius=Math.max(...points.map(p=>straightLineMeters(origin,[p.lng,p.lat])));
  const radius=Math.min(1200,Math.ceil(Math.max(radiusMeters,selectionRadius+80))),bbox=bounds(origin,radius);
  const q='[out:json][timeout:12][maxsize:33554432];(way["building"]('+bbox+');relation["building"]('+bbox+');relation["type"="building"]('+bbox+');way["building:part"]('+bbox+');relation["building:part"]('+bbox+');way["highway"]('+bbox+');nwr["amenity"~"^(school|police|parking|place_of_worship)$"]('+bbox+'););out geom;';
  try{
    const {data,response,url}=await query(read,q,signal);let context=parseContext(data,{origin,radius,response,sourceUrl:url});
    const missing=context.buildings.filter(b=>!b.buildingPart&&b.heightMeters===null);
    if(readHeights&&missing.length){
      let enrichment;try{enrichment=await readHeights({origin,radiusMeters:radius,buildingIds:missing.map(b=>b.id),signal});if(!enrichment||!Array.isArray(enrichment.records))throw new Error('Invalid height lookup response');}catch(error){signal?.throwIfAborted();enrichment={status:'unavailable',records:[],failure:{code:'height-source-unavailable',message:'Supplemental building heights could not be retrieved.'}};}
      context=applyHeightEnrichment(context,enrichment);context.renderVersion=contextRenderVersion(context.buildings);
    }
    return context;
  }
  catch(error){signal?.throwIfAborted();return {status:'unavailable',version:digest(['context-failure',origin,radius]).slice(0,20),geometryVersion:digest([]).slice(0,20),renderVersion:digest([]).slice(0,20),origin,searchRadiusMeters:radius,buildings:[],roads:[],amenities:[],attribution,sourceUrl:endpoint,coverage:{complete:false,queryComplete:false,detail:'Nearby map features could not be retrieved. This does not establish that the site is vacant.'},failure:sourceFailure(error)};}
}
export async function readNearbySchools(points,options={}){
  const {readNearbyPlaces}=await import('./place-routes.mjs');
  return readNearbyPlaces(points,{...options,kind:'school',mode:options.mode??'walking'});
}
