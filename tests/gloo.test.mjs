import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createFindingsService, handleFindings, validateInput, parseReview } from '../scripts/gloo.mjs';

const input=()=>({points:[{lat:29.76,lng:-95.37},{lat:29.76,lng:-95.369},{lat:29.759,lng:-95.369},{lat:29.759,lng:-95.37}],query:'User supplied location',priorities:{purpose:'Housing conversations',matters:'',exploring:false,choices:['Understand local housing needs']}});
const quote='Residential uses require approval under the conditions of this section.';
const evidence=()=>({schemaVersion:2,caseId:'fixture-records',status:'preliminary',code:['code-1'],parcel:{id:'parcel-A',mappedSquareMeters:1000},zones:[{id:'R'}],locality:{label:'Fixture authority',boundaryUncertain:false},gaps:[{id:'access',title:'Access remains unresolved'}],sources:[{id:'code-1',kind:'code-provision',text:quote,title:'Residential uses'}]});
const support=[{sourceId:'code-1',quote}];
const answer=()=>({assessment:{headline:'Approval conditions need review.',summary:'The retrieved provision requires approval; site access remains unresolved.',support},findings:[{heading:'An approval is required',summary:'Confirm the applicable approval conditions.',support}],obstacles:[{heading:'Approval conditions',consequence:'An approval has not been established.',nextStep:'Confirm this provision with the planning authority.',support}]});
const payload=(a=answer())=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(a)}]}]});
const upstream=()=>new Response(JSON.stringify(payload()));
const options=extra=>({apiKey:'fixture-private',recordsService:async()=>evidence(),fetchImpl:async()=>upstream(),...extra});

test('rejects invalid geometry and preferences before any lookup or paid call',async()=>{
 let calls=0;const review=createFindingsService(options({recordsService:async()=>{calls++;return evidence();}}));
 for(const bad of [null,{...input(),points:[]},{...input(),query:'x'.repeat(241)},{...input(),parcelKey:'https://untrusted.example'},{...input(),priorities:{...input().priorities,choices:['Invent a land value']}}])await assert.rejects(review(bad),e=>e.status===400);
 assert.equal(calls,0);assert.equal(validateInput({...input(),apiKey:'untrusted'}).apiKey,undefined);
});
test('Gloo receives retrieved provisions and gaps; its credential never reaches the result',async()=>{
 let sent;const review=createFindingsService(options({fetchImpl:async(url,opts)=>{sent={url,...opts,body:JSON.parse(opts.body)};return upstream();}}));
 const r=await review(input());assert.equal(r.narrativeStatus,'ready');assert.equal(sent.headers.Authorization,'Bearer fixture-private');assert.equal(sent.redirect,'error');
 const context=JSON.parse(sent.body.input);assert.equal(context.sources[0].passages[0].text,quote);assert.equal(context.unresolved[0].id,'access');assert.equal(JSON.stringify(r).includes('fixture-private'),false);
});
test('no paid interpretation without a matched parcel, one district and stable jurisdiction',async()=>{
 for(const change of [{parcel:null},{zones:[]},{zones:[{id:'R'},{id:'C'}]},{status:'needs-parcel'},{code:[]},{locality:{boundaryUncertain:true}}]){
  let calls=0;const review=createFindingsService(options({recordsService:async()=>({...evidence(),...change}),fetchImpl:async()=>{calls++;return upstream();}}));
  assert.equal((await review(input())).narrativeStatus,'not-ready');assert.equal(calls,0);
 }
});
test('exact source quotations required; invented sources, altered quotes and generated home counts fail closed',()=>{
 const a=answer();a.assessment.support=[{sourceId:'code-1',passageId:'code-1-p1'}];assert.equal(parseReview(payload(a),evidence().sources).assessment.support[0].quote,quote);
 a.assessment.support=[{sourceId:'code-1',passageId:'invented-passage'}];assert.throws(()=>parseReview(payload(a),evidence().sources));
 for(const change of [{support:[{sourceId:'invented',quote}]},{support:[{sourceId:'code-1',quote:'Residential uses are always permitted without any approval.'}]},{summary:'This site supports 40 homes.'},{summary:'<script>alert(1)</script>'}]){
  const a=answer();Object.assign(a.assessment,change);assert.throws(()=>parseReview(payload(a),evidence().sources));
 }
 assert.throws(()=>parseReview({...payload(),status:'incomplete'},evidence().sources));
});
test('deduplicates requests, refreshes changed priorities and caps paid calls',async()=>{
 let calls=0,time=0;const review=createFindingsService(options({now:()=>time,fetchImpl:async()=>{calls++;return upstream();}}));
 await Promise.all([review(input()),review(input())]);await review(input());assert.equal(calls,1);
 for(let i=0;i<3;i++)await review({...input(),priorities:{...input().priorities,matters:`Priority ${i}`}});
 assert.equal(calls,4);const limited=await review({...input(),query:'new context'});assert.equal(limited.narrativeStatus,'unavailable');assert.equal(limited.parcel.id,'parcel-A');assert.equal(calls,4);
 time=16*60*1000;await review(input());assert.equal(calls,5);
});
test('missing key, upstream errors and invalid output preserve records without exposing secrets',async()=>{
 const disconnected=await createFindingsService(options({apiKey:''}))(input());assert.equal(disconnected.parcel.id,'parcel-A');assert.equal(disconnected.narrativeStatus,'unavailable');
 for(const status of [401,402,403,429,500]){
  const r=await createFindingsService(options({fetchImpl:async()=>new Response('secret upstream body',{status})}))(input());
  assert.equal(r.narrativeStatus,'unavailable');assert.equal(r.parcel.id,'parcel-A');assert.equal(JSON.stringify(r).includes('secret upstream body'),false);
 }
 const invalid=await createFindingsService(options({fetchImpl:async()=>new Response('not JSON')}))(input());assert.equal(invalid.narrativeStatus,'unavailable');
});
test('timeout makes no paid retry and preserves the records',async()=>{
 let calls=0;const review=createFindingsService(options({timeoutMs:5,fetchImpl:async(_url,{signal})=>new Promise((resolve,reject)=>{calls++;const timer=setTimeout(()=>resolve(upstream()),100);signal.addEventListener('abort',()=>{clearTimeout(timer);reject(signal.reason);},{once:true});})}));
 const r=await review(input());assert.equal(r.narrativeStatus,'unavailable');assert.equal(r.parcel.id,'parcel-A');assert.equal(calls,1);
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
