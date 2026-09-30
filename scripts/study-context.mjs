// Model-facing projection only. Never use this to replace renderer/evidence state.
// Sources, exact excerpts, measurements and qualifications remain intact.
const displayArrays=new Set(['streets','buildings','roads','parking','maneuver']);
export function studyView(value){
  if(Array.isArray(value))return value.map(studyView);
  if(!value||typeof value!=='object')return value;
  const result={};
  for(const [key,item]of Object.entries(value)){
    if(key==='geometry'||key==='site')continue;
    if(displayArrays.has(key)&&Array.isArray(item)){
      if(!Object.hasOwn(value,key+'Count'))result[key+'Count']=item.length;
      continue;
    }
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
