import test from 'node:test';
import assert from 'node:assert/strict';
import clipping from 'polygon-clipping';
import {calculateConcept,validateLayout} from '../scripts/scenario-geometry.mjs';
import {scenarioTools,createScenarioAgent} from '../scripts/scenario-agent.mjs';
import {multiArea,overlapArea} from '../scripts/site-geometry.mjs';
const origin=[-95,30],mx=111195*Math.cos(Math.PI/6);
const geo=([x,y])=>[origin[0]+x/mx,origin[1]+y/111195];
const rect=(x,y,w,h)=>[[[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]].map(geo)]];
const evidence=(geometry=rect(0,0,85,75))=>({caseId:'b'.repeat(20),status:'preliminary',locality:{label:'Fixture authority'},parcel:{geometry,id:'fixture'},selectedArea:{geometry},sources:[]});
const base={width:6,depth:9,storeys:2,storey_height:3,spacing:3,edge_clearance:2,angle:0,homes:12,parking_spaces:0};
const apartment={...base,typology:'apartment',width:20,depth:18,storeys:3,units_per_floor:4,circulation_percent:25,unit_area:50};

test('legacy detached calls retain one dwelling per block and optional form fields are truly optional',()=>{
  const legacy=calculateConcept(evidence(),base),explicit=calculateConcept(evidence(),{...base,typology:'detached'});
  assert.equal(legacy.id,explicit.id);assert.equal(legacy.metrics.homes,legacy.buildings.length);
  assert.equal(legacy.metrics.grossFloorSquareMeters,legacy.metrics.homes*6*9*2);
  const schema=scenarioTools.find(t=>t.function.name==='test_layout').function.parameters;
  assert.ok(!schema.required.includes('typology'));assert.ok(!schema.required.includes('units_per_floor'));
  assert.deepEqual(schema.properties.typology.enum,['detached','attached','apartment']);
  assert.throws(()=>validateLayout({...base,width:20}),/16 × 24/);
  assert.throws(()=>validateLayout({...base,typology:'castle'}),/Invalid/);
});
test('an attached row fits as a connected whole and counts its dwellings once across storeys',()=>{
  const e=evidence(rect(0,0,30,16));
  const c=calculateConcept(e,{...base,homes:4,typology:'attached',homes_per_row:4});
  assert.equal(c.metrics.homes,4);assert.equal(c.metrics.buildingMasses,1);assert.equal(c.buildings.length,4);
  assert.equal(c.diagnostics.testedFootprintWidthMeters,24);assert.equal(c.metrics.footprintSquareMeters,216);
  assert.equal(new Set(c.buildings.map(b=>b.groupId)).size,1);
  for(const b of c.buildings){assert.equal(b.homes,1);assert.equal(b.homesInRow,4);assert.equal(b.typology,'attached');assert.ok(Math.abs(overlapArea(b.geometry,e.parcel.geometry)-multiArea(b.geometry))<.01);}
  for(let i=1;i<c.buildings.length;i++)assert.ok(Math.abs(c.buildings[i-1].geometry[0][0][1][0]-c.buildings[i].geometry[0][0][0][0])<1e-10,'Adjacent homes share the same edge');
  assert.match(c.assumptions[0],/Party walls/);assert.equal(c.checks.legalCapacity,'not-established');
  const short=calculateConcept(evidence(rect(0,0,25,16)),{...base,homes:4,typology:'attached',homes_per_row:4});
  assert.equal(short.status,'no-fit');assert.equal(short.buildings.length,0);assert.match(short.limitations,/Other forms/);
});
test('apartment count uses explicit unit and shared-area assumptions and caps to requested allocations',()=>{
  const c=calculateConcept(evidence(),apartment),b=c.buildings[0];
  assert.equal(c.buildings.length,1);assert.equal(c.metrics.homes,12);assert.equal(b.homes,12);
  assert.deepEqual(b.unitAllocationByFloor,[4,4,4]);assert.equal(c.metrics.grossFloorSquareMeters,1080);
  assert.equal(c.metrics.assumedSharedAreaSquareMeters,270);assert.equal(c.metrics.assumedDwellingAreaSquareMeters,600);
  assert.equal(c.metrics.unallocatedFloorAreaSquareMeters,210);
  assert.equal(c.metrics.assumedSharedAreaSquareMeters+c.metrics.assumedDwellingAreaSquareMeters+c.metrics.unallocatedFloorAreaSquareMeters,c.metrics.grossFloorSquareMeters);
  assert.equal(c.checks.assumedFloorAreaAllocation,'passed');assert.equal(c.checks.interiorPlanning,'not-established');assert.equal(c.checks.access,'not-established');
  assert.match(c.assumptions[0],/not a floor plan/);
  const capped=calculateConcept(evidence(),{...apartment,homes:10});
  assert.equal(capped.metrics.homes,10);assert.deepEqual(capped.buildings[0].unitAllocationByFloor,[4,4,2]);
  assert.equal(capped.metrics.unallocatedFloorAreaSquareMeters,310);
});
test('apartment and attached assumptions must be explicit and impossible floor allocations are rejected',()=>{
  for(const key of ['units_per_floor','circulation_percent','unit_area']){const missing={...apartment};delete missing[key];assert.throws(()=>calculateConcept(evidence(),missing),/explicit apartment assumption/);}
  assert.throws(()=>calculateConcept(evidence(),{...apartment,width:10,depth:12}),/do not fit the floor area/);
  assert.throws(()=>validateLayout({...base,typology:'attached'}),/homes_per_row/);
  assert.deepEqual(validateLayout({...base,homes_per_row:3}),validateLayout(base));
  assert.throws(()=>validateLayout({...apartment,circulation_percent:0}),/Invalid/);
  assert.throws(()=>validateLayout({...apartment,units_per_floor:2.5}),/Invalid/);
});
test('model calls containing every form field ignore irrelevant fields without changing the selected form, counts or identity',()=>{
  const variants=[
    [base,{homes_per_row:4,units_per_floor:4,circulation_percent:25,unit_area:50}],
    [{...base,typology:'attached',homes_per_row:3},{units_per_floor:0,circulation_percent:null,unit_area:'unused'}],
    [apartment,{homes_per_row:0}],
  ];
  for(const [params,unused] of variants){
    const plain=calculateConcept(evidence(),params),verbose=calculateConcept(evidence(),{...params,...unused});
    assert.equal(verbose.typology,plain.typology);assert.equal(verbose.id,plain.id);assert.deepEqual(verbose.metrics,plain.metrics);assert.deepEqual(verbose.buildings,plain.buildings);assert.deepEqual(verbose.parameters,plain.parameters);
    assert.deepEqual(verbose.ignoredParameters,Object.keys(unused).sort());assert.match(verbose.parameterNotes[0],/Ignored/);
    const reordered=Object.fromEntries(Object.entries({...params,...unused}).reverse());assert.equal(calculateConcept(evidence(),reordered).id,plain.id);
  }
  const missing={...apartment,homes_per_row:4};delete missing.units_per_floor;assert.throws(()=>calculateConcept(evidence(),missing),/explicit apartment assumption: units_per_floor/);
  assert.throws(()=>calculateConcept(evidence(),{...apartment,homes_per_row:4,units_per_floor:0}),/Invalid layout parameter: units_per_floor/);
});
test('all forms avoid existing buildings, parking and parcel holes at a non-axis-aligned orientation',()=>{
  const geometry=clipping.difference(rect(0,0,130,115),rect(45,30,25,35));
  const e=evidence(geometry);e.siteContext={geometryVersion:'c'.repeat(20),buildings:[{id:'existing',geometry:rect(0,0,30,115)}]};
  for(const params of [base,{...base,typology:'attached',homes_per_row:3},apartment]){
    const c=calculateConcept(e,{...params,angle:23,parking_spaces:4});assert.ok(c.buildings.length>0);
    assert.equal(c.metrics.homes,c.buildings.reduce((sum,b)=>sum+b.homes,0));
    for(const b of c.buildings){assert.ok(Math.abs(overlapArea(b.geometry,geometry)-multiArea(b.geometry))<.01);assert.ok(overlapArea(b.geometry,e.siteContext.buildings[0].geometry)<.01);for(const p of c.parking)assert.ok(overlapArea(b.geometry,p.geometry)<.01);}
    for(let i=0;i<c.buildings.length;i++)for(let j=0;j<i;j++)assert.ok(overlapArea(c.buildings[i].geometry,c.buildings[j].geometry)<.01);
  }
});
test('Gloo chooses a form, observes an impossible apartment allocation, revises it and reviews the measured result',async()=>{
  const e=evidence(),session={snapshot:()=>structuredClone(e),context:()=>({...e,sources:[]}),toolDefinitions:()=>[],renewSignal(){}};
  const entry={session,input:{priorities:{purpose:'Affordable apartments',matters:'',choices:[]}}};let n=0,id,observedIgnoredNote=false;const errors=[];
  const fetchImpl=async(_url,options)=>{
    const body=JSON.parse(options.body),outputs=body.input.filter(i=>i.type==='function_call_output').map(i=>JSON.parse(i.output));
    observedIgnoredNote ||= outputs.some(o=>o.ignoredParameters?.includes('homes_per_row')&&o.parameterNotes?.some(note=>note.includes('Ignored')));
    errors.push(...outputs.filter(o=>o.status==='tool-error').map(o=>o.message));id=outputs.findLast(o=>o.id&&o.metrics)?.id??id;
    const steps=[['interpret_priorities',{items:[{label:'Apartments',meaning:'Explore a small apartment mass.',original_excerpt:'Affordable apartments',kind:'goal',target:'homes'}]}],['test_layout',{...apartment,width:10,depth:12,homes_per_row:4}],['test_layout',{...apartment,homes_per_row:4}],['review_layout',()=>({concept_id:id})],['select_layout',()=>({concept_id:id,rationale:'A compact apartment mass leaves room around the building.',support:[]})]];
    const [name,a]=steps[n++];return new Response(JSON.stringify({output:[{type:'function_call',call_id:'c'+n,name,arguments:JSON.stringify(typeof a==='function'?a():a)}]}));
  };
  const run=createScenarioAgent({apiKey:'fixture',model:'fixture',fetchImpl,resolveContext:()=>entry,reserve:()=>()=>{}});
  const result=await run({assessmentVersion:'a'.repeat(20)});
  assert.equal(result.concept.typology,'apartment');assert.equal(result.concept.metrics.homes,12);assert.equal(n,5);
  assert.ok(errors.some(message=>message.includes('do not fit the floor area')));assert.equal(observedIgnoredNote,true);assert.equal(result.research.mode,'gloo-tool-agent');
});
