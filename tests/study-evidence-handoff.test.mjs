import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mergeStudyEvidence,matchingSavedScenario,saveFindingsSession,readFindingsSession} from '../findings-session.js';
const fixture=()=>{
 const input={points:[{lat:30,lng:-95},{lat:30,lng:-94.999},{lat:30.001,lng:-94.999},{lat:30.001,lng:-95}],query:'Example church',parcelKey:'parcel-1',priorities:{purpose:'Affordable housing'}};
 const original={id:'code-1',url:'https://example.gov/code',hash:'original'};
 const sources=[original,{id:'housing-1',url:'https://example.gov/housing',hash:'context'}];
 const evidence=createHash('sha256').update(JSON.stringify({points:input.points,parcel:input.parcelKey,sources})).digest('hex').slice(0,20);
 const result={schemaVersion:2,caseId:'a'.repeat(20),version:{assessment:'b'.repeat(20),evidence:'a'.repeat(20)},parcel:{key:input.parcelKey},selectedArea:{geometry:[[[[-95,30],[-94.999,30],[-94.999,30.001],[-95,30]]]]},sources:[original],siteContext:{geometryVersion:'c'.repeat(20)},narrativeStatus:'ready'};
 const scenario={assessmentVersion:result.version.assessment,version:{assessment:result.version.assessment,evidence},sources,siteContext:result.siteContext,status:'no-fit',concept:{evidenceVersion:evidence,contextVersion:'c'.repeat(20),buildings:[]},priorityMeasurements:[{originalExcerpt:'Example',distanceMeters:737}]};
 return {input,result,scenario};
};
test('new study sources advance a verified evidence snapshot and survive exact saved reload',async()=>{
 const {input,result,scenario}=fixture();const merged=await mergeStudyEvidence(input,result,scenario);
 assert.equal(merged.caseId,scenario.version.evidence);assert.equal(merged.assessmentEvidenceVersion,result.caseId);assert.equal(merged.version.assessment,result.version.assessment);
 assert.equal(matchingSavedScenario(merged,scenario),scenario);assert.deepEqual(merged.priorityMeasurements,scenario.priorityMeasurements);
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 assert(saveFindingsSession(storage,{input,lastFindings:{signature:JSON.stringify(input),result:merged,time:100},scenario}));
 assert.deepEqual(readFindingsSession(storage,input).scenario,scenario);
});
test('study handoff rejects changed property, points, source content, source omission, geometry and assessment',async()=>{
 for(const mutate of [f=>f.result.parcel.key='other',f=>f.input.points[0].lat+=.001,f=>f.scenario.sources[1].hash='altered',f=>f.scenario.sources.shift(),f=>f.scenario.sources.push(f.scenario.sources[0]),f=>f.scenario.concept.contextVersion='other',f=>f.scenario.siteContext={geometryVersion:'other'},f=>f.scenario.version.assessment='d'.repeat(20),f=>f.scenario.concept.evidenceVersion='e'.repeat(20)]){
  const f=fixture();mutate(f);assert.equal(await mergeStudyEvidence(f.input,f.result,f.scenario),f.result);
 }
});
import {priorityValue} from '../spatial-experience.js';
test('partial route receipts do not appear as a fully answered original priority',()=>{
 assert.equal(priorityValue({answer:{status:'partial',distanceMeters:737}},{result:{}}),'737 m · partial');
 assert.equal(priorityValue({answer:{status:'answered',distanceMeters:737}},{result:{}}),'737 m');
});
