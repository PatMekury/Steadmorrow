import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
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
const options=extra=>({apiKey:'fixture-private',sessionFactory,fetchImpl:async(_url,opts)=>{const body=JSON.parse(opts.body);return body.input.some(x=>x.type==='function_call_output')?new Response(JSON.stringify(payload())):response([call('review_evidence')]);},...extra});

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
test('deduplication shares the agent run; daily budget counts every model request',async()=>{
 let calls=0;const base=options();const review=createFindingsService({...base,maxDailyCalls:2,fetchImpl:async(...args)=>{calls++;return base.fetchImpl(...args);}});
 const [a,b]=await Promise.all([review(input()),review(input())]);assert.equal(a.narrativeStatus,'ready');assert.deepEqual(a,b);assert.equal(calls,2);await review(input());assert.equal(calls,2);
 await assert.rejects(review({...input(),query:'Changed input'}),e=>e.status===429&&/budget/.test(e.message));assert.equal(calls,2);
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

test('normal multi-turn property exploration is not stopped by the former 30-call single-response budget',async()=>{
 let now=0;const review=createFindingsService(options({now:()=>now}));
 for(let i=0;i<16;i++){now+=61000;const result=await review({...input(),query:'Property '+i});assert.equal(result.narrativeStatus,'ready');}
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

test('an official no-zoning system is not sent back to find a nonexistent use table',async()=>{
 let calls=0;const review=createFindingsService(options({sessionFactory:()=>({snapshot:()=>({...evidence(),planningSystem:{type:'no-zoning'}}),execute:async()=>({})}),fetchImpl:async()=>++calls===1?response([call('review_evidence')]):new Response(JSON.stringify(payload({...answer(),housingRoute:'unresolved'})))}));
 const r=await review(input());assert.equal(r.narrativeStatus,'partial');assert.equal(calls,2);
});
