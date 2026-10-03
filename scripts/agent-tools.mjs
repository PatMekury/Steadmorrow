import {goalItems,concernCoverage} from './concern-contract.mjs';
import {sourceCompleteness,sourceInventory} from './source-completeness.mjs';
import {studyView} from './study-context.mjs';
import {parcelStudy} from './parcel-study.mjs';
import {destinationSearch,destinationProperties} from './place-query.mjs';
import {readNearbyPlaces,travelModes} from './place-routes.mjs';
import {regulatoryPath,explicitNoZoning} from './regulatory-path.mjs';
import {readSiteContext,readNearbySchools} from './site-context.mjs';
import {readOvertureHeights} from './overture-heights.mjs';
import {createPublishedCodeSession} from './published-code.mjs';
import {createOfficialSession} from './official-sources.mjs';
import {createPublicWebClient,sourceFailure} from './public-web.mjs';
import {load} from 'cheerio';
import {createEvidenceClient,digest} from './evidence-client.mjs';
import {locate,discoverLayers,readSpatial,housingContext} from './records.mjs';
import {planningContext,municipalClient} from './planning-context.mjs';
import {selectedGeometry,multiArea,overlapArea,union,intersect} from './site-geometry.mjs';

const plain=value=>load(String(value??'')).text().replace(/\s+/g,' ').trim();
const canonical=value=>plain(value).toLowerCase().replace(/[^a-z0-9]/g,'');
const url=(base,params)=>`${base}?${new URLSearchParams(params)}`;
const muni='https://library.municode.com/api';
export function evidencePassages(source){
  const words=source.text.replace(/\s+/g,' ').trim().split(' '),passages=[];
  for(let start=0;start<words.length;start+=100)passages.push({id:`${source.id}-p${passages.length+1}`,text:words.slice(start,start+120).join(' '),wordRange:{start,end:Math.min(start+120,words.length)}});
  return passages;
}
const tool=(name,description,properties={},required=[])=>({type:'function',function:{name,description,parameters:{type:'object',properties,required,additionalProperties:false}}});
export const researchTools=[
  tool('interpret_concerns','First, separate EVERY original input into atomic concerns, including mixed types within the same sentence. Preserve the housing purpose. A goal, assertion, requirement and question are different. Use any research topic; never force questions into a preset list. Copy exact spans covering the original text.',{items:{type:'array',minItems:1,maxItems:32,items:{type:'object',additionalProperties:false,required:['original_excerpt','label','kind','research_topic'],properties:{original_excerpt:{type:'string',maxLength:600},label:{type:'string',maxLength:100},kind:{type:'string',enum:['goal','question','requirement','reported-fact']},research_topic:{type:'string',maxLength:100}}}}},['items']),
  tool('read_source_passages','Read a bounded continuation from ANY retained source. Every source remains in the inventory. Inspect relevant exceptions and cross-references before a positive conclusion. Passage numbers start at one.',{source_id:{type:'string',maxLength:80},start_passage:{type:'integer',minimum:1,maximum:10000},count:{type:'integer',minimum:1,maximum:8}},['source_id','start_passage','count']),
  tool('read_site_context','Retrieve nearby mapped building footprints, explicit mapped heights, roads and amenities around the retained selected land. These are contextual OpenStreetMap features, not legal parcel/zoning or proof of vacancy/access. Choose this once early so the scene can develop while property research continues.',{radius_meters:{type:'integer',minimum:150,maximum:500}},[]),
  tool('read_nearby_places','Find mapped destinations and measure actual travel routes along streets and paths. Interpret any requested destination category or named place. Supply OSM filters for categories or name_query for named places; the legacy categories school/police/hospital/clinic/pharmacy/supermarket/bus_stop can omit filters. Choose walking/driving/cycling from the original concern. After a missing result, revise tag filters, name or radius using the evidence. Availability is not guaranteed. Default to walking if unspecified and state the mode. Checks up to three geographically nearby candidates and chooses the shortest successfully routed result; never claims complete nearest coverage. No straight-line fallback. Include the exact original excerpt. Police travel is not response time or safety.',{...destinationProperties,mode:{type:'string',enum:travelModes},radius_meters:{type:'integer',minimum:500,maximum:50000},original_excerpt:{type:'string',minLength:2,maxLength:600}},['kind','mode','radius_meters','original_excerpt']),
  tool('read_nearby_schools','Find mapped schools near the selected land and calculate the nearest result in a bounded search. Use early when a user asks about school proximity; include original_excerpt copied exactly from their priorities so the measured result can appear beside that concern while other research continues. Returns walking distance and route geometry along mapped streets/paths, with endpoint and search limitations. Never substitutes direct-line distance or establishes attendance assignment. May retry with a larger radius after no usable result.',{radius_meters:{type:'integer',minimum:500,maximum:50000},original_excerpt:{type:'string',minLength:2,maxLength:600}},['radius_meters']),
  tool('resolve_location','Resolve the user-selected outline to official municipality, active town/township and county identifiers. Start here; never substitute another location.'),
  tool('discover_map_sources','Discover trusted parcel or zoning polygon sources for this location. Returns source IDs and metadata; choose a source to query. Use search_scope regional after local sources fail or have no match; it searches wider catalogue pages. A different search hint can locate alternatives.',{kind:{type:'string',enum:['parcel','zoning']},search_hint:{type:'string',maxLength:80},search_scope:{type:'string',enum:['local','regional']}},['kind']),
  tool('read_map_source','Query ONE discovered source against the selected area (parcels) or matched parcel (zoning). Omit identifier_field when identifierField is supplied in discovery. It cannot be overridden. On failure or no match, choose another discovered source. Only if identifierField is absent, inspect identifierFields and supply identifier_field only when its meaning identifies a parcel, not a block/lot component or generic object ID. Never choose among ambiguous parcels for the user.',{source_id:{type:'string',maxLength:60},identifier_field:{type:'string',maxLength:100}},['source_id']),
  tool('read_planning_guidance','Follow the exact authority’s official planning navigation. Returns official guidance and published chapter links. An explicit no-zoning statement can establish that system; an empty map cannot.'),
  tool('search_code_sections','Search the exact authority’s published code using a short targeted phrase, such as a use-group name or section number from the publication. Do not repeat the municipality name; the search is already scoped. Searches may require ALL query words. Returns actual section IDs/titles and their chapter context. Search excerpts are discovery clues, not legal evidence.',{query:{type:'string',minLength:2,maxLength:120}},['query']),
  tool('list_chapter_sections','List actual section titles within a published chapter link obtained from planning guidance or zoning records. Select relevant housing provisions and their exceptions.',{chapter_id:{type:'string',maxLength:60}},['chapter_id']),
  tool('read_code_sections','Retrieve original text for up to four section IDs returned by search/list tools. Returns source passage IDs for citation. You can follow up by retrieving another section.',{section_ids:{type:'array',items:{type:'string',maxLength:60},minItems:1,maxItems:4}},['section_ids']),
  tool('read_housing_context','Retrieve local ACS rental cost-burden and rent estimates, with geography, dates and uncertainty. These do not establish site demand.'),
  tool('discover_official_sources','Discover the selected authority and county websites from verified public directories. Use when catalogue/code access fails, or to find alternate original publications. Returns opaque IDs, never invented URLs.'),
  tool('read_official_source','Read an official website or PDF, follow its returned link IDs, or inspect a linked parcel/zoning GIS service. Choose housing provisions and their exceptions. PDF page_start is a file page number, not a printed section number; at most four pages per call. Set kind only for a GIS link.',{source_id:{type:'string',maxLength:60},page_start:{type:'integer',minimum:1,maximum:3000},include_evidence:{type:'boolean',description:'True for an original public document relevant to any concern beyond planning. Enables broader same-authority link navigation without promoting it to legal evidence.'},kind:{type:'string',enum:['parcel','zoning']}},['source_id']),
  tool('review_evidence','Inspect retrieved facts, conflicts, missing checks and available follow-up actions before writing the assessment. This performs no new lookups.'),
];
export const progressLabels={interpret_concerns:'Separating your goals and questions…',read_source_passages:'Reading the remaining original source passages…',resolve_location:'Identifying the local authority…',discover_map_sources:'Finding public property sources…',read_map_source:'Checking mapped property records…',read_planning_guidance:'Checking the authority’s development guidance…',search_code_sections:'Searching relevant housing provisions…',list_chapter_sections:'Reviewing the published development code…',read_code_sections:'Reading source provisions and exceptions…',read_housing_context:'Checking local housing needs…',review_evidence:'Reviewing evidence and remaining gaps…'};
Object.assign(progressLabels,{read_site_context:'Bringing the surrounding buildings and streets into view…',read_nearby_schools:'Checking walking routes to mapped schools…',read_nearby_places:'Finding nearby places and following the streets to them…',discover_official_sources:'Finding the authority’s official publications…',read_official_source:'Reading official records and published rules…'});

export function validateToolArguments(name,args){
  const definition=researchTools.find(t=>t.function.name===name)?.function.parameters;
  if(!definition||!args||typeof args!=='object'||Array.isArray(args))throw new Error('Unknown tool or invalid arguments');
  if(name==='search_code_sections'&&typeof args.query==='string'&&args.query.trim().split(/\s+/).length>8)throw new Error('Invalid code search: use at most eight words, focused on one provision or source phrase. Omit the city name; the publication is already scoped.');
  if(Object.keys(args).some(k=>!Object.hasOwn(definition.properties,k)))throw new Error('Unexpected tool argument');
  for(const k of definition.required)if(!Object.hasOwn(args,k))throw new Error('Missing tool argument');
  for(const [k,value] of Object.entries(args)){
    const p=definition.properties[k];
    if(p.type==='string'&&(typeof value!=='string'||value.length>(p.maxLength??200)||value.length<(p.minLength??1)||p.enum&&!p.enum.includes(value)))throw new Error('Invalid tool argument');
    if(name==='interpret_concerns'&&k==='items'){if(!Array.isArray(value)||!value.length||value.length>32||value.some(p=>!p||typeof p.original_excerpt!=='string'||!p.original_excerpt.trim()||p.original_excerpt.length>600||typeof p.label!=='string'||!p.label.trim()||p.label.length>100||typeof p.research_topic!=='string'||p.research_topic.length>100||!['goal','question','requirement','reported-fact'].includes(p.kind)))throw new Error('Invalid concern interpretation.');continue;}
    if(k==='filters'){destinationSearch(args);continue;}
    if(p.type==='array'&&(!Array.isArray(value)||value.length<p.minItems||value.length>p.maxItems||value.some(v=>typeof v!=='string'||!v||v.length>p.items.maxLength)))throw new Error('Invalid tool argument');
    if(p.type==='boolean'&&typeof value!=='boolean')throw new Error('Invalid tool argument');
    if(p.type==='integer'&&(!Number.isSafeInteger(value)||value<p.minimum||value>p.maximum))throw new Error('Invalid tool argument');
  }
  if(name==='read_nearby_places'){
    destinationSearch(args);
    // A category question must not acquire an invented literal place name.
    // The model still chooses category tags; named filters quote user wording.
    const original=args.original_excerpt.replace(/\s+/g,' ').toLowerCase();
    const names=[args.name_query,...(args.filters??[]).flatMap(g=>g.tags.filter(t=>['name','brand','operator'].includes(t.key)).map(t=>t.value))].filter(Boolean);
    if(names.some(n=>!original.includes(n.replace(/\s+/g,' ').toLowerCase())))throw new Error('A literal destination name must appear in the original question. For a category such as nearest library, omit name_query or set it to an empty string and remove name/brand/operator filters; use only category tags. Do not invent a public-access qualifier.');
    const categories=(args.filters??[]).flatMap(g=>g.tags.filter(t=>!['name','brand','operator'].includes(t.key)).map(t=>t.value.replaceAll('_',' ').toLowerCase()));
    if(names.some(n=>categories.includes(n.replace(/\s+/g,' ').toLowerCase())))throw new Error('The name filter repeats the destination category. For nearest-library or another category search, set name_query to an empty string and remove name/brand/operator filters. Otherwise you exclude places whose actual names do not contain the category word.');
  }
  return args;
}

// Each session owns the selected geometry, accepted sources and section IDs.
// The model chooses tools and follow-ups; it cannot supply arbitrary fetch URLs,
// change the location, fabricate a source, or promote its prose into a record.
export function createResearchSession(input,{read=createEvidenceClient(),webRead=createPublicWebClient(),readHeights=readOvertureHeights,now=Date.now,signal,initialEvidence,completedTools=[]}={}){
  const selected=selectedGeometry(input.points);
  const inputs=goalItems(input.priorities??{});if(!inputs.length)inputs.push({id:'input-housing',text:'Explore housing possibilities'});
  const state={goalItems:inputs,concernBrief:null,coverageMap:[],schemaVersion:2,caseId:digest(input.points).slice(0,20),generatedAt:new Date(now()).toISOString(),status:'partial',evidenceStatus:'retrieved-records',selectedArea:{geometry:selected,squareMeters:multiArea(selected)},locality:null,parcel:null,parcelCandidates:[],zones:[],housing:null,sources:[],gaps:[],code:[],assessment:null,checks:[],capacity:null,codeAccess:[],planningSystem:{type:'unresolved',sources:[],codeLinks:[]}};
  const sourceRead=(target,options={})=>read(target,{...options,signal});
  const layers=new Map(),sections=new Map(),chapters=new Map(),checks=new Map();
  const discoveredKinds=new Set(),regionalKinds=new Set();
  const completed=new Set(),sourceAttempts=new Map(),conflicts=[];let codeCatalog,publishedCodes,officialPages,chapterTruncated=false,locationAttempts=0,specialControlAttempted=false;
  const specialFlags=()=>(state.parcel?.members??[state.parcel]).filter(Boolean).flatMap(parcel=>Object.entries(parcel.attributes??{}).filter(([key,value])=>/spdist|special.?dist|histdist|historic|landmark/i.test(key)&&value&&!/^(0|none|no|n|not applicable)$/i.test(String(value))).map(([key,value])=>({parcelId:parcel.id,field:key,value:String(value)})));
  state.retrievalFailures=[];
  state.siteContext={status:'not-requested',buildings:[],roads:[],amenities:[]};state.priorityMeasurements=[];
  const contextualAttempts=new Map(),priorityTexts=new Set([input.priorities?.purpose,input.priorities?.matters,...(input.priorities?.choices??[])].filter(Boolean));
  const official=()=>officialPages??=createOfficialSession({locality:state.locality,read:sourceRead,webRead,signal});
  const recordFailure=(name,url,error)=>{const f={name,url,...sourceFailure(error)};if(!state.retrievalFailures.some(e=>e.name===name&&e.url===url))state.retrievalFailures.push(f);};
  const linkedRead=async(target,options={})=>{const r=await webRead(target,{...options,signal});const data=JSON.parse(Buffer.from(r.data).toString('utf8'));if(data.error)throw new Error('Source query failed');return {...r,data};};
  const published=()=>publishedCodes??=createPublishedCodeSession(sourceRead,state.locality);
  const requestedPassages=new Map();
  const addSource=s=>{s={...s,completeness:sourceCompleteness(s)};const at=state.sources.findIndex(v=>v.id===s.id);if(at<0)state.sources.push(s);else state.sources[at]=s;};
  const requireLocal=()=>{if(!state.locality)throw new Error('Resolve the selected location first');};
  const catalog=async()=>{
    requireLocal();if(state.locality.boundaryUncertain)throw new Error('Jurisdiction must be confirmed before code retrieval');
    if(codeCatalog)return codeCatalog;
    const client=await municipalClient(sourceRead,state.locality);for(const f of client?.discoveryFailures??[])if(!state.codeAccess.some(x=>x.url===f.url))state.codeAccess.push(f);if(!client)throw new Error('No connected code publisher matched this authority');
    const products=(await sourceRead(`${muni}/Products/clientId/${client.ClientID}`)).data.filter(p=>p.ContentType?.Id==='CODES').slice(0,3);
    const active=[];for(const product of products){const job=(await sourceRead(`${muni}/Jobs/latest/${product.ProductID}`)).data;if(job?.Id&&job.ProductId===product.ProductID)active.push({product,job});}
    codeCatalog={client,products:active};return codeCatalog;
  };
  const registerSection=(node,entry,client,trail=[])=>{
    const id=`section-${digest(`${entry.product.ProductID}:${entry.job.Id}:${node.Id}`).slice(0,16)}`;
    sections.set(id,{context:trail.map(plain).join(' > ')||sections.get(id)?.context||'',node:node.Id,title:plain(node.Heading??node.Title),...entry,client});
    return {section_id:id,title:plain(node.Heading??node.Title),context:trail.map(plain).join(' > ')};
  };
  const registerChapters=()=>{
    for(const link of [...state.planningSystem.codeLinks,...state.zones.flatMap(z=>Object.values(z.attributes??{}).filter(v=>/^https:\/\/library\.municode\.com\//.test(v)).map(value=>({url:value,label:'Published zoning chapter'})))]){
      const id=`chapter-${digest(link.url).slice(0,16)}`;chapters.set(id,link);
    }
    return [...chapters].map(([chapter_id,link])=>({chapter_id,title:link.label,url:link.url}));
  };
  const snapshot=()=>{
    const result=structuredClone(state),gaps=[];result.officialRecovery=officialPages?.progress()??null;
    for(const source of result.sources){
      const columns=source.tableDistricts??[];
      if(columns.length&&result.zones.length&&!result.zones.some(z=>columns.some(c=>z.id===c||z.id.startsWith(c+'-'))))source.scopeConflict='The table columns are '+columns.join(', ')+', not the mapped districts '+result.zones.map(z=>z.id).join(', ')+'. Do not use this table to infer housing permission for the selected site.';
    }
    const target=result.parcel?.geometry??selected;
    const zoneUnion=union(result.zones.map(z=>z.geometry));
    result.spatial={selectedParcelCoverage:result.parcel?Math.min(1,overlapArea(selected,target)/multiArea(selected)):null,
      parcelMembers:(result.parcel?.members??[]).map(p=>({id:p.id,key:p.key,selectedSquareMeters:overlapArea(p.geometry,selected),zoningCoverage:Math.min(1,overlapArea(p.geometry,zoneUnion)/multiArea(p.geometry)),zones:result.zones.map(z=>({id:z.id,squareMeters:overlapArea(z.geometry,p.geometry)})).filter(z=>z.squareMeters>.5)})),
      selectedZoningCoverage:Math.min(1,overlapArea(selected,zoneUnion)/multiArea(selected)),
      zones:result.zones.map(z=>({id:z.id,parcelSquareMeters:overlapArea(z.geometry,target),selectedSquareMeters:overlapArea(z.geometry,selected),geometry:intersect(z.geometry,target)}))};
    // Clip the display geometry to the researched site, retaining the original
    // source query and hashes as provenance. Never create a buildable envelope.
    result.zones=result.zones.map(z=>({...z,geometry:intersect(z.geometry,target)}));
    const gap=(id,title,detail,next)=>gaps.push({id,title,detail,next});
    if(!result.locality)gap('jurisdiction','The local authority remains unresolved','The connected geographic lookup has not established the selected jurisdiction.','Retry the lookup or confirm the local authority.');
    else if(result.locality.authorityUnresolved)gap('authority','The governing authority remains unresolved','Census identifies a statistical or nonfunctioning county area; it is not proof of a local planning government.','Identify the relevant state, tribal or local authority before applying development rules.');
    else if(result.locality.boundaryUncertain)gap('boundary','The planning authority needs confirming','The corners could not all be established within one jurisdiction.','Confirm the authority before applying one set of rules to the whole outline.');
    if(conflicts.length)gap('source-conflict','Public records disagree',conflicts.join(' '),'Confirm the current parcel record before relying on a site-specific conclusion.');
    if(!result.parcel){
      if(result.parcelCandidates.length)gap('parcel-match','The mapped property records need resolving','Overlapping or conflicting records prevent a reliable study boundary. Adjacent parcels are studied together without assuming consolidation.','Confirm which overlapping record describes the land.');
      else gap('parcel','A reliable parcel match remains unresolved',checks.get('Parcel')==='source-error'?'The connected parcel query failed; this does not establish that no record exists.':'No usable authoritative parcel match has been retrieved. The blue outline remains an exploration area.','Retry the lookup or obtain the local assessor record.');
    }
    if(result.parcel?.studyCollection)gap('parcel-control','The selected area crosses '+result.parcel.members.length+' parcels','Each parcel retains its own boundaries and records. Ownership/control and permission to develop them together have not been established.','Confirm control of each parcel and whether separate development or consolidation is needed.');
    if(result.retrievalFailures.length){const detail=result.retrievalFailures.slice(0,3).map(e=>`${e.name}: ${e.status.replaceAll('-',' ')}`).join('; ');gap('retrieval','Some sources could not be read',detail+'. Available records have been retained.','Use the linked official source or retry later; missing retrieval is not evidence of no records.');}
    if(!result.zones.length&&result.planningSystem.type!=='no-zoning')gap('zoning','The local planning controls remain unresolved','No zoning match or explicit official alternative planning system has been established.','Confirm the applicable controls with the local authority.');
    if(result.zones.length>1)gap('split-zoning','The site intersects multiple zoning districts','One district’s rules cannot be applied to the whole parcel.','Confirm the rules for the intended housing area.');
    if(result.zones.length&&result.zoningCoverage<.98)gap('zoning-coverage','The zoning map does not cover the whole site','Some of the mapped parcel remains unresolved.','Confirm the missing designation.');
    const flags=result.zones.flatMap(z=>Object.entries(z.attributes??{}).filter(([k,v])=>/^(overlay|historic|contract)$/i.test(k)&&v&&!/^(none|no|n|0)$/i.test(v)).map(([k,v])=>`${z.id}: ${k} ${v}`));
    if(flags.length)gap('map-conditions','Additional mapped conditions need review',flags.join('; '),'Retrieve the related provisions and confirm applicability.');
    if(!result.code.length)gap('code','Governing housing provisions remain unresolved',result.codeAccess.length?'The published code source could not be read ('+result.codeAccess.map(e=>e.message).join('; ')+'). This is a source-access failure, not evidence that no rules exist.':'The agent has not retrieved usable original code sections.','Obtain the authority’s original provisions before judging permission.');
    else gap('applicability','Confirm the approval route and site-specific conditions','Retrieved sections are a bounded review. Exceptions, amendments and site conditions may change the route.','Confirm applicability and required approvals with the local authority.');
    gap('capacity','A reliable home count needs more site evidence','Access, utilities, easements, existing development and environmental constraints are not fully established.','Resolve these inputs before calculating capacity.');
    if(!result.housing)gap('housing','Local housing estimates remain unavailable','No site demand or affordable rent has been inferred.','Retry the statistics source or consult the local housing-needs assessment.');
    gap('affordability','Affordable delivery remains to be established','Ownership/control, affordability commitments and funding are not verified.','Explore housing partnerships and affordability conditions reflecting the church’s priorities.');
    result.status=!result.locality?'unavailable':result.parcelCandidates.length&&!result.parcel?'needs-parcel':'partial';
    if(!conflicts.length&&result.parcel&&result.code.length&&!result.locality?.boundaryUncertain&&!result.locality?.authorityUnresolved&&((result.zones.length===1&&result.zoningCoverage>=.98)||result.planningSystem.type==='no-zoning'))result.status='preliminary';
    result.assessmentScope=result.status==='preliminary'?'matched-site':'local-rules';result.gaps=gaps;
    result.checks=[...checks].map(([name,status])=>({name,status}));
    result.checks.push({name:'Environmental, access and title checks',status:'not-established'});
    result.caseId=digest({points:input.points,parcel:result.parcel?.key,sources:result.sources.map(s=>({id:s.id,url:s.url,hash:s.hash})).sort((a,b)=>a.id.localeCompare(b.id))}).slice(0,20);return result;
  };
  const requiredFollowUps=()=>{
    const concernMissing=state.concernBrief?[]:['interpret_concerns: represent every original input and distinct concern before completing findings'];
    if(!state.locality)return [...concernMissing,...(locationAttempts<2?['resolve_location']:[]),...(!completed.has('read_site_context')?['read_site_context']:[])];
    if(state.parcelCandidates.length&&!state.parcel)return [...concernMissing,...(completed.has('read_site_context')?[]:['read_site_context'])];
    const required=[...concernMissing];
    if(!completed.has('read_site_context'))required.push('read_site_context: retrieve surrounding buildings and streets for the selected land before finishing');
    if(!discoveredKinds.has('parcel'))required.push('discover_map_sources: discover parcel sources');
    for(const kind of ['parcel','zoning']){
      const missing=kind==='parcel'?!state.parcel:!state.zones.length&&state.planningSystem.type!=='no-zoning';
      const untried=[...layers].some(([id,l])=>l.kind===kind&&!sourceAttempts.has(id));
      const attempts=[...layers].filter(([id,l])=>l.kind===kind&&sourceAttempts.has(id)).length;
      if(missing&&discoveredKinds.has(kind)&&!regionalKinds.has(kind)&&(!untried||attempts>=2))required.push(`discover_map_sources: retry ${kind} with search_scope regional after local discovery/query returned no usable match`);
    }
    if(!discoveredKinds.has('zoning')&&state.planningSystem.type!=='no-zoning')required.push('discover_map_sources: discover zoning sources');
    const attempted=kind=>[...layers].filter(([id,l])=>l.kind===kind&&sourceAttempts.has(id)).length;
    if([...layers].some(([id,l])=>l.kind==='zoning'&&!sourceAttempts.has(id))&&attempted('zoning')<2&&!state.zones.length&&state.planningSystem.type!=='no-zoning')required.push('read_map_source: query a discovered zoning source');
    if([...layers].some(([id,l])=>l.kind==='parcel'&&!sourceAttempts.has(id))&&attempted('parcel')<2&&!state.parcel)required.push('read_map_source: query a discovered parcel source');
    if(!completed.has('read_planning_guidance'))required.push('read_planning_guidance');
    // Housing context is optional; it must not delay parcel/use research.
    if((!state.parcel||!state.code.length)&&!state.locality.authorityUnresolved){
      if(!completed.has('discover_official_sources'))required.push('discover_official_sources: recover missing parcel or code evidence through official websites');
      else if(officialPages?.frontier().length)required.push('read_official_source: governing evidence is still missing. Choose a relevant unread link from officialRecovery.remaining, prioritizing original code/development provisions. Navigation-only and failed reads are not governing evidence; do not repeat them.');
    }
    if(!state.locality.boundaryUncertain&&!state.code.length){
      if(!completed.has('search_code_sections')&&!completed.has('list_chapter_sections'))required.push('search_code_sections or list_chapter_sections: original housing provisions are still needed');
      else if(sections.size||(publishedCodes?.needsRead()??false))required.push('read_code_sections: search titles are not evidence');
    }
    const codeSources=snapshot().sources.filter(s=>s.kind==='code-provision');
    if(state.code.length&&!specialControlAttempted&&specialFlags().length)required.push('search_code_sections: use the parcel’s special/historic/landmark flags '+JSON.stringify(specialFlags())+' to look for the applicable original modifications before concluding from base-district rules.');
    if(codeSources.some(s=>s.scopeConflict)&&!codeSources.some(s=>s.tableDistricts?.length&&!s.scopeConflict))required.push('search_code_sections or read_code_sections: retrieved district tables do not cover the mapped districts. Navigate to the correct district family and read its operative housing allowances.');
    if(chapterTruncated&&!completed.has('search_code_sections'))required.push('search_code_sections: chapter listing was truncated; search for operative housing and development-approval provisions');
    return required;
  };
  const context=()=>{
    const r=snapshot();
    return {goalItems:r.goalItems,concernBrief:r.concernBrief,coverageMap:r.coverageMap,siteContext:{status:r.siteContext.status,version:r.siteContext.version,geometryVersion:r.siteContext.geometryVersion,buildingCount:r.siteContext.buildings.length,roadCount:r.siteContext.roads.length,coverage:r.siteContext.coverage},priorityMeasurements:studyView(r.priorityMeasurements),officialRecovery:officialPages?.progress()??null,codeAccess:r.codeAccess,status:r.status,assessmentScope:r.assessmentScope,locality:r.locality,selectedSquareMeters:r.selectedArea.squareMeters,parcel:r.parcel?{id:r.parcel.id,address:r.parcel.address,mappedSquareMeters:r.parcel.mappedSquareMeters,attributes:r.parcel.attributes,members:r.parcel.members?.map(p=>({id:p.id,key:p.key,address:p.address,attributes:p.attributes,selectedOverlapSquareMeters:p.overlapSquareMeters})),studyCollection:r.parcel.studyCollection,controlStatus:r.parcel.controlStatus}:null,spatial:r.spatial,parcelCandidates:r.parcelCandidates.map(p=>({id:p.id,key:p.key,address:p.address})),zoning:r.zones.map(z=>({id:z.id,description:z.description})),planningSystem:r.planningSystem.type,regulatoryPath:regulatoryPath(r),housing:r.housing,unresolved:r.gaps,checks:r.checks,completedTools:[...completed],requiredFollowUps:requiredFollowUps(),sources:sourceInventory(r.sources,evidencePassages,requestedPassages),availableMapSources:[...layers].map(([source_id,l])=>({source_id,kind:l.kind,title:l.item.title,lastOutcome:sourceAttempts.get(source_id)??'not-queried'}))};
  };
  const execute=async(name,args={})=>{
    validateToolArguments(name,args);signal?.throwIfAborted();completed.add(name);
    if(name==='interpret_concerns'){
      const interpreted=args.items.map((p,i)=>({id:'priority-'+i,originalExcerpt:p.original_excerpt,label:p.label,kind:p.kind,researchTopic:p.research_topic}));
      if(interpreted.some(p=>!inputs.some(item=>item.text.includes(p.originalExcerpt))))throw new Error('Each concern must quote an exact original span.');
      const coverage=concernCoverage(inputs,interpreted);state.concernBrief=interpreted;state.coverageMap=coverage;return {status:'interpreted',concerns:interpreted,coverageMap:coverage};
    }
    if(name==='read_source_passages'){
      const source=state.sources.find(s=>s.id===args.source_id);if(!source)throw new Error('Choose a retained source ID.');
      const all=evidencePassages(source),passages=all.slice(args.start_passage-1,args.start_passage-1+args.count);if(!passages.length)throw new Error('Choose an available passage range.');
      const ids=requestedPassages.get(source.id)??new Set(all.slice(0,2).map(p=>p.id));for(const p of passages){ids.delete(p.id);ids.add(p.id);}requestedPassages.set(source.id,new Set([...ids].slice(-8)));
      return {status:'retrieved',sourceId:source.id,completeness:sourceCompleteness(source),passages,passageCount:all.length,nextPassage:args.start_passage+passages.length<=all.length?args.start_passage+passages.length:null};
    }
    if(name==='resolve_location'){
      if(locationAttempts>=2)return {status:'unavailable',note:'Location retry budget exhausted. No substitute location may be used.'};locationAttempts++;
      const found=await locate(sourceRead,input.points);if(!found){checks.set('Jurisdiction','unavailable');return {status:'unavailable',coverage:'Connected geographic lookup covers U.S. jurisdictions. Do not substitute a city.'};}
      state.locality=found.locality;addSource(found.evidence);checks.set('Jurisdiction',found.locality.boundaryUncertain?'needs-review':'retrieved');return {locality:state.locality,source:found.evidence};
    }
    if(name==='review_evidence')return context();
    if(name==='read_site_context'){
      const radius=args.radius_meters??300,key='context:'+radius;if(contextualAttempts.has(key))return contextualAttempts.get(key);
      if([...contextualAttempts.keys()].filter(k=>k.startsWith('context:')).length>=2)throw new Error('Context lookup already attempted. Retain existing map features.');
      const context=await readSiteContext(input.points,{radiusMeters:radius,read:webRead,readHeights,signal});
      if(context.status!=='unavailable'||state.siteContext.status==='not-requested')state.siteContext=context;
      const overlapping=context.buildings.filter(b=>{try{return overlapArea(b.geometry,selected)>.1;}catch{return false;}});
      const result={status:context.status,version:context.version,geometryVersion:context.geometryVersion,buildingCount:context.buildings.length,roadCount:context.roads.length,selectedLandMappedBuildings:overlapping.map(b=>({id:b.id,name:b.name,sourceUrl:b.sourceUrl})),coverage:context.coverage,note:'Scene geometry is retained server-side. Mapped context is separate from legal parcel and zoning evidence. Missing mapped buildings do not establish vacancy.'};contextualAttempts.set(key,result);return result;
    }
    if(name==='read_nearby_schools'||name==='read_nearby_places'){
      const excerpt=args.original_excerpt?.trim();if(excerpt&&![...priorityTexts].some(t=>t.includes(excerpt)))throw new Error('Choose an exact original excerpt from the user priorities.');
      const kind=name==='read_nearby_schools'?'school':args.kind,mode=args.mode??'walking';const search=destinationSearch({kind,filters:args.filters,name_query:args.name_query}),searchKey=digest(search);const key='place:'+searchKey+':'+mode+':'+args.radius_meters;let base=contextualAttempts.get(key);
      if(!base){
        if([...contextualAttempts.keys()].filter(k=>k.startsWith('place:'+searchKey+':')).length>=3)throw new Error('This destination search has already been attempted at three settings. Retain the returned result and its uncertainty.');
        const measurement=await readNearbyPlaces(input.points,{kind,filters:args.filters,name_query:args.name_query,mode,radiusMeters:args.radius_meters,read:webRead,signal});base={status:measurement.status,measurement};contextualAttempts.set(key,base);
      }
      const measurement=structuredClone(base.measurement);if(excerpt){measurement.originalExcerpt=excerpt;measurement.id+='-'+digest(excerpt).slice(0,6);}
      if(!state.priorityMeasurements.some(m=>m.id===measurement.id))state.priorityMeasurements.push(measurement);
      return {status:measurement.status,measurement};
    }
    requireLocal();
    if(name==='discover_official_sources'){
      const result=await official().discover();for(const f of result.failures)if(!state.retrievalFailures.some(e=>e.url===f.url))state.retrievalFailures.push({name:'Official website discovery',...f});return result;
    }
    if(name==='read_official_source'){
      const result=await official().inspect(args.source_id,args.page_start??1,args.include_evidence===true);
      if(result.mapSource){
        if(!args.kind)return {status:'kind-needed',note:'This is a mapped service. Choose kind parcel or zoning according to the link and service metadata.'};
        const e=result.mapSource;
        const found=await discoverLayers(linkedRead,state.locality,input.points,args.kind,'','local',[{id:digest(e.url).slice(0,32),url:e.url,title:e.title,authorityProof:e.proof,sourcePage:e.proof.at(-1)?.url??e.url}]);
        return {sources:found.map(l=>{const id=`${args.kind}-${digest(l.url).slice(0,16)}`;layers.set(id,{...l,kind:args.kind,linked:true});return {source_id:id,kind:args.kind,title:l.meta.name||l.item.title,identifierField:l.identifierField,identifierFields:l.identifierField?[]:l.identifierFields};}),discovery:found.diagnostics,note:'Query a returned map source to establish an actual parcel or zoning match.'};
      }
      for(const s of result.sources??[]){addSource(s);if(s.kind==='code-provision'&&!state.code.includes(s.id))state.code.push(s.id);const statement=s.scope==='authority'&&explicitNoZoning(s.text,state.locality);if(statement){state.planningSystem={...state.planningSystem,type:'no-zoning',sources:[...(state.planningSystem.sources??[]).filter(x=>x.id!==s.id),{...s,statement}]};}}
      if(result.sources?.length)checks.set('Official publications','retrieved');
      if(['access-blocked','rate-limited','timed-out','source-error','not-found','source-too-large','unreadable-document'].includes(result.status)&&!state.retrievalFailures.some(f=>f.url===result.url))state.retrievalFailures.push({name:'Official publication',url:result.url,status:result.status,message:result.message,diagnostic:result.diagnostic});
      return {...result,sources:(result.sources??[]).map(s=>({...s,passages:evidencePassages(s)}))};
    }
    if(name==='discover_map_sources'){
      discoveredKinds.add(args.kind);if(args.search_scope==='regional')regionalKinds.add(args.kind);
      const found=await discoverLayers(sourceRead,state.locality,input.points,args.kind,args.search_hint??'',args.search_scope??'local');
      return {kind:args.kind,discovery:found.diagnostics,sources:found.map(l=>{const id=`${args.kind}-${digest(l.url).slice(0,16)}`;layers.set(id,{...l,kind:args.kind});return {source_id:id,kind:args.kind,title:l.item.title,publisher:l.publisher,url:l.url,identifierField:l.identifierField,identifierFields:l.identifierField?[]:l.identifierFields,lastOutcome:sourceAttempts.get(id)??'not-queried'};}),note:found.length?'Choose a source of this kind and read it. Catalogue metadata alone does not establish a property match.':`No verified ${args.kind} source was discovered. Sources of a different kind cannot fill this gap. Use official planning guidance or another search hint.`};
    }
    if(name==='read_map_source'){
      const layer=layers.get(args.source_id);if(!layer)throw new Error('Choose a source ID returned by discovery');
      if(args.identifier_field){
        if(args.identifier_field!==layer.identifierField&&(layer.identifierField||layer.kind!=='parcel'||!layer.identifierFields.some(f=>f.name===args.identifier_field)))throw new Error(`Choose ${layer.identifierField?`identifier_field ${layer.identifierField}, or omit identifier_field`:'a parcel identifier field from this source metadata'}. Do not use a parcel number as a field name.`);
        layer.identifierField=args.identifier_field;
      }
      if(layer.kind==='parcel'&&!layer.identifierField){sourceAttempts.set(args.source_id,'identifier-needed');return {status:'identifier-needed',identifierFields:layer.identifierFields,followUp:'Inspect these source fields and choose a supported parcel identifier using identifier_field. If none is clear, try another source.'};}
      const kind=layer.kind,target=kind==='parcel'?selected:state.parcel?.geometry??selected,diagnostics={};
      const found=await readSpatial(layer.linked?linkedRead:sourceRead,[layer],target,kind,diagnostics);
      const status=found?'retrieved':diagnostics.failedQueries?'source-error':diagnostics.unsupportedQueries?'unsupported-record-format':'no-match';sourceAttempts.set(args.source_id,status);
      if(!found){if(kind==='parcel'&&!state.parcel)checks.set('Parcel',status);for(const failure of diagnostics.failures??[])recordFailure(kind==='parcel'?'Parcel service':'Zoning service',layer.url,new Error(failure));return {status,failures:diagnostics.failures,followUp:'Try another discovered source. If the catalogue fails, discover_official_sources and follow the assessor or state GIS links. Do not infer no property or no rules.'};}
      if(kind==='parcel'){
        if(state.parcel){const candidate=parcelStudy(found.records,selected).parcel;const same=candidate&&overlapArea(candidate.geometry,state.parcel.geometry)/Math.max(candidate.mappedSquareMeters,state.parcel.mappedSquareMeters)>.98;if(!same){conflicts.push('A queried parcel source disagrees geometrically with the retained match.');return {status:'conflict',note:'Boundary evidence disagrees with the retained match. Do not combine or silently replace parcels.',candidates:found.records.map(r=>({id:r.id,address:r.address}))};}return {status:'corroborated',note:'Mapped boundaries closely agree; identifiers can differ across publishers. This is not a legal survey.',source:found.evidence};}
        const oldKey=state.parcel?.key;state.parcelCandidates=found.records.slice(0,20);
        const collection=parcelStudy(found.records,selected,input.parcelKey);state.parcel=collection.parcel;if(collection.issue&&!state.parcel&&found.records.length>1)conflicts.push(collection.issue);
        if(oldKey!==state.parcel?.key){for(const [id,l] of layers)if(l.kind==='zoning')sourceAttempts.delete(id);state.zones=[];checks.delete('Planning system');delete state.zoningCoverage;state.sources=state.sources.filter(s=>s.id!=='zoning');}
        addSource(found.evidence);checks.set('Parcel',state.parcel?'retrieved':'needs-review');
        return {status:state.parcel?'matched':'needs-user-choice',zoningRecheckRequired:oldKey!==state.parcel?.key,parcel:state.parcel?{id:state.parcel.id,address:state.parcel.address,mappedSquareMeters:state.parcel.mappedSquareMeters,attributes:state.parcel.attributes,studyCollection:state.parcel.studyCollection,members:state.parcel.members?.map(p=>({id:p.id,key:p.key,address:p.address,attributes:p.attributes,selectedOverlapSquareMeters:p.overlapSquareMeters}))}:null,candidates:state.parcelCandidates.map(p=>({id:p.id,key:p.key,address:p.address,mappedSquareMeters:p.mappedSquareMeters})),source:{id:found.evidence.id,url:found.evidence.url,publisher:found.evidence.publisher}};
      }
      state.zones=found.records;state.zoningCoverage=Math.min(1,overlapArea(union(found.records.map(z=>z.geometry)),target)/multiArea(target));addSource(found.evidence);checks.set('Planning system','zoning-map-retrieved');
      return {zones:found.records.map(z=>({id:z.id,description:z.description,attributes:z.attributes})),coverage:state.zoningCoverage,spatial:snapshot().spatial,chapters:registerChapters(),source:{id:found.evidence.id,url:found.evidence.url}};
    }
    if(name==='read_planning_guidance'){
      state.planningSystem=await planningContext(sourceRead,state.locality,{webRead,discoverRoots:()=>official().discover()});for(const f of state.planningSystem.failures??[])if(!state.retrievalFailures.some(x=>x.url===f.url))state.retrievalFailures.push({name:'Planning discovery',...f});for(const s of state.planningSystem.sources)addSource(s);checks.set('Planning guidance',state.planningSystem.sources.length?'retrieved':'unresolved');
      return {planningSystem:state.planningSystem.type,sources:state.planningSystem.sources.map(s=>({id:s.id,title:s.title,url:s.url,passages:evidencePassages(s)})),chapters:registerChapters(),failures:state.planningSystem.failures};
    }
    if(name==='read_housing_context'){
      const housing=await housingContext(sourceRead,state.locality);state.housing={...housing};delete state.housing.evidence;addSource(housing.evidence);checks.set('Housing context','retrieved');return {housing:state.housing,source:housing.evidence};
    }
    if(name==='search_code_sections'&&(/special|historic|landmark/i.test(args.query)||specialFlags().some(f=>f.value.length>=3&&args.query.toLowerCase().includes(f.value.toLowerCase()))))specialControlAttempted=true;
    let c;try{c=await catalog();}catch(error){
      for(const f of error.failures??[{url:'https://library.municode.com/',...sourceFailure(error)}])if(!state.codeAccess.some(x=>x.url===f.url))state.codeAccess.push(f);
      if(name==='search_code_sections'){const result=await published().search(args.query);for(const f of result.failures??[])if(!state.codeAccess.some(x=>x.url===f.url))state.codeAccess.push(f);return {...result,failures:state.codeAccess,recovery:'Choose official source discovery and follow relevant published navigation. A failed catalog is not evidence that no code exists.'};}
      if(name==='read_code_sections'&&args.section_ids.every(id=>published().has(id)))c=null;
      else throw error;
    }
    if(name==='search_code_sections'){
      const response=await sourceRead(url('https://library.municode.com/localapi/search',{clientId:c.client.ClientID,searchText:args.query,contentTypeId:'CODES',mode:'CLIENTMODE',pageNum:'1',pageSize:'20',fragmentSize:'150',sort:'0',isAdvanced:'false',isAutocomplete:'false',titlesOnly:'false'}));
      return {sections:(response.data.hits??[]).flatMap(h=>{const entry=c.products.find(e=>String(e.product.ProductID)===String(h.product?.id));return entry?[registerSection({Id:h.nodeId,Heading:h.title},entry,c.client,(h.ancestors??[]).map(a=>a.title))]:[];}),note:'Retrieve the original sections before citing them.'};
    }
    if(name==='list_chapter_sections'){
      const link=chapters.get(args.chapter_id);if(!link)throw new Error('Choose a chapter ID returned by a source tool');
      const target=new URL(link.url),parts=target.pathname.split('/');
      if(target.hostname!=='library.municode.com'||parts[1]?.toUpperCase()!==state.locality.stateAbbr||canonical(decodeURIComponent(parts[2]??''))!==canonical(c.client.ClientName))throw new Error('Chapter belongs to a different authority');
      const entry=c.products.find(e=>canonical(e.product.ProductName)===canonical(decodeURIComponent(parts[4]??'')));if(!entry)throw new Error('Unknown code product');
      const tree=(await sourceRead(url(`${muni}/codesToc/fullTree`,{productId:entry.product.ProductID,jobId:entry.job.Id}),{maxBytes:5_000_000})).data;let match;
      const find=(n,parents=[])=>{if(n.Id===target.searchParams.get('nodeId'))match={n,parents};for(const child of n.Children??[])find(child,[...parents,n]);};find(tree);if(!match)throw new Error('Chapter link no longer resolves');
      const root=/chapter/i.test(link.label)?[...match.parents,match.n].reverse().find(n=>/chapter/i.test(n.Heading??''))??match.n:match.n;
      const choices=[];const collect=(n,trail=[])=>{if(!n.Children?.length)choices.push(registerSection(n,entry,c.client,trail));for(const child of n.Children??[])collect(child,[...trail,n.Heading??'']);};collect(root);
      chapterTruncated=choices.length>100;
      return {sections:choices.slice(0,100),truncated:choices.length>100,note:choices.length>100?'Use search_code_sections with a targeted query for omitted provisions.':'Choose relevant provisions and exceptions.'};
    }
    if(name==='read_code_sections'){
      const result=[];for(const id of args.section_ids){
        if(publishedCodes?.has(id)){const page=await publishedCodes.read(id);for(const source of page.sources){addSource(source);if(!state.code.includes(source.id))state.code.push(source.id);result.push({id:source.id,title:source.title,url:source.url,tableDistricts:source.tableDistricts,publication:source.publication,truncated:source.truncated,passages:evidencePassages(source)});}if(page.sections.length)result.push({navigation:page.sections,note:page.note});if(page.status==='source-unavailable')result.push({status:page.status,url:page.url,message:page.message});continue;}
        const entry=sections.get(id);if(!entry)throw new Error('Choose section IDs returned by code search or chapter listing');
        const response=await sourceRead(url(`${muni}/CodesContent`,{productId:entry.product.ProductID,jobId:entry.job.Id,nodeId:entry.node,groupChunks:'false'}));
        for(const doc of response.data.Docs??[]){
          if(doc.DocType!==1||!doc.Content)continue;
          const $=load(doc.Content);$('script,style').remove();$('tr').each((_,row)=>{const cells=$(row).find('th,td').map((_,cell)=>$(cell).text().replace(/\s+/g,' ').trim()).get();$(row).replaceWith($('<p>').text(cells.join(' | ')));});
          const full=$.text().replace(/\s+/g,' ').trim();if(full.length<50)continue;
          const sourceId=`code-${digest(`${entry.product.ProductID}:${doc.Id}`).slice(0,16)}`;
          const source={id:sourceId,kind:'code-provision',title:plain(doc.Title),context:entry.context,section:plain(doc.Title),publisher:`${entry.client.ClientName} · ${entry.product.ProductName}`,url:`https://library.municode.com/${state.locality.stateAbbr.toLowerCase()}/${encodeURIComponent(entry.client.ClientName.toLowerCase().replaceAll(' ','_'))}/codes/${encodeURIComponent(entry.product.ProductName.toLowerCase().replaceAll(' ','_'))}?nodeId=${encodeURIComponent(doc.Id)}`,queryUrl:response.url,hash:response.hash,retrievedAt:response.retrievedAt,text:full,truncated:false,publication:plain(entry.job.BannerText),amendmentsPending:doc.IsAmended===true||(doc.AmendedBy?.length??0)>0};
          addSource(source);if(!state.code.includes(sourceId))state.code.push(sourceId);result.push({id:sourceId,title:source.title,context:source.context,publication:source.publication,truncated:source.truncated,passages:evidencePassages(source)});
        }
      }
      checks.set('Published code',state.code.length?'retrieved':'unavailable');return {sources:result};
    }
    throw new Error('Unknown tool');
  };
  const toolDefinitions=()=>researchTools.flatMap(definition=>{
    const t=structuredClone(definition),name=t.function.name,properties=t.function.parameters.properties;
    const ids=name==='read_source_passages'?state.sources.map(s=>s.id):name==='read_map_source'?[...layers.keys()]:name==='read_official_source'?(officialPages?.choices().map(e=>e.source_id)??[]):name==='read_code_sections'?[...sections.keys(),...(publishedCodes?.ids()??[])]:name==='list_chapter_sections'?[...chapters.keys()]:null;
    if(ids){if(!ids.length)return [];if(name==='read_code_sections')properties.section_ids.items.enum=ids;else properties[name==='read_source_passages'||name==='read_map_source'||name==='read_official_source'?'source_id':'chapter_id'].enum=ids;}
    if(name==='read_map_source'){
      const fields=[...new Set([...layers.values()].flatMap(l=>l.identifierField?[l.identifierField]:l.identifierFields.map(f=>f.name)).filter(Boolean))];
      if(fields.length)properties.identifier_field.enum=fields;else delete properties.identifier_field;
    }
    if(name==='resolve_location'&&(state.locality||locationAttempts>=2))return [];
    return [t];
  });
  if(initialEvidence){
    if(initialEvidence.schemaVersion!==2||JSON.stringify(initialEvidence.selectedArea?.geometry)!==JSON.stringify(selected))throw new Error('Saved evidence does not match the selected outline.');
    if(initialEvidence.sources.some(s=>s.completeness?.textHash!==sourceCompleteness(s).textHash))throw new Error('Saved source text no longer matches its retained receipt.');
    Object.assign(state,structuredClone(initialEvidence));
    for(const check of initialEvidence.checks??[])checks.set(check.name,check.status);
    for(const name of completedTools)completed.add(name);
    if(state.parcel)discoveredKinds.add('parcel');if(state.zones.length||state.planningSystem.type==='no-zoning')discoveredKinds.add('zoning');
    if(state.concernBrief)concernCoverage(inputs,state.concernBrief);
    if(snapshot().caseId!==initialEvidence.caseId)throw new Error('Saved evidence identity does not match its original sources.');
  }
  const toolCacheKey=(name,args)=>name==='resolve_location'?String(locationAttempts):name==='read_map_source'&&layers.get(args.source_id)?.kind==='zoning'?(state.parcel?.key??'selected-area'):'';
  const toolLane=(name,args)=>name==='resolve_location'||name==='review_evidence'?'exclusive':name==='read_map_source'?'geometry':/code|chapter/.test(name)?'code':/official/.test(name)?'official':name==='discover_map_sources'?'discovery-'+args.kind:name==='read_site_context'?'site-context':['read_nearby_schools','read_nearby_places'].includes(name)?'nearby-places':name;
  return {execute,snapshot,context,requiredFollowUps,toolDefinitions:()=>state.concernBrief?toolDefinitions().filter(t=>t.function.name!=='interpret_concerns'):researchTools.filter(t=>t.function.name==='interpret_concerns'),toolCacheKey,toolLane,addPriorityTexts:values=>{for(const value of values)if(typeof value==='string'&&value.length<=600&&priorityTexts.size<32)priorityTexts.add(value);},renewSignal:next=>{signal=next;officialPages?.renewSignal?.(next);}};
}
