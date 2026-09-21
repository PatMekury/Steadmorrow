import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createFindingsService, handleFindings, validateInput, parseReview } from '../scripts/gloo.mjs';

const input = () => ({points:[{lat:29.76,lng:-95.37},{lat:29.76,lng:-95.369},{lat:29.759,lng:-95.369},{lat:29.759,lng:-95.37}], query:'Houston', priorities:{purpose:'Housing conversations', matters:'', exploring:false, choices:['Understand local housing needs']}});
const answer = {reflection:'You want to understand local housing needs.', questions:[{question:'Whose needs should guide the conversation?',why:'Local evidence can help define the purpose.',ask:'A local housing organization'},{question:'Who can authorize exploration of this land?',why:'Authority is not established by selecting a map area.',ask:'The people responsible for the property records'},{question:'How is this area used today?',why:'A marked area may still support existing activities.',ask:'People who use the space'}], nextStep:'Discuss the available housing-needs evidence with a local housing organization.'};
const payload = (result = answer) => ({status:'completed', output:[{type:'reasoning'}, {type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]}]});
const upstream = result => new Response(JSON.stringify(payload(result)), {status:200});

test('rejects invalid geometry and oversized/unknown preferences before any API call', async () => {
  let calls = 0;
  const review = createFindingsService({apiKey:'fixture-only',fetchImpl:async()=>{calls++; return upstream();}});
  for (const bad of [null,{...input(),points:[]},{...input(),query:'x'.repeat(241)},{...input(),priorities:{...input().priorities,choices:['Invent a land value']}}]) await assert.rejects(review(bad), error => error.status === 400);
  assert.equal(calls,0);
  assert.equal(validateInput({...input(), apiKey:'untrusted-key', model:'untrusted-model'}).apiKey,undefined);
});
test('Gloo call is server-authenticated, bounded and limited to unverified user context', async () => {
  let sent;
  const review = createFindingsService({apiKey:'fixture-private',fetchImpl:async(url,options)=>{sent={url,options,body:JSON.parse(options.body)};return upstream();}});
  const result = await review(input());
  assert.equal(sent.url,'https://platform.ai.gloo.com/ai/v2/guarded/responses');
  assert.equal(sent.options.headers.Authorization,'Bearer fixture-private');
  assert.equal(sent.options.redirect,'error');
  assert.equal(sent.body.max_output_tokens,2200);
  assert.deepEqual(JSON.parse(sent.body.input).verifiedPropertyRecords,[]);
  assert.match(sent.body.instructions,/No property records/);
  assert.equal(result.evidenceStatus,'user-input-only');
  assert.equal(JSON.stringify(result).includes('fixture-private'),false);
});
test('deduplicates concurrent/repeated calls; changed priorities and expired cache request new work', async () => {
  let calls=0, time=0;
  const review=createFindingsService({apiKey:'fixture-only',now:()=>time,fetchImpl:async()=>{calls++; return upstream();}});
  await Promise.all([review(input()),review(input())]);
  await review(input()); assert.equal(calls,1);
  const changed=input(); changed.priorities.matters='Listen to neighbors'; await review(changed); assert.equal(calls,2);
  time=16*60*1000; await review(input()); assert.equal(calls,3);
});
test('caps unique request bursts without automatic paid retries',async()=>{
  let calls=0;
  const review=createFindingsService({apiKey:'fixture-only',now:()=>100,fetchImpl:async()=>{calls++;return upstream();}});
  for(let i=0;i<4;i++) await review({...input(),query:`place ${i}`});
  await assert.rejects(review({...input(),query:'fifth'}),e=>e.status===429);
  assert.equal(calls,4);
});
test('missing key, provider failures and malformed output never become fabricated findings or expose secrets',async()=>{
  await assert.rejects(createFindingsService({apiKey:''})(input()),e=>e.status===503);
  for(const status of [401,402,403,429,500]) {
    const review=createFindingsService({apiKey:'fixture-private',fetchImpl:async()=>new Response('sensitive upstream body',{status})});
    await assert.rejects(review(input()),e=>!e.message.includes('sensitive')&&!e.message.includes('fixture-private')&&e.status>=429);
  }
  for(const malformed of [{...answer,questions:[]},{...answer,nextStep:'https://invented.example'},{...answer,reflection:'<img src=x onerror=alert(1)>'}]) {
    assert.throws(()=>parseReview(payload(malformed)));
  }
  const review=createFindingsService({apiKey:'fixture-private',fetchImpl:async()=>new Response('not JSON')});
  await assert.rejects(review(input()),e=>e.status===502);
});
test('times out without an automatic retry',async()=>{
  const review=createFindingsService({apiKey:'fixture-only',timeoutMs:5,fetchImpl:async(_url,{signal})=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>resolve(upstream()),100);
    signal.addEventListener('abort',()=>{clearTimeout(timer);reject(signal.reason);},{once:true});
  })});
  await assert.rejects(review(input()),e=>e.status===502&&/longer/.test(e.message));
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
