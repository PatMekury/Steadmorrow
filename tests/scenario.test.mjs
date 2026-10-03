import test from 'node:test';
import assert from 'node:assert/strict';
import clipping from 'polygon-clipping';
import {calculateConcept,validateLayout} from '../scripts/scenario-geometry.mjs';
import {validateScenarioInput} from '../scripts/scenario-agent.mjs';
import {createScenarioAgent} from './decision-fixtures.mjs';
import {multiArea,overlapArea} from '../scripts/site-geometry.mjs';
const origin=[-95,30],mx=111195*Math.cos(Math.PI/6);
const geo=([x,y])=>[origin[0]+x/mx,origin[1]+y/111195];
const rect=(x,y,w,h)=>[[[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]].map(geo)]];
const evidence=(geometry=rect(0,0,80,70))=>({caseId:'b'.repeat(20),status:'preliminary',locality:{label:'Test authority'},parcel:{geometry,id:'test'},selectedArea:{geometry},sources:[]});
const args={width:6,depth:9,storeys:2,storey_height:3,spacing:3,edge_clearance:3,angle:0,homes:12,parking_spaces:4};
test('measured allocations remain inside selection and parcel and never double count storeys as homes',()=>{
 const e=evidence();e.selectedArea.geometry=rect(10,10,60,50);const c=calculateConcept(e,args);
 assert.equal(c.metrics.homes,c.buildings.length);assert.ok(c.metrics.homes>0);assert.equal(c.metrics.grossFloorSquareMeters,c.metrics.homes*108);assert.equal(c.metrics.parkingRequirement,null);
 for(const b of c.buildings){assert.ok(Math.abs(overlapArea(b.geometry,e.selectedArea.geometry)-multiArea(b.geometry))<.01);assert.ok(Math.abs(overlapArea(b.geometry,e.parcel.geometry)-multiArea(b.geometry))<.01);}
 for(let i=0;i<c.buildings.length;i++)for(let j=0;j<i;j++)assert.ok(overlapArea(c.buildings[i].geometry,c.buildings[j].geometry)<.01);
 for(const p of c.parking){assert.ok(Math.abs(overlapArea(p.geometry,e.selectedArea.geometry)-multiArea(p.geometry))<.01);for(const b of c.buildings)assert.ok(overlapArea(p.geometry,b.geometry)<.01);}
 assert.equal(c.checks.legalCapacity,'not-established');assert.equal(c.checks.affordableDelivery,'not-established');
});
test('holes and concave boundaries cannot be bridged by a block; rotation is deterministic',()=>{
 const shape=clipping.difference(rect(0,0,80,70),rect(20,20,20,25),rect(60,0,20,30));const e=evidence(shape);
 const c=calculateConcept(e,{...args,angle:37});assert.equal(c.id,calculateConcept(e,{...args,angle:37}).id);
 for(const b of c.buildings)assert.ok(Math.abs(overlapArea(b.geometry,shape)-multiArea(b.geometry))<.01);
});
test('small sites report no-fit, and ambiguous parcels and invalid inputs are blocked',()=>{
 const c=calculateConcept(evidence(rect(0,0,4,4)),args);assert.equal(c.status,'no-fit');assert.equal(c.metrics.homes,0);
 assert.throws(()=>calculateConcept({...evidence(),status:'needs-parcel'},args),/Choose/);
 assert.throws(()=>validateLayout({...args,width:NaN}),/Invalid/);
 assert.throws(()=>validateLayout({...args,width:1}),/Invalid/);
 assert.throws(()=>validateScenarioInput({assessmentVersion:'a'.repeat(20),refinement:'donor records'}),/property goals/);
});
function mockSession(){const e=evidence();return {snapshot:()=>structuredClone(e),context:()=>({...e,sources:[]}),toolDefinitions:()=>[{type:'function',function:{name:'read_housing_context'}}],execute:async()=>({status:'retrieved',geography:'county'}),renewSignal(){}};}
test('Gloo selects tools, sees failure, changes a test and must review before choosing; no text fallback',async()=>{
 const session=mockSession(),entry={session,input:{priorities:{purpose:'Housing',matters:'A place where people can meet outdoors',choices:[]}}};
 let requestCount=0,selectedId,observedFailure=false,observedResearch=false;const emitted=[];
 const fetchImpl=async(url,options)=>{
  const payload=JSON.parse(options.body);const outputs=payload.input.filter(i=>i.type==='function_call_output').map(i=>JSON.parse(i.output));
  observedFailure ||= outputs.some(o=>o.status==='tool-error');observedResearch ||=outputs.some(o=>o.geography==='county');
  const calculated=outputs.findLast(o=>o.id&&o.metrics);if(calculated)selectedId=calculated.id;
  const call=(name,a)=>({type:'function_call',call_id:'call-'+requestCount,name,arguments:JSON.stringify(a)});
  const turns=[()=>call('interpret_priorities',{items:[{label:'Shared outdoor life',meaning:'Leave unallocated land for a shared outdoor place.',original_excerpt:'A place where people can meet outdoors',kind:'goal',target:'land'},{label:'Housing',meaning:'Explore the requested housing study.',original_excerpt:'Housing',kind:'goal',target:'homes',research_topic:'other'}]}),()=>call('read_housing_context',{}),()=>call('test_layout',{...args,width:1}),()=>call('test_layout',args),()=>call('select_layout',{concept_id:selectedId,rationale:'A small cluster leaves land unallocated.',support:[]}),()=>call('review_layout',{concept_id:selectedId}),()=>call('select_layout',{concept_id:selectedId,rationale:'A small cluster leaves land unallocated.',support:[]})];
  const out=turns[requestCount++]();return new Response(JSON.stringify({output:[out]}));
 };
 let active=0;const run=createScenarioAgent({optionCount:1,apiKey:'test',model:'test',fetchImpl,resolveContext:()=>entry,reserve:()=>{active++;return ()=>active--;}});
 const result=await run({assessmentVersion:'a'.repeat(20)},{onProgress:p=>emitted.push(p.message)});
 assert.equal(result.research.mode,'gloo-tool-agent');assert.equal(result.brief[0].target,'land');assert.ok(observedFailure&&observedResearch);assert.equal(result.concept.metrics.homes,result.concept.buildings.length);assert.equal(active,0);assert.ok(emitted.some(t=>t.includes('Measuring')));
 assert.equal((await run({assessmentVersion:'a'.repeat(20)})).version.scenario,result.version.scenario);assert.equal(requestCount,7);
});
test('expired server evidence cannot be replaced with client-supplied findings',async()=>{
 const run=createScenarioAgent({optionCount:1,resolveContext:()=>null,reserve:()=>{throw new Error('must not reserve');}});
 await assert.rejects(run({assessmentVersion:'a'.repeat(20),evidence:evidence()}),/expired/);
});
test('invented priority excerpts and premature clarification cannot bypass measured completion',async()=>{
 const session=mockSession(),entry={session,input:{priorities:{purpose:'Housing',matters:'Shared garden',choices:[]}}};let n=0,id;const errors=[];
 const fetchImpl=async(_url,options)=>{
  const body=JSON.parse(options.body),outputs=body.input.filter(i=>i.type==='function_call_output').map(i=>JSON.parse(i.output));errors.push(...outputs.filter(o=>o.status==='tool-error').map(o=>o.message));id=outputs.findLast(o=>o.id&&o.metrics)?.id??id;
  const requests=[['interpret_priorities',{items:[{label:'Keep parking',meaning:'Preserve parking.',original_excerpt:'keep parking',kind:'goal',target:'parking'},{label:'Housing',meaning:'Explore the requested housing study.',original_excerpt:'Housing',kind:'goal',target:'homes',research_topic:'other'}]}],['interpret_priorities',{items:[{label:'A shared garden',meaning:'Leave land for a possible garden.',original_excerpt:'Shared garden',kind:'goal',target:'land'},{label:'Housing',meaning:'Explore the requested housing study.',original_excerpt:'Housing',kind:'goal',target:'homes',research_topic:'other'}]}],['test_layout',args],['ask_priority_question',{question:'Which spacing should I use?'}],['review_layout',()=>({concept_id:id})],['select_layout',()=>({concept_id:id,rationale:'A compact cluster leaves land for the garden idea.',support:[]})]];
  const [name,a]=requests[n++];return new Response(JSON.stringify({output:[{type:'function_call',call_id:'c'+n,name,arguments:JSON.stringify(typeof a==='function'?a():a)}]}));
 };
 const run=createScenarioAgent({optionCount:1,apiKey:'test',model:'test',fetchImpl,resolveContext:()=>entry,reserve:()=>()=>{}});
 const r=await run({assessmentVersion:'a'.repeat(20)});assert.equal(r.brief[0].originalExcerpt,'Shared garden');assert.ok(errors.some(e=>e.includes('exact excerpt')));assert.ok(errors.some(e=>e.includes('failed geometric test')));
});
test('reviewing an alternative does not erase the receipt for a previously reviewed concept',async()=>{
 const session=mockSession(),entry={session,input:{priorities:{purpose:'Housing',matters:'',choices:[]}}};let n=0,firstId;
 const fetchImpl=async(_url,options)=>{
  const body=JSON.parse(options.body),outputs=body.input.filter(i=>i.type==='function_call_output').map(i=>JSON.parse(i.output));firstId??=outputs.find(o=>o.id&&o.metrics)?.id;
  if(n>=2)assert.ok(!body.tools.some(t=>t.function.name==='ask_priority_question'));
  const requests=[['interpret_priorities',{items:[{label:'Housing',meaning:'Explore housing blocks.',original_excerpt:'Housing',kind:'goal',target:'homes'}]}],['test_layout',args],['review_layout',()=>({concept_id:firstId})],['test_layout',{...args,angle:45}],['select_layout',()=>({concept_id:firstId,rationale:'The first arrangement provides the preferred cluster.',support:[]})]];
  const [name,a]=requests[n++];return new Response(JSON.stringify({output:[{type:'function_call',call_id:'c'+n,name,arguments:JSON.stringify(typeof a==='function'?a():a)}]}));
 };
 const run=createScenarioAgent({optionCount:1,apiKey:'test',model:'test',fetchImpl,resolveContext:()=>entry,reserve:()=>()=>{}});
 const r=await run({assessmentVersion:'a'.repeat(20)});assert.equal(r.concept.id,firstId);assert.equal(n,5);
});
