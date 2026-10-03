// Model-facing projection only. Never use this to replace renderer/evidence state.
// Sources, exact excerpts, measurements and qualifications remain intact.
const displayArrays=new Set(['streets','buildings','roads','parking','maneuver']);
export function studyView(value){
  if(Array.isArray(value))return value.map(studyView);
  if(!value||typeof value!=='object')return value;
  if(value.kind==='surroundings-effects'&&value.structures?.length>24){
    const overlapIds=new Set((value.shadows??[]).flatMap(s=>(s.groundProjectionOverlaps??[]).map(o=>o.structureId)));
    const nearby=value.structures.slice(0,12),visible=[...nearby,...value.structures.filter(s=>overlapIds.has(s.id)&&!nearby.includes(s)).slice(0,12)];
    value={...value,structures:visible,structuresCoverage:{total:value.structures.length,shown:visible.length,omitted:value.structures.length-visible.length,selection:'Nearest twelve plus up to twelve mapped ground-projection overlaps; not a complete inventory.',continuation:{tool:'read_surroundings_details',receipt_id:value.id,start_structure:1,count:12}},shadows:(value.shadows??[]).map(s=>({...s,...(s.groundProjectionOverlaps?{groundProjectionOverlaps:s.groundProjectionOverlaps.filter(o=>visible.some(b=>b.id===o.structureId)),overlappingStructureCount:s.groundProjectionOverlaps.length}:{} )}))};
  }
  const result={};
  for(const [key,item]of Object.entries(value)){
    if(key==='geometry'||key==='site')continue;
    if(displayArrays.has(key)&&Array.isArray(item)){
      if(!Object.hasOwn(value,key+'Count'))result[key+'Count']=item.length;
      continue;
    }
    if(key==='text'&&value.id&&typeof item==='string'&&item.length>6000){
      result.text=item.slice(0,6000);result.observationRange={start:0,end:6000,totalCharacters:item.length,omittedCharacters:item.length-6000,continuation:{tool:'read_source_passages',source_id:value.id,start_passage:1}};continue;
    }
    if(key==='passages'&&Array.isArray(item)&&item.length>8){result.passages=item.slice(0,8);result.omittedPassageCount=item.length-8;result.continuation={tool:'read_source_passages',source_id:value.id,start_passage:9};continue;}
    result[key]=studyView(item);
  }
  return result;
}

// A single current state, not a second copy of every current test in its archive.
// This projection never changes saved receipts or the evidence used by validators.
export function studyMessageView(value){
  const view=studyView(value),state=view.studyState;
  if(!state?.brief){
    return {...view,propertyEvidence:{concernBrief:view.propertyEvidence?.concernBrief??[]},
      measuredSiteShape:undefined,eligibleHousingPassages:undefined,priorTestHistory:[],previousScenario:undefined};
  }
  const active=new Set((state.concepts??[]).map(c=>c.id));
  for(const concept of state.concepts??[]){
    // The accepted option holds this exact brief once, including all citations.
    if(state.options?.some(o=>o.id===concept.optionId)){
      delete concept.designBrief;concept.designBriefOptionId=concept.optionId;
    }
  }
  view.priorTestHistory=(view.priorTestHistory??[]).filter(t=>!active.has(t.concept?.id)).map(t=>{
    const c=t.concept;
    if(!c)return t;
    return {archived:true,concept:{id:c.id,optionId:c.optionId,planVersion:c.planVersion,evidenceVersion:c.evidenceVersion,
      status:c.status,typology:c.typology,parameters:c.parameters,metrics:c.metrics,diagnostics:c.diagnostics,
      assumptions:c.assumptions,limitations:c.limitations,designCheck:c.designCheck},review:t.review,
      note:'Historical test only; the current option design brief governs all new tests.'};
  });
  if(view.previousScenario)delete view.previousScenario.previousTests;
  // Quote text lives in the original source passages. Exact matching only; an
  // unmatched excerpt remains verbatim, so exceptions cannot be silently lost.
  const sources=view.propertyEvidence?.sources??[];
  const references=item=>{
    if(Array.isArray(item))return item.map(references);
    if(!item||typeof item!=='object')return item;
    const passage=item.sourceId&&typeof item.quote==='string'
      ?sources.find(s=>s.id===item.sourceId)?.passages?.find(p=>p.text===item.quote):null;
    const result={};
    for(const [key,part]of Object.entries(item))if(!(passage&&key==='quote'))result[key]=references(part);
    if(passage)result.passageId=passage.id;
    return result;
  };
  view.studyState=references(state);
  view.completedAssessment=references(view.completedAssessment);
  view.priorTestHistory=references(view.priorTestHistory);
  return view;
}

export function studyExchangeView(tool,output){
  if(output?.status==='tool-error')return output;
  if(['plan_housing_options','revise_housing_plan'].includes(tool))return {
    status:output.status,planVersion:output.planVersion,review:output.review,
    storedIn:'studyState.options: the accepted options and full design briefs are in the current state.'};
  if(tool==='review_layout')return {id:output.id,status:output.status,metrics:output.metrics,review:output.review,
    storedIn:'studyState.concepts and studyState.reviews'};
  return studyView(output);
}

export function studyFailure(error){
  if(Number.isInteger(error.status))return error;
  const timedOut=error.name==='TimeoutError'||error.name==='AbortError';
  if(!timedOut)return error;
  return Object.assign(new Error('The housing study ran out of time before its final check. Your property findings and concerns are saved. Retry the housing study.'),
    {status:504,cause:error,diagnostic:{code:'STUDY_TIMEOUT'}});
}

export async function studyUpstreamError(response,{round,onDiagnostic}){
  // Retain only typed diagnostics, never request headers or arbitrary error text.
  let data;try{
    const reader=response.body?.getReader();let size=0;const chunks=[];
    if(reader)while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>16000){await reader.cancel();break;}chunks.push(part.value);}
    data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }catch{}
  const safe=v=>typeof v==='string'&&/^[a-zA-Z0-9_:.\/-]{1,150}$/.test(v)?v:null;
  const code=safe(data?.error?.name)??safe(data?.detail?.code)??safe(data?.error?.type);
  const contextExceeded=/CONTEXT_LENGTH_EXCEEDED|context_length_exceeded/.test(code??'');
  const diagnostic={type:'scenario-upstream-error',round,status:response.status,code,traceId:safe(data?.error?.trace_id)??safe(response.headers.get('x-sentry-trace-id')),retryable:typeof data?.error?.retryable==='boolean'?data.error.retryable:null};
  onDiagnostic(diagnostic);
  return Object.assign(new Error(contextExceeded?'The study exceeded its working context. Your findings and selected land are kept.':response.status===429?'The study service is temporarily limiting requests. Your findings and selected land are kept.':'The study service could not complete this request. Your findings and selected land are kept.'),{status:502,diagnostic});
}
