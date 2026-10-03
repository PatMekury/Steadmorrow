import test from 'node:test';
import assert from 'node:assert/strict';
import {auditAssessment} from '../scripts/assessment-audit.mjs';
import {createFindingsService,parseReview} from '../scripts/gloo.mjs';
import {createOfficialSession,directoryUrl} from '../scripts/official-sources.mjs';

const input={points:[{lat:30,lng:-95},{lat:30,lng:-94.999},{lat:30.001,lng:-94.999},{lat:30.001,lng:-95}],query:'Test',priorities:{purpose:'Affordable housing',matters:'',choices:[]}};
const rule={id:'rule',kind:'code-provision',title:'Residential uses',context:'Residence district A',text:'Residential housing is permitted subject to the applicable approval conditions. This provision does not authorize construction before site review. Subdivision is required only if land is divided.'};
const guidance={id:'guide',kind:'planning-guidance',title:'Development guidance',text:'The planning department reviews applications and the recorded property restrictions.'};
const evidence={caseId:'test-evidence',status:'preliminary',assessmentScope:'matched-site',locality:{city:'Example',authority:{type:'municipality'}},code:['rule'],sources:[rule,guidance],parcel:{id:'test-parcel'},gaps:[],zones:[{id:'A'}]};
const ref='rule::rule-p1',guide='guide::guide-p1';
const draft=()=>({housingRoute:'supported',housingAnalysis:{support:[ref],applicability:'The residential use provision covers the matched district.',approvals:'The conditions of site review remain unresolved.',siteLimits:'Physical fit remains untested.',affordability:'Affordable delivery remains unestablished.'},assessment:{headline:'Housing may be possible, subject to site review',summary:'The recorded restrictions still need checking.',support:[guide]},findings:[{heading:'Site review',summary:'Its conditions remain unresolved.',support:[ref]}],obstacles:[{heading:'Site conditions',consequence:'The review conditions remain unresolved.',nextStep:'Confirm which conditions affect the proposed housing.',support:[ref]}]});
const reply=(name,args,id='call')=>Response.json({status:'completed',output:[{type:'function_call',call_id:id,name,arguments:JSON.stringify(args)}]});
const auditReply=(body,issues=[])=>{const packet=JSON.parse(body.input[0].content);return reply('record_assessment_audit',{checks:Object.keys(packet.fields).map(field=>{const issue=issues.find(i=>i.field===field);return {field,verdict:issue?'unsupported':'qualified-or-unknown',source_excerpt_id:issue?.source_excerpt_id??'not-a-factual-claim',reason:issue?.reason??'This fixture remains qualified.',correction:issue?.correction??''};})});};
const expand=value=>{value=structuredClone(value);for(const o of [value.housingAnalysis,value.assessment,...value.findings,...value.obstacles])o.support=o.support.map(r=>{const [sourceId,passageId]=r.split('::');return {sourceId,passageId};});return {output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]};};
test('housing basis is independent of the short assessment citations and retains all four distinctions',()=>{
 const value=parseReview(expand(draft()),evidence.sources,evidence);assert.equal(value.housingBasis,'zoning-use');assert.equal(value.assessment.support[0].sourceId,'guide');assert.equal(value.housingAnalysis.support[0].sourceId,'rule');assert.match(value.housingAnalysis.affordability,/unestablished/);
});
test('an exception-bearing approval route stays conditional in every clause',()=>{
 const exceptionRule={...rule,text:rule.text+' Small alterations are exempt from approval.'},state={...evidence,sources:[exceptionRule,guidance]};
 const d=draft();d.housingAnalysis.approvals='New housing will require site approval; subdivision may require review if land is divided.';
 assert.throws(()=>parseReview(expand(d),state.sources,state),/Unqualified approval obligation in housingAnalysis.approvals/);
 d.housingAnalysis.approvals='New housing generally requires site approval unless an exemption applies; subdivision may require review if land is divided.';d.obstacles[0].nextStep='Ask whether Sec. 42 requires approval or an exception applies.';
 assert.equal(parseReview(expand(d),state.sources,state).housingRoute,'supported');
 d.housingAnalysis.approvals='The provision requires a development plat but lists specific exemptions; applicability depends on whether an exemption applies.';d.assessment.summary='The route supports exploration provided any required approval is obtained.';assert.equal(parseReview(expand(d),state.sources,state).housingRoute,'supported');
});
test('audit reads original sections including exceptions and rejects malformed acceptance',async()=>{
 const narrative=parseReview(expand(draft()),evidence.sources,evidence);let body;
 const audit=await auditAssessment({narrative,evidence,apiKey:'test-secret',model:'test',fetchImpl:async(_url,opts)=>{body=JSON.parse(opts.body);return auditReply(body);}});
 assert.equal(audit.expertApproval,false);const provided=JSON.parse(body.input[0].content);assert.equal(provided.sources.find(s=>s.id==='rule').text,rule.text);assert.equal(provided.sources.find(s=>s.id==='rule').context,'Residence district A');assert(!JSON.stringify(body).includes('test-secret'));
 await assert.rejects(auditAssessment({narrative,evidence,apiKey:'test',model:'test',fetchImpl:async()=>reply('record_assessment_audit',{accepted:true,issues:[{field:'assessment.summary',reason:'Unsupported subdivision obligation',correction:'Make it conditional.'}]})}),/invalid decision/);
});
test('source applicability rejection returns to Gloo for correction without repeating property research',async()=>{
 let modelCalls=0,audits=0;const executed=[];
 const service=createFindingsService({apiKey:'test',maxRounds:5,sessionFactory:()=>({snapshot:()=>evidence,execute:async name=>{executed.push(name);return {};}}),fetchImpl:async(_url,opts)=>{
   const b=JSON.parse(opts.body);modelCalls++;
   if(b.tools.some(t=>t.function.name==='record_assessment_audit')){audits++;return auditReply(b,audits===1?[{field:'assessment.summary',source_excerpt_id:'rule::audit-1',reason:'Subdivision is conditional on dividing land; division has not been established.',correction:'Remove the universal subdivision requirement.'}]:[]);}
   if(modelCalls===1)return reply('review_evidence',{});
   const d=draft();if(audits===0)d.assessment.summary='The project requires subdivision approval.';
   else assert.match(JSON.stringify(b.input),/Subdivision is conditional/);
   return reply('submit_assessment',d,'draft-'+modelCalls);
 }});
 const r=await service(input);assert.equal(r.narrativeStatus,'ready');assert.equal(r.research.modelCalls,5);assert.equal(audits,2);assert.deepEqual(executed,['review_evidence']);assert(!r.assessment.summary.includes('requires subdivision'));assert.equal(r.sourceReview.expertApproval,false);
});
test('audit excerpt references retain exact exception text and reject invented references',async()=>{
 const narrative=parseReview(expand(draft()),evidence.sources,evidence);narrative.assessment.headline='Every project requires subdivision approval.';
 const invoke=bad=>auditAssessment({narrative,evidence,apiKey:'fixture',model:'fixture',fetchImpl:async(_,request)=>{
  const body=JSON.parse(request.body),packet=JSON.parse(body.input[0].content);
  const excerpt=packet.sourceExcerpts.find(x=>x.quote.includes('Subdivision is required only if land is divided.'));
  assert(excerpt);assert.equal(packet.fields['assessment.headline'],narrative.assessment.headline);
  return auditReply(body,[{field:'assessment.headline',source_excerpt_id:bad?'invented':excerpt.id,reason:'Subdivision is conditional on dividing land.',correction:'State the actual trigger.'}]);
 }});
 const result=await invoke(false);assert.equal(result.issues[0].claim,narrative.assessment.headline);assert.ok(rule.text.includes(result.issues[0].sourceQuote));assert.match(result.issues[0].sourceQuote,/only if land is divided/);
 await assert.rejects(invoke(true),/invalid decision/);
});

test('correcting an unrelated draft error does not suppress targeted housing-source recovery',async()=>{
 let n=0,recovered=false;const executed=[];
 const service=createFindingsService({apiKey:'fixture',maxRounds:12,assessmentAuditor:null,sessionFactory:()=>({snapshot:()=>evidence,execute:async name=>{executed.push(name);return {};}}),fetchImpl:async(_,request)=>{
  const b=JSON.parse(request.body);n++;
  if(n===1||n===5)return reply('review_evidence',{},'review-'+n);
  if(n===4){assert.match(JSON.stringify(b.input),/follow-up-needed/);recovered=true;return reply('read_code_sections',{section_ids:['original-section']},'source');}
  const d=draft();if(n<4)d.housingRoute='unresolved';if(n===2)d.assessment.summary='The project requires subdivision approval.';
  return reply('submit_assessment',d,'draft-'+n);
 }});
 const result=await service(input);assert.equal(recovered,true);assert.deepEqual(executed,['review_evidence','read_code_sections','review_evidence']);assert.equal(result.narrativeStatus,'ready');assert.equal(n,6);
});
test('audit permits an editorial note on a qualified recommendation but cannot omit a field',async()=>{
 const narrative=parseReview(expand(draft()),evidence.sources,evidence);
 const invoke=omit=>auditAssessment({narrative,evidence,apiKey:'fixture',model:'fixture',fetchImpl:async(_,request)=>{const body=JSON.parse(request.body),replyData=await auditReply(body).json(),decision=JSON.parse(replyData.output[0].arguments);decision.checks.at(-1).correction='This is a recommended next step, not an affirmative source claim.';if(omit)decision.checks.pop();return reply('record_assessment_audit',decision);}});
 assert.equal((await invoke(false)).accepted,true);await assert.rejects(invoke(true),/every current field/);
});
test('failed review can resume the same sources with a new signal and no new session',async()=>{
 let sessions=0,calls=0,renewed=0,fail=true;
 const service=createFindingsService({apiKey:'test',sessionFactory:()=>{sessions++;return {snapshot:()=>evidence,execute:async()=>({}),renewSignal:()=>{renewed++;}};},fetchImpl:async(_url,opts)=>{calls++;const b=JSON.parse(opts.body);if(b.tools.some(t=>t.function.name==='record_assessment_audit'))return fail?new Response('',{status:503}):auditReply(b);if(!b.tools.some(t=>t.function.name==='submit_assessment'))return reply('review_evidence',{});return reply('submit_assessment',draft());}});
 const first=await service(input);assert.equal(first.narrativeStatus,'unavailable');assert.equal(first.parcel.id,'test-parcel');fail=false;
 const second=await service(input);assert.equal(second.narrativeStatus,'ready');assert.equal(second.research.resumedEvidence,true);assert.equal(sessions,1);assert.equal(renewed,1);assert(calls<10);
});
test('official-source recovery keeps previously discovered IDs when its aborted signal is renewed',async()=>{
 const old=new AbortController(),next=new AbortController();let observed;
 const locality={stateAbbr:'NJ',city:'Example',authority:{type:'municipality',base:'Example',name:'Example city'}};
 const session=createOfficialSession({locality,signal:old.signal,read:async()=>{throw new Error('unavailable');},webRead:async(url,{signal})=>{observed=signal;signal.throwIfAborted();return {url,contentType:'text/html',hash:'test',data:Buffer.from(url===directoryUrl?'Domain name,Domain type,Organization name,Suborganization name,City,State\nexample.gov,City,City of Example,,Example,NJ\n':'<main>Planning department <a href="/code">Development ordinance</a></main>')};}});
 const discovered=await session.discover();old.abort();session.renewSignal(next.signal);const page=await session.inspect(discovered.sources[0].source_id);assert.equal(observed,next.signal);assert(page.links.length);
});
