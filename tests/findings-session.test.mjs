import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {findingsSessionKey,maxFindingsSessionCharacters,saveFindingsSession,readFindingsSession,savedFindingsMessage} from '../findings-session.js';

const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
const input=()=>({points:[{lat:30,lng:-95},{lat:30,lng:-94.999},{lat:30.001,lng:-94.999},{lat:30.001,lng:-95}],query:'Example church',parcelKey:null,priorities:{purpose:'Affordable housing',matters:'How close is a school?',choices:[],exploring:false}});
const result=()=>({schemaVersion:2,caseId:'a'.repeat(20),version:{assessment:'b'.repeat(20),evidence:'a'.repeat(20)},selectedArea:{geometry:[[[[-95,30],[-94.999,30],[-94.999,30.001],[-95,30.001],[-95,30]]]]},sources:[{id:'source-1',name:'Public record'}],assessment:'A preliminary finding.',narrativeStatus:'ready',siteContext:{geometryVersion:'c'.repeat(20),buildings:[]}});
const scenario=()=>({assessmentVersion:'b'.repeat(20),version:{assessment:'b'.repeat(20)},status:'illustrative',concept:{evidenceVersion:'a'.repeat(20),contextVersion:'c'.repeat(20),buildings:[{id:'home-1'}]}});
const entry=()=>{const i=input();return {input:i,lastFindings:{signature:JSON.stringify(i),result:result(),time:500},scenario:scenario(),simulationState:{}};};

test('an unresolved agent study retains factual answers across reload only for matching evidence',()=>{
 const s=storage(),e=entry();e.scenario={status:'needs-evidence',assessmentVersion:'b'.repeat(20),version:{assessment:'b'.repeat(20),evidence:'a'.repeat(20)},contextVersion:'c'.repeat(20),concept:null,brief:[{label:'Police route',answer:{distanceType:'street-route',distanceMeters:836}}]};
 assert(saveFindingsSession(s,e));assert.deepEqual(readFindingsSession(s,input()).scenario,e.scenario);
 e.scenario.contextVersion='obsolete';saveFindingsSession(s,e);assert.equal(readFindingsSession(s,input()).scenario,null);
});

test('a same-input session restores exact findings and version-matched concept without changing the evidence timestamp',()=>{
  const s=storage(),e=entry();assert.equal(saveFindingsSession(s,e,1000),true);
  const saved=readFindingsSession(s,input());assert.deepEqual(saved.lastFindings,e.lastFindings);assert.deepEqual(saved.scenario,e.scenario);assert.equal(saved.savedAt,500);
  assert.equal(saved.simulationState.busy,false);assert.match(savedFindingsMessage(saved),/Saved findings/);assert.doesNotMatch(savedFindingsMessage(saved),/unresolved/);
});
test('changed geometry, priorities, query or parcel cannot restore stale findings',()=>{
  const s=storage();saveFindingsSession(s,entry());
  for(const change of [i=>{i.points[0].lat+=.00001;},i=>{i.priorities.matters='Keep parking';},i=>{i.priorities.purpose='A garden';},i=>{i.query='Another address';},i=>{i.parcelKey='another-parcel';}]){
    const i=input();change(i);assert.equal(readFindingsSession(s,i),null);
  }
});
test('boot can restore a previously chosen parcel only when every other input matches',()=>{
  const s=storage(),e=entry();e.input.parcelKey='source-parcel-123';e.lastFindings.signature=JSON.stringify(e.input);saveFindingsSession(s,e);
  assert.equal(readFindingsSession(s,input()),null);
  assert.equal(readFindingsSession(s,input(),{restoreParcel:true}).input.parcelKey,'source-parcel-123');
  const changed=input();changed.priorities.matters='Other concern';assert.equal(readFindingsSession(s,changed,{restoreParcel:true}),null);
  const chosen=input();chosen.parcelKey='new-choice';assert.equal(readFindingsSession(s,chosen,{restoreParcel:true}),null);
});
test('interrupted research and study are restored as incomplete, never ready or actively running',()=>{
  const s=storage(),e=entry();e.lastFindings.time=0;e.lastFindings.result.narrativeStatus='researching';delete e.lastFindings.result.assessment;e.simulationState={busy:true,brief:[{label:'School'}],refinement:'Keep a garden'};
  saveFindingsSession(s,e,1000);const saved=readFindingsSession(s,input());
  assert.equal(saved.interrupted,true);assert.equal(saved.lastFindings.time,0);assert.equal(saved.lastFindings.result.narrativeStatus,'unavailable');assert.equal(saved.lastFindings.result.researchError,'session-interrupted');
  assert.equal(saved.simulationState.busy,false);assert.match(saved.simulationState.error,/did not finish/);assert.match(savedFindingsMessage(saved),/Research did not finish/);
  assert.equal(saved.lastFindings.result.sources.length,1);assert.equal(saved.simulationState.brief[0].label,'School');
  const partial=entry();partial.lastFindings.result.narrativeStatus='partial';saveFindingsSession(s,partial);assert.match(savedFindingsMessage(readFindingsSession(s,input())),/unresolved/);
});
test('stale evidence, context or assessment versions prevent restoring a concept while preserving source findings',()=>{
  for(const mutate of [c=>{c.assessmentVersion='d'.repeat(20);},c=>{c.version.assessment='d'.repeat(20);},c=>{c.concept.evidenceVersion='d'.repeat(20);},c=>{c.concept.contextVersion='d'.repeat(20);}]){
    const s=storage(),e=entry();mutate(e.scenario);saveFindingsSession(s,e);const saved=readFindingsSession(s,input());assert.equal(saved.scenario,null);assert.equal(saved.lastFindings.result.sources.length,1);
  }
});
test('oversize, sensitive, malformed and mismatched payloads are rejected without truncating source data',()=>{
  const s=storage(),e=entry();saveFindingsSession(s,e);
  e.lastFindings.result.sources[0].text='x'.repeat(maxFindingsSessionCharacters);assert.equal(saveFindingsSession(s,e),false);assert.equal(s.getItem(findingsSessionKey),null);
  const sensitive=entry();sensitive.input.priorities.matters='donor records';sensitive.lastFindings.signature=JSON.stringify(sensitive.input);assert.equal(saveFindingsSession(s,sensitive),false);
  const changed=entry();changed.input.priorities.matters='Different concern';assert.equal(saveFindingsSession(s,changed),false);
  s.setItem(findingsSessionKey,'{broken');assert.equal(readFindingsSession(s,input()),null);
  const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}};assert.equal(saveFindingsSession(blocked,entry()),false);assert.equal(readFindingsSession(blocked,input()),null);
});
test('page boot follows display-only restoration and retains explicit findings/retry run triggers',async()=>{
  const source=await readFile(new URL('../land.js',import.meta.url),'utf8');
  assert.match(source,/if\(findingsOpen\)showSavedFindings\(\);/);assert.doesNotMatch(source,/if\(findingsOpen\)void showFindings\(\)/);
  const restore=source.slice(source.indexOf('function showSavedFindings()'),source.indexOf("window.addEventListener('pagehide'"));
  assert.doesNotMatch(restore,/fetch\(|startAutomaticStudy\(|simulateFindings\(/);assert.match(restore,/savedFindingsMessage/);
  assert.match(source,/\$\('see-findings'\)\.addEventListener\('click', \(\) => \{ void showFindings\(\); \}\)/);
  assert.match(source,/\$\('refresh-findings'\)\.addEventListener\('click', \(\) => \{ void showFindings\(true\); \}\)/);
  assert.match(source,/window\.addEventListener\('pagehide',saveFindingsVisit\)/);
});
