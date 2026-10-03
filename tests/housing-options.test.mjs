import test from 'node:test';
import assert from 'node:assert/strict';
import {createScenarioAgent} from '../scripts/scenario-agent.mjs';
import {calculateConcept} from '../scripts/scenario-geometry.mjs';
import {parcelStudy} from '../scripts/parcel-study.mjs';
import {activateHousingOption,matchingSavedScenario} from '../findings-session.js';
import {multiArea,overlapArea} from '../scripts/site-geometry.mjs';
const origin=[-95,30],mx=111195*Math.cos(Math.PI/6),geo=([x,y])=>[origin[0]+x/mx,origin[1]+y/111195];
const rect=(x,y,w,h)=>[[[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]].map(geo)]];
const quote='Residential dwellings are permitted subject to development approval and applicable site requirements.';
const source={id:'local-use',kind:'code-provision',title:'Residential uses',text:quote,passages:[{id:'p1',text:quote}]};
const evidence={caseId:'b'.repeat(20),parcel:{key:'p',id:'p',geometry:rect(0,0,80,60)},selectedArea:{geometry:rect(0,0,80,60)},locality:{city:'Fixture'},sources:[source],siteContext:{geometryVersion:'c'.repeat(20),buildings:[]}};
const base={width:6,depth:9,storeys:2,storey_height:3,spacing:3,edge_clearance:2,angle:0,homes:4,parking_spaces:1};
const options=[1,2,3].map(i=>({id:'option-'+i,title:['Detached cluster','Compact cottages','Supportive cottages'][i-1],typology:'detached',housing_model:i===3?'supportive':'independent',use_status:'conditional',applicability:'Residential exploration is conditional on local development approval; supportive services and affordability delivery remain unverified.',dimension_basis:'A compact footprint leaves room around the buildings.',support:[{sourceId:source.id,passageId:'p1'}]}));
test('three options require source review and three distinct reviewed arrangements before selection',async()=>{
 const entry={input:{priorities:{purpose:'Affordable housing',matters:'',choices:[]}},result:{housingRoute:'supported'},session:{snapshot:()=>structuredClone(evidence),context:()=>structuredClone(evidence),toolDefinitions:()=>[],renewSignal(){}}};
 let round=0,audits=0;const ids=[],errors=[];
 const fetchImpl=async(_url,request)=>{
  const body=JSON.parse(request.body),outputs=body.input.filter(i=>i.type==='function_call_output').map(i=>JSON.parse(i.output));
  for(const o of outputs){if(o.status==='tool-error')errors.push(o.message);if(o.id&&o.metrics&&!ids.includes(o.id))ids.push(o.id);}
  const steps=[
   ['interpret_priorities',{items:[{label:'Housing',meaning:'Explore housing',original_excerpt:'Affordable housing',kind:'goal',target:'homes'}]}],
   ['plan_housing_options',{options}],['plan_housing_options',{options}],
   ['test_layout',{...base,option_id:'option-1'}],['review_layout',()=>({concept_id:ids[0]})],
   ['select_layout',()=>({concept_id:ids[0],rationale:'Compact buildings retain outdoor space.',support:[]})],
   ['test_layout',{...base,width:7,option_id:'option-2'}],['review_layout',()=>({concept_id:ids[1]})],
   ['test_layout',{...base,width:8,option_id:'option-3'}],['review_layout',()=>({concept_id:ids[2]})],
   ['select_layout',()=>({concept_id:ids[0],rationale:'Compact buildings retain outdoor space.',support:[{sourceId:'local-use',passageId:'p1'}]})]
  ];
  const [name,args]=steps[round++];return new Response(JSON.stringify({output:[{type:'function_call',call_id:'c'+round,name,arguments:JSON.stringify(typeof args==='function'?args():args)}]}));
 };
 const run=createScenarioAgent({apiKey:'fixture',model:'fixture',fetchImpl,resolveContext:()=>entry,reserve:()=>()=>{},optionAuditor:async()=>++audits===1?{accepted:false,issues:[{optionId:'option-3',reason:'Keep voluntary services conditional.'}]}:{accepted:true,issues:[]}});
 const result=await run({assessmentVersion:'a'.repeat(20)});
 assert.equal(result.options.length,3);assert.equal(result.activeOptionId,'option-1');assert.equal(result.research.optionAuditCalls,2);assert.equal(result.research.modelCalls,13);
 assert.ok(result.options.every(o=>o.concept?.buildings.length&&o.concept.optionId===o.id));assert.equal(new Set(result.options.map(o=>o.concept.id)).size,3);
 assert.ok(errors.some(e=>e.includes('Independent option review')));assert.ok(errors.some(e=>e.includes('Each planned option')));
 const switched=activateHousingOption(result,'option-3');assert.equal(switched.concept.parameters.width,8);assert.equal(switched.version.scenario,result.version.scenario);assert.equal(result.concept.parameters.width,6);
 const finding={caseId:evidence.caseId,version:{assessment:'a'.repeat(20)},siteContext:evidence.siteContext};assert.ok(matchingSavedScenario(finding,switched));
 const stale=structuredClone(switched);stale.options[0].concept.evidenceVersion='d'.repeat(20);assert.equal(matchingSavedScenario(finding,stale),null,'an inactive stale option invalidates the saved collection');
});
test('adjacent parcels retain separate rights and constrain individual buildings; conflicting records are rejected',()=>{
 const selected=rect(0,0,16,30),records=[{id:'A',key:'a',geometry:rect(0,0,8,30),attributes:{LANDMARK:'yes'}},{id:'B',key:'b',geometry:rect(8,0,8,30),attributes:{LANDMARK:'no'}}];
 const collection=parcelStudy(records,selected);assert.equal(collection.parcel.members.length,2);assert.equal(collection.parcel.controlStatus,'unverified');assert.equal(collection.parcel.members[0].attributes.LANDMARK,'yes');
 const e={...evidence,selectedArea:{geometry:selected},parcel:collection.parcel};
 const fits=calculateConcept(e,{...base,width:4,depth:6,homes:4,parking_spaces:0,edge_clearance:1});assert.ok(fits.buildings.length);
 for(const b of fits.buildings)assert.ok(records.some(p=>Math.abs(overlapArea(p.geometry,b.geometry)-multiArea(b.geometry))<.01));
 const tooWide=calculateConcept(e,{...base,width:12,depth:10,homes:1,parking_spaces:0});assert.equal(tooWide.buildings.length,0,'cannot place a building across an unverified member boundary');assert.match(tooWide.diagnostics.explanation,/bounded search/);
 const duplicate=parcelStudy([records[0],{...records[0],id:'X',key:'x'}],selected);assert.equal(duplicate.parcel,null);assert.match(duplicate.issue,/overlap|conflict/i);assert.equal(parcelStudy([records[0],{...records[0],id:'X',key:'x'}],selected,'x').parcel.id,'X');assert.equal(parcelStudy(records,selected,'a').parcel.members.length,2,'an old single-parcel choice does not discard an adjacent member');
});

test('retained narrow Houston outline places the previously rejected footprint without reducing dimensions',async()=>{
 const {readFile}=await import('node:fs/promises');const e=JSON.parse(await readFile(new URL('./fixtures/retained-placement.json',import.meta.url),'utf8'));
 const c=calculateConcept(e,e.parameters);assert.equal(c.metrics.homes,3);assert.equal(c.metrics.parking,2);assert.equal(c.parameters.width,8);assert.equal(c.parameters.depth,10);assert.equal(c.parameters.spacing,3);assert.equal(c.parameters.edge_clearance,2);
 for(const b of c.buildings){assert.ok(Math.abs(overlapArea(b.geometry,e.selectedArea.geometry)-multiArea(b.geometry))<.001);assert.ok(Math.abs(overlapArea(b.geometry,e.parcel.geometry)-multiArea(b.geometry))<.001);}
 assert.equal(c.diagnostics.search.exhaustive,false);assert.ok(c.diagnostics.search.orientations>1);assert.equal(c.checks.legalCapacity,'not-established');
});


for(const count of [1,2])test(`${count} useful alternatives can finish without padding to three`,async()=>{
 const entry={input:{priorities:{purpose:'Affordable housing',matters:'',choices:[]}},result:{housingRoute:'supported'},session:{snapshot:()=>structuredClone(evidence),context:()=>structuredClone(evidence),toolDefinitions:()=>[],renewSignal(){}}};
 let round=0,ids=[];const chosen=options.slice(0,count),steps=[['interpret_priorities',{items:[{label:'Housing',meaning:'Explore housing',original_excerpt:'Affordable housing',kind:'goal',target:'homes'}]}],['plan_housing_options',{options:chosen}]];
 chosen.forEach((o,i)=>steps.push(['test_layout',{...base,width:6+i,option_id:o.id}],['review_layout',()=>({concept_id:ids[i]})]));steps.push(['select_layout',()=>({concept_id:ids[0],rationale:'Compact housing preserves outdoor space.',support:[]})]);
 const run=createScenarioAgent({apiKey:'fixture',model:'fixture',resolveContext:()=>entry,reserve:()=>()=>{},optionAuditor:async()=>({accepted:true,issues:[]}),fetchImpl:async(_,request)=>{
 const body=JSON.parse(request.body);for(const o of body.input.filter(i=>i.type==='function_call_output').map(i=>JSON.parse(i.output)))if(o.id&&o.metrics&&!ids.includes(o.id))ids.push(o.id);
 const [name,args]=steps[round++];return new Response(JSON.stringify({output:[{type:'function_call',call_id:'c'+round,name,arguments:JSON.stringify(typeof args==='function'?args():args)}]}));}});
 const r=await run({assessmentVersion:'a'.repeat(20)});assert.equal(r.options.length,count);assert.ok(r.options.every(o=>o.reviewed&&o.concept.buildings.length));assert.equal(r.explorations.length,0);
});

test('saved empty options move to supporting exploration without losing stale-evidence checks',async()=>{
 const {normalizeHousingOptions}=await import('../findings-session.js');
 const placed=calculateConcept(evidence,base),failed={...placed,id:'f'.repeat(20),status:'no-fit',buildings:[]};
 const s={assessmentVersion:'a'.repeat(20),version:{assessment:'a'.repeat(20)},concept:failed,activeOptionId:'option-1',options:[{id:'option-1',useStatus:'conditional',concept:failed},{id:'option-2',useStatus:'conditional',concept:placed}]};
 const next=normalizeHousingOptions(s);assert.equal(next.options.length,1);assert.equal(next.explorations.length,1);assert.equal(next.concept.id,placed.id);assert.equal(s.options.length,2);assert.equal(activateHousingOption(next,'option-1'),next);
 const finding={caseId:evidence.caseId,version:{assessment:'a'.repeat(20)},siteContext:evidence.siteContext};assert.ok(matchingSavedScenario(finding,next));
 const stale=structuredClone(next);stale.explorations[0].concept.evidenceVersion='d'.repeat(20);assert.equal(matchingSavedScenario(finding,stale),null);
 const roadStale=structuredClone(next);roadStale.options[0].concept.roadContextVersion='earlier-roads';assert.equal(matchingSavedScenario(finding,roadStale),null);
});

test('street-facing parking retains metre dimensions, one continuous aisle and no building collision',()=>{
 const roads=[{id:'road',kind:'residential',name:'Fixture street',geometry:[geo([0,-8]),geo([80,-8])],sourceUrl:'https://example.org/road'}];
 const e={...evidence,siteContext:{...evidence.siteContext,renderVersion:'roads-v1',roads}};
 const c=calculateConcept(e,{...base,parking_spaces:3,parking_strategy:'street-edge'});
 assert.equal(c.parking.length,3);assert.equal(c.maneuver.length,1);assert.equal(c.roadContextVersion,'roads-v1');
 assert.equal(c.siteDesign.frontage.roadId,'road');assert.equal(c.checks.access,'not-established');
 for(const p of c.parking){assert.ok(Math.abs(multiArea(p.geometry)-13)<.001);for(const b of c.buildings)assert.ok(overlapArea(p.geometry,b.geometry)<.001);}
 assert.ok(Math.abs(multiArea(c.maneuver[0])-3*2.6*6)<.001);
 for(const b of c.buildings)assert.ok(overlapArea(c.maneuver[0],b.geometry)<.001);
 assert.ok(c.parking[0].geometry[0][0].every(p=>(p[1]-origin[1])*111195<14),'parking court is at mapped street edge');
});

test('a failed test cannot displace a reviewed positive result or become a selectable alternative',async()=>{
 const narrow={...evidence,selectedArea:{geometry:rect(0,0,16,40)},parcel:{...evidence.parcel,geometry:rect(0,0,16,40)}};
 const entry={input:{priorities:{purpose:'Affordable housing',choices:[]}},result:{housingRoute:'supported'},session:{snapshot:()=>structuredClone(narrow),context:()=>structuredClone(narrow),toolDefinitions:()=>[],renewSignal(){}}};
 const ids=[],errors=[];let round=0;
 const steps=[['interpret_priorities',{items:[{label:'Housing',meaning:'Explore housing',original_excerpt:'Affordable housing',kind:'goal',target:'homes'}]}],['plan_housing_options',{options:options.slice(0,2)}],['test_layout',{...base,homes:2,option_id:'option-1'}],['review_layout',()=>({concept_id:ids[0]})],['test_layout',{...base,width:16,depth:24,option_id:'option-2'}],['review_layout',()=>({concept_id:ids[1]})],['select_layout',()=>({concept_id:ids[1],rationale:'Unplaced',support:[]})],['select_layout',()=>({concept_id:ids[0],rationale:'Placed',support:[]})]];
 const run=createScenarioAgent({apiKey:'fixture',model:'fixture',resolveContext:()=>entry,reserve:()=>()=>{},optionAuditor:async()=>({accepted:true,issues:[]}),fetchImpl:async(_,request)=>{
 const body=JSON.parse(request.body);for(const o of body.input.filter(i=>i.type==='function_call_output').map(i=>JSON.parse(i.output))){if(o.id&&o.metrics&&!ids.includes(o.id))ids.push(o.id);if(o.status==='tool-error')errors.push(o.message);}
 const [name,args]=steps[round++];return new Response(JSON.stringify({output:[{type:'function_call',call_id:'c'+round,name,arguments:JSON.stringify(typeof args==='function'?args():args)}]}));}});
 const r=await run({assessmentVersion:'a'.repeat(20)});assert.equal(r.options.length,1);assert.equal(r.explorations.length,1);assert.equal(r.explorations[0].concept.status,'no-fit');assert.equal(r.testHistory.length,2);assert.ok(errors.some(e=>e.includes('Select a reviewed placed arrangement')));
});
