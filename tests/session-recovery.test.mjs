import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createResearchSession} from '../scripts/agent-tools.mjs';
import {createFindingsService,validateInput} from '../scripts/gloo.mjs';
import {sourceCompleteness} from '../scripts/source-completeness.mjs';
const input=validateInput({points:[{lat:30,lng:-95},{lat:30,lng:-94.999},{lat:30.001,lng:-94.999},{lat:30.001,lng:-95}],priorities:{purpose:'Housing',matters:'',choices:[]}});
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
test('local recovery reuses a bound result without model calls and rejects stale or mismatched data',async()=>{
 const evidence=createResearchSession(input).snapshot(),result={...evidence,narrativeStatus:'partial'};
 result.version={evidence:result.caseId,assessment:digest([result.caseId,input.priorities,null,null,null,null,null]).slice(0,20)};
 const record={input,evidence,result,at:1000,completedTools:[]};let calls=0;
 const make=()=>createFindingsService({now:()=>1001,apiKey:'fixture',fetchImpl:async()=>{calls++;throw Error('Unexpected model call');}});
 const review=make();assert.equal(review.restore([record]),1);assert.equal((await review(input)).execution.action,'cached');assert.equal(calls,0);
 assert.equal(make().restore([{...record,at:-3600000}]),0);
 const changed=structuredClone(record);changed.input.priorities.purpose='Different purpose';assert.equal(make().restore([changed]),0);
 const outline=structuredClone(record);outline.evidence.selectedArea.geometry[0][0][0][0]+=.001;assert.equal(make().restore([outline]),0);
});
test('research recovery rejects edited source text and retains original source passages',()=>{
 const original=createResearchSession(input).snapshot(),source={id:'s',kind:'planning-guidance',url:'https://example.gov/code',hash:'original',text:'The original public provision remains qualified.'};source.completeness=sourceCompleteness(source);
 original.sources=[source];original.caseId=digest({points:input.points,sources:[{id:source.id,url:source.url,hash:source.hash}]}).slice(0,20);
 const restored=createResearchSession(input,{initialEvidence:original});assert.equal(restored.snapshot().sources[0].text,source.text);
 original.sources[0].text='Changed source claim';assert.throws(()=>createResearchSession(input,{initialEvidence:original}),/source text/);
});


test('display-only server restore reads retained results beyond cache TTL and never starts research on a miss',async()=>{
 const evidence=createResearchSession(input).snapshot(),result={...evidence,narrativeStatus:'partial'};result.version={evidence:result.caseId,assessment:digest([result.caseId,input.priorities,null,null,null,null,null]).slice(0,20)};
 let calls=0,time=1000000;const review=createFindingsService({now:()=>time,apiKey:'fixture',fetchImpl:async()=>{calls++;throw Error('Unexpected research');}});assert.equal(review.restore([{input,evidence,result,at:1000,completedTools:[]}]),1);
 const restored=await review({...input,executionIntent:'restore'});assert.equal(restored.execution.action,'restored');assert.equal(restored.savedAt,1000);assert.equal(restored.version.assessment,result.version.assessment);
 await assert.rejects(review({...input,priorities:{...input.priorities,purpose:'A different goal'},executionIntent:'restore'}),e=>e.status===404);
 time=3601001;await assert.rejects(review({...input,executionIntent:'restore'}),e=>e.status===404);assert.equal(calls,0);
});
