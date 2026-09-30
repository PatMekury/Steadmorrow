import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,basename,resolve} from 'node:path';
import {createFindingsService,handleFindings,validateInput,parseReview} from '../scripts/gloo.mjs';
const input=()=>({points:[{lat:29.76,lng:-95.37},{lat:29.76,lng:-95.369},{lat:29.759,lng:-95.369},{lat:29.759,lng:-95.37}],query:'User supplied location',priorities:{purpose:'Housing conversations',matters:'',exploring:false,choices:['Understand local housing needs']}});
const quote='Residential uses require approval under the conditions of this section.';
const evidence=()=>({schemaVersion:2,caseId:'fixture-records',status:'preliminary',assessmentScope:'matched-site',code:['code-1'],parcel:{id:'parcel-A',mappedSquareMeters:1000},zones:[{id:'R'}],locality:{label:'Fixture authority',boundaryUncertain:false},gaps:[{id:'access',title:'Access remains unresolved'}],sources:[{id:'code-1',kind:'code-provision',text:quote,title:'Residential uses'}]});
const support=[{sourceId:'code-1',passageId:'code-1-p1'}];
const answer=()=>({housingRoute:'supported',assessment:{headline:'Approval conditions need review.',summary:'The retrieved provision requires approval; site access remains unresolved.',support},findings:[{heading:'An approval is required',summary:'Confirm the applicable approval conditions.',support}],obstacles:[{heading:'Approval conditions',consequence:'An approval has not been established.',nextStep:'Confirm this provision with the planning authority.',support}]});
const payload=(a=answer())=>({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(a)}]}]});
const call=(name,args={},id=name)=>({type:'function_call',call_id:id,name,arguments:JSON.stringify(args)});
const response=output=>new Response(JSON.stringify({status:'completed',output}));
const sessionFactory=()=>({execute:async()=>({ok:true}),snapshot:evidence});
const options=extra=>({assessmentAuditor:null,apiKey:'fixture-private',sessionFactory,fetchImpl:async(_url,opts)=>{const body=JSON.parse(opts.body);return body.input.some(x=>x.type==='function_call_output')?new Response(JSON.stringify(payload())):response([call('review_evidence')]);},...extra});

test('invalid input makes no agent or lookup calls; missing key cannot silently fall back to scripted research',async()=>{
 let calls=0;const review=createFindingsService(options({sessionFactory:()=>{calls++;return sessionFactory();}}));
 for(const bad of [null,{...input(),points:[]},{...input(),query:'x'.repeat(241)},{...input(),parcelKey:'https://untrusted.example'},{...input(),priorities:{...input().priorities,choices:['Invent a land value']}}])await assert.rejects(review(bad),e=>e.status===400);
 assert.equal(calls,0);assert.equal(validateInput({...input(),apiKey:'untrusted'}).apiKey,undefined);
 await assert.rejects(createFindingsService(options({apiKey:''}))(input()),e=>e.status===503);
});
test('real function-call loop replays matching call IDs and retains server-attached citations without credentials',async()=>{
 const requests=[],executed=[];
 const review=createFindingsService(options({sessionFactory:()=>({snapshot:evidence,execute:async(name,args)=>{executed.push({name,args});return {source:'actual tool output'};}}),fetchImpl:async(url,opts)=>{const body=JSON.parse(opts.body);requests.push(body);assert.equal(opts.headers.Authorization,'Bearer fixture-private');assert.equal(opts.redirect,'error');return requests.length===1?response([call('resolve_location')]):requests.length===2?response([call('review_evidence')]):new Response(JSON.stringify(payload()));}}));
 const r=await review(input());assert.equal(r.narrativeStatus,'ready');assert.equal(r.research.mode,'gloo-tool-agent');assert.equal(r.research.modelCalls,3);assert.deepEqual(executed.map(c=>c.name),['resolve_location','review_evidence']);
 assert.ok(requests[0].tools.some(t=>t.function.name==='read_map_source'));assert.equal(requests[1].input.find(x=>x.type==='function_call_output').call_id,'resolve_location');assert.equal(r.assessment.support[0].quote,quote);assert.ok(!JSON.stringify(r).includes('fixture-private'));
});
test('agent observes a source failure and selects an alternative instead of receiving a fixed lookup bundle',async()=>{
 let turn=0;const calls=[];const review=createFindingsService(options({sessionFactory:()=>({snapshot:evidence,execute:async(name,args)=>{calls.push([name,args]);return args.source_id==='failed'?{status:'source-error',followUp:'Try another source'}:{status:'retrieved'};}}),fetchImpl:async(_u,opts)=>{
  turn++;const history=JSON.parse(opts.body).input;
  if(turn===1)return response([call('read_map_source',{source_id:'failed'},'first')]);
  if(turn===2){assert.match(history.find(x=>x.call_id==='first'&&x.type==='function_call_output').output,/source-error/);return response([call('read_map_source',{source_id:'alternative'},'second')]);}
  if(turn===3)return response([call('review_evidence')]);return new Response(JSON.stringify(payload()));
 }}));
 const r=await review(input());assert.equal(r.narrativeStatus,'ready');assert.equal(calls[1][1].source_id,'alternative');assert.equal(r.research.events[0].outcome,'source-error');
});
test('unknown tools and extra fetch URLs never reach the tool executor; loop and output limits preserve evidence',async()=>{
 let executed=0;const review=createFindingsService(options({maxRounds:2,sessionFactory:()=>({snapshot:evidence,execute:async()=>{executed++;return {};}}),fetchImpl:async()=>response([call('run_shell',{cmd:'bad'}),call('resolve_location',{url:'http://127.0.0.1/private'},'unsafe')])}));
 const r=await review(input());assert.equal(executed,0);assert.equal(r.narrativeStatus,'unavailable');assert.equal(r.parcel.id,'parcel-A');assert.equal(r.research.modelCalls,2);
});
test('exact source quotations required; invented references and generated home counts fail closed',()=>{
 assert.equal(parseReview(payload(),evidence().sources).assessment.support[0].quote,quote);
 for(const change of [{support:[{sourceId:'invented',passageId:'code-1-p1'}]},{support:[{sourceId:'code-1',passageId:'invented'}]},{summary:'This site supports 40 homes.'},{summary:'<script>alert(1)</script>'}]){const a=answer();Object.assign(a.assessment,change);assert.throws(()=>parseReview(payload(a),evidence().sources));}
 assert.throws(()=>parseReview({...payload(),status:'incomplete'},evidence().sources));
});
test('deduplication shares the agent run and changed inputs can start fresh research',async()=>{
 let calls=0;const base=options();const review=createFindingsService({...base,fetchImpl:async(...args)=>{calls++;return base.fetchImpl(...args);}});
 const [a,b]=await Promise.all([review(input()),review(input())]);assert.equal(a.narrativeStatus,'ready');assert.deepEqual(a,b);assert.equal(calls,2);await review(input());assert.equal(calls,2);
 assert.equal((await review({...input(),query:'Changed input'})).narrativeStatus,'ready');assert.equal(calls,4);
});
test('ambiguous parcels or unstable jurisdiction never receive a ready site assessment',async()=>{
 for(const change of [{status:'needs-parcel'},{locality:{boundaryUncertain:true}},{code:[]}]){const review=createFindingsService(options({sessionFactory:()=>({execute:async()=>({}),snapshot:()=>({...evidence(),...change})})}));assert.equal((await review(input())).narrativeStatus,change.code?'partial':'not-ready');}
});
test('upstream failure and timeout preserve acquired evidence, make no automatic transport retry and expose no upstream body',async()=>{
 for(const fetchImpl of [async()=>new Response('private upstream body',{status:503}),async(_u,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))]){
  let calls=0;const review=createFindingsService(options({timeoutMs:10,fetchImpl:async(...args)=>{calls++;return fetchImpl(...args);}}));const keepAlive=setTimeout(()=>{},50);const r=await review(input());clearTimeout(keepAlive);assert.equal(calls,1);assert.equal(r.parcel.id,'parcel-A');assert.equal(r.narrativeStatus,'unavailable');assert.ok(!JSON.stringify(r).includes('private upstream'));
 }
});
test('HTTP endpoint rejects other sites, invalid content and large bodies; accepts same-origin JSON',async()=>{
  let calls=0;
  const server=createServer((req,res)=>handleFindings(req,res,async data=>{calls++;validateInput(data);return {evidenceStatus:'user-input-only'};}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}`;
  try {
    const post=(body,headers={})=>fetch(url+'/api/first-look',{method:'POST',headers:{'Content-Type':'application/json',Origin:url,...headers},body});
    assert.equal((await post(JSON.stringify(input()),{Origin:'https://unrelated.example'})).status,403);
    assert.equal((await post(JSON.stringify(input()),{'Content-Type':'text/plain'})).status,415);
    assert.equal((await post('invalid')).status,400);
    assert.equal((await post('x'.repeat(12001))).status,413);
    assert.equal((await fetch(url+'/api/first-look')).status,405);
    const success=await post(JSON.stringify(input()));assert.equal(success.status,200);
    assert.equal(success.headers.get('cache-control'),'no-store');assert.equal(calls,1);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});

test('HTTP agent stream contains real progress and one final result while retaining origin checks',async()=>{
 const server=createServer((req,res)=>handleFindings(req,res,async(data,{onProgress})=>{validateInput(data);onProgress({message:'Checking mapped property records…'});return {...evidence(),narrativeStatus:'ready'};}));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}`;
 try{const response=await fetch(url+'/api/first-look',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/x-ndjson',Origin:url},body:JSON.stringify(input())});assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/ndjson/);const events=(await response.text()).trim().split('\n').map(JSON.parse);assert.deepEqual(events.map(e=>e.type),['progress','result']);assert.equal(events[1].result.parcel.id,'parcel-A');}
 finally{await new Promise(resolve=>server.close(resolve));}
});

test('incomplete research cannot offer repeated evidence reviews instead of a missing lookup',async()=>{
 let read=false,turn=0;
 const review=createFindingsService(options({sessionFactory:()=>({snapshot:evidence,requiredFollowUps:()=>read?[]:['read_code_sections'],execute:async name=>{if(name==='read_code_sections')read=true;return {};}}),fetchImpl:async(_u,opts)=>{
  const body=JSON.parse(opts.body);turn++;
  if(turn===1){assert.ok(!body.tools.some(t=>t.function.name==='review_evidence'));return response([call('read_code_sections',{section_ids:['known']})]);}
  if(turn===2)return response([call('review_evidence')]);
  assert.ok(!body.tools.some(t=>t.function.name==='review_evidence'));return new Response(JSON.stringify(payload()));
 }}));
 assert.equal((await review(input())).narrativeStatus,'ready');assert.equal(turn,3);
});

test('research continues past 480 model calls within one rolling day',async()=>{
 let now=0;const review=createFindingsService(options({now:()=>now}));
 for(let i=0;i<241;i++){now+=61000;const result=await review({...input(),query:'Property '+i});assert.equal(result.narrativeStatus,'ready');}
});

test('zoning tool memoization changes with parcel geometry and cannot reuse the earlier selected-area result',async()=>{
 let turn=0,revision='outline',reads=0;
 const review=createFindingsService(options({sessionFactory:()=>({snapshot:evidence,toolCacheKey:()=>revision,execute:async name=>{if(name==='read_map_source')reads++;if(name==='resolve_location')revision='parcel';return {};}}),fetchImpl:async()=>{
  turn++;if(turn===1||turn===3)return response([call('read_map_source',{source_id:'zone'},'zone-'+turn)]);
  if(turn===2)return response([call('resolve_location')]);if(turn===4)return response([call('review_evidence')]);return new Response(JSON.stringify(payload()));
 }}));assert.equal((await review(input())).narrativeStatus,'ready');assert.equal(reads,2);
});

test('a modest editorial overrun retains the full qualification without another model round; hard bounds remain',async()=>{
 const a=answer();a.assessment.headline='Residential use has a supported route, subject to approval and a separate review of the selected land and access';
 a.assessment.summary='The original provision supports considering housing, subject to its approval conditions. '.repeat(5)+'Access remains unresolved.';
 const review=createFindingsService(options({fetchImpl:async(_u,opts)=>JSON.parse(opts.body).input.some(i=>i.type==='function_call_output')?new Response(JSON.stringify(payload(a))):response([call('review_evidence')])}));
 const r=await review(input());assert.equal(r.narrativeStatus,'ready');assert.equal(r.research.modelCalls,2);assert.equal(r.assessment.summary,a.assessment.summary);assert.equal(r.assessment.support[0].quote,quote);
 a.assessment.headline='x'.repeat(161);assert.throws(()=>parseReview(payload(a),evidence().sources),/assessment.headline/);
 a.assessment.headline='Housing';a.assessment.summary='x'.repeat(701);assert.throws(()=>parseReview(payload(a),evidence().sources),/assessment.summary/);
});

test('readable code with an admitted missing use allowance prompts Gloo to choose a focused recovery',async()=>{
 let turn=0;const executed=[];
 const review=createFindingsService(options({sessionFactory:()=>({snapshot:evidence,execute:async name=>{executed.push(name);return {};}}),fetchImpl:async(_u,opts)=>{
  turn++;if(turn===1||turn===4)return response([call('review_evidence')]);
  if(turn===2)return new Response(JSON.stringify(payload({...answer(),housingRoute:'unresolved'})));
  if(turn===3){assert.match(JSON.stringify(JSON.parse(opts.body).input),/Do not hand that routine lookup back/);return response([call('read_code_sections',{section_ids:['known-use-table']})]);}
  return new Response(JSON.stringify(payload()));
 }}));
 const r=await review(input());assert.equal(r.narrativeStatus,'ready');assert.deepEqual(executed,['review_evidence','read_code_sections','review_evidence']);
});

test('a late subscriber receives acquired evidence immediately and a later model failure retains it',async()=>{
 let acquired=false,turn=0,release,arrived;
 const waiting=new Promise(r=>arrived=r),blocked=new Promise(r=>release=r),progress=[];
 const review=createFindingsService(options({sessionFactory:()=>({snapshot:()=>acquired?evidence():{...evidence(),parcel:null,sources:[],code:[]},execute:async()=>{acquired=true;return {};}}),fetchImpl:async()=>{
  if(++turn===1)return response([call('read_map_source',{source_id:'parcel'})]);arrived();await blocked;return new Response('private upstream response',{status:503});
 }}));
 const first=review(input());await waiting;
 const second=review(input(),{onProgress:e=>progress.push(e)});
 assert.equal(progress[0].evidence.parcel.id,'parcel-A');release();
 const [a,b]=await Promise.all([first,second]);assert.deepEqual(a,b);assert.equal(a.parcel.id,'parcel-A');assert.equal(a.narrativeStatus,'unavailable');assert.equal(turn,2);
});

test('one incomplete model response can recover from retained evidence without executing its unfinished tools',async()=>{
 let turn=0,executed=0;
 const review=createFindingsService(options({sessionFactory:()=>({snapshot:evidence,execute:async()=>{executed++;return {};}}),fetchImpl:async(_u,opts)=>{
  turn++;if(turn===1)return new Response(JSON.stringify({status:'incomplete',output:[call('read_map_source',{source_id:'unfinished'})]}));
  if(turn===2){assert.match(JSON.stringify(JSON.parse(opts.body).input),/parcel-A/);return response([call('review_evidence')]);}
  return new Response(JSON.stringify(payload()));
 }}));
 const r=await review(input());assert.equal(r.narrativeStatus,'ready');assert.equal(executed,1);assert.equal(turn,3);
});

test('a bulk-only citation cannot establish a supported housing-use route',()=>{
 const e=evidence();e.sources[0].title='Residential bulk regulations';
 assert.throws(()=>parseReview(payload(),e.sources),/Housing-use allowance unsupported/);
});

test('no-zoning recovery asks for development review instead of a nonexistent use table',async()=>{
 let calls=0;const requests=[];const review=createFindingsService(options({sessionFactory:()=>({snapshot:()=>({...evidence(),planningSystem:{type:'no-zoning'}}),execute:async()=>({})}),fetchImpl:async(_url,options)=>{const body=JSON.parse(options.body);requests.push(body);calls++;return calls%2?response([call('review_evidence')]):new Response(JSON.stringify(payload({...answer(),housingRoute:'unresolved'})));}}));
 const r=await review(input());assert.equal(r.narrativeStatus,'partial');assert.equal(calls,6);
 const recoveries=requests.flatMap(r=>r.input).filter(x=>x.role==='user'&&typeof x.content==='string'&&x.content.includes('The authority confirms a no-comprehensive-zoning system'));
 assert.ok(recoveries.length);assert.ok(recoveries.every(x=>JSON.parse(x.content).instruction.includes('Do not demand a zoning use table')));
});

test('legacy full, locked and corrupt daily ledgers cannot block research and remain untouched',async()=>{
 const parent=resolve(tmpdir()),dir=await mkdtemp(join(parent,'stead-cap-removal-')),file=join(dir,'research-usage.json');
 try{
  await writeFile(file+'.lock','legacy lock');
  for(const contents of [JSON.stringify({version:1,entries:Array.from({length:480},()=>({bucket:'gloo-model-calls',units:1,time:Date.now()}))}),'invalid legacy ledger']){
   await writeFile(file,contents);
   const review=createFindingsService(options({budgetFile:file,maxDailyCalls:1}));
   const result=await review(input());assert.equal(result.narrativeStatus,'ready');assert.equal(result.research.modelCalls,2);
   assert.equal(await readFile(file,'utf8'),contents);assert.equal(await readFile(file+'.lock','utf8'),'legacy lock');
  }
 }finally{
  if(dirname(dir)!==parent||!basename(dir).startsWith('stead-cap-removal-'))throw new Error('Unexpected cleanup path');
  await rm(dir,{recursive:true,force:true});
 }
});


const submissionAnswer=(value=answer())=>{
 const copy=structuredClone(value);
 copy.housingAnalysis??={support:copy.assessment.support??support,applicability:'The original residential provision covers the proposed use subject to its approval conditions.',approvals:'Approval conditions need confirmation.',siteLimits:'Access remains unresolved.',affordability:'Affordable delivery has not been established.'};
 copy.housingAnalysis.support=copy.housingAnalysis.support.map(s=>typeof s==='string'?s:s.sourceId+'::'+s.passageId);
 for(const item of [copy.assessment,...copy.findings,...copy.obstacles])if(item.support)item.support=item.support.map(s=>typeof s==='string'?s:s.sourceId+'::'+s.passageId);
 return copy;
};
const submit=(value,id='submit')=>response([call('submit_assessment',submissionAnswer(value),id)]);
const researchTurn=n=>response([call('read_code_sections',{section_ids:['section-'+n]},'research-'+n)]);

test('structured citation submission is available immediately after evidence review',async()=>{
 let n=0;const review=createFindingsService(options({fetchImpl:async(_u,opts)=>{
  n++;if(n===1)return response([call('review_evidence')]);
  const body=JSON.parse(opts.body);assert.equal(body.tool_choice,'required');assert(body.tools.some(t=>t.function.name==='submit_assessment'));
  if(n===2){const bad=answer();delete bad.assessment.support;return submit(bad,'early-incomplete');}
  assert.match(JSON.stringify(body.input),/Missing assessmentSubmission.assessment.support/);return submit(answer(),'early-corrected');
 }}));
 const r=await review(input());assert.equal(r.narrativeStatus,'ready');assert.equal(r.research.modelCalls,3);assert.equal(r.research.events.at(-1).tool,'submit_assessment');assert.equal(r.research.events.at(-1).outcome,'validated');
});
test('submission cannot offer supported when no retained operative passage establishes the housing route',async()=>{
 const retained={...evidence(),code:[],sources:[{...evidence().sources[0],kind:'planning-guidance'}]};let calls=0;
 const review=createFindingsService(options({sessionFactory:()=>({snapshot:()=>retained,execute:async()=>({})}),fetchImpl:async(_u,opts)=>{if(++calls===1)return response([call('review_evidence')]);const schema=JSON.parse(opts.body).tools.find(t=>t.function.name==='submit_assessment').function.parameters;assert.deepEqual(schema.properties.housingRoute.enum,['unresolved']);return submit({...answer(),housingRoute:'unresolved'});}}));
 const r=await review(input());assert.equal(r.narrativeStatus,'partial');assert.equal(calls,2);
});
test('an unsupported citation can be corrected using operative evidence already retained',async()=>{
 const retained={...evidence(),sources:[...evidence().sources,{id:'guidance',kind:'planning-guidance',text:'Development guidance describes the planning system, not site-specific housing permission.'}]};let calls=0;
 const guidanceSupport=[{sourceId:'guidance',passageId:'guidance-p1'}];
 const review=createFindingsService(options({sessionFactory:()=>({snapshot:()=>retained,execute:async()=>({})}),fetchImpl:async(_u,opts)=>{
  if(++calls===1)return response([call('review_evidence')]);const schema=JSON.parse(opts.body).tools.find(t=>t.function.name==='submit_assessment').function.parameters;
  if(calls===2){assert(schema.properties.housingRoute.enum.includes('supported'));const a=answer();a.assessment.support=guidanceSupport;return submit(a,'bad-positive');}
  assert(schema.properties.housingRoute.enum.includes('supported'));return submit(answer(),'corrected-citation');
 }}));
 const r=await review(input());assert.equal(r.housingRoute,'supported');assert.equal(r.narrativeStatus,'ready');assert.equal(calls,3);
});

test('final submission requires complete nested fields and actual source-passage pairs, then recovers a missing field',async()=>{
 let calls=0;const errors=[];
 const filteredEvidence=()=>({...evidence(),sources:[...evidence().sources,{id:'title-only',kind:'code-provision',text:'Short heading'},{id:'wrong-district',kind:'code-provision',text:quote,scopeConflict:'Other district'},{id:'navigation-only',kind:'navigation',text:quote}]});
 const review=createFindingsService(options({sessionFactory:()=>({snapshot:filteredEvidence,execute:async()=>({})}),onDiagnostic:e=>{if(e.type==='invalid-assessment')errors.push(e.reason);},fetchImpl:async(_u,opts)=>{
  const body=JSON.parse(opts.body);calls++;
  if(calls<=17)return researchTurn(calls);
  if(calls===18)return response([call('review_evidence')]);
  assert.equal(body.tool_choice,'required');assert.deepEqual(body.tools.map(t=>t.function.name),['submit_assessment']);
  const schema=body.tools[0].function.parameters;
  assert.deepEqual(schema.required,['housingAnalysis','housingRoute','assessment','findings','obstacles']);
  for(const object of [schema.properties.assessment,schema.properties.findings.items,schema.properties.obstacles.items]){
   assert.deepEqual(object.required,Object.keys(object.properties));assert.equal(object.additionalProperties,false);
   assert.deepEqual(object.properties.support.items.enum,['code-1::code-1-p1']);assert.equal(object.properties.support.minItems,1);
  }
  if(calls===19){const bad=answer();delete bad.assessment.support;return submit(bad,'missing-support');}
  assert.equal(calls,20);assert.match(JSON.stringify(body.input),/Missing assessmentSubmission.assessment.support/);
  assert.ok(body.input.some(e=>e.type==='function_call_output'&&e.call_id==='missing-support'));
  return submit(answer(),'corrected');
 }}));
 const r=await review(input());assert.equal(r.narrativeStatus,'ready');assert.equal(r.assessment.support[0].quote,quote);assert.equal(r.research.modelCalls,20);assert.equal(r.research.toolCalls,20);assert.equal(errors.length,1);assert.equal(r.research.events.at(-1).outcome,'validated');
});

test('late unsupported-use function submission recovers a cited partial within twenty calls',async()=>{
 let calls=0;const executed=[],diagnostics=[];
 const retained={...evidence(),sources:[{...evidence().sources[0],title:'Residential bulk regulations'}]};
 const partial={...answer(),housingRoute:'unresolved',assessment:{headline:'Housing-use permission remains unresolved.',summary:'The retrieved bulk provision does not establish housing-use permission. Its applicability and an affordable delivery route remain unresolved.',support}};
 const review=createFindingsService(options({sessionFactory:()=>({snapshot:()=>retained,execute:async name=>{executed.push(name);return {};}}),onDiagnostic:e=>diagnostics.push(e),fetchImpl:async(_u,opts)=>{
  const body=JSON.parse(opts.body);calls++;
  if(calls<=17)return researchTurn(calls);
  if(calls===18){assert.deepEqual(body.tools.map(t=>t.function.name),['review_evidence']);return response([call('review_evidence')]);}
  assert.equal(body.tool_choice,'required');assert.deepEqual(body.tools.map(t=>t.function.name),['submit_assessment']);
  if(calls===19)return submit(answer(),'unsupported-use');
  assert.equal(calls,20);assert.match(JSON.stringify(body.input),/Housing-use allowance unsupported/);return submit(partial,'partial');
 }}));
 const r=await review(input());assert.equal(r.narrativeStatus,'partial');assert.equal(r.housingRoute,'unresolved');assert.equal(r.assessment.summary,partial.assessment.summary);assert.equal(r.assessment.support[0].quote,quote);assert.equal(r.research.modelCalls,20);assert.equal(r.research.toolCalls,20);assert.equal(executed.at(-1),'review_evidence');assert.equal(diagnostics.filter(e=>e.type==='invalid-assessment').length,1);
});

test('structured finalization cannot bypass unfinished mandatory research checks',async()=>{
 let calls=0;
 const review=createFindingsService(options({sessionFactory:()=>({snapshot:evidence,requiredFollowUps:()=>['read_code_sections: operative exception still needs checking'],execute:async()=>({})}),fetchImpl:async(_u,opts)=>{
  const body=JSON.parse(opts.body);calls++;
  if(calls<=17)return researchTurn(calls);
  if(calls===18)return response([call('review_evidence')]);
  assert.equal(calls,19);assert.equal(body.tool_choice,'required');assert.match(JSON.stringify(body.input),/unfinishedChecks/);return submit();
 }}));
 const r=await review(input());assert.equal(r.narrativeStatus,'not-ready');assert.equal(r.assessment,undefined);assert.equal(r.research.modelCalls,19);assert.equal(r.research.toolCalls,19);assert.equal(r.parcel.id,'parcel-A');
});

test('structured finalization rejects unknown citation pairs and numeric claims without relaxing checks or limits',async()=>{
 for(const change of [{summary:'The land fits 12 homes.'},{support:['invented::invented']}]){
  let calls=0;const errors=[];const review=createFindingsService(options({onDiagnostic:e=>{if(e.type==='invalid-assessment')errors.push(e.reason);},fetchImpl:async()=>{
   calls++;if(calls<=17)return researchTurn(calls);if(calls===18)return response([call('review_evidence')]);
   const invalid=answer();Object.assign(invalid.assessment,change);return submit(invalid,'invalid-'+calls);
  }}));
  const r=await review(input());assert.equal(r.narrativeStatus,'unavailable');assert.equal(r.research.modelCalls,20);assert.equal(r.research.toolCalls,20);assert.equal(r.assessment,undefined);assert.equal(r.parcel.id,'parcel-A');assert.equal(errors.length,1);
  assert.match(errors[0],change.summary?/Unsupported site capacity/:/assessmentSubmission.(?:housingAnalysis|assessment).support\[0\]/);
 }
});

test('no research tool executes during the final reserve even if a model requests one',async()=>{
 let calls=0;const executed=[];
 const review=createFindingsService(options({sessionFactory:()=>({snapshot:evidence,execute:async(name,args)=>{executed.push({name,args});return {};}}),fetchImpl:async(_u,opts)=>{
  calls++;if(calls<=17)return researchTurn(calls);
  const body=JSON.parse(opts.body);
  if(calls===18){assert.deepEqual(body.tools.map(t=>t.function.name),['review_evidence']);return response([call('read_code_sections',{section_ids:['forbidden-review-phase']},'closed-review')]);}
  if(calls===19){assert.deepEqual(body.tools.map(t=>t.function.name),['submit_assessment']);return response([call('read_code_sections',{section_ids:['forbidden-submit-phase']},'closed-submit')]);}
  assert.equal(calls,20);return submit();
 }}));
 const r=await review(input());assert.equal(r.narrativeStatus,'ready');assert.equal(executed.length,17);assert.ok(!executed.some(e=>e.args.section_ids?.some(id=>id.startsWith('forbidden'))));assert.equal(r.research.toolCalls,20);assert.equal(r.research.events.filter(e=>e.outcome==='rejected-finalization').length,2);
});


test('mapped landmark designation alone cannot establish a mandatory approval process',()=>{
 const mapped={id:'parcel',kind:'mapped-record',title:'MAPPLUTO parcel',text:'Parcel record: LANDMARK = INDIVIDUAL LANDMARK; SPDist1 = MiD.'},mappedSupport=[{sourceId:'parcel',passageId:'parcel-p1'}];
 const value=answer();value.obstacles=[{heading:'Landmark protection',consequence:'The landmark designation requires Landmarks Preservation Commission review.',nextStep:'Confirm the effect on the selected land.',support:mappedSupport}];
 const sources=[...evidence().sources,mapped];
 for(const consequence of [value.obstacles[0].consequence,'New work must obtain a permit.','An approval is required for new work.','Landmark review is mandatory.']){
  value.obstacles[0].consequence=consequence;
  assert.throws(()=>parseReview(payload(value),sources),/Unsupported approval obligation in obstacles\[0\].consequence/);
 }
 for(const consequence of ['The designation may need a review; confirm its effect on the selected land.','The designation may require Landmarks Preservation Commission review.','Confirm whether Landmarks Preservation Commission review is required.','Would new work require a permit?']){
  value.obstacles[0].consequence=consequence;
  assert.equal(parseReview(payload(value),sources).obstacles[0].consequence,consequence);
 }
});

test('mandatory review can cite an original rule or official guidance without treating a map flag as that rule',()=>{
 const value=answer();
 value.obstacles=[{heading:'Landmark review',consequence:'The proposed work requires Landmarks Preservation Commission review.',nextStep:'Confirm how this provision applies to the selected work.',support:[{sourceId:'landmark-rule',passageId:'landmark-rule-p1'}]}];
 for(const kind of ['code-provision','planning-guidance']){
  const source={id:'landmark-rule',kind,title:'Landmark work review',text:'Proposed exterior work on a designated landmark requires commission review under this provision.'};
  assert.equal(parseReview(payload(value),[...evidence().sources,source]).obstacles[0].consequence,value.obstacles[0].consequence);
 }
});

test('headline plain-language guidance does not reject an otherwise sourced assessment for jargon',async()=>{
 const value=answer();value.assessment.headline='Residential use allowed in C5; landmark and MiD limits remain';
 assert.equal(parseReview(payload(value),evidence().sources).assessment.headline,value.assessment.headline);
 let calls=0;const review=createFindingsService(options({fetchImpl:async(_u,opts)=>{
  calls++;if(calls<=17)return researchTurn(calls);if(calls===18)return response([call('review_evidence')]);
  const schema=JSON.parse(opts.body).tools[0].function.parameters;
  assert.match(schema.properties.assessment.properties.headline.description,/everyday consequence/);
  assert.match(schema.properties.assessment.properties.headline.description,/Do not put district codes/);
  return submit(value);
 }}));
 assert.equal((await review(input())).narrativeStatus,'ready');
});
