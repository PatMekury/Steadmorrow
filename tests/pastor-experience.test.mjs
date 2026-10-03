import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {frameRouteFromSite} from '../route-camera.js';
import {surroundingSummary} from '../pastor-copy.js';
import {validateDesignBrief,checkHomeDesign} from '../scripts/home-design.mjs';
import {auditHousingOptions} from '../scripts/housing-options-audit.mjs';
import {fitHomeLayout} from '../scripts/home-layout-search.mjs';
import {parcelStudy} from '../scripts/parcel-study.mjs';
import {multiArea,overlapArea} from '../scripts/site-geometry.mjs';
const brief={household:'Two-bedroom homes for families',basis:'Fictional source fixture; room sizes are design allowances.',rooms_per_home:{bedroom_areas_m2:[12,12],living_dining_m2:18,kitchen_m2:10,bathrooms_m2:6,storage_m2:4,other_m2:0},interior_reserve_percent:20,floor_structure_meters:.3,standards:[],unresolved_checks:['Check doors, daylight and access.']};
test('frontage-only building lines cannot masquerade as all-edge clearance',()=>{
 const sources=[{id:'s',passages:[{id:'p',text:'A building line of 25 feet along major thoroughfares is required unless otherwise authorized.'}]}];
 const rule={requirement:'Street building line',scope:'applicable',applicability:'Frontage classification needs checking.',metric:'edge-clearance-min',value:25,unit:'feet',support:[{sourceId:'s',passageId:'p'}]};
 assert.throws(()=>validateDesignBrief({...brief,standards:[rule]},sources),/EVERY parcel edge/);
 const b=validateDesignBrief({...brief,standards:[{...rule,metric:'other',value:0,unit:'not-numeric'}]},sources);
 assert.equal(b.standards[0].support[0].quote,sources[0].passages[0].text);
});
test('bounded home sizing preserves the family room budget and individual parcel containment',()=>{
 const mx=111195*Math.cos(Math.PI/6),geo=([x,y])=>[-95+x/mx,30+y/111195];
 const rect=(x,y,w,h)=>[[[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]].map(geo)]];
 const selected=rect(0,0,40,17),members=[{id:'left',key:'left',geometry:rect(0,0,20,17)},{id:'right',key:'right',geometry:rect(20,0,20,17)}];
 const e={caseId:'fixture',status:'preliminary',selectedArea:{geometry:selected},parcel:parcelStudy(members,selected).parcel,siteContext:{geometryVersion:'fixture',buildings:[],roads:[]}};
 const b=validateDesignBrief(brief,[]),common={storeys:2,storey_height:3.6,spacing:3,edge_clearance:2,angle:0,homes:4,parking_spaces:0};
 for(const typology of ['attached','apartment']){
  const c=fitHomeLayout(e,{...common,typology,...(typology==='attached'?{homes_per_row:2}:{units_per_floor:2,circulation_percent:25})},b);
  assert.ok(c.metrics.homes>0,typology+' should place homes');
  assert.ok(c.designCheck.grossOrAllocatedAreaPerHome>=b.minimumAllocatedAreaPerHomeSquareMeters);
  assert.ok(c.diagnostics.sizingSearch.candidates.length<=8);
  assert.equal(c.diagnostics.sizingSearch.exhaustive,false);
  for(const building of c.buildings)assert.ok(members.some(p=>Math.abs(overlapArea(p.geometry,building.geometry)-multiArea(building.geometry))<.01));
 }
 const impossible=fitHomeLayout({...e,parcel:{geometry:rect(0,0,3,3)},parcels:[],selectedArea:{geometry:rect(0,0,3,3)}},{...common,typology:'detached'},b);
 assert.equal(impossible.metrics.homes,0);assert.equal(impossible.status,'no-fit');
 assert.ok(impossible.designCheck.grossOrAllocatedAreaPerHome>=b.minimumAllocatedAreaPerHomeSquareMeters);
});
test('home room budget rejects the old small family row while allowing a larger two-storey test',()=>{
 const b=validateDesignBrief(brief,[]),p={typology:'attached',width:5.5,depth:10,storeys:1,storey_height:3};
 assert.throws(()=>checkHomeDesign(p,b),/below the agreed/);
 assert.equal(checkHomeDesign({...p,storeys:2},b).grossOrAllocatedAreaPerHome,110);
 assert.throws(()=>checkHomeDesign({typology:'apartment',unit_area:50,storeys:2,storey_height:3},b),/below the agreed/);
});

test('home standards include roof and floor space and enforce source-backed parking dimensions',()=>{
 const b=validateDesignBrief(brief,[]),p={typology:'attached',width:8,depth:10,storeys:2,storey_height:3.8};
 b.standards=[{requirement:'Fixture clear ceiling',scope:'program-benchmark',metric:'clear-height-min',value:9,unit:'feet'}];
 assert.throws(()=>checkHomeDesign({...p,storey_height:3},b),/cited design requirement/);
 assert.ok(checkHomeDesign(p,b).approximateClearHeight>=9*.3048);
 b.standards=[{requirement:'Fixture parking depth',scope:'applicable',metric:'parking-depth-min',value:19,unit:'feet'}];
 assert.throws(()=>checkHomeDesign(p,b),/Fixture parking depth/);
 assert.ok(checkHomeDesign({...p,parking_bay_depth:5.8},b));
});

test('option audit includes sources cited only by the home design brief',async()=>{
 let packet;
 await auditHousingOptions({options:[{id:'o',support:[{sourceId:'use'}],designBrief:{support:[{sourceId:'room'}]}}],evidence:{sources:[{id:'use',text:'Housing route.'},{id:'room',text:'Original room rule.'},{id:'unused',text:'Unrelated.'}]},apiKey:'fixture',model:'fixture',fetchImpl:async(_url,request)=>{packet=JSON.parse(JSON.parse(request.body).input[0].content);return new Response(JSON.stringify({output:[{type:'function_call',name:'record_option_audit',arguments:JSON.stringify({accepted:true,issues:[]})}]}));}});
 assert.deepEqual(packet.sources.map(s=>s.id),['use','room']);assert.equal(packet.sources[1].text,'Original room rule.');
});
test('numeric source requirements retain program scope and reject invented values and undersized bedrooms',()=>{
 const sources=[{id:'program',passages:[{id:'p',text:'For participating single-family projects, each bedroom must be at least 121 square feet.'}]}];
 const r={requirement:'Bedroom size',scope:'program-benchmark',applicability:'Voluntary benchmark; funding is unconfirmed.',metric:'bedroom-area-min',value:121,unit:'sq-ft',support:[{sourceId:'program',passageId:'p'}]};
 const b=validateDesignBrief({...brief,standards:[r]},sources);assert.equal(b.standards[0].scope,'program-benchmark');
 assert.throws(()=>validateDesignBrief({...brief,standards:[{...r,value:150}]},sources),/must appear/);
 b.rooms[0].area_m2=10;assert.throws(()=>checkHomeDesign({typology:'attached',width:8,depth:10,storeys:2,storey_height:3.8},b),/cited design requirement/);
});
test('effects summary uses only the displayed concept and keeps the adverse uncertainty',()=>{
 const answer={receipts:[{kind:'surroundings-effects',conceptId:'first',structures:[{name:'the church',minimumSeparationMeters:3.8}]},{kind:'surroundings-effects',conceptId:'second',structures:[{name:'the church',minimumSeparationMeters:7.6}]}]};
 assert.match(surroundingSummary(answer,'second').detail,/25 feet/);assert.match(surroundingSummary(answer,'first').detail,/12 feet/);assert.match(surroundingSummary(answer,'stale').detail,/still needs its own check/);assert.equal(surroundingSummary(answer,'stale').receipt,null);
 assert.match(surroundingSummary(answer,'first').next,/drainage, trees, noise/);
});
test('route camera retains all route points with site in foreground for every heading and viewport',()=>{
 for(const aspect of [.7,1.5,2.2])for(let angle=0;angle<Math.PI*2;angle+=Math.PI/4){
  const site=[[-10,0,-15],[10,0,-15],[10,7,15],[-10,7,15]].map(p=>new THREE.Vector3(...p));
  const end=new THREE.Vector3(Math.cos(angle)*600,0,Math.sin(angle)*600),bend=end.clone().multiplyScalar(.5).add(new THREE.Vector3(35,0,0)),points=[...site,new THREE.Vector3(),bend,end];
  const camera=new THREE.PerspectiveCamera();frameRouteFromSite(camera,{site,points,destination:end,aspect});
  for(const p of points){const v=p.clone().project(camera);assert.ok(Math.abs(v.x)<.85&&v.y>-.81&&v.y<.83&&v.z<1);}
  assert.ok(new THREE.Vector3().project(camera).y<end.clone().project(camera).y,'site is in foreground below destination');
  assert.ok(camera.position.distanceTo(end)>camera.position.length()*2,'site is closer to camera');
 }
});
