import test from 'node:test';
import assert from 'node:assert/strict';
import {readNearbyPlaces,parseRoute,streetRoute} from '../scripts/place-routes.mjs';
import {parseReview} from '../scripts/gloo.mjs';
import {regulatoryPath,explicitNoZoning} from '../scripts/regulatory-path.mjs';
import {jurisdictionFromGeographies} from '../scripts/jurisdiction.mjs';
import {streetWidth,streetTriangles} from '../street-geometry.js';
import {currentRouteAnswer,priorityValue} from '../spatial-experience.js';

const points=[{lat:30,lng:-95},{lat:30,lng:-94.9999},{lat:30.0001,lng:-94.9999},{lat:30.0001,lng:-95}];
const places={elements:[{type:'node',id:1,lat:30.001,lon:-95,tags:{amenity:'police',name:'Geographically closer'}},{type:'node',id:2,lat:30.002,lon:-95,tags:{amenity:'police',name:'Shorter street journey'}}]};
const read=async url=>({data:Buffer.from(JSON.stringify(url.includes('way%5B')?{elements:[]}:places)),url,hash:'fixture',retrievedAt:'2026-09-29'});
test('proximity selects routed distance, retains travel mode and does not report geographic ranking as nearest',async()=>{
 const r=await readNearbyPlaces(points,{kind:'police',mode:'walking',read,route:async(origin,destination)=>({distanceMeters:destination[1]===30.001?500:300,durationSeconds:220,mode:'walking',geometry:{type:'LineString',coordinates:[origin,[-95.001,30.001],destination]}})});
 assert.equal(r.feature.id,'node/2');assert.equal(r.distanceMeters,300);assert.equal(r.distanceType,'street-route');assert.equal(r.coverage.candidatesRouted,2);assert.match(r.detail,/not police response time/);assert.match(r.detail,/Other places may be missing/);
});
test('routing failure never becomes a direct-line measurement, and places with failed routes remain in coverage',async()=>{
 const r=await readNearbyPlaces(points,{kind:'police',read,route:async()=>{throw new Error('Route disconnected');}});
 assert.equal(r.status,'unresolved');assert.equal(r.distanceMeters,null);assert.equal(r.route,null);assert.equal(r.coverage.failures.length,2);assert.match(r.detail,/No direct-line distance/);
 await assert.rejects(readNearbyPlaces(points,{kind:'invented',read}));
});
test('candidate cap is explicit and does not invent comprehensive nearest coverage',async()=>{
 const data={elements:Array.from({length:6},(_,i)=>({...places.elements[0],id:i+1,lat:30.0002+i*.0001}))};
 let calls=0;const r=await readNearbyPlaces(points,{kind:'police',read:async()=>({data,hash:'many'}),route:async(origin,destination)=>{calls++;return {distanceMeters:200+calls,durationSeconds:150,geometry:{type:'LineString',coordinates:[origin,destination]}};}});
 assert.equal(calls,3);assert.equal(r.status,'partial');assert.equal(r.coverage.completeInventory,false);assert.equal(r.coverage.candidatesFound,6);
});
test('route parser accepts a real bend and rejects shortcuts, distant snapping and malformed geometry',()=>{
 const origin=[-95,30],corner=[-94.999,30],destination=[-94.999,30.001];
 const data={code:'Ok',routes:[{distance:207.5,duration:150,geometry:{type:'LineString',coordinates:[origin,corner,destination]}}]};
 const r=parseRoute(data,{origin,destination,mode:'walking'});assert.equal(r.geometry.coordinates.length,3);assert.equal(r.distanceMeters,208);
 assert.throws(()=>parseRoute({...data,routes:[{...data.routes[0],distance:1200}]},{origin,destination,mode:'walking'}),/disagree/);
 assert.throws(()=>parseRoute(data,{origin:[-96,30],destination,mode:'walking'}),/too far/);
 assert.throws(()=>parseRoute({...data,code:'NoRoute'},{origin,destination,mode:'walking'}));
});
test('cached binary responses parse correctly and costing follows selected travel mode',async()=>{
 const origin=[-95,30],destination=[-94.999,30.001],data={code:'Ok',routes:[{distance:207.5,duration:150,geometry:{type:'LineString',coordinates:[origin,[-94.999,30],destination]}}]};
 for(const [mode,costing]of [['walking','pedestrian'],['driving','auto'],['cycling','bicycle']]){
  const r=await streetRoute(origin,destination,{mode,read:async url=>{assert.equal(JSON.parse(new URL(url).searchParams.get('json')).costing,costing);return {data:structuredClone(Buffer.from(JSON.stringify(data))),url};}});assert.equal(r.mode,mode);
 }
});
test('roads retain useful width hierarchy and bends rather than depending on one-pixel GL lines',()=>{
 assert(streetWidth({kind:'primary'}).metres>streetWidth({kind:'residential'}).metres);assert(streetWidth({kind:'residential'}).metres>streetWidth({kind:'footway'}).metres);
 assert.deepEqual(streetWidth({kind:'residential',widthMeters:9}),{metres:9,basis:'mapped-width'});
 assert.equal(streetWidth({lanes:2}).basis,'lane-estimate');const t=streetTriangles([[0,0],[10,0],[10,10]],6);assert(t.length>36);assert(t.every(Number.isFinite));assert(t.some(n=>n===-3));
});
test('saved direct-line answers are retired in the UI without generating network calls',()=>{
 const old={distanceType:'straight-line',distanceMeters:509,status:'answered',feature:{name:'School'}};const next=currentRouteAnswer(old);
 assert.equal(next.distanceMeters,null);assert.equal(next.route,null);assert.equal(next.status,'unresolved');assert.equal(old.distanceMeters,509);assert.equal(priorityValue({answer:old},{result:{},scenario:null}),'Not confirmed');
});

const guidance={id:'planning',kind:'planning-guidance',title:'Development regulations',text:'Example city does not have zoning. Development is governed by subdivision and site-plan regulations.'};
const development={id:'code',kind:'code-provision',title:'Multi-unit residential performance standards',text:'Multi-unit residential development shall comply with the following performance standards. A development plat is required before new construction.'};
const support=sources=>sources.map(s=>({sourceId:s.id,quote:s.text}));
function review(sources){return {output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({housingRoute:'supported',assessment:{headline:'Housing can be explored through development review',summary:'The applicable development path still requires site-specific checks.',support:support(sources)},findings:[{heading:'A development path is documented',summary:'Site restrictions remain to be checked.',support:support(sources)}],obstacles:[{heading:'Recorded restrictions',consequence:'Their effect has not been established.',nextStep:'Review the recorded plat and restrictions.',support:support(sources)}]})}]}]};}
test('no-zoning requires confirmed system evidence plus cited operative development controls',()=>{
 const sources=[guidance,development],e={planningSystem:{type:'no-zoning',sources:[guidance]},locality:{city:'Example'}};
 assert.equal(parseReview(review(sources),sources,e).housingBasis,'development-review');
 assert.throws(()=>parseReview(review([guidance]),[guidance],e),/unsupported/);
 assert.throws(()=>parseReview(review(sources),sources,{planningSystem:{type:'no-zoning'}}),/unsupported/);
 for(const title of ['Definitions','Purpose','Conversion rules']){const d={...development,title};assert.throws(()=>parseReview(review([guidance,d]),[guidance,d],e),/unsupported/);}
});
test('zoned and unknown jurisdictions do not inherit the no-zoning pathway; county evidence cannot authorize a municipality',()=>{
 const generic={...development,title:'Development plat',text:'No new building shall be constructed before the development plat has been approved.'};const sources=[guidance,generic];
 assert.throws(()=>parseReview(review(sources),sources,{planningSystem:{type:'unresolved'}}),/unsupported/);
 const foreign={...development,scope:'county'};assert.throws(()=>parseReview(review([guidance,foreign]),[guidance,foreign],{planningSystem:{type:'no-zoning',sources:[guidance]}}),/unsupported/);
 const prohibition={...development,title:'Residential uses',text:'Residential housing is prohibited in this district and shall not be permitted.'};assert.throws(()=>parseReview(review([prohibition]),[prohibition]),/unsupported/);
});
test('authority selection is location-driven across all states and different government patterns',()=>{
 const states='AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
 for(const state of states)for(const type of ['city','township','county']){
  const g={States:[{NAME:state,STUSAB:state,STATE:state}],Counties:[{NAME:'Example County',BASENAME:'Example',GEOID:state+'001',FUNCSTAT:'A'}]};
  if(type==='city')g['Incorporated Places']=[{NAME:'Selected city',BASENAME:'Selected',GEOID:state+'1'}];
  if(type==='township')g['County Subdivisions']=[{NAME:'Selected township',BASENAME:'Selected',GEOID:state+'2',FUNCSTAT:'A'}];
  const locality=jurisdictionFromGeographies(g),path=regulatoryPath({locality});assert.equal(path.stateAbbr,state);assert.equal(path.authority.type,{city:'municipality',township:'county-subdivision',county:'county'}[type]);assert.equal(path.system,'planning-system-unresolved');
 }
 assert.equal(regulatoryPath({locality:{boundaryUncertain:true},planningSystem:{type:'no-zoning'}}).system,'authority-unresolved');
});
test('no-zoning detection requires an explicit statement naming the selected authority',()=>{
 const city={city:'Houston',authority:{name:'Houston city',base:'Houston',type:'municipality'}};
 assert(explicitNoZoning('Houston does not have a zoning ordinance.',city));
 assert.equal(explicitNoZoning('A zoning record was not found for Houston.',city),null);
 assert.equal(explicitNoZoning('Example County has no zoning ordinance.',city),null);
 assert(explicitNoZoning('Example County has not adopted countywide zoning.',{authority:{name:'Example County',type:'county'},countyBase:'Example'}));
 assert.equal(explicitNoZoning('Houston has zoning.',city),null);
});


test('a subdivision waiver mentioning residential use cannot establish a housing development path',()=>{
 const waiver={id:'waiver',kind:'code-provision',title:'Exceptions to subdivision platting requirements',text:'A subdivision plat shall not be required for a subdivision of a reserve tract that is part of a subdivision plat approved by the commission if the reserve tract is not encumbered and will not be used for single-family residential purposes.'};
 const e={planningSystem:{type:'no-zoning',sources:[guidance]},locality:{city:'Example'}};
 assert.throws(()=>parseReview(review([guidance,waiver]),[guidance,waiver],e),/Housing-use allowance unsupported/);
 const operative={id:'operative',kind:'code-provision',title:'Development plat required',text:'Development of property through the new construction of any building within the city shall require a development plat, except that the following types of development shall be exempt from this requirement.'};
 assert.equal(parseReview(review([guidance,operative]),[guidance,operative],e).housingBasis,'development-review');
});
