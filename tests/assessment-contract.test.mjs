import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {evidencePassages} from '../scripts/agent-tools.mjs';
import {housingEvidenceBasis} from '../scripts/regulatory-path.mjs';
import {assessmentSubmission} from '../scripts/gloo.mjs';
const source=JSON.parse(await readFile(new URL('fixtures/residential-performance.json',import.meta.url)));
const guidance={id:'official',kind:'planning-guidance',text:'Houston does not have zoning.'};
const sources=[source,guidance],evidence={planningSystem:{type:'no-zoning',sources:[guidance]}};
test('retained failed case: operative residential introduction is eligible, purpose and parking alone are not',()=>{
 const passages=evidencePassages(source);
 const basis=p=>housingEvidenceBasis([{sourceId:source.id,quote:p.text}],sources,evidence);
 assert.equal(basis(passages[1]),'development-review');
 for(const n of [0,3,4])assert.equal(basis(passages[n]),null);
 const submission=assessmentSubmission(sources,{sources:[{...source,passages}]},evidence);
 assert.deepEqual(submission.tool.function.parameters.properties.housingAnalysis.properties.support.items.enum,[source.id+'::'+passages[1].id]);
 assert.equal(housingEvidenceBasis([{sourceId:source.id,quote:passages[1].text}],[{...source,scopeConflict:true},guidance],evidence),null);
});
