import test from 'node:test';
import assert from 'node:assert/strict';
import {parseContext,readSiteContext,readNearbySchools,mappedHeight,straightLineMeters} from '../scripts/site-context.mjs';
import {createResearchSession} from '../scripts/agent-tools.mjs';
import {calculateConcept} from '../scripts/scenario-geometry.mjs';
import {createScenarioAgent} from '../scripts/scenario-agent.mjs';
import {multiArea,overlapArea} from '../scripts/site-geometry.mjs';
import {digest} from '../scripts/evidence-client.mjs';
import {heightRecord} from '../scripts/overture-heights.mjs';

const origin=[-95,30],mx=111195*Math.cos(Math.PI/6);
const geo=([x,y])=>[origin[0]+x/mx,origin[1]+y/111195];
const ring=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]].map(geo);
const rect=(x,y,w,h)=>[[ring(x,y,w,h)]];
const points=ring(-20,-20,40,40).slice(0,-1).map(([lng,lat])=>({lng,lat}));
const way=(id,coords,tags)=>({type:'way',id,tags,nodes:coords.map((_,i)=>id*100+(i===coords.length-1?0:i)),geometry:coords.map(([lon,lat])=>({lon,lat}))});
const data={elements:[way(1,ring(0,0,25,25),{building:'yes',height:'12'}),way(2,ring(2,2,10,10),{'building:part':'yes',height:'18',min_height:'3'}),way(3,ring(35,0,15,15),{building:'yes','building:levels':'4'}),way(4,[geo([-30,-30]),geo([60,-30])],{highway:'residential',name:'Example Street'})]};
const metadata={origin,radius:300,response:{hash:'fixture',retrievedAt:'2026-09-28T00:00:00Z'},sourceUrl:'https://overpass-api.de/api/interpreter?data=fixture'};
const fakeRead=value=>async url=>({data:Buffer.from(JSON.stringify(value)),hash:digest(value),retrievedAt:'2026-09-28T00:00:00Z',url});
const params={width:6,depth:9,storeys:2,storey_height:3,spacing:3,edge_clearance:3,angle:0,homes:12,parking_spaces:4};
const evidence=()=>({caseId:'b'.repeat(20),status:'preliminary',locality:{label:'Fixture'},parcel:{geometry:rect(0,0,80,70),id:'fixture'},selectedArea:{geometry:rect(0,0,80,70)},sources:[]});

test('mapped geometry preserves building parts; levels never become invented metre heights',()=>{
  const c=parseContext(data,metadata);assert.equal(c.buildings.length,3);assert.equal(c.roads.length,1);
  const parent=c.buildings.find(b=>b.id==='way/1'),part=c.buildings.find(b=>b.id==='way/2');
  assert.deepEqual(parent.partIds,['way/2']);assert.equal(parent.partsCoverageComplete,false);assert.ok(Math.abs(parent.partCoverage-.16)<.001);
  assert.equal('isOutlineWithParts'in parent,false);assert.equal(parent.heightMeters,12);assert.deepEqual(parent.geometry,rect(0,0,25,25));
  assert.equal(part.parentId,parent.id);assert.equal(part.parentAssociation.basis,'footprint-containment');
  assert.equal(c.buildings.find(b=>b.id==='way/2').minHeightMeters,3);
  assert.equal(c.buildings.find(b=>b.id==='way/3').heightMeters,null);assert.equal(c.buildings.find(b=>b.id==='way/3').heightBasis,'levels');
  assert.equal(mappedHeight('30 FT'),9.144);assert.equal(mappedHeight('about 30'),null);assert.equal(c.coverage.complete,false);
});
test('part coverage uses the union, retains partial parent footprints and recognizes full coverage without erasure',()=>{
  const parent=way(10,ring(0,0,20,20),{building:'yes',height:'12'}),left=way(11,ring(0,0,10,20),{'building:part':'yes',height:'10'}),overlap=way(12,ring(0,0,10,20),{'building:part':'yes',height:'8'}),right=way(13,ring(10,0,10,20),{'building:part':'yes',height:'16'});
  const partial=parseContext({elements:[parent,left,overlap]},metadata).buildings.find(b=>b.id==='way/10');
  assert.ok(Math.abs(partial.partCoverage-.5)<.001);assert.equal(partial.partsCoverageComplete,false);assert.deepEqual(partial.geometry,rect(0,0,20,20));
  const full=parseContext({elements:[parent,left,right]},metadata).buildings.find(b=>b.id==='way/10');
  assert.ok(Math.abs(full.partCoverage-1)<.001);assert.equal(full.partsCoverageComplete,true);assert.equal(full.heightMeters,12);assert.deepEqual(full.geometry,partial.geometry);
  assert.equal('isOutlineWithParts'in full,false);
});
test('mapped building relationships take precedence over geometric inference and retain provenance',()=>{
  const large=way(20,ring(0,0,40,40),{building:'yes',height:'12'}),small=way(21,ring(0,0,20,20),{building:'yes',height:'9'}),part=way(22,ring(2,2,8,8),{'building:part':'yes',height:'15'});
  const relation={type:'relation',id:30,tags:{type:'building'},members:[{type:'way',ref:20,role:'outline'},{type:'way',ref:22,role:'part'}]};
  const geometric=parseContext({elements:[large,small,part]},metadata).buildings.find(b=>b.id==='way/22');assert.equal(geometric.parentId,'way/21');
  const mapped=parseContext({elements:[large,small,part,relation]},metadata).buildings.find(b=>b.id==='way/22');
  assert.equal(mapped.parentId,'way/20');assert.equal(mapped.parentAssociation.basis,'mapped-relation');assert.equal(mapped.parentAssociation.sourceUrl,'https://www.openstreetmap.org/relation/30');
});
test('height and relationship updates change render identity without invalidating footprint collision identity',()=>{
  const before=parseContext(data,metadata),changed=structuredClone(data);changed.elements[0].tags.height='36';
  const after=parseContext(changed,metadata);assert.equal(before.geometryVersion,after.geometryVersion);assert.notEqual(before.renderVersion,after.renderVersion);
  changed.elements[1].tags['building:part']='no';changed.elements[1].tags.building='yes';
  const unassociated=parseContext(changed,metadata);assert.equal(after.geometryVersion,unassociated.geometryVersion);assert.notEqual(after.renderVersion,unassociated.renderVersion);
});
test('missing and invalid height fields stay unknown; levels and roof tags retain their distinct source basis',()=>{
  const c=parseContext({elements:[way(40,ring(0,0,10,10),{building:'yes'}),way(41,ring(15,0,10,10),{building:'yes','building:levels':'4','building:min_level':'1','roof:shape':'gabled','roof:height':'2 m','roof:levels':'1','roof:direction':'90'}),way(42,ring(30,0,10,10),{building:'yes',height:'about 9','building:levels':'3000','building:min_level':'-1','roof:shape':'not-a-roof','roof:direction':'720'}),way(43,ring(45,0,10,10),{building:'yes',height:'12',min_height:'12','building:levels':'3','building:min_level':'3'}),way(44,ring(60,0,10,10),{building:'yes',height:'12',min_height:'0','building:levels':'3','building:min_level':'0'})]},metadata);
  const byId=id=>c.buildings.find(b=>b.id===`way/${id}`),unknown=byId(40),levels=byId(41),invalid=byId(42),contradictory=byId(43),ground=byId(44);
  assert.equal(unknown.heightMeters,null);assert.equal(unknown.levels,null);assert.equal(unknown.minHeightMeters,null);assert.equal(unknown.heightBasis,'unknown');
  assert.equal(levels.heightMeters,null);assert.equal(levels.heightBasis,'levels');assert.equal(levels.levels,4);assert.equal(levels.minLevel,1);
  assert.deepEqual(levels.roof,{shape:'gabled',heightMeters:2,levels:1,directionDegrees:90,orientation:null,basis:'mapped-tags'});
  assert.equal(invalid.heightMeters,null);assert.equal(invalid.levels,null);assert.equal(invalid.minLevel,null);assert.equal(invalid.roof,null);
  assert.equal(contradictory.minHeightMeters,null);assert.equal(contradictory.minLevel,null);assert.equal(ground.minHeightMeters,0);assert.equal(ground.minLevel,0);
});
test('incomplete OSM geometry is rejected, never closed into a fabricated building',()=>{
  const broken={elements:[{type:'way',id:9,tags:{building:'yes'},nodes:[1,2,3,1],geometry:[{lon:-95,lat:30},null,{lon:-94.999,lat:30.001},{lon:-95,lat:30}]}]};
  const c=parseContext(broken,metadata);assert.equal(c.buildings.length,0);assert.equal(c.status,'partial');assert.ok(c.coverage.rejectedGeometries>0);
});
test('supplemental heights revise rendering only, while supplemental failure retains usable site context',async()=>{
  const plain=await readSiteContext(points,{read:fakeRead(data),readHeights:null});
  const record=heightRecord({id:'overture-fixture',height:11,sources:JSON.stringify([{dataset:'OpenStreetMap',property:'',record_id:'w3@1'},{dataset:'USGS Lidar',property:'/properties/height'}])});
  const enriched=await readSiteContext(points,{read:fakeRead(data),readHeights:async({buildingIds})=>{assert.deepEqual(buildingIds,['way/3']);return {status:'ready',records:[record]};}});
  assert.equal(enriched.geometryVersion,plain.geometryVersion);assert.notEqual(enriched.renderVersion,plain.renderVersion);assert.equal(enriched.version,plain.version);assert.equal(enriched.buildings.find(b=>b.id==='way/3').heightBasis,'overture');
  const failed=await readSiteContext(points,{read:fakeRead(data),readHeights:async()=>{throw new Error('Network unavailable');}});
  assert.equal(failed.status,'ready');assert.equal(failed.heightEnrichment.status,'unavailable');assert.deepEqual(failed.buildings,plain.buildings);
  const invalid=await readSiteContext(points,{read:fakeRead(data),readHeights:async()=>null});assert.equal(invalid.status,'ready');assert.equal(invalid.heightEnrichment.status,'unavailable');
});
test('context lookups retain location, bounded queries and distinct legal evidence identity',async()=>{
  const input={points,priorities:{purpose:'Housing',matters:'School nearby',choices:[]}},session=createResearchSession(input,{webRead:fakeRead(data),readHeights:null});
  const before=session.snapshot().caseId;await session.execute('read_site_context',{radius_meters:300});const after=session.snapshot();
  assert.equal(before,after.caseId);assert.equal(after.sources.length,0);assert.ok(after.siteContext.version);assert.equal(after.siteContext.buildings.length,3);
  await assert.rejects(readSiteContext(points,{radiusMeters:50000}),/Invalid context radius/);
  const failed=await readSiteContext(points,{read:async()=>{throw new Error('Source returned 429');}});assert.equal(failed.status,'unavailable');assert.match(failed.coverage.detail,/does not establish/);
});
test('legacy school tool now returns a routed receipt and never falls back to a direct line',async()=>{
 const schools={elements:[{type:'node',id:10,lon:geo([100,0])[0],lat:30,tags:{amenity:'school',name:'Near School'}}]};
 const result=await readNearbySchools(points,{radiusMeters:1000,read:fakeRead(schools),route:async(origin,destination)=>({distanceMeters:180,durationSeconds:120,mode:'walking',geometry:{type:'LineString',coordinates:[origin,destination]}})});
 assert.equal(result.distanceType,'street-route');assert.equal(result.kind,'school');assert.equal(result.distanceMeters,180);assert.equal(result.feature.sourceUrl,'https://www.openstreetmap.org/node/10');
 const failed=await readNearbySchools(points,{radiusMeters:1000,read:fakeRead(schools),route:async()=>{throw new Error('No route');}});assert.equal(failed.distanceMeters,null);assert.equal(failed.status,'unresolved');
});

test('known existing footprints block new houses and parking; context changes invalidate concept identity',()=>{
  const e=evidence(),building={id:'way/1',geometry:rect(0,0,32,70),sourceUrl:'https://www.openstreetmap.org/way/1'};
  const plain=calculateConcept(e,params);e.siteContext={geometryVersion:'c'.repeat(20),buildings:[building]};const c=calculateConcept(e,params);
  assert.notEqual(c.id,plain.id);assert.equal(c.contextVersion,'c'.repeat(20));assert.ok(c.metrics.mappedExistingFootprintSquareMeters>2000);assert.equal(c.blockedRegions.length,1);
  for(const b of [...c.buildings,...c.parking])assert.ok(overlapArea(b.geometry,building.geometry)<.01);
  for(const b of c.buildings)assert.ok(Math.abs(overlapArea(b.geometry,e.parcel.geometry)-multiArea(b.geometry))<.01);
  e.siteContext.buildings=[{...building,geometry:e.parcel.geometry}];assert.equal(calculateConcept(e,params).status,'no-fit');
});
test('school question cannot be completed by interpretation: Gloo must attach an actual receipt',async()=>{
  const e=evidence(),receipt={originalExcerpt:'How close is the nearest school?',id:'school-fixture',status:'answered',headline:'100 m to Near School',detail:'Straight-line; mapped schools may be missing.',distanceMeters:100,distanceType:'street-route',kind:'school',feature:{id:'node/10',name:'Near School',coordinates:geo([100,0]),sourceUrl:'https://www.openstreetmap.org/node/10'},searchRadiusMeters:1000};e.priorityMeasurements=[];
  const session={snapshot:()=>structuredClone(e),context:()=>({...e,sources:[]}),renewSignal(){},toolDefinitions:()=>[{type:'function',function:{name:'read_nearby_schools'}}],execute:async()=>{e.priorityMeasurements.push(receipt);return {status:'answered',measurement:receipt};}};
  const entry={session,input:{priorities:{purpose:'Housing',matters:'How close is the nearest school?',choices:[]}}};let n=0,id;const errors=[];
  const fetchImpl=async(_url,options)=>{const b=JSON.parse(options.body),outputs=b.input.filter(i=>i.type==='function_call_output').map(i=>JSON.parse(i.output));errors.push(...outputs.filter(o=>o.status==='tool-error').map(o=>o.message));id=outputs.findLast(o=>o.id&&o.metrics)?.id??id;
    const steps=[['interpret_priorities',{items:[{label:'School nearby',meaning:'Find the nearest mapped school.',original_excerpt:'How close is the nearest school?',kind:'question',target:'whole-site',research_topic:'school-distance'},{label:'Housing',meaning:'Explore the requested housing study.',original_excerpt:'Housing',kind:'goal',target:'homes',research_topic:'other'}]}],['test_layout',params],['review_layout',()=>({concept_id:id})],['select_layout',()=>({concept_id:id,rationale:'Homes form a compact group.',support:[]})],['answer_priority',{priority_id:'priority-0',measurement_id:'invented'}],['read_nearby_schools',{radius_meters:1000}],['answer_priority',{priority_id:'priority-0',measurement_id:receipt.id}],['review_layout',()=>({concept_id:id})],['select_layout',()=>({concept_id:id,rationale:'Homes form a compact group.',support:[]})]];
    if(n===3)assert.ok(!b.tools.some(t=>t.function.name==='select_layout'),'Selection must be withheld while a factual question has no attached receipt');
    if(n===8)assert.ok(b.tools.some(t=>t.function.name==='select_layout'),'Selection should become available after the receipt is attached and layout reviewed');
    const [name,args]=steps[n++];return new Response(JSON.stringify({output:[{type:'function_call',call_id:'c'+n,name,arguments:JSON.stringify(typeof args==='function'?args():args)}]}));};
  const run=createScenarioAgent({optionCount:1,apiKey:'fixture',model:'fixture',fetchImpl,resolveContext:()=>entry,reserve:()=>()=>{}}),result=await run({assessmentVersion:'a'.repeat(20)});
  assert.ok(errors.some(e=>e.includes('factual priorities')));assert.ok(errors.some(e=>e.includes('measurement ID')));assert.equal(result.brief[0].answer.distanceMeters,100);assert.equal(result.brief[0].answer.feature.name,'Near School');
});
