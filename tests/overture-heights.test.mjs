import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {PbfWriter} from 'pbf';
import {zxyToTileId} from 'pmtiles';
import {OVERTURE_ARCHIVE,OVERTURE_RELEASE,overtureTiles,heightRecord,decodeHeightTile,boundedDecompress,createOvertureRangeSource,createOvertureHeightReader,applyHeightEnrichment} from '../scripts/overture-heights.mjs';

const origin=[-95.36483435,29.73735165];
const sourceProps=(height=9,id='overture-1',osm='w1@3')=>({id,height,sources:JSON.stringify([{dataset:'OpenStreetMap',property:'',record_id:osm},{dataset:'USGS Lidar',provider:'usgs',resource:'lidar',property:'/properties/height'}]),'@height_source':'OpenStreetMap'});
function tileFor(properties){
  const pbf=new PbfWriter();pbf.writeMessage(3,(_,layer)=>{
    layer.writeStringField(1,'building');layer.writeVarintField(15,2);layer.writeVarintField(5,4096);
    const keys=[...new Set(properties.flatMap(p=>Object.keys(p)))],values=[];
    for(const key of keys)layer.writeStringField(3,key);
    for(const props of properties){const tags=[];for(const [key,value]of Object.entries(props)){tags.push(keys.indexOf(key),values.length);values.push(value);}layer.writeMessage(2,(_,feature)=>{feature.writePackedVarint(2,tags);feature.writeVarintField(3,3);},null);}
    for(const value of values)layer.writeMessage(4,(value,p)=>{if(typeof value==='number')p.writeDoubleField(3,value);else if(typeof value==='boolean')p.writeBooleanField(7,value);else p.writeStringField(1,value);},value);
  },null);return pbf.finish();
}
function archiveFor(properties){
  const tile=gzipSync(tileFor(properties)),coord=overtureTiles(origin,300)[0],v=new PbfWriter();for(const n of [1,zxyToTileId(coord.z,coord.x,coord.y),1,tile.length,1])v.writeVarint(n);
  const root=gzipSync(v.finish()),header=Buffer.alloc(16384);header.write('PMTiles');header[7]=3;header.writeBigUInt64LE(127n,8);header.writeBigUInt64LE(BigInt(root.length),16);header.writeBigUInt64LE(16384n,56);header.writeBigUInt64LE(BigInt(tile.length),64);header[97]=2;header[98]=2;header[99]=1;header[100]=14;header[101]=14;root.copy(header,127);return Buffer.concat([header,tile]);
}
function rangeFetch(archive){let calls=0;const fetchImpl=async(url,options)=>{calls++;assert.equal(url,OVERTURE_ARCHIVE);assert.equal(options.redirect,'error');const [,start,end]=/^bytes=(\d+)-(\d+)$/.exec(options.headers.Range).map(Number);return new Response(archive.subarray(start,end+1),{status:206,headers:{'content-range':`bytes ${start}-${end}/${archive.length}`,etag:'"fixture"'}});};return {fetchImpl,calls:()=>calls};}

test('height provenance comes from the height property, with exact geometry record IDs',()=>{
  const r=heightRecord(sourceProps());assert.equal(r.osmId,'way/1');assert.equal(r.heightSources[0].dataset,'USGS Lidar');assert.equal(r.heightRelease,OVERTURE_RELEASE);
  const missing=sourceProps();missing.sources=JSON.stringify([{dataset:'OpenStreetMap',record_id:'w1@3',property:''}]);assert.equal(heightRecord(missing),null);
  const ambiguous=sourceProps();ambiguous.sources=JSON.stringify([...JSON.parse(ambiguous.sources),{dataset:'OpenStreetMap',record_id:'w2@1',property:'/geometry'}]);assert.equal(heightRecord(ambiguous),null);
  assert.equal(heightRecord({...sourceProps(),height:Infinity}),null);assert.equal(heightRecord({...sourceProps(),min_height:4}),null);assert.equal(heightRecord({...sourceProps(),sources:'{bad'}),null);
});
test('standard PMTiles and protobuf readers return exact-ID heights and reuse cached tiles',async()=>{
  const fake=rangeFetch(archiveFor([sourceProps(),sourceProps(30,'different','w2@2')])),read=createOvertureHeightReader({fetchImpl:fake.fetchImpl});
  const result=await read({origin,buildingIds:['way/1']});assert.equal(result.status,'ready');assert.equal(result.records.length,1);assert.equal(result.records[0].height,9);assert.match(result.qualification,/inspection/);assert.ok(result.transferBytes>0);
  const calls=fake.calls(),cached=await read({origin,buildingIds:['way/1']});assert.equal(fake.calls(),calls);assert.equal(cached.transferBytes,0);assert.deepEqual(cached.records,result.records);
  const mismatch=await read({origin,buildingIds:['way/999']});assert.deepEqual(mismatch.records,[]);
});
test('conflicting height matches stay unresolved instead of selecting an arbitrary building',async()=>{
  const fake=rangeFetch(archiveFor([sourceProps(),sourceProps(30,'different','w1@3')])),read=createOvertureHeightReader({fetchImpl:fake.fetchImpl});
  const result=await read({origin,buildingIds:['way/1']});assert.equal(result.status,'partial');assert.deepEqual(result.records,[]);assert.deepEqual(result.conflictingIds,['way/1']);
});
test('bounded extent, range validation and decompression failures preserve precise failure states',async()=>{
  assert.throws(()=>overtureTiles([0,89],300),/bounds/);assert.throws(()=>overtureTiles([0,80],1200),/extent/);
  let called=false;const read=createOvertureHeightReader({fetchImpl:async()=>{called=true;return new Response('whole archive');}});
  const bounds=await read({origin:[0,89],buildingIds:['way/1']});assert.equal(bounds.status,'unavailable');assert.equal(bounds.failure.code,'invalid-bounds');assert.equal(called,false);
  const failed=await read({origin,buildingIds:['way/1']});assert.equal(failed.failure.code,'range-response');assert.deepEqual(failed.records,[]);
  const badSource=createOvertureRangeSource({fetchImpl:async()=>new Response(new Uint8Array(10),{status:206,headers:{'content-range':'bytes 0-8/100'}})});await assert.rejects(badSource.getBytes(0,10),/unexpected byte range/);
  await assert.rejects(badSource.getBytes(0,2000001),/invalid byte range/);
  await assert.rejects(boundedDecompress(gzipSync(Buffer.alloc(8000001)),2),/decompression limit/);
  assert.throws(()=>decodeHeightTile(new Uint8Array(8000001)),/size limit/);
});
test('height timeout returns a visible enrichment failure; caller abort remains an abort',async()=>{
  const fetchImpl=(_url,{signal})=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>resolve(new Response('late')),100);signal.addEventListener('abort',()=>{clearTimeout(timer);reject(signal.reason);},{once:true});});
  const read=createOvertureHeightReader({fetchImpl,timeoutMs:5}),result=await read({origin,buildingIds:['way/1']});assert.equal(result.failure.code,'timeout');assert.equal(result.status,'unavailable');
  const abort=new AbortController();abort.abort(new Error('user-cancelled'));await assert.rejects(read({origin,buildingIds:['way/1'],signal:abort.signal}),/user-cancelled/);
});
test('height enrichment preserves geometry, recorded heights, unmatched buildings and legal collision identity',()=>{
  const geometry=[[[[0,0],[1,0],[1,1],[0,0]]]],context={geometryVersion:'unchanged',buildings:[{id:'way/1',geometry,heightMeters:null,heightBasis:'unknown'},{id:'way/2',geometry,heightMeters:15,heightBasis:'mapped'},{id:'way/3',geometry,heightMeters:null,heightBasis:'unknown'}]};
  const records=[heightRecord(sourceProps()),heightRecord(sourceProps(50,'two','w2@1'))],next=applyHeightEnrichment(context,{status:'ready',records});
  assert.equal(next.buildings[0].heightMeters,9);assert.equal(next.buildings[0].heightBasis,'overture');assert.equal(next.buildings[0].osmHeightMeters,null);assert.equal(next.buildings[0].geometry,geometry);assert.equal(next.buildings[1].heightMeters,15);assert.equal(next.buildings[2].heightMeters,null);assert.equal(next.geometryVersion,'unchanged');assert.equal(context.buildings[0].heightMeters,null);
  assert.equal(next.heightEnrichment.addedHeights,1);assert.equal(next.heightEnrichment.unmatchedBuildings,1);
  const failed=applyHeightEnrichment(context,{status:'unavailable',records:[],failure:{code:'timeout'}});assert.deepEqual(failed.buildings,context.buildings);assert.equal(failed.heightEnrichment.failure.code,'timeout');
});
