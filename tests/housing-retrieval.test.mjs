import test from 'node:test';
import assert from 'node:assert/strict';
import {municipalClient,planningContext} from '../scripts/planning-context.mjs';
import {createPublicWebClient,sourceFailure} from '../scripts/public-web.mjs';
import {createOfficialSession,directoryUrl} from '../scripts/official-sources.mjs';
import {createResearchSession} from '../scripts/agent-tools.mjs';
import {housingRetrievalIncomplete,sceneOutcome} from '../spatial-experience.js';
const locality={state:'Washington',stateAbbr:'WA',city:'Example',authority:{name:'Example city',base:'Example',type:'municipality'},label:'Example city, WA'};
const client={ClientID:7,ClientName:'Example',State:{StateAbbreviation:'WA'},Website:'www.example.gov'};
const env=(url,data)=>({url,data,hash:'hash',retrievedAt:'2026-09-29T00:00:00Z'});
const web=(url,text)=>({...env(url,Buffer.from(text)),contentType:'text/html'});
const timeout=()=>Object.assign(new Error('timeout'),{name:'TimeoutError'});
test('directory timeout recovers exact authority independently and shares result and failure receipt',async()=>{
 const calls=[];const read=async url=>{calls.push(url);if(url.includes('stateAbbr?'))throw timeout();assert.match(url,/localapi\/Organizations\/GetByUrlEncodedNames\/wa\/example$/);return env(url,client);};
 const [a,b]=await Promise.all([municipalClient(read,locality),municipalClient(read,locality)]);assert.equal(a.ClientID,7);assert.deepEqual(a,b);assert.equal(calls.length,2);assert.equal(a.discoveryFailures[0].status,'timed-out');assert.match(a.authorityProof.url,/Organizations/);
});
test('independent resolver rejects a different state or governing authority and uncertain boundaries',async()=>{
 for(const wrong of [{...client,State:{StateAbbreviation:'TX'}},{...client,ClientName:'Example County'}]){const read=async url=>{if(url.includes('stateAbbr?'))throw timeout();return env(url,wrong);};await assert.rejects(municipalClient(read,locality));}
 assert.equal(await municipalClient(()=>{throw Error('Must not fetch');},{...locality,boundaryUncertain:true}),null);
});
test('official HTTP canonical redirect is requested over HTTPS only and preserves chain',async()=>{
 const calls=[];const read=createPublicWebClient({request:async url=>{calls.push(url);return calls.length===1?{status:301,location:'http://example.gov/codes/'}:{status:200,type:'text/html',buffer:Buffer.from('Original publication')};}});
 const r=await read('https://example.gov/codes');assert.deepEqual(calls,['https://example.gov/codes','https://example.gov/codes/']);assert.equal(r.redirects[0].httpsUpgrade,true);assert.equal(r.requestedUrl,'https://example.gov/codes');
 const blocked=createPublicWebClient({request:async()=>({status:302,location:'http://127.0.0.1/'})});await assert.rejects(blocked('https://example.gov/'));
 const loop=createPublicWebClient({request:async()=>({status:301,location:'http://example.gov/codes'})});await assert.rejects(loop('https://example.gov/codes'),/loop/);
});
test('safe diagnostics distinguish DNS, TLS, HTTP and timeout without raw provider secrets',()=>{
 for(const [code,stage] of [['ENOTFOUND','dns'],['ERR_TLS_CERT_ALTNAME_INVALID','tls']]){const f=sourceFailure(Object.assign(new Error('secret credential body'),{code}));assert.equal(f.diagnostic.stage,stage);assert.equal(f.diagnostic.code,code);assert.ok(!JSON.stringify(f).includes('secret'));}
 assert.equal(sourceFailure(Object.assign(new Error('secret'),{httpStatus:503})).diagnostic.httpStatus,503);assert.equal(sourceFailure(timeout()).status,'timed-out');
});
test('planning recovery follows an independently verified official root when publisher discovery fails',async()=>{
 const r=await planningContext(async()=>{throw timeout();},locality,{discoverRoots:async()=>({sources:[{url:'https://example.gov/',scope:'authority'}]}),webRead:async url=>web(url,url.endsWith('/')?'<a href="/planning">Planning</a>':'<body><main>The City of Example does not have zoning. Development regulations still apply.<a href="https://library.municode.com/wa/example/codes/code?nodeId=ch">Development code</a></main></body>')});
 assert.equal(r.type,'no-zoning');assert.equal(r.codeLinks.length,1);assert.ok(r.failures.length);
});
test('recovery tracks navigation, guidance, irrelevant and operative outcomes, reuses failed reads, retains relevant frontier beyond six attempts',async()=>{
 let failures=0;const csv='Domain name,Domain type,Organization name,Suborganization name,City,State\nexample.gov,City,City of Example,,Example,WA';
 const s=createOfficialSession({locality,read:async()=>{throw timeout();},webRead:async url=>{
  if(url===directoryUrl)return web(url,csv);
  if(url==='https://example.gov/')return web(url,'<body>'+Array.from({length:8},(_,i)=>`<a href="/planning${i}">Planning ${i}</a>`).join('')+'<a href="/code">Development ordinance</a><a href="/blocked">Zoning code</a></body>');
  if(url.endsWith('/blocked')){failures++;throw Object.assign(new Error('blocked'),{httpStatus:403});}
  if(url.endsWith('/code'))return web(url,'<body><main><h1>Development ordinance</h1>Section 10. New residential construction shall require a development approval. All applicable exceptions and site conditions must be reviewed before approval.</main></body>');
  return web(url,'<body><main>Welcome to this government webpage. No relevant text.</main></body>');
 }});
 const d=await s.discover();const home=await s.inspect(d.sources[0].source_id);assert.equal(home.outcome,'navigation-only');
 for(const e of home.links.filter(e=>e.url.includes('/planning')).slice(0,7))assert.equal((await s.inspect(e.source_id)).outcome,'irrelevant');
 assert.ok(s.frontier().some(e=>e.url.endsWith('/code')));const fail=home.links.find(e=>e.url.endsWith('/blocked'));await s.inspect(fail.source_id);await s.inspect(fail.source_id);assert.equal(failures,1);
 const found=await s.inspect(home.links.find(e=>e.url.endsWith('/code')).source_id);assert.equal(found.outcome,'operative');assert.equal(found.sources[0].authorityProof[0].url,directoryUrl);assert.equal(s.progress().operative,1);
});
test('failed catalog remains recorded when no alternate publication is connected',async()=>{
 const points=[{lat:29,lng:-95},{lat:29,lng:-94.999},{lat:29.001,lng:-94.999},{lat:29.001,lng:-95}];
 const read=async url=>{if(url.includes('census.gov'))return env(url,{result:{geographies:{States:[{NAME:'Washington',STUSAB:'WA',STATE:'53'}],Counties:[{NAME:'Sample County',BASENAME:'Sample',GEOID:'53001'}],'Incorporated Places':[{NAME:'Example city',BASENAME:'Example',GEOID:'5300001'}]}}});throw timeout();};
 const s=createResearchSession({points,priorities:{},query:''},{read});await s.execute('resolve_location');const r=await s.execute('search_code_sections',{query:'residential use'});assert.ok(r.failures.length);assert.ok(s.snapshot().codeAccess.length);assert.equal(s.snapshot().code.length,0);
});
test('technical zero-code result cannot look like a property restriction or completed housing test',()=>{
 const r={parcel:{id:'P'},code:[],narrativeStatus:'partial',retrievalFailures:[{name:'Official publication'}],version:{assessment:'a'}};assert.equal(housingRetrievalIncomplete(r),true);assert.match(sceneOutcome(r,{status:'needs-evidence',assessmentVersion:'a'}),/could not be retrieved/);assert.equal(housingRetrievalIncomplete({...r,code:['operative']}),false);
});
