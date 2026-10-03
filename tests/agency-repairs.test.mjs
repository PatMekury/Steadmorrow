import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,writeFile,mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {goalItems,concernCoverage,citedAnswer} from '../scripts/concern-contract.mjs';
import {createResearchSession,evidencePassages} from '../scripts/agent-tools.mjs';
import {sourceInventory,sourceCompleteness} from '../scripts/source-completeness.mjs';
import {housingEvidenceBasis} from '../scripts/regulatory-path.mjs';
import {createScenarioAgent} from '../scripts/scenario-agent.mjs';
import {validateLayoutReview,explicitSelections} from '../scripts/layout-decisions.mjs';
import {measureSurroundings,solarPosition,shadowFootprint} from '../scripts/surroundings-effects.mjs';
import {createRunLedger} from '../scripts/run-ledger.mjs';
import {createFindingsService} from '../scripts/gloo.mjs';
import {auditAssessment} from '../scripts/assessment-audit.mjs';
import {auditPriorityAnswer} from '../scripts/priority-audit.mjs';
import {auditHousingOptions} from '../scripts/housing-options-audit.mjs';
import {activateHousingOption,matchingSavedScenario,saveFindingsSession,readFindingsSession} from '../findings-session.js';
import {calculateConcept} from '../scripts/scenario-geometry.mjs';
import {studyView} from '../scripts/study-context.mjs';

const origin=[-95,30],mx=111195*Math.cos(Math.PI/6),geo=([x,y])=>[origin[0]+x/mx,origin[1]+y/111195];
const rect=(x,y,w,h)=>[[[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]].map(geo)]];
const points=rect(0,0,80,60)[0][0].slice(0,4).map(([lng,lat])=>({lng,lat}));
const ref='a'.repeat(20),quote='Residential housing is permitted subject to site review. Recorded covenants and their applicability require separate verification.';
const source={id:'rule',kind:'code-provision',title:'Residential uses',text:quote,passages:[{id:'rule-p1',text:quote}],url:'https://example.gov/code'};
const params={width:6,depth:9,storeys:2,storey_height:3,spacing:3,edge_clearance:2,angle:0,homes:4,parking_spaces:1};
const purpose={label:'Housing',meaning:'Explore housing on the retained property.',original_excerpt:'Housing',kind:'goal',target:'homes'};
const fixtureDesign={household:'Synthetic fixture only',basis:'Test areas, not a residential design.',rooms_per_home:{bedroom_areas_m2:[4],living_dining_m2:5,kitchen_m2:3,bathrooms_m2:3,storage_m2:1,other_m2:0},interior_reserve_percent:20,floor_structure_meters:.3,standards:[],unresolved_checks:['Fixture only.']};
const option={design_brief:fixtureDesign,id:'option-1',title:'Compact homes',housing_model:'independent',use_status:'conditional',applicability:'Residential use is conditional on site review.',dimension_basis:'Compact blocks leave shared space.',typology:'detached',support:[{sourceId:'rule',passageId:'rule-p1'}]};
const makeEntry=(matters='')=>{const e={caseId:'b'.repeat(20),schemaVersion:2,status:'preliminary',sources:[source],code:['rule'],locality:{city:'Fixture'},parcel:{id:'p',geometry:rect(0,0,80,60)},selectedArea:{geometry:rect(0,0,80,60)},siteContext:{geometryVersion:'c'.repeat(20),buildings:[],roads:[],coverage:{queryComplete:true}},priorityMeasurements:[]};return {e,input:{points,priorities:{purpose:'Housing',matters,choices:[]}},result:{housingRoute:'supported'},session:{snapshot:()=>structuredClone(e),context:()=>structuredClone(e),toolDefinitions:()=>[],renewSignal(){}}};};
const response=(name,args,n)=>Response.json({model:'fixture-resolved',usage:{input_tokens:90,output_tokens:20},output:[{type:'function_call',call_id:'call-'+n,name,arguments:JSON.stringify(args)}]});
function scripted(entry,steps,extra={}){let n=0;const payloads=[];const run=createScenarioAgent({optionCount:1,apiKey:'fixture',model:'fixture',resolveContext:()=>entry,reserve:()=>()=>{},...extra,fetchImpl:async(_,request)=>{const payload=JSON.parse(request.body);payloads.push(payload);const state=JSON.parse(payload.input[0].content);assert.ok(n<steps.length,'unexpected model retry: '+JSON.stringify(state.studyState.lastFeedback));const step=typeof steps[n]==='function'?steps[n](state,payload):steps[n];n++;return response(...step,n);}});return {run,payloads};}
const judgment=(s,c=s.studyState.concepts.at(-1))=>({concept_id:c.id,plan_version:s.studyState.planVersion,evidence_version:c.evidenceVersion,observed_receipt_ids:[c.observationId],verdict:c.buildingsCount?'ready-to-compare':'unresolved',priority_findings:s.studyState.brief.map(p=>({priority_id:p.id,status:'tradeoff',finding:'The measured footprint leaves some outdoor land; delivery remains unresolved.'})),limitations:['Access, complete site standards and affordable delivery remain unverified.'],next_action:'Compare the compact arrangement against the alternatives.'});
const select=(s,c=s.studyState.concepts[0])=>({concept_id:c.id,rationale:'The compact arrangement leaves room between buildings.',support:[],selections:(s.studyState.options??[]).filter(o=>o.useStatus==='conditional').map(o=>{const chosen=o.id===c.optionId?c:s.studyState.concepts.find(c=>c.optionId===o.id&&c.buildingsCount);return {option_id:o.id,concept_id:chosen.id,review_id:s.studyState.reviews.find(r=>r.conceptId===chosen.id).id,rationale:'The spacing preserves a useful outdoor area.'};}),unresolved_option_ids:(s.studyState.options??[]).filter(o=>o.useStatus==='unresolved').map(o=>o.id)});

test('mixed clauses and more than four concerns are covered without a preset research taxonomy',async()=>{
 const matters='Keep the hall and check community restrictions; compare shadow effects; check construction noise; check tree loss; check service capacity';
 const session=createResearchSession({points,priorities:{purpose:'Housing',matters,choices:[]}}),parts=['Keep the hall','check community restrictions','compare shadow effects','check construction noise','check tree loss','check service capacity'];
 assert.deepEqual(session.toolDefinitions().map(t=>t.function.name),['interpret_concerns']);
 await assert.rejects(session.execute('interpret_concerns',{items:[{original_excerpt:'Housing',label:'Housing',kind:'goal',research_topic:'housing'}]}),/Uncovered/);
 const result=await session.execute('interpret_concerns',{items:['Housing',...parts].map((text,i)=>({original_excerpt:text,label:text,kind:i<2?'goal':'question',research_topic:i===6?'service-capacity':'user-selected-topic'}))});
 assert.equal(result.concerns.length,7);assert.equal(result.coverageMap.length,2);assert.equal(result.coverageMap[1].priorityIds.length,6);assert.ok(session.toolDefinitions().some(t=>t.function.name==='discover_official_sources'));
});
test('scenario cannot silently drop matters or checkboxes, and recovers a rejected interpretation',async()=>{
 const entry=makeEntry('Keep the hall');entry.input.priorities.choices=['Retain ownership'];entry.result.housingRoute='unresolved';
 const m=scripted(entry,[['interpret_priorities',{items:[purpose]}],s=>{assert.match(s.studyState.lastFeedback,/Uncovered/);return ['interpret_priorities',{items:[purpose,{...purpose,original_excerpt:'Keep the hall',label:'Hall'},{...purpose,original_excerpt:'Retain ownership',label:'Ownership'}]}];},['finish_unresolved_study',{}]]);
 const result=await m.run({assessmentVersion:ref});assert.equal(result.coverageMap.length,3);assert.equal(result.brief.length,3);
});
test('non-route answers require current citations, actual scope and unresolved checks',()=>{
 const priority={id:'p',originalExcerpt:'Are there community restrictions?'},args={status:'partial',answer:'The published rule refers to recorded covenants; their parcel applicability is unknown.',applicability:'Only the retrieved public code was read.',evidence_refs:[{source_id:'rule',passage_id:'rule-p1'}],unresolved_checks:['Obtain applicable recorded instruments.']};
 const context={priority,sources:[source],evidenceVersion:'v'};
 assert.equal(citedAnswer(args,context).support[0].quote,quote);
 assert.throws(()=>citedAnswer({...args,evidence_refs:[]},context),/requires/);
 assert.throws(()=>citedAnswer({...args,evidence_refs:[{source_id:'rule',passage_id:'invented'}]},context),/exact current/);
 assert.throws(()=>citedAnswer({...args,status:'answered'},context),/partial/);
 assert.throws(()=>citedAnswer({...args,answer:'There are no restrictions.'},context),/absence/);
});
test('a mixed factual concern is answered, independently reviewed and retained through completion',async()=>{
 const entry=makeEntry('Are there community restrictions?');entry.result.housingRoute='unresolved';let audits=0;
 const m=scripted(entry,[['interpret_priorities',{items:[purpose,{...purpose,original_excerpt:entry.input.priorities.matters,label:'Restrictions',kind:'question',research_topic:'community-restrictions'}]}],['submit_priority_answer',{priority_id:'priority-1',status:'partial',answer:'The public provision references recorded covenants. Their applicability is unresolved.',applicability:'Only this public provision has been read.',evidence_refs:[{source_id:'rule',passage_id:'rule-p1'}],unresolved_checks:['Check recorded instruments against this parcel.']}],['finish_unresolved_study',{}]],{priorityAuditor:async({answer})=>{audits++;assert.equal(answer.support[0].sourceId,'rule');return {accepted:true};}});
 const result=await m.run({assessmentVersion:ref});assert.equal(audits,1);assert.equal(result.brief[1].answer.status,'partial');assert.equal(result.research.modelCalls,4);assert.equal(result.brief[1].answer.sourceReview.expertApproval,false);
});
test('an open research topic accepts its exact route receipt and rejects another concern receipt',async()=>{
 const entry=makeEntry('nearness to ta an elementary school');entry.result.housingRoute='unresolved';
 entry.e.priorityMeasurements=[{id:'route-good',kind:'elementary school',originalExcerpt:entry.input.priorities.matters,distanceType:'street-route',status:'partial',distanceMeters:777},{id:'route-other',kind:'school',originalExcerpt:'Distance to a different school',distanceType:'street-route',status:'partial'}];
 const m=scripted(entry,[['interpret_priorities',{items:[purpose,{...purpose,original_excerpt:entry.input.priorities.matters,label:'School proximity',kind:'question',research_topic:'school proximity'}]}],['answer_priority',{priority_id:'priority-1',measurement_id:'route-other'}],s=>{assert.match(s.studyState.lastFeedback,/exact original priority/);return ['answer_priority',{priority_id:'priority-1',measurement_id:'route-good'}];},['finish_unresolved_study',{}]]);
 const result=await m.run({assessmentVersion:ref});assert.equal(result.brief[1].answer.id,'route-good');assert.equal(result.brief[1].answer.distanceMeters,777);
});
test('effects detail continuation retains omitted structures and offers only receipts for pending concerns',async()=>{
 const entry=makeEntry('Effects on surrounding structures');entry.e.siteContext.buildings=Array.from({length:40},(_,i)=>({id:'context-'+i,geometry:rect(100+i*10,0,5,5),heightMeters:3}));entry.e.priorityMeasurements=[{id:'other-route',originalExcerpt:'Unrelated school question',distanceType:'street-route'}];
 const question={...purpose,label:'Effects',original_excerpt:entry.input.priorities.matters,kind:'question',research_topic:'surroundings'};
 const m=scripted(entry,[['interpret_priorities',{items:[purpose,question]}],['test_layout',params],s=>['assess_surroundings',{concept_id:s.studyState.concepts[0].id,priority_id:'priority-1',sample_times:[]}],(s,payload)=>{
  const receipt=s.studyState.effects[0];assert.equal(receipt.structuresCoverage.omitted,28);
  const refs=payload.tools.find(t=>t.function.name==='submit_priority_answer').function.parameters.properties.evidence_refs.items.enum;assert(refs.includes('receipt::'+receipt.id));assert(!refs.includes('receipt::other-route'));
  return ['read_surroundings_details',{receipt_id:receipt.id,start_structure:25,count:5}];
 },(s,payload)=>{const detail=JSON.parse(payload.input.findLast(x=>x.type==='function_call_output').output);assert.equal(detail.structures[0].id,'context-24');assert.equal(detail.nextStructure,30);return ['submit_priority_answer',{priority_id:'priority-1',status:'partial',answer:'Mapped separation is measured; environmental effects remain unverified.',applicability:'Only this illustrative massing was measured.',evidence_refs:['receipt::'+s.studyState.effects[0].id],unresolved_checks:['Window orientation and indoor daylight remain unverified.']}];},s=>['review_layout',judgment(s)],s=>['select_layout',select(s)]],{priorityAuditor:async()=>({accepted:true})});
 const result=await m.run({assessmentVersion:ref});assert.equal(result.effects[0].structures.length,40);assert.equal(result.brief[1].answer.receipts[0].structures.length,40);
});
test('short clarification replies retain the initiating refinement and exact server question',async()=>{
 const entry=makeEntry();entry.result.housingRoute='unresolved';
 const first=scripted(entry,[['interpret_priorities',{items:[purpose,{...purpose,original_excerpt:'Add a tall tower',label:'Tower',clarification_issue:'unsupported-explicit-form',clarification_excerpt:'tall tower'}]}],['ask_priority_question',{question:'Would a small apartment building satisfy the housing goal?',priority_id:'priority-1'}]]);
 const pending=await first.run({assessmentVersion:ref,refinement:'Add a tall tower'});assert.equal(pending.clarification.initiatingRefinement,'Add a tall tower');
 const second=scripted(entry,[s=>{assert.equal(s.clarification.question,pending.question);assert.equal(s.clarification.reply,'Yes');assert.ok(s.originalTexts.includes('Add a tall tower'));return ['interpret_priorities',{items:[purpose,{...purpose,original_excerpt:'Add a tall tower',label:'Original form'},{...purpose,original_excerpt:'Yes',label:'Agreed form'}]}];},['finish_unresolved_study',{}]]);
 const done=await second.run({assessmentVersion:ref,refinement:'Yes',clarificationId:pending.clarification.id});assert.equal(done.brief.length,3);assert.equal(entry.clarification,null);
 await assert.rejects(second.run({assessmentVersion:ref,refinement:'Yes',clarificationId:pending.clarification.id}),/no longer matches/);
});
test('bare or unseen layout reviews cannot become selection authority',()=>{
 const c={id:'c',observationId:'o',evidenceVersion:'e',buildings:[{}]},brief=[{id:'p'}];
 assert.throws(()=>validateLayoutReview({concept_id:'c'},{concept:c,brief,planVersion:'v',observed:new Set()}),/later model turn/);
 assert.throws(()=>validateLayoutReview({concept_id:'c'},{concept:c,brief,planVersion:'v',observed:new Set(['o'])}),/versions/);
 const args={plan_version:'v',evidence_version:'e',observed_receipt_ids:['o'],verdict:'ready-to-compare',priority_findings:[],limitations:['A limitation remains.'],next_action:'Compare the retained test.'};
 assert.throws(()=>validateLayoutReview(args,{concept:c,brief,planVersion:'v',observed:new Set(['o'])}),/every original priority/);
});
test('explicit option versions preserve the chosen earlier success and recommendation rationale',async()=>{
 const entry=makeEntry();const m=scripted(entry,[['interpret_priorities',{items:[purpose]}],['plan_housing_options',{options:[option]}],['test_layout',{...params,option_id:'option-1'}],s=>['review_layout',judgment(s)],['test_layout',{...params,width:7,option_id:'option-1'}],s=>['review_layout',judgment(s)],s=>['select_layout',select(s,s.studyState.concepts[0])]],{optionCount:3,optionAuditor:async()=>({accepted:true,issues:[]})});
 const result=await m.run({assessmentVersion:ref});assert.equal(result.options[0].concept.parameters.width,6);assert.equal(result.testHistory.length,2);assert.equal(result.rationale,'The compact arrangement leaves room between buildings.');assert.notEqual(result.rationale,option.dimension_basis);assert.equal(result.recommendedConceptId,result.concept.id);
 const switched=activateHousingOption(result,'option-1');assert.equal(switched.rationale,'The spacing preserves a useful outdoor area.');assert.equal(switched.recommendedConceptId,result.recommendedConceptId);
});
test('replanning uses observed failures, fresh source review and one cumulative run budget',async()=>{
 const entry=makeEntry();entry.e.parcel.geometry=entry.e.selectedArea.geometry=rect(0,0,12,20);let audits=0;
 const m=scripted(entry,[['interpret_priorities',{items:[purpose]}],['plan_housing_options',{options:[option]}],['test_layout',{...params,width:16,depth:24,option_id:'option-1'}],s=>['review_layout',judgment(s)],s=>['revise_housing_plan',{base_plan_version:s.studyState.planVersion,observation_ids:[s.studyState.concepts[0].observationId],reason:'The initial footprint does not fit the narrow site.',options:[{...option,title:'Narrow cottages'}]}],s=>{assert.equal(s.priorTestHistory[0].concept.status,'no-fit');return ['test_layout',{...params,width:4,depth:6,homes:1,parking_spaces:0,option_id:'option-1'}];},s=>['review_layout',judgment(s)],s=>['select_layout',select(s)]],{optionCount:3,optionAuditor:async()=>{audits++;return {accepted:true,issues:[]};}});
 const result=await m.run({assessmentVersion:ref});assert.equal(audits,2);assert.equal(result.research.modelCalls,10);assert.equal(result.testHistory.length,2);assert.equal(result.testHistory[0].concept.status,'no-fit');assert.equal(result.options.length,1);const schema=m.payloads[1].tools.find(t=>t.function.name==='plan_housing_options').function.parameters.properties.options.items.properties.support;assert.deepEqual(schema.items.properties.sourceId.enum,['rule']);assert.deepEqual(schema.items.properties.passageId.enum,['rule-p1']);
});
test('later refinements can see failed and intermediate versions, including attempts from interrupted runs',async()=>{
 const entry=makeEntry();const old=calculateConcept(entry.e,params);entry.studyHistory=[{concept:{...old,id:'earlier',status:'no-fit',buildings:[]},reviewed:false}];
 const m=scripted(entry,[['interpret_priorities',{items:[purpose,{...purpose,original_excerpt:'Keep outdoor space',label:'Outdoor'}]}],s=>{assert.equal(s.priorTestHistory[0].concept.id,'earlier');return ['test_layout',params];},s=>['review_layout',judgment(s)],s=>['select_layout',select(s)]]);
 const result=await m.run({assessmentVersion:ref,refinement:'Keep outdoor space'});assert.equal(result.testHistory.length,2);assert.equal(result.testHistory[0].concept.id,'earlier');
});
test('late sources stay discoverable and incomplete text cannot establish a positive housing route',()=>{
 const sources=Array.from({length:8},(_,i)=>({...source,id:'large-'+i,text:('Residential housing is permitted. '+i+' ').repeat(1200)}));sources.push({...source,id:'late-rule'});
 const inventory=sourceInventory(sources,evidencePassages);assert.equal(inventory.length,9);assert.equal(inventory.at(-1).id,'late-rule');assert.equal(inventory[0].omittedPassageCount>0,true);assert.equal(inventory[0].completeness.availableCharacters,sources[0].text.length);
 assert.equal(housingEvidenceBasis([{sourceId:'rule',quote}], [{...source,truncated:true}],{}),null);
 assert.equal(sourceCompleteness({...source,truncated:true}).omittedCharacters,null);
 const full={...source,text:'a'.repeat(17000)+' A material exception at the end.'};const view=studyView(full);assert.equal(full.text.length,17033);assert.ok(view.observationRange.omittedCharacters>10000);assert.equal(view.observationRange.continuation.source_id,'rule');
});
test('housing-analysis-only citations are included in the independent audit source packet',async()=>{
 const narrative={housingAnalysis:{support:[{sourceId:'rule',quote}],applicability:'Subject to the original conditions.'},assessment:{headline:'The route needs review.',support:[]},findings:[],obstacles:[]};let inspected=false;
 await auditAssessment({narrative,evidence:{sources:[source]},apiKey:'fixture',model:'fixture',fetchImpl:async(_,request)=>{const p=JSON.parse(request.body),packet=JSON.parse(p.input[0].content);assert.equal(packet.sources[0].text,quote);assert.deepEqual(p.tools[0].function.parameters.properties.checks.items.properties.source_excerpt_id.enum,['rule::audit-1','not-a-factual-claim']);inspected=true;return response('record_assessment_audit',{checks:Object.keys(packet.fields).map(field=>({field,verdict:'qualified-or-unknown',source_excerpt_id:'not-a-factual-claim',reason:'Qualified fixture field.',correction:''}))},1);}});assert.equal(inspected,true);
});
test('retry action submits retained failed refinement rather than an empty string',async()=>{
 const s=await readFile(new URL('../spatial-experience.js',import.meta.url),'utf8'),action=s.match(/button\('Try the study again',([^,]+),'site-text-button'\)/)[1];let submitted;
 vm.runInNewContext('('+action+')()',{simulationState:{refinement:'Keep the hall and assess the neighbours'},onSimulate:v=>submitted=v});assert.equal(submitted,'Keep the hall and assess the neighbours');
});
test('receipt identity selects driving and updated geometry for the same destination',async()=>{
 const s=await readFile(new URL('../site-scene.js',import.meta.url),'utf8'),fn=s.slice(s.indexOf('function routeReceipt('),s.indexOf('\n',s.indexOf('function routeReceipt(')));
 const make=(id,mode)=>({id,mode,feature:{id:'node/same'},distanceType:'street-route',route:{geometry:{type:'LineString',coordinates:[[id]]}}});const walk=make('walk','walking'),drive=make('drive','driving'),newer=make('drive-new','driving');const ctx={currentResult:{priorityMeasurements:[walk,drive,newer]},currentScenario:null};vm.runInNewContext(fn+';selected=routeReceipt("drive");updated=routeReceipt("drive-new");wrong=routeReceipt("node/same");',ctx);assert.equal(ctx.selected,drive);assert.equal(ctx.updated,newer);assert.equal(ctx.wrong,undefined);
});
test('explicit fresh findings bypass result and session caches, while ordinary reads reuse the result',async()=>{
 const entry=makeEntry();let sessions=0,calls=0;const support=[{sourceId:'rule',passageId:'rule-p1'}],draft={housingRoute:'supported',assessment:{headline:'A residential path needs review.',summary:'Residential housing remains subject to site review.',support},findings:[{heading:'Site review',summary:'Residential housing is subject to site review.',support}],obstacles:[{heading:'Recorded covenants',consequence:'Applicability remains unresolved.',nextStep:'Check original instruments.',support}]};const service=createFindingsService({apiKey:'fixture',assessmentAuditor:null,maxRounds:8,sessionFactory:()=>{sessions++;return {snapshot:()=>({...entry.e,zones:[],gaps:[]}),execute:async()=>({status:'retrieved'})};},fetchImpl:async(_,request)=>{calls++;return JSON.parse(request.body).input.some(p=>p.type==='function_call_output')?Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(draft)}]}]}):response('review_evidence',{},calls);}});
 const first=await service(entry.input);const cached=await service(entry.input);assert.equal(cached.execution.action,'cached');assert.ok(cached.execution.ageMs>=0);assert.deepEqual(cached.execution.trace.usage,[]);assert.equal(sessions,1);const before=calls;const second=await service({...entry.input,executionIntent:'fresh'});assert.equal(sessions,2);assert.ok(calls>before);assert.equal(second.execution.action,'fresh');assert.equal(first.execution.action,'started');
});
test('decision ledger persists across factory recreation and excludes secrets and private raw response bodies',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'steadmorrow-ledger-'));try{
 const ledger=createRunLedger(dir)({phase:'study',input:{question:'Housing'},prompt:'Check',code:'fixed-code'});ledger.record({type:'model',model:'fixture',responseId:'r',usage:{input_tokens:123,output_tokens:45,output_tokens_details:{reasoning_tokens:12}},raw:'raw-secret',headers:{Authorization:'Bearer secret'}});ledger.observation('test_layout',{width:6,apiKey:'secret'}, {status:'illustrative',id:'measured-receipt',metrics:{footprintSquareMeters:54},geometry:['do not copy']});ledger.record({type:'terminal',status:'completed',rationale:'Keep shared outdoor space.'});
 createRunLedger(dir)({phase:'research',input:{},prompt:'Check',code:'fixed-code',parentRunId:ledger.id});const files=await readdir(dir);assert.equal(files.length,2);const text=await readFile(join(dir,ledger.id+'.jsonl'),'utf8'),events=text.trim().split('\n').map(JSON.parse);assert.equal(events[1].usage.input_tokens,123);assert.equal(events[1].usage.output_tokens_details.reasoning_tokens,12);assert.equal(events[2].observation.id,'measured-receipt');assert.equal(events[2].observation.metrics.footprintSquareMeters,54);assert.equal(events.at(-1).rationale,'Keep shared outdoor space.');assert.doesNotMatch(text,/raw-secret|Bearer|apiKey|do not copy/);assert.equal(events[0].codeHash,'fixed-code');assert.equal(ledger.summary().runId,ledger.id);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('sun direction and shadow sweep have correct physical orientation and scale',()=>{
 const noon=solarPosition('2026-03-20T12:00:00Z',0,0);assert.ok(noon.altitudeDegrees>87&&noon.altitudeDegrees<=90);
 const shape=[[[[0,0],[10,0],[10,10],[0,10],[0,0]]]],shadow=shadowFootprint(shape,10,{altitudeDegrees:45,azimuthDegrees:180});const ys=shadow.flat(2).map(p=>p[1]);assert.ok(Math.abs(Math.max(...ys)-20)<.0001);assert.equal(Math.min(...ys),0);assert.equal(shadowFootprint(shape,10,{altitudeDegrees:-1,azimuthDegrees:180}),null);
});
test('surroundings receipts compare real mapped geometry and retain missing-window and environmental limits',()=>{
 const entry=makeEntry(),concept=calculateConcept(entry.e,{...params,homes:1,parking_spaces:0});entry.e.siteContext.buildings=[{id:'neighbour',geometry:rect(25,0,10,10),heightMeters:null,levels:null}];
 const receipt=measureSurroundings({evidence:entry.e,concept,priority:{originalExcerpt:'What are the effects on surrounding structures and the environment?'},sampleTimes:['2026-12-21T18:00:00Z']});assert.equal(receipt.status,'partial');assert.equal(receipt.conceptId,concept.id);assert.ok(receipt.structures[0].minimumSeparationMeters>0);assert.equal(receipt.structures[0].existingHeightMeters,null);assert.equal(receipt.shadows.length,1);assert.match(receipt.limitations.join(' '),/overlooking|indoor daylight/);assert.match(receipt.limitations.join(' '),/drainage/);
 assert.throws(()=>measureSurroundings({evidence:{...entry.e,caseId:'changed'},concept,priority:{originalExcerpt:'Effects'}}),/current placed/);
});
test('archived attempts retain their old evidence without invalidating current saved options',()=>{
 const entry=makeEntry(),concept=calculateConcept(entry.e,params),old={...concept,evidenceVersion:'older-evidence',contextVersion:'older-context',roadContextVersion:'older-roads'};
 const scenario={status:'illustrative',assessmentVersion:ref,version:{assessment:ref},concept,testHistory:[{concept:old,archived:true}]};const result={...entry.e,version:{assessment:ref}};
 assert.ok(matchingSavedScenario(result,scenario));assert.equal(scenario.testHistory[0].concept.evidenceVersion,'older-evidence');
 const activeStale={...scenario,concept:old};assert.equal(matchingSavedScenario(result,activeStale),null);
 const legacy={...scenario,testHistory:[{concept:old}]};assert.equal(matchingSavedScenario(result,legacy),null);
});
test('pending clarification and failed-refinement context survive local saved reload',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},entry=makeEntry(),input=entry.input;
 const simulationState={question:'Which form?',clarificationId:'clarify-'+ref,initiatingRefinement:'Keep the hall and compare forms',refinement:'Use apartments',error:'The study was interrupted.'};
 assert.equal(saveFindingsSession(storage,{input,lastFindings:{signature:JSON.stringify(input),result:{...entry.e,version:{assessment:ref}},time:1},simulationState}),true);
 const restored=readFindingsSession(storage,input);assert.equal(restored.simulationState.clarificationId,simulationState.clarificationId);assert.equal(restored.simulationState.refinement,'Use apartments');assert.equal(restored.simulationState.initiatingRefinement,'Keep the hall and compare forms');
});
test('generic factual submission cannot replace a required street-route receipt',async()=>{
 const entry=makeEntry('Walking to a library');entry.result.housingRoute='unresolved';const m=scripted(entry,[['interpret_priorities',{items:[purpose,{...purpose,original_excerpt:entry.input.priorities.matters,label:'Library',kind:'question',research_topic:'place-route'}]}],['submit_priority_answer',{priority_id:'priority-1',status:'unresolved',answer:'No measurement was obtained.',applicability:'No route.',evidence_refs:[],unresolved_checks:['Obtain route.']}],s=>{assert.match(s.studyState.lastFeedback,/actual route receipt/);throw new Error('checked route gate');}]);
 await assert.rejects(m.run({assessmentVersion:ref}),/checked route gate/);
});
test('selection rejects omitted option versions, mismatched reviews and inflated rationale claims',()=>{
 const a={id:'a',optionId:'option-1',planVersion:'v',buildings:[{}]},b={id:'b',optionId:'option-2',planVersion:'v',buildings:[{}]},reviews=new Map([['a',{id:'ra',verdict:'ready-to-compare'}],['b',{id:'rb',verdict:'ready-to-compare'}]]),context={options:[{id:'option-1'},{id:'option-2'}],concepts:new Map([['a',a],['b',b]]),reviews,planVersion:'v'};
 const args={concept_id:'a',selections:[{option_id:'option-1',concept_id:'a',review_id:'ra',rationale:'Room remains around buildings.'}],unresolved_option_ids:[]};
 assert.throws(()=>explicitSelections(args,context),/Every planned option/);
 assert.throws(()=>explicitSelections({...args,selections:[{...args.selections[0],review_id:'rb'}]},context),/exact current/);
 assert.throws(()=>explicitSelections({...args,selections:[{...args.selections[0],rationale:'This is approved housing.'}]},context),/legal/);
});


test('noncontiguous source passage reads retain exact omitted ranges and the next unread passage',()=>{
 const s={...source,text:Array.from({length:1100},(_,i)=>'word'+i).join(' ')};
 const all=evidencePassages(s),requested=new Map([[s.id,new Set([all[8].id,all[9].id])]]);
 const [item]=sourceInventory([s],evidencePassages,requested);
 assert.equal(item.continuation.start_passage,1);assert.deepEqual(item.omittedPassageRanges,[{start:1,end:8},{start:11,end:11}]);
 assert.equal(item.passages[0].wordRange.start,800);
});

test('factual review sees complete cited originals, measured quantities and unresolved scope together',async()=>{
 const original={...source,text:quote+' '+('Retained context. '.repeat(500))+' Important final qualification.'};
 const answer=citedAnswer({status:'partial',answer:'The measured separation is six metres.',applicability:'A geometric comparison only.',evidence_refs:['rule::rule-p1','receipt::m'],unresolved_checks:['Window orientation remains unverified.']},{priority:{originalExcerpt:'Effects'},sources:[original],measurements:[{id:'m',originalExcerpt:'Effects',status:'partial',minimumSeparationMeters:6,geometry:['renderer-only']}],evidenceVersion:'e'});
 const audit=await auditPriorityAnswer({priority:{originalExcerpt:'Effects'},answer,sources:[original],apiKey:'fixture',model:'fixture',fetchImpl:async(_,request)=>{const p=JSON.parse(request.body),packet=JSON.parse(p.input[0].content);assert.equal(packet.sources[0].text,original.text);assert.equal(packet.answer.receipts[0].minimumSeparationMeters,6);assert.deepEqual(packet.answer.unresolvedChecks,['Window orientation remains unverified.']);assert.ok(!JSON.stringify(packet).includes('renderer-only'));return response('record_priority_audit',{accepted:true,reason:'The measured partial answer preserves its limits.'},1);}});assert.equal(audit.accepted,true);
});

test('option review accepts only supplied option IDs from its structured decision',async()=>{
 const invoke=id=>auditHousingOptions({options:[{...option,support:[{sourceId:'rule',quote}]}],evidence:{sources:[source]},assessment:{},apiKey:'fixture',model:'fixture',fetchImpl:async(_,request)=>{const p=JSON.parse(request.body);assert.deepEqual(p.tools[0].function.parameters.properties.issues.items.properties.optionId.enum,['option-1']);return response('record_option_audit',{accepted:false,issues:[{optionId:id,reason:'Retain an explicit conditional qualification.'}]},1);}});
 assert.equal((await invoke('option-1')).accepted,false);await assert.rejects(invoke('overall-assessment'),/Invalid independent/);
});


test('completed factual answers retire redundant submissions while goals remain layout judgments',async()=>{
 const entry=makeEntry('Are there community restrictions?');entry.result.housingRoute='unresolved';
 const m=scripted(entry,[['interpret_priorities',{items:[purpose,{...purpose,original_excerpt:entry.input.priorities.matters,label:'Restrictions',kind:'question'}]}],['submit_priority_answer',{priority_id:'priority-1',status:'partial',answer:'The public provision references covenants; applicability remains unresolved.',applicability:'Only the supplied provision is available.',evidence_refs:['rule::rule-p1'],unresolved_checks:['Check recorded instruments.']}],(s,p)=>{assert.ok(!p.tools.some(t=>t.function.name==='submit_priority_answer'));assert.equal(s.studyState.brief[1].answer.status,'partial');return ['finish_unresolved_study',{}];}],{priorityAuditor:async()=>({accepted:true,reason:'Qualified.'})});
 assert.equal((await m.run({assessmentVersion:ref})).status,'needs-evidence');
});


test('mixed sentences cannot masquerade as separate concerns by duplicating the full excerpt',()=>{
 const input=[{id:'mixed',text:'Keep a garden; would new buildings affect drainage?'}];
 assert.throws(()=>concernCoverage(input,[{id:'a',originalExcerpt:input[0].text,kind:'goal'},{id:'b',originalExcerpt:input[0].text,kind:'question'}]),/Do not duplicate/);
 const split=concernCoverage(input,[{id:'a',originalExcerpt:'Keep a garden;',kind:'goal'},{id:'b',originalExcerpt:'would new buildings affect drainage?',kind:'question'}]);
 assert.deepEqual(split[0].priorityIds,['b','a']);
});


test('study preserves research-separated questions instead of recombining a mixed sentence',async()=>{
 const question='Are there access obligations, and who would maintain the entrance?';
 const entry=makeEntry(question);entry.result.housingRoute='unresolved';
 const split=['Are there access obligations,','who would maintain the entrance?'];
 entry.e.concernBrief=[{...purpose,originalExcerpt:'Housing'},...split.map(originalExcerpt=>({originalExcerpt,kind:'question'}))];
 const item=original_excerpt=>({...purpose,original_excerpt,label:'Access question',kind:'question'});
 const m=scripted(entry,[(s,p)=>{const items=p.tools.find(t=>t.function.name==='interpret_priorities').function.parameters.properties.items;assert.equal(items.minItems,3);assert.equal(items.maxItems,3);assert.deepEqual(items.items.properties.original_excerpt.enum,['Housing',...split]);return ['interpret_priorities',{items:[purpose,item(question)]}];},s=>{
  assert.match(s.studyState.lastFeedback,/Uncovered/);
  assert.ok(split.every(text=>s.propertyEvidence.concernBrief.some(i=>i.originalExcerpt===text)));
  assert.ok(!s.originalInputs.some(i=>split.includes(i.text)),'Retained interpretations must not masquerade as additional user inputs');
  return ['interpret_priorities',{items:[purpose,...split.map(item)]}];
 },['note_priority_gap',{priority_id:'priority-1',reason:'Recorded access obligations require the applicable instrument.'}],['note_priority_gap',{priority_id:'priority-2',reason:'Maintenance responsibility requires the operative shared-access agreement.'}],['finish_unresolved_study',{}]]);
 const result=await m.run({assessmentVersion:ref});assert.equal(result.brief.length,3);assert.deepEqual(result.brief.slice(1).map(p=>p.originalExcerpt),split);
});


test('a mixed input cannot appear alongside its already represented separate concerns',()=>{
 const text='Nearness to ta an elementary school and the effects of the new building to the surrounding structures';
 const separate=[{id:'school',originalExcerpt:'Nearness to ta an elementary school'},{id:'effects',originalExcerpt:'the effects of the new building to the surrounding structures'}];
 assert.throws(()=>concernCoverage([{id:'input',text}],[{id:'combined',originalExcerpt:text},...separate]),/combined concern/);
 assert.equal(concernCoverage([{id:'input',text}],separate)[0].priorityIds.length,2);
 // One broad effects question with multiple receptors stays one concern.
 const broad='What effects would new housing have on surrounding structures and the environment?';
 assert.equal(concernCoverage([{id:'broad',text:broad}],[{id:'effects',originalExcerpt:broad}])[0].priorityIds.length,1);
 // A shared phrase across distinct inputs does not erase the additional intent.
 assert.equal(concernCoverage([{id:'goal',text:'Housing'},{id:'purpose',text:'Housing with shared space'}],[{id:'a',originalExcerpt:'Housing'},{id:'b',originalExcerpt:'Housing with shared space'}]).length,2);
});


test('actual findings service interprets only original user text and publishes concerns before records',async()=>{
 const matters='nearness to ta an elementary school and the effects of the new building to the surrounding structures';
 const entry=makeEntry(matters);entry.input.query='Church search phrase';
 const progress=[],payloads=[];
 const service=createFindingsService({apiKey:'fixture',assessmentAuditor:null,fetchImpl:async(_url,request)=>{
  const p=JSON.parse(request.body);payloads.push(p);
  if(payloads.length<=2){
   const first=JSON.parse(p.input[0].content);
   assert.deepEqual(first.originalInputs.map(i=>i.text),['Housing',matters]);
   assert.doesNotMatch(p.input[0].content,/selectedArea|userQuery|parcelKey|requiredResearch|Church search phrase|lat|lng/);
   assert.deepEqual(p.tools.map(t=>t.function.name),['interpret_concerns']);
   if(payloads.length===1)return response('interpret_concerns',{items:[{original_excerpt:'Research this property',label:'Invented task',kind:'goal',research_topic:'research'}]},1);
   assert.match(p.input.find(i=>i.type==='function_call_output').output,/Each concern must quote an exact original span/);
   return response('interpret_concerns',{items:[{original_excerpt:'Housing',label:'Housing',kind:'goal',research_topic:'housing'},{original_excerpt:'nearness to ta an elementary school',label:'School proximity',kind:'question',research_topic:'school-distance'},{original_excerpt:'the effects of the new building to the surrounding structures',label:'Surrounding effects',kind:'question',research_topic:'surroundings'}]},2);
  }
  assert.ok(p.tools.some(t=>t.function.name==='resolve_location'));
  assert.match(p.input[0].content,/selectedArea/);
  throw new Error('Stop after the real service accepts interpretation; no external record lookups.');
 }});
 const result=await service(entry.input,{onProgress:p=>progress.push(p)});
 assert.equal(result.concernBrief.length,3);
 assert.ok(progress.some(p=>p.message==='Separating your goals and questions…'));
 assert.ok(progress.some(p=>p.evidence?.concernBrief?.length===3));
 assert.equal(result.research.firstEvidenceMs,null,'Interpretation alone is not property evidence');
 assert.equal(result.research.events[0].outcome,'failed');
 assert.equal(result.research.events[1].outcome,'interpreted');
});


test('agent-selected proposal measurements cannot be replaced by generic source caveats',async()=>{
 const entry=makeEntry('Effects on neighboring structures');let audits=0;
 const question={...purpose,original_excerpt:entry.input.priorities.matters,label:'Surroundings',kind:'question',measurement_needed:'proposal-surroundings'};
 const draft={priority_id:'priority-1',status:'partial',answer:'The code leaves engineering checks unresolved.',applicability:'Only preliminary housing standards are known.',evidence_refs:['rule::rule-p1'],unresolved_checks:['Structural surveys remain unavailable.']};
 const m=scripted(entry,[['interpret_priorities',{items:[purpose,question]}],['submit_priority_answer',draft],s=>{assert.match(s.studyState.lastFeedback,/Plan and test a layout/);assert.equal(audits,0);return ['test_layout',params];},s=>['assess_surroundings',{concept_id:s.studyState.concepts[0].id,priority_id:'priority-1',sample_times:[]}],s=>['submit_priority_answer',{...draft,answer:'This assumed building height is measured; specialist effects remain unresolved.',evidence_refs:['receipt::'+s.studyState.effects[0].id]}],s=>['review_layout',judgment(s)],s=>['select_layout',select(s)]],{priorityAuditor:async()=>{audits++;return {accepted:true};}});
 const result=await m.run({assessmentVersion:ref});assert.equal(audits,1);assert.equal(result.brief[1].measurementNeeded,'proposal-surroundings');assert.equal(result.brief[1].answer.receipts[0].conceptId,result.concept.id);
});

test('rejected option revisions preserve the accepted form with actionable recovery',async()=>{
 const entry=makeEntry();let audits=0;
 const m=scripted(entry,[['interpret_priorities',{items:[purpose]}],['plan_housing_options',{options:[option]}],['test_layout',{...params,option_id:'option-1'}],s=>['revise_housing_plan',{base_plan_version:s.studyState.planVersion,observation_ids:[s.studyState.concepts[0].observationId],reason:'Try an apartment alternative.',options:[{...option,typology:'apartment'}]}],(s,p)=>{assert.equal(s.studyState.options[0].typology,'detached');assert.deepEqual(p.tools.find(t=>t.function.name==='test_layout').function.parameters.properties.typology.enum,['detached']);return ['test_layout',{...params,option_id:'option-1',typology:'apartment'}];},s=>{assert.match(s.studyState.lastFeedback,/CURRENT accepted plan requires option-1 = detached/);return ['review_layout',judgment(s)];},s=>['select_layout',select(s)]],{optionCount:3,optionAuditor:async()=>++audits===1?{accepted:true,issues:[]}:{accepted:false,issues:[{optionId:'option-1',reason:'Unsupported fixture revision.'}]}});
 const result=await m.run({assessmentVersion:ref});assert.equal(result.concept.typology,'detached');assert.equal(result.testHistory.length,1);
});

test('selection offers only proposals with their own attached surroundings receipt',async()=>{
 const entry=makeEntry('Effects on neighboring buildings'),question={...purpose,original_excerpt:entry.input.priorities.matters,label:'Effects',kind:'question',measurement_needed:'proposal-surroundings'};
 const draft={priority_id:'priority-1',status:'partial',answer:'The distance is measured; structural effects still need an engineer.',applicability:'This measurement is for the first proposed arrangement only.',unresolved_checks:['Structural surveys remain unavailable.']};
 const m=scripted(entry,[['interpret_priorities',{items:[purpose,question]}],['test_layout',params],['test_layout',{...params,width:7}],s=>['assess_surroundings',{concept_id:s.studyState.concepts[0].id,priority_id:'priority-1',sample_times:[]}],s=>['submit_priority_answer',{...draft,evidence_refs:['receipt::'+s.studyState.effects[0].id]}],s=>['review_layout',judgment(s,s.studyState.concepts[0])],s=>['review_layout',judgment(s,s.studyState.concepts[1])],(s,p)=>{assert.deepEqual(p.tools.find(t=>t.function.name==='select_layout').function.parameters.properties.concept_id.enum,[s.studyState.concepts[0].id]);return ['select_layout',select(s,s.studyState.concepts[1])];},s=>{assert.match(s.studyState.lastFeedback,/Another proposal/);return ['select_layout',select(s,s.studyState.concepts[0])];}],{priorityAuditor:async()=>({accepted:true})});
 const r=await m.run({assessmentVersion:ref});assert.equal(r.concept.id,r.brief[1].answer.receipts[0].conceptId);
});

test('another sun sample for the same proposal does not reopen its completed partial answer',async()=>{
 const entry=makeEntry('Effects on nearby buildings'),question={...purpose,original_excerpt:entry.input.priorities.matters,label:'Effects',kind:'question',measurement_needed:'proposal-surroundings'};
 const m=scripted(entry,[['interpret_priorities',{items:[purpose,question]}],['test_layout',params],s=>['assess_surroundings',{concept_id:s.studyState.concepts[0].id,priority_id:'priority-1',sample_times:[]}],s=>['submit_priority_answer',{priority_id:'priority-1',status:'partial',answer:'The proposed building has been measured against mapped outlines; other effects need checking.',applicability:'Approximate map measurements for this proposed arrangement.',evidence_refs:['receipt::'+s.studyState.effects[0].id],unresolved_checks:['Actual indoor daylight and structural effects remain unverified.']}],s=>['assess_surroundings',{concept_id:s.studyState.concepts[0].id,priority_id:'priority-1',sample_times:['2026-10-03T17:00:00Z']}],(s,p)=>{assert.equal(p.tools.some(t=>t.function.name==='submit_priority_answer'),false);return ['review_layout',judgment(s)];},s=>['select_layout',select(s)]],{priorityAuditor:async()=>({accepted:true})});
 const r=await m.run({assessmentVersion:ref});assert.equal(r.effects.length,2);assert.equal(r.brief[1].answer.receipts.length,1);assert.equal(r.concept.id,r.brief[1].answer.receipts[0].conceptId);
});
