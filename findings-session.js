import {privateInputFields,hasPrivateInput} from './input-privacy.js';
import {validatePolygon} from './geometry.js';

export const findingsSessionKey='steadmorrow.findings.session.v1';
export const maxFindingsSessionCharacters=1500000;
const assessmentVersion=value=>typeof value==='string'&&/^[a-f0-9]{20}$/.test(value);
const safeInput=input=>input&&validatePolygon(input.points??[]).valid&&!privateInputFields(input).length;
const validResult=result=>result?.schemaVersion===2&&Array.isArray(result.sources)&&result.selectedArea?.geometry?.length;
const inputWithoutParcel=input=>JSON.stringify({...input,parcelKey:null});

// A study may add sources after the assessment. Recompute the server's evidence
// identity before advancing the saved snapshot; stale or unrelated studies fail closed.
export async function mergeStudyEvidence(input,result,scenario){
  if(!scenario||scenario.assessmentVersion!==result?.version?.assessment||scenario.version?.assessment!==result.version.assessment)return result;
  const expected=scenario.version?.evidence;
  if(!assessmentVersion(expected)||!Array.isArray(scenario.sources)||!safeInput(input))return result;
  if([scenario.concept,...[...(scenario.options??[]),...(scenario.explorations??[]),...(scenario.testHistory??[])].map(o=>o.concept)].some(c=>c?.roadContextVersion&&c.roadContextVersion!==result.siteContext?.renderVersion))return result;
  const geometry=scenario.concept?.contextVersion??scenario.contextVersion??null;
  if(geometry!==(result.siteContext?.geometryVersion??null)||(scenario.siteContext?.geometryVersion??null)!==geometry)return result;
  if(scenario.concept&&scenario.concept.evidenceVersion!==expected)return result;
  if([...(scenario.options??[]),...(scenario.explorations??[]),...(scenario.testHistory??[])].some(o=>o.concept&&(o.concept.evidenceVersion!==expected||(o.concept.contextVersion??null)!==geometry)))return result;
  const sources=scenario.sources;
  if(new Set(sources.map(s=>s.id)).size!==sources.length||sources.some(s=>!s.id||!s.url||!s.hash))return result;
  if((result.sources??[]).some(s=>!sources.some(n=>n.id===s.id&&n.url===s.url&&n.hash===s.hash)))return result;
  const identity={points:input.points,parcel:result.parcel?.key,sources:sources.map(s=>({id:s.id,url:s.url,hash:s.hash})).sort((a,b)=>a.id.localeCompare(b.id))};
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(identity)));
  const actual=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('').slice(0,20);
  if(actual!==expected)return result;
  return {...result,assessmentEvidenceVersion:result.assessmentEvidenceVersion??result.caseId,caseId:actual,version:{...result.version,evidence:actual},sources,siteContext:scenario.siteContext,priorityMeasurements:scenario.priorityMeasurements??result.priorityMeasurements};
}

export function matchingSavedScenario(result,scenario){
  const version=result?.version?.assessment;
  if(!assessmentVersion(version)||scenario?.assessmentVersion!==version)return null;
  if([...(scenario.options??[]),...(scenario.explorations??[]),...(scenario.testHistory??[])].some(o=>o.concept&&(o.concept.evidenceVersion!==(result.caseId??result.version?.evidence)||(o.concept.contextVersion??null)!==(result.siteContext?.geometryVersion??null))))return null;
  if(scenario.options?.length&&(!scenario.options.some(o=>o.id===scenario.activeOptionId)&&scenario.activeOptionId))return null;
  if(scenario.status==='needs-evidence'&&!scenario.concept)return scenario.version?.assessment===version&&scenario.version?.evidence===(result.caseId??result.version?.evidence)&&(scenario.contextVersion??null)===(result.siteContext?.geometryVersion??null)?scenario:null;
  if([scenario.concept,...[...(scenario.options??[]),...(scenario.explorations??[]),...(scenario.testHistory??[])].map(o=>o.concept)].some(c=>c?.roadContextVersion&&c.roadContextVersion!==result.siteContext?.renderVersion))return null;
  if(!scenario.concept)return null;
  if(scenario.concept.status==='no-fit'&&scenario.concept.method&&!scenario.concept.method.includes('translated-v4'))return null;
  if(scenario.version?.assessment!==version||scenario.concept.evidenceVersion!==(result.caseId??result.version?.evidence))return null;
  if((scenario.concept.contextVersion??null)!==(result.siteContext?.geometryVersion??null))return null;
  return normalizeHousingOptions(scenario);
}

export function saveFindingsSession(storage,{input,lastFindings,scenario=null,simulationState={}},now=Date.now()){
  try{
    const signature=JSON.stringify(input);
    if(!safeInput(input)||lastFindings?.signature!==signature||!validResult(lastFindings.result)||hasPrivateInput(simulationState.refinement??'')){
      storage.removeItem(findingsSessionKey);return false;
    }
    const matched=matchingSavedScenario(lastFindings.result,scenario);
    const state={busy:simulationState.busy===true,question:simulationState.question,brief:simulationState.brief,refinement:simulationState.refinement,error:simulationState.error};
    // A result can embed the same scenario. Store it once, with all original
    // source/context data retained; exceeding the bound never truncates facts.
    const result={...lastFindings.result};delete result.scenario;
    const savedAt=Number.isFinite(lastFindings.time)&&lastFindings.time>0?lastFindings.time:now;
    const payload=JSON.stringify({version:1,savedAt,input,lastFindings:{signature,result,time:lastFindings.time},scenario:matched,simulationState:state});
    if(payload.length>maxFindingsSessionCharacters){storage.removeItem(findingsSessionKey);return false;}
    storage.setItem(findingsSessionKey,payload);return true;
  }catch{return false;}
}

export function readFindingsSession(storage,input,{restoreParcel=false}={}){
  try{
    const raw=storage.getItem(findingsSessionKey);
    if(!raw||raw.length>maxFindingsSessionCharacters||!safeInput(input))return null;
    const saved=JSON.parse(raw);
    if(saved?.version!==1||!Number.isFinite(saved.savedAt)||!safeInput(saved.input)||!validResult(saved.lastFindings?.result))return null;
    if(saved.lastFindings.signature!==JSON.stringify(saved.input))return null;
    const exact=JSON.stringify(input)===saved.lastFindings.signature;
    // The recorded parcel choice is restored only during page initialization,
    // after every other original input and all selection points match exactly.
    if(!exact&&!(restoreParcel&&input.parcelKey===null&&inputWithoutParcel(input)===inputWithoutParcel(saved.input)))return null;
    const lastFindings=saved.lastFindings;
    const interrupted=lastFindings.time===0||lastFindings.result.narrativeStatus==='researching';
    if(interrupted){lastFindings.result={...lastFindings.result,narrativeStatus:'unavailable',researchError:'session-interrupted',narrativeMessage:'The previous research did not finish. Its saved records are available; retry findings to continue.'};lastFindings.time=0;}
    const simulationState={...saved.simulationState,busy:false};
    if(simulationState.error&&!saved.scenario?.concept)simulationState.error=simulationState.error.replace('Your previous concept is retained.','Your findings and land selection are kept.');
    if(saved.simulationState?.busy)simulationState.error='The previous housing study did not finish. Saved findings are shown; retry findings to continue.';
    if(hasPrivateInput(simulationState.refinement??''))return null;
    return {input:saved.input,lastFindings,scenario:matchingSavedScenario(lastFindings.result,saved.scenario),simulationState,savedAt:saved.savedAt,interrupted};
  }catch{return null;}
}

export function savedFindingsMessage(saved){
  const time=new Date(saved.savedAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  const complete=saved.lastFindings.result.narrativeStatus==='ready';
  const retrievalIncomplete=!saved.lastFindings.result.code?.length&&(saved.lastFindings.result.codeAccess?.length||(saved.lastFindings.result.retrievalFailures??[]).some(f=>/planning|code|publication|website/i.test(f.name??'')));
  const detail=retrievalIncomplete?'Housing rules could not be retrieved; the housing check is incomplete.':saved.interrupted?'Research did not finish.':complete?(saved.simulationState.error?'The housing study did not finish.':''):'Some housing checks remain unresolved.';
  return `Saved findings from ${time}. ${detail?detail+' ':''}Retry findings to run a new check.`;
}

export function activateHousingOption(scenario,id){
  const option=selectableHousingOptions(scenario).find(o=>o.id===id);if(!option)return scenario;
  return {...scenario,activeOptionId:id,concept:option.concept??null,status:option.concept?.status??'needs-evidence',
    rationale:option.dimensionBasis,support:option.support,contextVersion:scenario.siteContext?.geometryVersion??null};
}

export function selectableHousingOptions(scenario){
  return (scenario?.options??[]).filter(o=>o.useStatus==='conditional'&&o.reviewed!==false&&o.concept?.status==='illustrative'&&o.concept?.buildings?.length);
}
export function normalizeHousingOptions(scenario){
  if(!scenario?.options?.length)return scenario;
  const options=selectableHousingOptions(scenario),explorations=[...(scenario.explorations??[]),...scenario.options.filter(o=>!options.includes(o))];
  const next={...scenario,options,explorations};
  if(options.length&&!options.some(o=>o.id===scenario.activeOptionId))return activateHousingOption(next,options[0].id);
  return next;
}
