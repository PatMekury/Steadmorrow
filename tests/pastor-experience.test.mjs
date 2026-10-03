import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {frameRouteFromSite} from '../route-camera.js';
import {surroundingSummary} from '../pastor-copy.js';
import {validateDesignBrief,checkHomeDesign} from '../scripts/home-design.mjs';
import {auditHousingOptions} from '../scripts/housing-options-audit.mjs';
const brief={household:'Two-bedroom homes for families',basis:'Fictional source fixture; room sizes are design allowances.',rooms_per_home:{bedroom_areas_m2:[12,12],living_dining_m2:18,kitchen_m2:10,bathrooms_m2:6,storage_m2:4,other_m2:0},interior_reserve_percent:20,floor_structure_meters:.3,standards:[],unresolved_checks:['Check doors, daylight and access.']};
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
