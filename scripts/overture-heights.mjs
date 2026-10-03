import {gunzipSync} from 'node:zlib';
import {PMTiles,ResolvedValueCache} from 'pmtiles';
import {VectorTile} from '@mapbox/vector-tile';
import {PbfReader} from 'pbf';

export const OVERTURE_RELEASE='2026-09-23.1';
export const OVERTURE_ARCHIVE=`https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/${OVERTURE_RELEASE}/buildings.pmtiles`;
export const OVERTURE_QUALIFICATION='Overture inspection tiles supplement heights by exact OpenStreetMap record ID. Tile geometry is not used. Derived heights are not surveyed dimensions; coverage and source dates vary. The archive is published for data inspection, not a production cartography service.';
const LIMITS={range:2_000_000,bytes:8_000_000,inflated:8_000_000,requests:24,tiles:4,features:25_000,cacheEntries:12,ttl:24*60*60*1000};
const safeNumber=n=>Number.isFinite(n)&&n>0&&n<1000;
const fail=(code,message)=>Object.assign(new Error(message),{code});
const text=(value,max=200)=>typeof value==='string'?value.slice(0,max):undefined;
const asArrayBuffer=buffer=>buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength);

export function overtureTiles(origin,radiusMeters){
  if(!Array.isArray(origin)||origin.length!==2||origin.some(n=>!Number.isFinite(n))||Math.abs(origin[0])>180||Math.abs(origin[1])>85||!Number.isFinite(radiusMeters)||radiusMeters<1||radiusMeters>1200)throw fail('invalid-bounds','Height lookup bounds are invalid or outside supported Mercator latitude.');
  const z=14,n=2**z,dy=radiusMeters/111195,dx=dy/Math.cos(origin[1]*Math.PI/180);
  const bbox=[origin[0]-dx,origin[1]-dy,origin[0]+dx,origin[1]+dy];
  if(bbox[0]<-180||bbox[2]>180||bbox[1]<-85||bbox[3]>85)throw fail('invalid-bounds','Height lookup crosses the supported map boundary.');
  const tx=lng=>Math.floor((lng+180)/360*n),ty=lat=>Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n);
  const x0=tx(bbox[0]),x1=tx(bbox[2]),y0=ty(bbox[3]),y1=ty(bbox[1]);
  if((x1-x0+1)*(y1-y0+1)>LIMITS.tiles)throw fail('tile-limit','This area exceeds the bounded height lookup extent.');
  const tiles=[];for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)tiles.push({z,x,y});return tiles;
}

// Only property-specific height attribution establishes where the height came from.
// The tile's @height_source convenience field can disagree with this source list.
export function heightRecord(properties){
  if(!properties||!safeNumber(properties.height)||properties.is_underground===true||Number(properties.min_height)>0)return null;
  if(typeof properties.id!=='string'||properties.id.length>100)return null;
  let sources;try{sources=typeof properties.sources==='string'&&properties.sources.length<=32768?JSON.parse(properties.sources):Array.isArray(properties.sources)?properties.sources:null;}catch{return null;}
  if(!Array.isArray(sources)||sources.length>32)return null;
  const osm=sources.filter(s=>s?.dataset==='OpenStreetMap'&&['','/geometry'].includes(s.property??'')&&/^[wr]\d+@\d+$/.test(s.record_id??''));
  const ids=[...new Set(osm.map(s=>s.record_id.split('@')[0]))];if(ids.length!==1)return null;
  const heightSources=sources.filter(s=>s?.property==='/properties/height'&&typeof s.dataset==='string').map(s=>Object.fromEntries(['dataset','provider','property','resource','version','license'].map(k=>[k,text(s[k])]).filter(([,v])=>v!==undefined)));
  if(!heightSources.length)return null;
  return {osmId:ids[0].replace(/^w/,'way/').replace(/^r/,'relation/'),overtureId:properties.id,height:properties.height,heightSources,heightRelease:OVERTURE_RELEASE,heightSourceUrl:OVERTURE_ARCHIVE,osmRecordId:osm[0].record_id};
}

export function decodeHeightTile(data){
  if(data.byteLength>LIMITS.inflated)throw fail('decompression-limit','The decoded height tile exceeded its size limit.');
  const tile=new VectorTile(new PbfReader(new Uint8Array(data))),records=[];
  // Building-part height semantics and lifted volumes require a separate reviewed join.
  const layer=tile.layers.building;if(!layer)return records;
  if(layer.length>LIMITS.features)throw fail('feature-limit','The height tile contains too many features.');
  for(let i=0;i<layer.length;i++){const record=heightRecord(layer.feature(i).properties);if(record)records.push(record);}return records;
}

export async function boundedDecompress(data,compression){
  if(data.byteLength>LIMITS.range)throw fail('range-limit','A compressed height tile exceeded its range limit.');
  if(compression===1)return data;
  if(compression!==2)throw fail('compression-unsupported','The height archive uses an unsupported compression type.');
  try{return asArrayBuffer(gunzipSync(new Uint8Array(data),{maxOutputLength:LIMITS.inflated}));}catch(error){throw fail('decompression-failed',error.code==='ERR_BUFFER_TOO_LARGE'?'The height tile exceeded its decompression limit.':'The height tile could not be decompressed.');}
}

export function createOvertureRangeSource({fetchImpl=fetch,signal,budget={bytes:0,requests:0}}={}){
  return {getKey:()=>OVERTURE_ARCHIVE,async getBytes(offset,length,requestSignal,etag){
    if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(length)||length<1||length>LIMITS.range||!Number.isSafeInteger(offset+length))throw fail('range-limit','The height archive requested an invalid byte range.');
    if(++budget.requests>LIMITS.requests||budget.bytes+length>LIMITS.bytes)throw fail('transfer-limit','The height lookup reached its transfer limit.');
    const signals=[signal,requestSignal].filter(Boolean),activeSignal=signals.length?AbortSignal.any(signals):undefined;activeSignal?.throwIfAborted();
    const response=await fetchImpl(OVERTURE_ARCHIVE,{headers:{Range:`bytes=${offset}-${offset+length-1}`,'Accept-Encoding':'identity',...(etag?{'If-Match':etag}:{})},redirect:'error',signal:activeSignal});
    if(response.status!==206){await response.body?.cancel();throw fail('range-response',`The height archive returned HTTP ${response.status} instead of a byte range.`);}
    const contentRange=response.headers.get('content-range'),match=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange??'');
    if(!match||Number(match[1])!==offset||Number(match[2])!==offset+length-1||Number(match[3])<=offset+length-1){await response.body?.cancel();throw fail('range-response','The height archive returned an unexpected byte range.');}
    if(etag&&response.headers.get('etag')&&etag!==response.headers.get('etag')){await response.body?.cancel();throw fail('archive-changed','The height archive changed during the lookup.');}
    const reader=response.body?.getReader();if(!reader)throw fail('range-response','The height archive response had no body.');
    const chunks=[];let size=0;
    try{while(true){activeSignal?.throwIfAborted();const {done,value}=await reader.read();if(done)break;size+=value.byteLength;budget.bytes+=value.byteLength;if(size>length||budget.bytes>LIMITS.bytes)throw fail('transfer-limit','The height archive exceeded its requested byte range.');chunks.push(Buffer.from(value));}}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
    if(size!==length)throw fail('range-response','The height archive response was incomplete.');
    return {data:asArrayBuffer(Buffer.concat(chunks)),etag:response.headers.get('etag')??undefined};
  }};
}

export function createOvertureHeightReader({fetchImpl=fetch,now=Date.now,timeoutMs=12000}={}){
  const tileCache=new Map();
  return async function readOvertureHeights({origin,radiusMeters=300,buildingIds=[],signal}={}){
    const basis={release:OVERTURE_RELEASE,sourceUrl:OVERTURE_ARCHIVE,qualification:OVERTURE_QUALIFICATION,retrievedAt:new Date(now()).toISOString()};
    const deadline=new AbortController(),timer=setTimeout(()=>deadline.abort(fail('timeout','The supplemental height lookup exceeded 12 seconds.')),Math.min(12000,Math.max(1,timeoutMs)));timer.unref?.();
    const activeSignal=signal?AbortSignal.any([signal,deadline.signal]):deadline.signal,budget={bytes:0,requests:0};
    try{
      signal?.throwIfAborted();const tiles=overtureTiles(origin,radiusMeters);
      if(!Array.isArray(buildingIds)||buildingIds.length>800||buildingIds.some(id=>!/^way\/\d+$|^relation\/\d+$/.test(id)))throw fail('invalid-identifiers','Height lookup building identifiers are invalid.');
      const wanted=new Set(buildingIds);if(!wanted.size)return {...basis,status:'not-needed',records:[],transferBytes:0};
      const source=createOvertureRangeSource({fetchImpl,signal:activeSignal,budget}),archive=new PMTiles(source,new ResolvedValueCache(16,false,boundedDecompress),boundedDecompress),records=[];
      for(const {z,x,y}of tiles){
        activeSignal.throwIfAborted();const key=`${z}/${x}/${y}`,cached=tileCache.get(key);let found=cached?.expires>now()?cached.records:null;
        if(!found){const header=await archive.getHeader();if(header.specVersion!==3||header.tileType!==1||header.maxZoom<14)throw fail('archive-format','The height archive format or detail level changed.');const tile=await archive.getZxy(z,x,y,activeSignal);found=tile?decodeHeightTile(tile.data):[];tileCache.delete(key);tileCache.set(key,{expires:now()+LIMITS.ttl,records:found});while(tileCache.size>LIMITS.cacheEntries)tileCache.delete(tileCache.keys().next().value);}
        records.push(...found.filter(r=>wanted.has(r.osmId)));
      }
      const unique=new Map(),conflicts=new Set();for(const record of records){const previous=unique.get(record.osmId);if(previous&&(previous.overtureId!==record.overtureId||previous.height!==record.height)){conflicts.add(record.osmId);continue;}unique.set(record.osmId,record);}for(const id of conflicts)unique.delete(id);
      return {...basis,status:conflicts.size?'partial':'ready',records:[...unique.values()],conflictingIds:[...conflicts],transferBytes:budget.bytes,tileCount:tiles.length};
    }catch(error){signal?.throwIfAborted();return {...basis,status:'unavailable',records:[],transferBytes:budget.bytes,failure:{code:deadline.signal.aborted?'timeout':error.code??'height-source-unavailable',message:deadline.signal.aborted?'The supplemental height lookup timed out.':String(error.message??'Supplemental heights could not be read.').slice(0,200)}};}finally{clearTimeout(timer);}
  };
}
export const readOvertureHeights=createOvertureHeightReader();

/** Heights only: source footprints, existing measured heights and geometryVersion survive unchanged. */
export function applyHeightEnrichment(context,enrichment){
  const records=new Map(),conflicts=new Set();
  for(const r of enrichment.records??[]){if(!r||!safeNumber(r.height)||r.heightRelease!==OVERTURE_RELEASE||r.heightSourceUrl!==OVERTURE_ARCHIVE||!Array.isArray(r.heightSources)||!r.heightSources.length||r.heightSources.some(s=>s?.property!=='/properties/height'||typeof s.dataset!=='string'))continue;const existing=records.get(r.osmId);if(existing&&(existing.height!==r.height||existing.overtureId!==r.overtureId))conflicts.add(r.osmId);records.set(r.osmId,r);}
  let added=0;const buildings=context.buildings.map(b=>{const record=records.get(b.id);if(!record||conflicts.has(b.id)||b.buildingPart||safeNumber(b.heightMeters)||Number.isFinite(b.minHeightMeters)&&b.minHeightMeters>=record.height)return b;added++;return {...b,osmHeightMeters:b.heightMeters??null,heightMeters:record.height,heightBasis:'overture',heightSources:record.heightSources,heightRelease:record.heightRelease,heightSourceUrl:record.heightSourceUrl,overtureId:record.overtureId,heightOsmRecordId:record.osmRecordId};});
  const {records:_records,...status}=enrichment;
  const datasets=[...new Set(buildings.filter(b=>b.heightBasis==='overture').flatMap(b=>(b.heightSources??[]).map(s=>s.dataset)))];
  return {...context,buildings,heightEnrichment:{...status,addedHeights:added,unmatchedBuildings:buildings.filter(b=>!safeNumber(b.heightMeters)).length,attribution:datasets.length?`Supplemental heights: Overture Maps Foundation; ${datasets.join('; ')}.`:null}};
}
