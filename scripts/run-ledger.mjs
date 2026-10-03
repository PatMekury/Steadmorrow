import {appendFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {hasPrivateInput} from '../input-privacy.js';
import {studyView} from './study-context.mjs';
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const traceModelFetch=(fetchImpl,ledger)=>async(url,options)=>{const request=JSON.parse(options.body);ledger.record({type:'request',model:request.model,inputHash:digest(request.input),promptHash:digest(request.instructions)});return fetchImpl(url,options);};
// This allowlist excludes HTTP credentials, raw responses, and model reasoning.
const allowed=new Set(['type','phase','tool','callId','status','outcome','model','modelId','responseId','usage','arguments','observation','observationHash','inputHash','promptHash','codeHash','evidenceVersion','conceptId','planVersion','reason','rationale','parentRunId','durationMs','ageMs','executionIntent']);
const scrub=v=>Array.isArray(v)?v.map(scrub):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k,x])=>k==='reasoning_tokens'&&typeof x==='number'||!/(api.?key|authorization|token(?!s)|secret|password|reasoning|raw|headers)/i.test(k)).map(([k,x])=>[k,scrub(x)])):typeof v==='string'&&(hasPrivateInput(v)||/bearer\s+|sk-[a-z0-9]{12}/i.test(v))?'[redacted]':v;
export function createRunLedger(directory){
  return ({phase,parentRunId,input,prompt,code,executionIntent})=>{
    const id=randomUUID();let sequence=0,usage=[];
    const record=event=>{const safe=scrub(Object.fromEntries(Object.entries(event).filter(([k])=>allowed.has(k))));if(safe.type==='model'){safe.usage??=null;usage.push(safe.usage);}mkdirSync(directory,{recursive:true});appendFileSync(join(directory,id+'.jsonl'),JSON.stringify({runId:id,sequence:++sequence,at:new Date().toISOString(),...safe})+'\n',{encoding:'utf8',mode:0o600});};
    record({type:'start',phase,parentRunId,inputHash:digest(input),promptHash:digest(prompt),codeHash:code,executionIntent});
    return {id,record,summary:()=>({runId:id,events:sequence,usage}),observation:(tool,args,value,callId)=>record({type:'tool',tool,callId,arguments:args,status:value?.status??'completed',observation:studyView(value),observationHash:digest(value)})};
  };
}
export const memoryLedger=()=>{const events=[],id=randomUUID();return {id,record:event=>events.push(event),observation:(tool,args,value)=>events.push({tool,arguments:args,status:value?.status,observationHash:digest(value)}),summary:()=>({runId:id,events:events.length,usage:events.filter(e=>e.usage).map(e=>e.usage)})};};
export function executionReceipt({ledgerFactory,parentRunId,input,code,action,ageMs=0,executionIntent}){
  const ledger=ledgerFactory({phase:'execution',parentRunId,input,prompt:'Local result access: '+action,code,executionIntent});
  ledger.record({type:'terminal',status:action,ageMs});
  return {action,runId:parentRunId,ageMs,trace:ledger.summary()};
}
