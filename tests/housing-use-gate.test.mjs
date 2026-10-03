import test from 'node:test';
import assert from 'node:assert/strict';
import {parseReview} from '../scripts/gloo.mjs';
test('absence of zoning alone cannot release a supported housing-use conclusion',()=>{
 const source={id:'guidance',kind:'planning-guidance',title:'Planning guidance',text:'This municipality does not have zoning. Development permits and other requirements still apply.'};
 const support=[{sourceId:'guidance',passageId:'guidance-p1'}];
 const answer={housingRoute:'supported',assessment:{headline:'The housing route needs review',summary:'The published guidance describes a municipality without zoning; it does not establish this development route.',support},findings:[{heading:'Other controls still apply',summary:'The guidance says development requirements remain.',support}],obstacles:[{heading:'Establish the development route',consequence:'The applicable housing controls have not been established.',nextStep:'Clarify the applicable development route with the planning authority.',support}]};
 const payload=()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(answer)}]}]});
 assert.throws(()=>parseReview(payload(),[source]),/Housing-use allowance unsupported/);
 answer.housingRoute='unresolved';assert.equal(parseReview(payload(),[source]).housingRoute,'unresolved');
});
