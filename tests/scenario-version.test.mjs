import test from 'node:test';
import assert from 'node:assert/strict';
import {createScenarioAgent} from '../scripts/scenario-agent.mjs';

const geometry=[[[[-95,30],[-94.999,30],[-94.999,30.001],[-95,30.001],[-95,30]]]];
const parameters={width:6,depth:9,storeys:2,storey_height:3,spacing:3,edge_clearance:3,angle:0,homes:12,parking_spaces:2};
const purpose={label:'Housing',meaning:'Explore the requested housing.',original_excerpt:'Housing',kind:'goal',target:'homes',research_topic:'other'};

for(const changed of ['source evidence','context geometry'])test(`late ${changed} change retires stale IDs and frees a fresh Gloo-selected test`,async()=>{
  const evidence={caseId:'b'.repeat(20),status:'preliminary',locality:{label:'Fixture'},parcel:{geometry,id:'fixture'},selectedArea:{geometry},sources:[],siteContext:{geometryVersion:'c'.repeat(20),version:'context-a',buildings:[]}};
  let checks=0;
  const session={snapshot:()=>structuredClone(evidence),context:()=>structuredClone(evidence),renewSignal(){},toolDefinitions:()=>[{type:'function',function:{name:'search_code_sections'}}],execute:async()=>{
    if(++checks===3){if(changed==='source evidence')evidence.caseId='d'.repeat(20);else evidence.siteContext={...evidence.siteContext,geometryVersion:'e'.repeat(20),version:'context-b'};}
    return {status:'reviewed',evidenceVersion:evidence.caseId};
  }};
  const entry={session,input:{priorities:{purpose:'Housing',matters:'',choices:[]}}},oldIds=new Set(),diagnostics=[];
  let calls=0,currentId,invalidatedNotice=false;
  const fetchImpl=async(_url,options)=>{
    const payload=JSON.parse(options.body),outputs=payload.input.filter(i=>i.type==='function_call_output').map(i=>JSON.parse(i.output));
    currentId=outputs.findLast(o=>o.id&&o.metrics)?.id??currentId;
    const round=calls++,call=(name,args)=>({type:'function_call',call_id:'call-'+round,name,arguments:JSON.stringify(args)});
    let selected;
    if(round===0)selected=call('interpret_priorities',{items:[purpose]});
    else if([1,3,5].includes(round))selected=call('test_layout',{...parameters,angle:(round-1)*10});
    else if([2,4,6].includes(round)){oldIds.add(currentId);selected=call('review_layout',{concept_id:currentId});}
    else if(round>=7&&round<=12){
      if(round>=10){
        assert.equal(payload.tools.some(t=>t.function.name==='review_layout'),false);
        assert.equal(payload.tools.some(t=>t.function.name==='select_layout'),false);
        const notice=payload.input.filter(i=>i.role==='user').map(i=>{try{return JSON.parse(i.content);}catch{return {};}}).find(i=>i.invalidatedConceptIds?.length);
        if(round===10){assert.deepEqual(new Set(notice?.invalidatedConceptIds),oldIds);invalidatedNotice=true;}
      }
      selected=call('search_code_sections',{query:'housing followup '+round});
    }else if(round===13){
      assert.equal(oldIds.size,3);assert.ok(payload.tools.some(t=>t.function.name==='test_layout'),'fresh test must remain offered after round twelve despite three earlier stale tests');
      selected=call('test_layout',parameters);
    }else if(round===14){
      assert.equal(oldIds.has(currentId),false);const ids=payload.tools.find(t=>t.function.name==='review_layout').function.parameters.properties.concept_id.enum;
      assert.deepEqual(ids,[currentId]);selected=call('review_layout',{concept_id:currentId});
    }else if(round===15){
      assert.deepEqual(payload.tools.find(t=>t.function.name==='select_layout').function.parameters.properties.concept_id.enum,[currentId]);
      selected=call('select_layout',{concept_id:currentId,rationale:'A fresh test uses the current mapped conditions.',support:[]});
    }else throw new Error('Unexpected retry loop');
    return new Response(JSON.stringify({output:[selected]}));
  };
  const run=createScenarioAgent({apiKey:'fixture',model:'fixture',fetchImpl,resolveContext:()=>entry,reserve:()=>()=>{},onDiagnostic:event=>diagnostics.push(event)});
  const result=await run({assessmentVersion:'a'.repeat(20)});
  assert.equal(calls,16);assert.ok(invalidatedNotice);assert.equal(result.concept.evidenceVersion,evidence.caseId);assert.equal(result.concept.contextVersion,evidence.siteContext.geometryVersion);
  assert.deepEqual(diagnostics.find(d=>d.type==='scenario-concepts-invalidated')?.conceptIds,[...oldIds]);
  assert.ok(result.research.events.some(e=>e.tool==='select_layout'&&e.status===result.status));
  assert.ok(result.research.toolCalls<=32);
});
