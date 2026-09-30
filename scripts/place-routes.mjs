import {searchMappedPlaces} from './place-search.mjs';
import {destinationSearch,placeQuery,matchesDestination} from './place-query.mjs';
import osmtogeojson from 'osmtogeojson';
import {polygonCenter} from '../geometry.js';
import {digest} from './evidence-client.mjs';
import {createPublicWebClient,sourceFailure} from './public-web.mjs';

const readDefault=createPublicWebClient({timeoutMs:15000});
const discoveryCooldown=new WeakMap();
const overpass='https://overpass-api.de/api/interpreter';
const router='https://valhalla1.openstreetmap.de/route';
export const placeKinds=['school','police','hospital','clinic','pharmacy','supermarket','bus_stop'];
export const travelModes=['walking','driving','cycling'];
const valid=p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
const clean=s=>String(s??'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim().slice(0,160);
const json=r=>r.data&&typeof r.data==='object'&&!ArrayBuffer.isView(r.data)&&!(r.data instanceof ArrayBuffer)?r.data:JSON.parse(Buffer.from(r.data).toString('utf8'));
const metres=(a,b)=>{const r=Math.PI/180,h=Math.sin((b[1]-a[1])*r/2)**2+Math.cos(a[1]*r)*Math.cos(b[1]*r)*Math.sin((b[0]-a[0])*r/2)**2;return 12742017.6*Math.asin(Math.sqrt(Math.min(1,h)));};
const display=m=>m<1000?Math.round(m)+' m':(m/1000).toFixed(1)+' km';

async function routeStreets(coordinates,read,signal){
  const lngs=coordinates.map(p=>p[0]),lats=coordinates.map(p=>p[1]);
  const box=[Math.min(...lats)-.0007,Math.min(...lngs)-.0008,Math.max(...lats)+.0007,Math.max(...lngs)+.0008];
  if(box[2]-box[0]>.08||box[3]-box[1]>.1)return [];
  const q=`[out:json][timeout:12][maxsize:16777216];way["highway"](${box.map(v=>v.toFixed(7)).join(',')});out geom;`;
  const r=await read(overpass+'?'+new URLSearchParams({data:q}),{signal,maxBytes:4000000,ttl:900000}),data=json(r);
  if(!Array.isArray(data.elements)||data.remark||data.elements.length>3000)return [];
  return data.elements.filter(e=>e.type==='way'&&e.tags?.highway&&e.geometry?.length>1&&e.geometry.every(p=>valid([p.lon,p.lat]))).map(e=>({id:'way/'+e.id,name:clean(e.tags.name),kind:e.tags.highway,geometry:e.geometry.map(p=>[p.lon,p.lat]),widthMeters:/^\d+(\.\d+)?$/.test(e.tags.width??'')?Number(e.tags.width):null,lanes:/^\d+$/.test(e.tags.lanes??'')?Number(e.tags.lanes):null,sourceUrl:'https://www.openstreetmap.org/way/'+e.id}));
}

export function parseRoute(data,{origin,destination,mode,sourceUrl=router,retrievedAt}={}){
  const r=data.routes?.[0],coordinates=r?.geometry?.coordinates;
  if(data.code!=='Ok'||r?.geometry?.type!=='LineString'||!coordinates||coordinates.length<2||coordinates.length>25000||!coordinates.every(valid)||!Number.isFinite(r.distance)||r.distance<=0||r.distance>100000||!Number.isFinite(r.duration)||r.duration<0)throw new Error('No usable street route was returned');
  const startGap=metres(origin,coordinates[0]),endGap=metres(destination,coordinates.at(-1));
  if(startGap>150||endGap>150)throw new Error('The mapped route ends too far from the requested site or destination');
  const lineLength=coordinates.slice(1).reduce((n,p,i)=>n+metres(coordinates[i],p),0);
  if(Math.abs(lineLength-r.distance)>Math.max(60,r.distance*.12))throw new Error('Route geometry and distance disagree');
  return {type:'street-route',mode,geometry:{type:'LineString',coordinates},distanceMeters:Math.round(r.distance),durationSeconds:Math.round(r.duration),originConnectionMeters:Math.round(startGap),destinationConnectionMeters:Math.round(endGap),start:coordinates[0],end:coordinates.at(-1),provider:'Valhalla / OpenStreetMap',sourceUrl,retrievedAt,attribution:'Routing: Valhalla · © OpenStreetMap contributors'};
}

export async function streetRoute(origin,destination,{mode='walking',read=readDefault,signal}={}){
  if(!valid(origin)||!valid(destination)||!travelModes.includes(mode))throw new Error('Invalid route request');
  const query={locations:[origin,destination].map(([lon,lat])=>({lon,lat,search_cutoff:150})),costing:{walking:'pedestrian',driving:'auto',cycling:'bicycle'}[mode],units:'kilometers',format:'osrm',shape_format:'geojson',directions_type:'none'};
  const response=await read(router+'?'+new URLSearchParams({json:JSON.stringify(query)}),{signal,maxBytes:1500000,ttl:3600000});
  return parseRoute(json(response),{origin,destination,mode,sourceUrl:response.url??router,retrievedAt:response.retrievedAt});
}

export async function readNearbyPlaces(points,{kind='school',filters,name_query,mode='walking',radiusMeters=2000,read=readDefault,route=streetRoute,searchIndex=searchMappedPlaces,signal}={}){
  const search=destinationSearch({kind,filters,name_query});
  if(!travelModes.includes(mode)||!Number.isInteger(radiusMeters)||radiusMeters<500||radiusMeters>50000)throw new Error('Invalid nearby-place request');
  const centre=polygonCenter(points),origin=[centre.lng,centre.lat],label=kind==='police'?'police station':kind.replace('_',' ');
  const base={id:'route-'+digest([origin,search,mode,radiusMeters]).slice(0,16),kind,search,mode,distanceType:'street-route',origin,originDescription:'Mapped street access near the selected land',searchRadiusMeters:radiusMeters,attribution:'© OpenStreetMap contributors',distanceMeters:null,route:null,feature:null,status:'unresolved',headline:'Route not confirmed'};
  const q=placeQuery(search,origin,radiusMeters);
  let sourceUrl=overpass+'?'+new URLSearchParams({data:q});
  try{
    let response,features,recovery=null;
    try{
      const paused=discoveryCooldown.get(read);if(paused&&paused.until>Date.now())throw paused.error;
      response=await read(sourceUrl,{signal,maxBytes:6000000,ttl:900000});const data=json(response);
      if(!Array.isArray(data.elements)||data.remark||data.elements.length>4000)throw new Error('Place search was incomplete');
      features=osmtogeojson(data,{flatProperties:false}).features;
    }catch(error){
      signal?.throwIfAborted();
      const failure=sourceFailure(error);
      if(!discoveryCooldown.has(read)||discoveryCooldown.get(read).until<=Date.now())discoveryCooldown.set(read,{until:Date.now()+30000,error});
      const index=await searchIndex(search,origin,radiusMeters,{signal});
      recovery={provider:index.provider,originalSourceUrl:sourceUrl,failure,returnedMatches:index.returnedMatches,qualification:index.qualification};
      sourceUrl=index.sourceUrl;response=index;features=index.features;
    }
    let rejected=0;const candidates=[];
    for(const f of features){
      if(!matchesDestination(f.properties?.tags,search))continue;
      if(f.properties?.tainted){rejected++;continue;}
      let coordinates=f.geometry?.type==='Point'?f.geometry.coordinates:null;
      if(!coordinates&&['Polygon','MultiPolygon'].includes(f.geometry?.type)){
        const ring=f.geometry.type==='Polygon'?f.geometry.coordinates[0]:f.geometry.coordinates[0]?.[0];
        if(ring?.length&&ring.every(valid)){const p=polygonCenter(ring.slice(0,-1).map(([lng,lat])=>({lng,lat})));coordinates=[p.lng,p.lat];}
      }
      if(!valid(coordinates)||!/^(node|way|relation)\/\d+$/.test(f.id??'')){rejected++;continue;}
      const lowerBound=metres(origin,coordinates);if(lowerBound>radiusMeters)continue;
      candidates.push({id:f.id,name:clean(f.properties.tags.name||f.properties.tags.brand||f.properties.tags.operator)||`Mapped ${label}`,kind,coordinates,sourceUrl:'https://www.openstreetmap.org/'+f.id,lowerBound});
    }
    candidates.sort((a,b)=>a.lowerBound-b.lowerBound||a.id.localeCompare(b.id));
    // Distance through the network selects the winner. Geographic distance only
    // bounds candidate discovery; it is never displayed as a journey distance.
    const checked=[],failures=[];
    for(const place of candidates.slice(0,3)){
      signal?.throwIfAborted();
      try{const result=await route(origin,place.coordinates,{mode,read,signal});const {lowerBound,...feature}=place;checked.push({feature,route:result});}
      catch(error){signal?.throwIfAborted();failures.push({id:place.id,...sourceFailure(error)});}
    }
    checked.sort((a,b)=>a.route.distanceMeters-b.route.distanceMeters);
    const best=checked[0],coverage={candidatesFound:candidates.length,candidatesRouted:checked.length,candidatesAttempted:Math.min(3,candidates.length),candidateLimit:3,completeInventory:false,failures,rejected,...(recovery?{recovery}:{})};
    if(!best)return {...base,sourceUrl,retrievedAt:response.retrievedAt,coverage,detail:candidates.length?`A mapped ${label} was found, but a ${mode} route could not be confirmed. No direct-line distance has been substituted.`:`No usable mapped ${label} was found in this search. This does not establish that none is nearby.`};
    const {feature,route:measured}=best;
    let streets=[];if(!recovery)try{streets=await routeStreets(measured.geometry.coordinates,read,signal);}catch{signal?.throwIfAborted();}
    measured.streets=streets;measured.streetContextStatus=streets.length?'retrieved':'unavailable';
    return {...base,version:digest([base.id,response.hash,measured.geometry]).slice(0,20),status:recovery||failures.length||candidates.length>3||rejected?'partial':'answered',feature,route:measured,distanceMeters:measured.distanceMeters,durationSeconds:measured.durationSeconds,sourceUrl,retrievedAt:response.retrievedAt,coverage,headline:`${display(measured.distanceMeters)} ${mode} to ${feature.name}`,detail:`Shortest ${mode} route among ${checked.length} mapped ${label} ${checked.length===1?'destination':'destinations'} successfully checked within a ${(radiusMeters/1000).toFixed(1)} km search area. Other places may be missing. The route starts and ends on the mapped travel network near the site and destination; entrances and the connections across the properties are not verified. Travel time is an estimate.${recovery?' '+recovery.qualification:''}${kind==='school'?' School type and attendance eligibility are not established.':''}${kind==='police'?' This is travel to a station, not police response time or a safety rating.':''}`};
  }catch(error){signal?.throwIfAborted();return {...base,sourceUrl,failure:sourceFailure(error),detail:`The ${label} route lookup could not be completed. No direct-line distance has been substituted.`};}
}
