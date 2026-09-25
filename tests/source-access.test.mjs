import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createUsageBudget} from '../scripts/usage-budget.mjs';
import {createPublicWebClient,publicAddress,webUrl,publicRequest} from '../scripts/public-web.mjs';
import {createEvidenceClient} from '../scripts/evidence-client.mjs';
import {createOfficialSession,directoryMatches,directoryUrl,documentSource} from '../scripts/official-sources.mjs';
import {createResearchSession} from '../scripts/agent-tools.mjs';
import {readPdf} from '../scripts/pdf-reader.mjs';
import {locate} from '../scripts/records.mjs';
const locality={state:'New Jersey',stateAbbr:'NJ',city:'Example',countyBase:'Sample',authority:{type:'municipality',base:'Example',name:'Example city'},label:'Example, NJ'};
const csv='Domain name,Domain type,Organization name,Suborganization name,City,State,Security contact email\nexample.gov,City,City of Example,,Example,NJ,private@example.gov\nwrong.gov,City,City of Example,,Example,NY,x@x.gov\ncounty.gov,County,Sample County,,Sample,NJ,x@x.gov\npolice.gov,City,Example Police,,Example,NJ,x@x.gov\n';
const envelope=(url,text,type='text/html')=>({url,data:Buffer.from(text),contentType:type,hash:'hash',retrievedAt:'2026-09-24T00:00:00Z'});

test('government discovery matches state and authority, excludes police and personal contacts',()=>{
 const r=directoryMatches(csv,locality);assert.deepEqual(r.map(r=>r.url),['https://example.gov/','https://county.gov/']);assert.equal(r[1].scope,'county');assert.ok(!JSON.stringify(r).includes('private@'));
});
test('failed center retains consistent corner discovery clues without claiming full jurisdiction',async()=>{
 let n=0;const read=async url=>{if(n++===0)throw new Error('Source returned 503');return {url,data:{result:{geographies:{States:[{NAME:'New Jersey',STUSAB:'NJ',STATE:'34'}],Counties:[{NAME:'Sample County',BASENAME:'Sample',GEOID:'34123'}],'Incorporated Places':[{NAME:'Example city',BASENAME:'Example',GEOID:'3412345'}]}}}};};
 const r=await locate(read,[{lat:40,lng:-74},{lat:40,lng:-73.999},{lat:40.001,lng:-73.999},{lat:40.001,lng:-74}]);assert.equal(r.locality.city,'Example');assert.equal(r.locality.boundaryUncertain,true);assert.match(r.evidence.text,/center unresolved/);
});
test('public HTTP rejects private DNS, literal IPs, credential URLs and unsafe redirect parameters',async()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.1','::1','::ffff:127.0.0.1','fc00::1','2001:db8::1'])assert.equal(publicAddress(ip),false,ip);
 assert.equal(publicAddress('8.8.8.8'),true);assert.equal(publicAddress('2606:4700:4700::1111'),true);
 for(const u of ['https://127.0.0.1/','http://example.gov/','https://x:y@example.gov/','https://example.gov/?url=https://private/'])assert.throws(()=>webUrl(u));
 await assert.rejects(publicRequest('https://example.gov/',{resolveHost:async()=>[{address:'127.0.0.1',family:4}]}),/Unsupported/);
});
test('public cache deduplicates across cases, isolates objects and rejects unsafe redirects',async()=>{
 let calls=0,time=100;const read=createPublicWebClient({now:()=>time,request:async()=>{calls++;return {status:200,type:'text/plain',buffer:Buffer.from('public')}}});
 const [a,b]=await Promise.all([read('https://example.gov/'),read('https://example.gov/')]);assert.equal(calls,1);a.data[0]=0;assert.equal(Buffer.from(b.data).toString(),'public');
 await read('https://example.gov/');assert.equal(calls,1);time+=900001;await read('https://example.gov/');assert.equal(calls,2);
 const bad=createPublicWebClient({request:async()=>({status:302,location:'https://127.0.0.1/private'})});await assert.rejects(bad('https://example.gov/'),/Unsupported/);
});
test('shared GIS cache retains original retrieval time, expires, and does not cache failures',async()=>{
 let n=0,time=100;const read=createEvidenceClient({now:()=>time,fetchImpl:async()=>{n++;return Response.json({features:[{id:1}]});}});
 const a=await read('https://example.gov/service');a.data.features[0].id=9;
 const b=await read('https://example.gov/service');assert.equal(b.data.features[0].id,1);assert.equal(n,1);assert.equal(a.retrievedAt,b.retrievedAt);
 time+=900001;await read('https://example.gov/service');assert.equal(n,2);
 let attempts=0;const failed=createEvidenceClient({fetchImpl:async()=>{attempts++;return new Response('',{status:403});}});await assert.rejects(failed('https://example.gov/fail'));await assert.rejects(failed('https://example.gov/fail'));assert.equal(attempts,2);
});
test('model usage survives reconstruction, enforces rolling cap and fails closed on corrupt state',()=>{
 const dir=mkdtempSync(join(tmpdir(),'stead-budget-')),file=join(dir,'usage.json');let now=1_000;
 try{assert.equal(createUsageBudget({file,now:()=>now}).reserve('gloo',2,3),true);assert.equal(createUsageBudget({file,now:()=>now}).reserve('gloo',2,3),false);assert.equal(createUsageBudget({file,now:()=>now}).reserve('gloo',1,3),true);now+=86400001;assert.equal(createUsageBudget({file,now:()=>now}).reserve('gloo',3,3),true);writeFileSync(file,'broken');assert.throws(()=>createUsageBudget({file}).reserve('gloo',1,3));}finally{rmSync(dir,{recursive:true,force:true});}
});
test('Gloo can discover official links and read alternative provisions after a 403',async()=>{
 const text='Section 10. Residential uses. Housing shall be permitted only subject to the district use table and applicable development approvals. All exceptions must be checked.';
 const webRead=async url=>{if(url===directoryUrl)return envelope(url,csv,'text/plain');if(url==='https://example.gov/')return envelope(url,'<main><a href="/blocked">Zoning code</a><a href="/zoning.pdf">Zoning ordinance PDF</a><a href="https://gis.example.org/FeatureServer">Parcel GIS</a></main>');if(url.endsWith('/blocked'))throw new Error('Source returned 403');if(url.endsWith('.pdf'))return envelope(url,'%PDF-fixture','application/pdf');throw new Error('Unexpected URL');};
 const s=createOfficialSession({locality,read:async()=>{throw new Error('Source returned 403');},webRead,pdf:async()=>({pages:[{page:1,text}],pageCount:12})});
 const d=await s.discover(),home=await s.inspect(d.sources[0].source_id);const blocked=await s.inspect(home.links.find(l=>l.url.endsWith('/blocked')).source_id);assert.equal(blocked.status,'access-blocked');assert.ok(blocked.alternatives.length);
 const found=await s.inspect(home.links.find(l=>l.url.endsWith('.pdf')).source_id);assert.equal(found.sources[0].kind,'code-provision');assert.match(found.sources[0].url,/#page=1/);assert.equal(found.nextPage,5);assert.equal(found.sources[0].authorityProof[0].url,directoryUrl);await assert.rejects(s.inspect('invented'));
});
test('TOC, drafts and county guidance never become municipal legal permission',()=>{
 const base={title:'Zoning ordinance',url:'https://example.gov/code',scope:'authority',text:'Table of contents '+('Chapter 1 .... 2 Chapter 2 .... 4 '.repeat(7))};assert.equal(documentSource(base),null);
 const text='Housing shall be permitted subject to district restrictions. '.repeat(4);assert.equal(documentSource({...base,text,scope:'county'}).kind,'planning-guidance');assert.equal(documentSource({...base,text,title:'Draft zoning ordinance'}).kind,'planning-guidance');
 assert.equal(documentSource({...base,text,title:'Zoning guidance'}).kind,'planning-guidance');
});
test('published HTML base resolves relative links and removes duplicated navigation',async()=>{
 const s=createOfficialSession({locality,read:async()=>{throw new Error('Unavailable');},webRead:async url=>url===directoryUrl?envelope(url,csv):envelope('https://example.gov/departments/index.html','<base href="https://example.gov/"><a href="departments/planning">Planning</a><a href="departments/planning">Planning</a><a href="voter">Voter registration</a>')});
 const d=await s.discover(),page=await s.inspect(d.sources[0].source_id);assert.equal(page.links.length,1);assert.equal(page.links[0].url,'https://example.gov/departments/planning');assert.equal(page.sources.length,0);
});
test('agent accepts a government-linked parcel service and queries geometry, not its title',async()=>{
 const points=[{lat:29,lng:-95},{lat:29,lng:-94.999},{lat:29.001,lng:-94.999},{lat:29.001,lng:-95}];
 const read=async url=>({url,data:{result:{geographies:{States:[{NAME:'New Jersey',STUSAB:'NJ',STATE:'34'}],Counties:[{NAME:'Sample County',BASENAME:'Sample',GEOID:'34123'}],'Incorporated Places':[{NAME:'Example city',BASENAME:'Example',GEOID:'3412345'}]}}}});
 const webRead=async url=>{if(url===directoryUrl)return envelope(url,csv,'text/plain');if(url==='https://example.gov/')return envelope(url,'<a href="https://gis.example.org/FeatureServer/0">Parcel GIS</a>');if(url.includes('/query'))return envelope(url,JSON.stringify({features:[{attributes:{APN:'P1',OWNER:'Never pass this'},geometry:{rings:[[[-95,29],[-94.999,29],[-94.999,29.001],[-95,29.001],[-95,29]]]}}]}),'application/json');return envelope(url,JSON.stringify({name:'Parcels',geometryType:'esriGeometryPolygon',fields:[{name:'APN',type:'esriFieldTypeString'}]}),'application/json');};
 const s=createResearchSession({points,priorities:{},query:''},{read,webRead});await s.execute('resolve_location');const d=await s.execute('discover_official_sources');const home=await s.execute('read_official_source',{source_id:d.sources[0].source_id});const maps=await s.execute('read_official_source',{source_id:home.links[0].source_id,kind:'parcel'});assert.equal(s.snapshot().parcel,null);await s.execute('read_map_source',{source_id:maps.sources[0].source_id});assert.equal(s.snapshot().parcel.id,'P1');assert.ok(!JSON.stringify(s.snapshot()).includes('Never pass this'));
});

test('PDF extraction reads bounded pages in a worker and reports physical file pages',async()=>{
 const stream='BT /F1 12 Tf 30 700 Td (Housing shall be permitted subject to district requirements.) Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];let body='%PDF-1.4\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(body.length);body+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}const xref=body.length;body+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 const result=await readPdf(Buffer.from(body));assert.equal(result.pageCount,1);assert.equal(result.pages[0].page,1);assert.match(result.pages[0].text,/Housing shall/);
});
