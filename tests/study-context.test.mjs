import test from 'node:test';
import assert from 'node:assert/strict';
import {studyView,studyMessageView,studyExchangeView,studyCompletionChecks,studyFailure,studyUpstreamError} from '../scripts/study-context.mjs';
import {createScenarioAgent} from '../scripts/scenario-agent.mjs';

test('completion asks for a selected version per option, not new reviews and effects for every abandoned attempt',()=>{
 const options=[{id:'one',useStatus:'conditional'},{id:'two',useStatus:'conditional'}];
 const concepts=[{id:'old-empty',optionId:'one',buildings:[]},{id:'old-placed',optionId:'one',buildings:[{}]},{id:'chosen',optionId:'one',buildings:[{}]},{id:'empty-two',optionId:'two',buildings:[]}];
 const reviews=new Map([['chosen',{verdict:'ready-to-compare',priorityStateVersion:'current'}],['empty-two',{verdict:'unresolved',priorityStateVersion:'current'}]]);
 const checks=()=>studyCompletionChecks({options,concepts,reviews,priorityStateVersion:'current',hasSelectedEffects:c=>c.id==='chosen'});
 assert.deepEqual(checks().optionsNeedingTests,[]);assert.deepEqual(checks().optionsNeedingCurrentCritique,[]);assert.deepEqual(checks().optionsNeedingEffects,[]);
 assert.deepEqual(checks().selectionChoices.map(c=>c.conceptId),['chosen','empty-two']);
 reviews.get('chosen').priorityStateVersion='old-answer';assert.deepEqual(checks().optionsNeedingCurrentCritique[0].candidateConceptIds,['old-placed','chosen']);
});

test('six tests and a revision do not duplicate active concepts, briefs or exact citation text',()=>{
 const quote='Residential development requires review, subject to the stated exceptions. '.repeat(45);
 const designBrief={household:'Family homes',minimumAllocatedAreaPerHomeSquareMeters:85,support:[{sourceId:'rule',quote}]};
 const concepts=Array.from({length:6},(_,i)=>({id:'concept-'+i,optionId:'option-1',status:i===3?'illustrative':'no-fit',parameters:{width:6+i,depth:10},metrics:{homes:i===3?2:0},designBrief,limitations:'This bounded search does not establish capacity.'}));
 const original={originalTexts:['Housing','Effects'],propertyEvidence:{sources:[{id:'rule',passages:[{id:'rule-p1',text:quote}]}]},
   studyState:{brief:[{id:'goal'}],options:[{id:'option-1',designBrief}],concepts:concepts.slice(3),reviews:[]},
   priorTestHistory:concepts.map(concept=>({concept})),previousScenario:{previousTests:concepts}};
 const before=structuredClone(original),view=studyMessageView(original);
 assert.deepEqual(original,before);assert.equal(view.priorTestHistory.length,3);
 assert.deepEqual(view.studyState.concepts.map(c=>c.id),concepts.slice(3).map(c=>c.id));
 assert.equal(view.studyState.options[0].designBrief.support[0].passageId,'rule-p1');
 assert.equal(view.propertyEvidence.sources[0].passages[0].text,quote);
 assert.equal(view.studyState.concepts[0].designBrief,undefined);
 assert.equal(view.studyState.concepts[0].designBriefOptionId,'option-1');
 assert.equal(view.priorTestHistory[0].concept.limitations,concepts[0].limitations);
 assert.ok(JSON.stringify(view).length<JSON.stringify(studyView(original)).length/3);
 const partial={...original,completedAssessment:{support:[{sourceId:'rule',quote:'An unmatched exact exception.'}]}};
 assert.equal(studyMessageView(partial).completedAssessment.support[0].quote,'An unmatched exact exception.');
 assert.equal(studyExchangeView('plan_housing_options',{status:'planned',options:original.studyState.options}).options,undefined);
});

test('study interpretation receives concerns without property or archived layout baggage',()=>{
 const view=studyMessageView({originalTexts:['Housing','Effects'],propertyEvidence:{concernBrief:[{originalExcerpt:'Effects'}],sources:[{text:'Records'}],selectedArea:{geometry:[1,2]}},studyState:{brief:null},priorTestHistory:[{concept:{id:'old'}}]});
 assert.deepEqual(view.propertyEvidence,{concernBrief:[{originalExcerpt:'Effects'}]});assert.deepEqual(view.originalTexts,['Housing','Effects']);assert.equal(view.priorTestHistory.length,0);
});

test('a study timeout produces an actionable study error while keeping existing typed failures',async()=>{
 const entry={input:{priorities:{purpose:'Housing',matters:'',choices:[]}},session:{snapshot:()=>({sources:[]}),context:()=>({sources:[]}),toolDefinitions:()=>[]}};
 const run=createScenarioAgent({resolveContext:()=>entry,reserve:()=>()=>{},fetchImpl:async()=>{throw new DOMException('Private provider details','TimeoutError');}});
 await assert.rejects(run({assessmentVersion:'a'.repeat(20)}),e=>e.status===504&&/housing study ran out of time/.test(e.message)&&!e.message.includes('Private'));
 const typed=Object.assign(new Error('Preserve specific issue'),{status:409});assert.equal(studyFailure(typed),typed);
});

test('model projection preserves receipt facts and source qualifications without mutating scene geometry',()=>{
 const original={originalExcerpt:'nearest police station',answer:{id:'route-1',distanceMeters:836,distanceType:'street-route',sourceUrl:'https://example.gov/source',coverage:'Three candidates, not complete nearest coverage',route:{mode:'walking',geometry:[[1,2],[3,4]],streets:[{geometry:Array(10000).fill([1,2])}]}},sources:[{id:'s1',passages:[{id:'p1',text:'New construction requires review except specified exemptions.'}]}]};
 const before=structuredClone(original),view=studyView(original);
 assert.deepEqual(original,before);assert.equal(view.answer.distanceMeters,836);assert.equal(view.answer.coverage,original.answer.coverage);
 assert.deepEqual(view.sources,original.sources);assert.equal(view.answer.route.mode,'walking');assert.equal(view.answer.route.streets,undefined);assert.equal(view.answer.route.geometry,undefined);
 assert.ok(JSON.stringify(view).length<1000);
});
test('dense surroundings receipts have a bounded model view and an explicit complete-record continuation',()=>{
 const receipt={id:'effects-real',kind:'surroundings-effects',originalExcerpt:'Effects on neighbors',conceptId:'concept',structures:Array.from({length:900},(_,i)=>({id:'building-'+i,minimumSeparationMeters:i+.5})),shadows:[{instant:'2026-12-21T18:00:00Z',groundProjectionOverlaps:[{structureId:'building-800',squareMeters:4}]}],limitations:['Ground projection is not indoor daylight.']};
 const view=studyView(receipt);assert.equal(receipt.structures.length,900);assert.equal(view.structures.length,13);assert.equal(view.structures[0].minimumSeparationMeters,.5);assert.equal(view.structures.at(-1).id,'building-800');assert.equal(view.structuresCoverage.omitted,887);assert.equal(view.structuresCoverage.continuation.receipt_id,receipt.id);assert.deepEqual(view.limitations,receipt.limitations);assert.ok(JSON.stringify(view).length<3000);
});

test('unchanged reviews cannot grow the conversation; evidence changes reopen review and retire old state',async()=>{
 const evidence={caseId:'b'.repeat(20),sources:[{id:'s1',passages:[{id:'p1',text:'A qualified source.'}]}],priorityMeasurements:[{id:'route-1',distanceType:'street-route',kind:'police',distanceMeters:836,route:{streets:[{geometry:Array(20000).fill([1,2])}]}}]};
 let executions=0,requests=0;
 const session={snapshot:()=>structuredClone(evidence),context:()=>structuredClone(evidence),toolDefinitions:()=>[{type:'function',function:{name:'review_evidence'}}],execute:async()=>{executions++;return structuredClone(evidence);}};
 const entry={session,input:{priorities:{purpose:'affordable housing',matters:'nearest police station',choices:[]}},result:{housingRoute:'supported',assessment:{summary:'A qualified development path.'},housingAnalysis:{siteLimits:'Recorded restrictions remain unverified.'}}};
 const run=createScenarioAgent({optionCount:1,apiKey:'fixture',model:'fixture',resolveContext:()=>entry,reserve:()=>()=>{},fetchImpl:async(_url,options)=>{
  const payload=JSON.parse(options.body),state=JSON.parse(payload.input[0].content);
  if(requests)assert.equal(state.completedAssessment.housingAnalysis.siteLimits,'Recorded restrictions remain unverified.');
  assert.equal(state.originalTexts[0],'affordable housing');
  assert.ok(JSON.stringify(payload.input).length<14000,'No cumulative geometry or source copies');
  assert.ok(payload.input.filter(i=>i.type==='function_call').length<=2,'Only complete recent exchanges retained');
  for(const c of payload.input.filter(i=>i.type==='function_call'))assert.equal(payload.input.filter(i=>i.type==='function_call_output'&&i.call_id===c.call_id).length,1);
  const reviewOffered=payload.tools.some(t=>t.function.name==='review_evidence');
  if(requests===1||requests===8)assert.ok(reviewOffered);else assert.equal(reviewOffered,false);
  if(requests===7){evidence.caseId='c'.repeat(20);evidence.sources[0].passages[0].text='Changed qualified source.';}
  if(requests===9){assert.equal(state.propertyEvidence.sources[0].passages[0].text,'Changed qualified source.');throw new Error('fixture finished');}
  const first=requests===0;requests++;return new Response(JSON.stringify({status:'completed',output:[{type:'function_call',call_id:'call-'+requests,name:first?'interpret_priorities':'review_evidence',arguments:first?JSON.stringify({items:[{label:'Housing',meaning:'Explore housing',original_excerpt:'affordable housing',kind:'goal',target:'homes'},{label:'Police route',meaning:'Check the requested route',original_excerpt:'nearest police station',kind:'question',target:'whole-site',research_topic:'place-route'}]}):'{}'}]}));
 }});
 await assert.rejects(run({assessmentVersion:'a'.repeat(20)}),/repeated validation failures/);
 assert.equal(executions,1);assert.equal(evidence.priorityMeasurements[0].route.streets[0].geometry.length,20000);
});

test('typed upstream diagnostics retain status/code/trace without leaking arbitrary provider text',async()=>{
 const events=[];
 const response=new Response(JSON.stringify({error:{name:'CONTEXT_LENGTH_EXCEEDED',trace_id:'trace-123',retryable:false,message:'secret-provider-debug-content'}}),{status:400});
 const error=await studyUpstreamError(response,{round:11,onDiagnostic:e=>events.push(e)});
 assert.equal(error.diagnostic.code,'CONTEXT_LENGTH_EXCEEDED');assert.equal(error.diagnostic.status,400);assert.equal(error.diagnostic.retryable,false);
 assert.match(error.message,/working context/);assert.doesNotMatch(JSON.stringify(events),/secret-provider/);
});

test('completed assessment handoff retires duplicate discovery but keeps targeted research and layout choices',async()=>{
 const evidence={caseId:'b'.repeat(20),sources:[],completedTools:['read_planning_guidance'],siteContext:{status:'ready',coverage:{queryComplete:true},buildings:[]}};
 const names=['read_planning_guidance','review_evidence','read_site_context','search_code_sections'];
 const session={snapshot:()=>evidence,context:()=>evidence,toolDefinitions:()=>names.map(name=>({type:'function',function:{name,parameters:{properties:name==='search_code_sections'?{query:{type:'string'}}:{}}}}))};
 const entry={session,input:{priorities:{purpose:'Housing',matters:'',choices:[]}},result:{narrativeStatus:'ready',housingRoute:'supported',housingAnalysis:{siteLimits:'Access remains unverified.'}}};let n=0;
 const run=createScenarioAgent({optionCount:1,resolveContext:()=>entry,reserve:()=>()=>{},fetchImpl:async(_url,options)=>{
  const payload=JSON.parse(options.body),offered=payload.tools.map(t=>t.function.name);
  if(n++===0){assert.deepEqual(offered,['interpret_priorities']);return new Response(JSON.stringify({output:[{type:'function_call',call_id:'one',name:'interpret_priorities',arguments:JSON.stringify({items:[{label:'Housing',meaning:'Explore housing',original_excerpt:'Housing',kind:'goal',target:'homes'}]})}]}));}
  assert.ok(offered.includes('test_layout'));assert.ok(offered.includes('search_code_sections'));
  for(const name of ['read_planning_guidance','review_evidence','read_site_context'])assert.equal(offered.includes(name),false,name);
  assert.equal(JSON.parse(payload.input[0].content).completedAssessment.housingAnalysis.siteLimits,'Access remains unverified.');
  throw new Error('verified available decisions');
 }});
 await assert.rejects(run({assessmentVersion:'a'.repeat(20)}),/verified available decisions/);
});
