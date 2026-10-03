import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlaceSearchReader,placeSearchUrl,searchMappedPlaces} from '../scripts/place-search.mjs';
import {destinationSearch} from '../scripts/place-query.mjs';
import {readNearbyPlaces} from '../scripts/place-routes.mjs';
const search=destinationSearch({kind:'library',filters:[{tags:[{key:'amenity',value:'library'}]}]});
const origin=[-95.36459,29.73728],points=[{lng:-95.365,lat:29.737},{lng:-95.364,lat:29.737},{lng:-95.364,lat:29.738},{lng:-95.365,lat:29.738}];
const library={osm_type:'way',osm_id:123,lat:'29.738',lon:'-95.365',category:'amenity',type:'library',name:'Mapped Library'};
test('place index uses bounded coarse window and independently verifies OSM identity, category and name',async()=>{
 const url=new URL(placeSearchUrl(search,origin,2000));assert.equal(url.searchParams.get('q'),'[library]');assert.equal(url.searchParams.get('bounded'),'1');assert.equal(url.searchParams.get('limit'),'10');assert(!url.href.includes('95.36459'));
 const read=async()=>({data:[library,{...library,osm_id:124,category:'highway',type:'path'},{...library,osm_type:'synthetic'},{...library,lat:'invalid'}],hash:'fixture'});
 const result=await searchMappedPlaces(search,origin,2000,{read});assert.equal(result.features.length,1);assert.equal(result.features[0].id,'way/123');
 const named=destinationSearch({kind:'library',name_query:'Different',filters:search.filters});assert.equal((await searchMappedPlaces(named,origin,2000,{read})).features.length,0);
 assert.throws(()=>placeSearchUrl(search,origin,2000,'disabled'),/disabled/);
});
test('shared place search queue enforces spacing, coalesces duplicates and isolates cached objects',async()=>{
 let clock=1000,calls=0;const starts=[];const read=createPlaceSearchReader({now:()=>clock,wait:async ms=>{clock+=ms;},read:async url=>{calls++;starts.push(clock);return {data:[{url}]};}});
 const [a,b]=await Promise.all([read('https://example.org/a'),read('https://example.org/a'),read('https://example.org/b')]);assert.equal(calls,2);assert(starts[1]-starts[0]>=1000);a.data[0].url='changed';assert.notEqual(b.data[0].url,'changed');assert.notEqual((await read('https://example.org/a')).data[0].url,'changed');assert.equal(calls,2);
});
test('failed Overpass recovers real candidates, retains source receipts and avoids another doomed road lookup',async()=>{
 let upstream=0,indexCalls=0;const read=async()=>{upstream++;throw new Error('Source returned 504');};
 const searchIndex=async()=>{indexCalls++;return {features:[{id:'way/123',properties:{tags:{amenity:'library',name:'Mapped Library'}},geometry:{type:'Point',coordinates:origin}}],sourceUrl:'https://nominatim.openstreetmap.org/search?q=library',provider:'Nominatim / OpenStreetMap',returnedMatches:1,qualification:'Ranked matches, not complete inventory.',hash:'index'};};
 const route=async(start,end)=>({distanceMeters:220,durationSeconds:150,geometry:{type:'LineString',coordinates:[start,end]}});
 const args={kind:'library',filters:search.filters,read,searchIndex,route};const a=await readNearbyPlaces(points,args),b=await readNearbyPlaces(points,args);
 assert.equal(a.distanceMeters,220);assert.equal(a.coverage.recovery.provider,'Nominatim / OpenStreetMap');assert(a.sourceUrl.includes('nominatim'));assert.equal(a.route.streetContextStatus,'unavailable');assert.equal(a.status,'partial');assert.match(a.detail,/Ranked matches/);assert.equal(upstream,1);assert.equal(indexCalls,2);assert.equal(b.distanceMeters,220);
 const failed=await readNearbyPlaces(points,{...args,route:async()=>{throw new Error('Disconnected');}});assert.equal(failed.distanceMeters,null);assert.equal(failed.route,null);
});
