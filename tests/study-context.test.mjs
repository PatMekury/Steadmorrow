import test from 'node:test';
import assert from 'node:assert/strict';
import {studyView,studyUpstreamError} from '../scripts/study-context.mjs';
import {createScenarioAgent} from '../scripts/scenario-agent.mjs';

test('model projection preserves receipt facts and source qualifications without mutating scene geometry',()=>{
 const original={originalExcerpt:'nearest police station',answer:{id:'route-1',distanceMeters:836,distanceType:'street-route',sourceUrl:'https://example.gov/source',coverage:'Three candidates, not complete nearest coverage',route:{mode:'walking',geometry:[[1,2],[3,4]],streets:[{geometry:Array(10000).fill([1,2])}]}},sources:[{id:'s1',passages:[{id:'p1',text:'New construction requires review except specified exemptions.'}]}]};
 const before=structuredClone(original),view=studyView(original);
 assert.deepEqual(original,before);assert.equal(view.answer.distanceMeters,836);assert.equal(view.answer.coverage,original.answer.coverage);
 assert.deepEqual(view.sources,original.sources);assert.equal(view.answer.route.mode,'walking');assert.equal(view.answer.route.streets,undefined);assert.equal(view.answer.route.geometry,undefined);
 assert.ok(JSON.stringify(view).length<1000);
});

test('unchanged reviews cannot grow the conversation; evidence changes reopen review and retire old state',async()=>{
 const evidence={caseId:'b'.repeat(20),sources:[{id:'s1',passages:[{id:'p1',text:'A qualified source.'}]}],priorityMeasurements:[{id:'route-1',distanceType:'street-route',kind:'police',distanceMeters:836,route:{streets:[{geometry:Array(20000).fill([1,2])}]}}]};
 let executions=0,requests=0;
 const session={snapshot:()=>structuredClone(evidence),context:()=>structuredClone(evidence),toolDefinitions:()=>[{type:'function',function:{name:'review_evidence'}}],execute:async()=>{executions++;return structuredClone(evidence);}};
 const entry={session,input:{priorities:{purpose:'affordable housing',matters:'nearest police station',choices:[]}},result:{housingRoute:'supported',assessment:{summary:'A qualified development path.'},housingAnalysis:{siteLimits:'Recorded restrictions remain unverified.'}}};
 const run=createScenarioAgent({optionCount:1,apiKey:'fixture',model:'fixture',resolveContext:()=>entry,reserve:()=>()=>{},fetchImpl:async(_url,options)=>{
  const payload=JSON.parse(options.body),state=JSON.parse(payload.input[0].content);
  assert.equal(state.completedAssessment.housingAnalysis.siteLimits,'Recorded restrictions remain unverified.');
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
