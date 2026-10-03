import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createResearchSession} from '../scripts/agent-tools.mjs';
import {createScenarioAgent} from './decision-fixtures.mjs';

const points=[{lng:-95,lat:30},{lng:-94.999,lat:30},{lng:-94.999,lat:30.001},{lng:-95,lat:30.001}];
const geometry=[[points.map(p=>[p.lng,p.lat]).concat([[-95,30]])]];
const params={width:6,depth:9,storeys:2,storey_height:3,spacing:3,edge_clearance:3,angle:0,homes:12,parking_spaces:2};
const purpose={label:'Affordable housing',meaning:'Explore the requested affordable-housing study.',original_excerpt:'Affordable housing',kind:'goal',target:'homes',research_topic:'other'};
const schoolText='How close is the nearest school?';
const school={label:'School distance',meaning:'Measure the distance to a mapped school.',original_excerpt:schoolText,kind:'question',target:'whole-site',research_topic:'school-distance'};
const receipt={originalExcerpt:schoolText,id:'school-receipt',status:'answered',distanceMeters:151,distanceType:'street-route',kind:'school',headline:'151 m to a mapped school',detail:'Straight-line distance; school type is unverified.',feature:{id:'node/1',name:'Mapped School',coordinates:[-95,30],sourceUrl:'https://www.openstreetmap.org/node/1'},searchRadiusMeters:1500};
function setup(){const e={caseId:'b'.repeat(20),status:'preliminary',locality:{label:'Fixture'},parcel:{geometry,id:'fixture'},selectedArea:{geometry},sources:[],priorityMeasurements:[]};return {e,entry:{input:{priorities:{purpose:'Affordable housing',matters:schoolText,choices:[]}},session:{snapshot:()=>structuredClone(e),context:()=>structuredClone(e),renewSignal(){},toolDefinitions:()=>[{type:'function',function:{name:'read_nearby_schools'}}],execute:async()=>{e.priorityMeasurements=[receipt];return {status:'answered',measurement:receipt};}}}};}
function model(steps,inspect=()=>{}){let n=0,id;const errors=[];return {errors,get calls(){return n;},fetchImpl:async(_url,options)=>{const b=JSON.parse(options.body),outputs=b.input.filter(i=>i.type==='function_call_output').map(i=>JSON.parse(i.output));errors.push(...outputs.filter(o=>o.status==='tool-error').map(o=>o.message));id=outputs.findLast(o=>o.id&&o.metrics)?.id??id;inspect(b,n);const [name,value]=steps[n++];return new Response(JSON.stringify({output:[{type:'function_call',call_id:'c'+n,name,arguments:JSON.stringify(typeof value==='function'?value(id):value)}]}));}};}

test('unresolved housing study can finish without a fabricated layout only after factual receipts are attached',async()=>{
 const {entry,e}=setup();entry.result={housingRoute:'unresolved'};e.priorityMeasurements=[receipt];
 const m=model([['interpret_priorities',{items:[purpose,school]}],['finish_unresolved_study',{}],['answer_priority',{priority_id:'priority-1',measurement_id:receipt.id}],['finish_unresolved_study',{}]]);
 const run=createScenarioAgent({optionCount:1,apiKey:'fixture',model:'fixture',fetchImpl:m.fetchImpl,resolveContext:()=>entry,reserve:()=>()=>{}});
 const r=await run({assessmentVersion:'a'.repeat(20)});assert.equal(r.status,'needs-evidence');assert.equal(r.concept,null);assert.equal(r.brief[1].answer.distanceMeters,151);assert(m.errors.some(e=>e.includes('Complete the factual')));
 const cached=await run({assessmentVersion:'a'.repeat(20)});assert.equal(cached.version.scenario,r.version.scenario);assert.equal(m.calls,4);
});
test('interrupted housing research can complete factual priorities without a made-up housing layout',async()=>{
 const {entry,e}=setup();entry.result={narrativeStatus:'unavailable'};e.priorityMeasurements=[receipt];const m=model([['interpret_priorities',{items:[purpose,school]}],['answer_priority',{priority_id:'priority-1',measurement_id:receipt.id}],['finish_unresolved_study',{}]]);
 const r=await createScenarioAgent({optionCount:1,apiKey:'fixture',model:'fixture',fetchImpl:m.fetchImpl,resolveContext:()=>entry,reserve:()=>()=>{}})({assessmentVersion:'a'.repeat(20)});assert.equal(r.status,'needs-evidence');assert.equal(r.concept,null);
});

test('housing purpose cannot be replaced by school question or generic permission request',async()=>{
  const {entry}=setup(),m=model([
    ['interpret_priorities',{items:[school]}],
    ['interpret_priorities',{items:[purpose,school]}],
    ['ask_priority_question',{question:'Do you want me to run a small illustrative detached-block layout study, or do you only need school proximity information?'}],
    ['read_nearby_schools',{radius_meters:1500}],
    ['answer_priority',{priority_id:'priority-1',measurement_id:receipt.id}],
    ['test_layout',params],['review_layout',id=>({concept_id:id})],['select_layout',id=>({concept_id:id,rationale:'A compact arrangement keeps the housing purpose in view.',support:[]})],
  ]);
  const run=createScenarioAgent({optionCount:1,apiKey:'fixture',model:'fixture',fetchImpl:m.fetchImpl,resolveContext:()=>entry,reserve:()=>()=>{}}),r=await run({assessmentVersion:'a'.repeat(20)});
  assert.ok(m.errors.some(e=>e.includes('original housing purpose')));assert.ok(m.errors.some(e=>e.includes('already requested')));assert.ok(r.concept);assert.equal(r.brief[0].originalExcerpt,'Affordable housing');assert.equal(r.brief[1].answer.distanceMeters,151);
});

test('a later concern retains exact earlier free-text excerpts and their measurement receipts',async()=>{
  const {entry,e}=setup();entry.input.priorities.matters='';entry.scenario={version:{scenario:'c'.repeat(20)},refinement:schoolText,brief:[{originalExcerpt:schoolText,answer:receipt}]};e.priorityMeasurements=[receipt];
  const refinement='Leave a place to meet outdoors';let checked=false;const m=model([
    ['interpret_priorities',{items:[purpose,school,{label:'Meet outdoors',meaning:'Keep outdoor gathering in the study.',original_excerpt:refinement,kind:'goal',target:'land',research_topic:'other'}]}],
    ['answer_priority',{priority_id:'priority-1',measurement_id:receipt.id}],['test_layout',params],['review_layout',id=>({concept_id:id})],['select_layout',id=>({concept_id:id,rationale:'A compact arrangement leaves land for gathering.',support:[]})],
  ],(payload,n)=>{if(n===0){const input=JSON.parse(payload.input[0].content);assert.ok(input.originalTexts.includes(schoolText));assert.ok(input.originalTexts.includes(refinement));checked=true;}});
  const run=createScenarioAgent({optionCount:1,apiKey:'fixture',model:'fixture',fetchImpl:m.fetchImpl,resolveContext:()=>entry,reserve:()=>()=>{}}),r=await run({assessmentVersion:'a'.repeat(20),refinement});
  assert.ok(checked);assert.equal(m.errors.length,0);assert.equal(r.brief[1].answer.id,receipt.id);assert.equal(r.brief[2].originalExcerpt,refinement);
});

test('early school receipts attach only to exact original text and reuse the physical lookup',async()=>{
  let reads=0;const raw={elements:[{type:'node',id:1,lon:-95,lat:30,tags:{amenity:'school',name:'Mapped School'}}]};
  const session=createResearchSession({points,priorities:{purpose:'Affordable housing',matters:schoolText,choices:[]}},{webRead:async url=>{reads++;const data=url.includes('valhalla')?{code:'Ok',routes:[{distance:73.5,duration:60,geometry:{type:'LineString',coordinates:[[-94.9995,30.0005],[-95,30]]}}]}:raw;return {data:Buffer.from(JSON.stringify(data)),hash:'fixture',retrievedAt:'2026-09-28T00:00:00Z',url};}});
  await assert.rejects(session.execute('read_nearby_schools',{radius_meters:1500,original_excerpt:'Invented question'}),/exact original excerpt/);assert.equal(reads,0);
  const first=await session.execute('read_nearby_schools',{radius_meters:1500,original_excerpt:schoolText});assert.equal(first.measurement.originalExcerpt,schoolText);assert.equal(first.measurement.status,'answered');
  const prior='Schools for families are important';session.addPriorityTexts([prior]);const second=await session.execute('read_nearby_schools',{radius_meters:1500,original_excerpt:prior});assert.equal(reads,3);assert.equal(second.measurement.originalExcerpt,prior);assert.notEqual(first.measurement.id,second.measurement.id);assert.equal(session.snapshot().priorityMeasurements.length,2);
});

test('leaving an automatic study permits rejoining; a duplicate display cannot start another run',async()=>{
  const source=await readFile(new URL('../land.js',import.meta.url),'utf8');
  const cancel=source.slice(source.indexOf('function cancelScenario()'),source.indexOf('function workBanner('));
  const start=source.slice(source.indexOf('function startAutomaticStudy('),source.indexOf('async function simulateFindings('));
  assert.ok(cancel&&start);const context={calls:0,displays:0};
  vm.runInNewContext(`let restoredVisit=null,findingsOpen=true,scenarioResult=null,scenarioSequence=0,simulationState={},scenarioController={abort(){}};const automaticStudies=new Set(),studyQuestions=new Map();const result={version:{assessment:'version-a'},parcel:{},status:'preliminary'};let lastFindings={result};function simulateFindings(){calls++;simulationState.busy=true;}function displayFindings(){displays++;}${cancel}${start};restoredVisit={savedAt:1};startAutomaticStudy(result);if(calls!==0||automaticStudies.size!==0)throw Error('saved visit started a model run');restoredVisit=null;startAutomaticStudy(result);startAutomaticStudy(result);if(calls!==1)throw Error('duplicate start');cancelScenario();startAutomaticStudy(result);if(calls!==2)throw Error('cancelled study cannot rejoin');cancelScenario();studyQuestions.set('version-a',{question:'Which explicit form?',brief:[]});startAutomaticStudy(result);if(calls!==2||displays!==1||simulationState.question!=='Which explicit form?')throw Error('clarification lost');`,context);
  assert.equal(context.calls,2);assert.equal(context.displays,1);
});


test('an unrelated proximity receipt cannot answer another original question',async()=>{
 const {entry,e}=setup();entry.result={housingRoute:'unresolved'};
 const wrong={...receipt,id:'other-route',originalExcerpt:'How far is the park?'};e.priorityMeasurements=[wrong,receipt];
 const m=model([['interpret_priorities',{items:[purpose,school]}],['answer_priority',{priority_id:'priority-1',measurement_id:wrong.id}],['answer_priority',{priority_id:'priority-1',measurement_id:receipt.id}],['finish_unresolved_study',{}]]);
 const result=await createScenarioAgent({optionCount:1,apiKey:'fixture',model:'fixture',fetchImpl:m.fetchImpl,resolveContext:()=>entry,reserve:()=>()=>{}})({assessmentVersion:'a'.repeat(20)});
 assert(m.errors.some(e=>e.includes('exact original priority')));assert.equal(result.brief[1].answer.id,receipt.id);
});
