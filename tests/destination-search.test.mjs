import test from 'node:test';
import assert from 'node:assert/strict';
import {destinationSearch,placeQuery,matchesDestination} from '../scripts/place-query.mjs';
import {readNearbyPlaces} from '../scripts/place-routes.mjs';
import {createResearchSession,validateToolArguments} from '../scripts/agent-tools.mjs';
const points=[{lat:30,lng:-95},{lat:30,lng:-94.9999},{lat:30.0001,lng:-94.9999},{lat:30.0001,lng:-95}];
test('a generic category cannot acquire an invented literal destination name',()=>{
 const args={kind:'library',filters:[{tags:[{key:'amenity',value:'library'}]}],mode:'walking',radius_meters:2000,original_excerpt:'How far is the nearest library on foot?'};
 assert.throws(()=>validateToolArguments('read_nearby_places',{...args,name_query:'Public library'}),/omit name_query/);
 assert.doesNotThrow(()=>validateToolArguments('read_nearby_places',args));
 assert.doesNotThrow(()=>validateToolArguments('read_nearby_places',{...args,name_query:''}));
 assert.equal(destinationSearch({...args,name_query:''}).name_query,null);
 assert.throws(()=>validateToolArguments('read_nearby_places',{...args,name_query:'library'}),/repeats the destination category/);
 assert.throws(()=>validateToolArguments('read_nearby_places',{...args,filters:[{tags:[{key:'name',value:'Central Library'}]}]}),/literal destination name/);
 assert.doesNotThrow(()=>validateToolArguments('read_nearby_places',{...args,original_excerpt:'How far is Emancipation Park on foot?',kind:'park',filters:[{tags:[{key:'leisure',value:'park'}]}],name_query:'Emancipation Park'}));
});
test('Gloo can choose categories outside presets and conjunctions, with literal query compilation',()=>{
 const search=destinationSearch({kind:'food assistance',filters:[{tags:[{key:'amenity',value:'social_facility'},{key:'social_facility',value:'food_bank'}]},{tags:[{key:'shop',value:'charity'}]}]});
 assert(matchesDestination({amenity:'social_facility',social_facility:'food_bank'},search));
 assert(!matchesDestination({amenity:'social_facility'},search));
 assert(matchesDestination({shop:'charity'},search));
 const named=destinationSearch({kind:'named clinic',name_query:'A+B (West)'});
 const query=placeQuery(named,[-95,30],5000);
 assert(query.includes(JSON.stringify('A\\+B \\(West\\)')));
 assert(matchesDestination({brand:'A+B (West) Health'},named));assert(!matchesDestination({name:'AB West'},named));
 assert.throws(()=>destinationSearch({kind:'park',filters:[{tags:[{key:'x];out;',value:'park'}]}]}));
 assert.throws(()=>validateToolArguments('read_nearby_places',{kind:'park',filters:[{tags:[{key:'leisure',value:7}]}],mode:'walking',radius_meters:2000,original_excerpt:'Nearby park'}));
});
test('arbitrary category and named place retain routes and reject unrelated search returns',async()=>{
 const data={elements:[{type:'node',id:1,lat:30.001,lon:-95,tags:{amenity:'library',name:'Central Library'}},{type:'node',id:2,lat:30.0002,lon:-95,tags:{amenity:'police',name:'Central Police'}}]};
 const r=await readNearbyPlaces(points,{kind:'library',filters:[{tags:[{key:'amenity',value:'library'}]}],name_query:'Central',read:async()=>({data,hash:'fixture'}),route:async(origin,destination)=>({distanceMeters:220,durationSeconds:160,geometry:{type:'LineString',coordinates:[origin,destination]}})});
 assert.equal(r.feature.id,'node/1');assert.equal(r.coverage.candidatesFound,1);assert.equal(r.distanceMeters,220);assert.equal(r.search.name_query,'Central');
 const absent=await readNearbyPlaces(points,{kind:'library',name_query:'Absent',read:async()=>({data})});assert.equal(absent.distanceMeters,null);assert.equal(absent.status,'unresolved');
});
test('same kind with different names has distinct cache identities and bound question receipts',async()=>{
 let requests=0;const input={points,priorities:{purpose:'Affordable housing',matters:'Near Alpha and Beta libraries',choices:[]}};
 const session=createResearchSession(input,{webRead:async()=>{requests++;return {data:{elements:[]}};}});
 const args={kind:'library',mode:'walking',radius_meters:2000,original_excerpt:input.priorities.matters};
 const a=await session.execute('read_nearby_places',{...args,name_query:'Alpha'}),b=await session.execute('read_nearby_places',{...args,name_query:'Beta'});
 assert.notEqual(a.measurement.id,b.measurement.id);assert.equal(requests,2);
 await session.execute('read_nearby_places',{...args,name_query:'Alpha'});assert.equal(requests,2);assert.equal(a.measurement.originalExcerpt,input.priorities.matters);
});
