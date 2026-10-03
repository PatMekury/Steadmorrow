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
