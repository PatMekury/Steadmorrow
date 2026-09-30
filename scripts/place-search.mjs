import {setTimeout as delay} from 'node:timers/promises';
import {createPublicWebClient} from './public-web.mjs';
import {matchesDestination} from './place-query.mjs';

// One application-wide queue and cache, not one request allowance per user.
// Public Nominatim is for modest, explicit user searches; never autocomplete,
// bulk inventories or background polling. The endpoint can be changed/disabled
// in the server environment without a software update.
export function createPlaceSearchReader({read=createPublicWebClient({timeoutMs:12000}),now=Date.now,wait=ms=>delay(ms)}={}){
  const cache=new Map(),pending=new Map();let tail=Promise.resolve(),nextStart=0;
  return (url,{signal}={})=>{
    signal?.throwIfAborted();const saved=cache.get(url);
    if(saved&&now()-saved.at<3600000)return Promise.resolve(structuredClone(saved.value));
    if(!pending.has(url)){
      const task=tail.catch(()=>{}).then(async()=>{
        if(nextStart>now())await wait(nextStart-now());nextStart=now()+1100;
        const value=await read(url,{maxBytes:1500000,ttl:3600000});
        cache.set(url,{at:now(),value});while(cache.size>128)cache.delete(cache.keys().next().value);
        return value;
      });tail=task;pending.set(url,task);task.finally(()=>pending.delete(url)).catch(()=>{});
    }
    const task=pending.get(url);
    // Cancelling one caller does not cancel another caller's shared lookup.
    return new Promise((resolve,reject)=>{
      const abort=()=>reject(signal.reason);signal?.addEventListener('abort',abort,{once:true});
      task.then(v=>resolve(structuredClone(v)),reject).finally(()=>signal?.removeEventListener('abort',abort));
    });
  };
}
const sharedRead=createPlaceSearchReader();
export function placeSearchUrl(search,origin,radius,endpoint=process.env.STEADMORROW_PLACE_SEARCH_ENDPOINT??'https://nominatim.openstreetmap.org/search'){
  if(endpoint==='disabled')throw new Error('Place-search recovery is disabled by server configuration');
  const tag=search.filters[0]?.tags.find(t=>!['name','brand','operator'].includes(t.key));
  const term=search.name_query??(tag?'['+tag.value.replaceAll('_',' ')+']':search.kind);
  const latSpan=radius/111320,lngSpan=latSpan/Math.max(.05,Math.cos(origin[1]*Math.PI/180));
  // Round the public search window outward; exact site coordinates stay local.
  const west=Math.max(-180,Math.floor((origin[0]-lngSpan)*100)/100),east=Math.min(180,Math.ceil((origin[0]+lngSpan)*100)/100);
  const south=Math.max(-90,Math.floor((origin[1]-latSpan)*100)/100),north=Math.min(90,Math.ceil((origin[1]+latSpan)*100)/100);
  const url=new URL(endpoint);url.search=new URLSearchParams({q:term,viewbox:[west,south,east,north].join(','),bounded:'1',format:'jsonv2',limit:'10',extratags:'1',namedetails:'1'}).toString();return url.href;
}
export async function searchMappedPlaces(search,origin,radius,{read=sharedRead,signal}={}){
  const sourceUrl=placeSearchUrl(search,origin,radius),response=await read(sourceUrl,{signal});
  const data=Array.isArray(response.data)?response.data:JSON.parse(Buffer.from(response.data).toString('utf8'));
  if(!Array.isArray(data)||data.length>10)throw new Error('Invalid place-search response');
  const features=[];
  for(const item of data){
    const tags={...item.extratags,...item.namedetails,name:item.name??item.namedetails?.name,[item.category??item.class]:item.type};
    if(!['node','way','relation'].includes(item.osm_type)||!Number.isSafeInteger(item.osm_id)||item.osm_id<1||!matchesDestination(tags,search))continue;
    const coordinates=[Number(item.lon),Number(item.lat)];
    if(!coordinates.every(Number.isFinite)||Math.abs(coordinates[0])>180||Math.abs(coordinates[1])>90)continue;
    features.push({type:'Feature',id:item.osm_type+'/'+item.osm_id,properties:{tags},geometry:{type:'Point',coordinates}});
  }
  return {features,sourceUrl,retrievedAt:response.retrievedAt,hash:response.hash,provider:'Nominatim / OpenStreetMap',returnedMatches:data.length,
    qualification:'Recovery used a ranked place-search index (up to ten matches), not a complete destination inventory. Category filters were checked against returned OSM tags. The representative destination point is not a verified entrance.'};
}
