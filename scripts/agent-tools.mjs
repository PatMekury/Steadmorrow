import {createPublishedCodeSession} from './published-code.mjs';
import {load} from 'cheerio';
import {createEvidenceClient,digest} from './evidence-client.mjs';
import {locate,discoverLayers,readSpatial,housingContext} from './records.mjs';
import {planningContext,municipalClient} from './planning-context.mjs';
import {selectedGeometry,multiArea,overlapArea,union} from './site-geometry.mjs';

const plain=value=>load(String(value??'')).text().replace(/\s+/g,' ').trim();
const canonical=value=>plain(value).toLowerCase().replace(/[^a-z0-9]/g,'');
const url=(base,params)=>`${base}?${new URLSearchParams(params)}`;
const muni='https://library.municode.com/api';
export function evidencePassages(source){
  const words=source.text.replace(/\s+/g,' ').trim().split(' '),passages=[];
  for(let start=0;start<words.length;start+=100)passages.push({id:`${source.id}-p${passages.length+1}`,text:words.slice(start,start+120).join(' ')});
  return passages;
}
const tool=(name,description,properties={},required=[])=>({type:'function',function:{name,description,parameters:{type:'object',properties,required,additionalProperties:false}}});
export const researchTools=[
  tool('resolve_location','Resolve the user-selected outline to official municipality, active town/township and county identifiers. Start here; never substitute another location.'),
  tool('discover_map_sources','Discover trusted parcel or zoning polygon sources for this location. Returns source IDs and metadata; choose a source to query. Use search_scope regional after local sources fail or have no match; it searches wider catalogue pages. A different search hint can locate alternatives.',{kind:{type:'string',enum:['parcel','zoning']},search_hint:{type:'string',maxLength:80},search_scope:{type:'string',enum:['local','regional']}},['kind']),
  tool('read_map_source','Query ONE discovered source against the selected area (parcels) or matched parcel (zoning). On failure or no match, choose another discovered source. If identifierField is absent, inspect identifierFields and supply identifier_field only when its meaning identifies a parcel, not a block/lot component or generic object ID. Never choose among ambiguous parcels for the user.',{source_id:{type:'string',maxLength:60},identifier_field:{type:'string',maxLength:100}},['source_id']),
  tool('read_planning_guidance','Follow the exact authority’s official planning navigation. Returns official guidance and published chapter links. An explicit no-zoning statement can establish that system; an empty map cannot.'),
  tool('search_code_sections','Search the exact authority’s published code using a targeted query of your choice. Returns actual section IDs/titles and their chapter context. Search excerpts are discovery clues, not legal evidence.',{query:{type:'string',minLength:2,maxLength:120}},['query']),
  tool('list_chapter_sections','List actual section titles within a published chapter link obtained from planning guidance or zoning records. Select relevant housing provisions and their exceptions.',{chapter_id:{type:'string',maxLength:60}},['chapter_id']),
  tool('read_code_sections','Retrieve original text for up to four section IDs returned by search/list tools. Returns source passage IDs for citation. You can follow up by retrieving another section.',{section_ids:{type:'array',items:{type:'string',maxLength:60},minItems:1,maxItems:4}},['section_ids']),
  tool('read_housing_context','Retrieve local ACS rental cost-burden and rent estimates, with geography, dates and uncertainty. These do not establish site demand.'),
  tool('review_evidence','Inspect retrieved facts, conflicts, missing checks and available follow-up actions before writing the assessment. This performs no new lookups.'),
];
export const progressLabels={resolve_location:'Identifying the local authority…',discover_map_sources:'Finding public property sources…',read_map_source:'Checking mapped property records…',read_planning_guidance:'Checking the authority’s development guidance…',search_code_sections:'Searching relevant housing provisions…',list_chapter_sections:'Reviewing the published development code…',read_code_sections:'Reading source provisions and exceptions…',read_housing_context:'Checking local housing needs…',review_evidence:'Reviewing evidence and remaining gaps…'};

export function validateToolArguments(name,args){
  const definition=researchTools.find(t=>t.function.name===name)?.function.parameters;
  if(!definition||!args||typeof args!=='object'||Array.isArray(args))throw new Error('Unknown tool or invalid arguments');
  if(Object.keys(args).some(k=>!Object.hasOwn(definition.properties,k)))throw new Error('Unexpected tool argument');
  for(const k of definition.required)if(!Object.hasOwn(args,k))throw new Error('Missing tool argument');
  for(const [k,value] of Object.entries(args)){
    const p=definition.properties[k];
    if(p.type==='string'&&(typeof value!=='string'||value.length>(p.maxLength??200)||value.length<(p.minLength??1)||p.enum&&!p.enum.includes(value)))throw new Error('Invalid tool argument');
    if(p.type==='array'&&(!Array.isArray(value)||value.length<p.minItems||value.length>p.maxItems||value.some(v=>typeof v!=='string'||!v||v.length>p.items.maxLength)))throw new Error('Invalid tool argument');
  }
  return args;
}

// Each session owns the selected geometry, accepted sources and section IDs.
// The model chooses tools and follow-ups; it cannot supply arbitrary fetch URLs,
// change the location, fabricate a source, or promote its prose into a record.
export function createResearchSession(input,{read=createEvidenceClient(),now=Date.now,signal}={}){
  const selected=selectedGeometry(input.points);
  const state={schemaVersion:2,caseId:digest(input.points).slice(0,20),generatedAt:new Date(now()).toISOString(),status:'partial',evidenceStatus:'retrieved-records',selectedArea:{geometry:selected,squareMeters:multiArea(selected)},locality:null,parcel:null,parcelCandidates:[],zones:[],housing:null,sources:[],gaps:[],code:[],assessment:null,checks:[],capacity:null,codeAccess:[],planningSystem:{type:'unresolved',sources:[],codeLinks:[]}};
  const sourceRead=(target,options={})=>read(target,{...options,signal});
  const layers=new Map(),sections=new Map(),chapters=new Map(),checks=new Map();
  const discoveredKinds=new Set(),regionalKinds=new Set();
  const completed=new Set(),sourceAttempts=new Map(),conflicts=[];let codeCatalog,publishedCodes,chapterTruncated=false;
  const published=()=>publishedCodes??=createPublishedCodeSession(sourceRead,state.locality);
  const addSource=s=>{const at=state.sources.findIndex(v=>v.id===s.id);if(at<0)state.sources.push(s);else state.sources[at]=s;};
  const requireLocal=()=>{if(!state.locality)throw new Error('Resolve the selected location first');};
  const catalog=async()=>{
    requireLocal();if(state.locality.boundaryUncertain)throw new Error('Jurisdiction must be confirmed before code retrieval');
    if(codeCatalog)return codeCatalog;
    const client=await municipalClient(sourceRead,state.locality);if(!client)throw new Error('No connected code publisher matched this authority');
    const products=(await sourceRead(`${muni}/Products/clientId/${client.ClientID}`)).data.filter(p=>p.ContentType?.Id==='CODES').slice(0,3);
    const active=[];for(const product of products){const job=(await sourceRead(`${muni}/Jobs/latest/${product.ProductID}`)).data;if(job?.Id&&job.ProductId===product.ProductID)active.push({product,job});}
    codeCatalog={client,products:active};return codeCatalog;
  };
  const registerSection=(node,entry,client,trail=[])=>{
    const id=`section-${digest(`${entry.product.ProductID}:${entry.job.Id}:${node.Id}`).slice(0,16)}`;
    sections.set(id,{node:node.Id,title:plain(node.Heading??node.Title),...entry,client});
    return {section_id:id,title:plain(node.Heading??node.Title),context:trail.map(plain).join(' > ')};
  };
  const registerChapters=()=>{
    for(const link of [...state.planningSystem.codeLinks,...state.zones.flatMap(z=>Object.values(z.attributes??{}).filter(v=>/^https:\/\/library\.municode\.com\//.test(v)).map(value=>({url:value,label:'Published zoning chapter'})))]){
      const id=`chapter-${digest(link.url).slice(0,16)}`;chapters.set(id,link);
    }
    return [...chapters].map(([chapter_id,link])=>({chapter_id,title:link.label,url:link.url}));
  };
  const snapshot=()=>{
    const result=structuredClone(state),gaps=[];
    const gap=(id,title,detail,next)=>gaps.push({id,title,detail,next});
    if(!result.locality)gap('jurisdiction','The local authority remains unresolved','The connected geographic lookup has not established the selected jurisdiction.','Retry the lookup or confirm the local authority.');
    else if(result.locality.authorityUnresolved)gap('authority','The governing authority remains unresolved','Census identifies a statistical or nonfunctioning county area; it is not proof of a local planning government.','Identify the relevant state, tribal or local authority before applying development rules.');
    else if(result.locality.boundaryUncertain)gap('boundary','The planning authority needs confirming','The corners could not all be established within one jurisdiction.','Confirm the authority before applying one set of rules to the whole outline.');
    if(conflicts.length)gap('source-conflict','Public records disagree',conflicts.join(' '),'Confirm the current parcel record before relying on a site-specific conclusion.');
    if(!result.parcel){
      if(result.parcelCandidates.length)gap('parcel-match','First, confirm the parcel','More than one property intersects the outline, or the previous match changed.','Choose a parcel below. Their capacities have not been combined.');
      else gap('parcel','A reliable parcel match remains unresolved',checks.get('Parcel')==='source-error'?'The connected parcel query failed; this does not establish that no record exists.':'No usable authoritative parcel match has been retrieved. The blue outline remains an exploration area.','Retry the lookup or obtain the local assessor record.');
    }
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
    result.caseId=digest({points:input.points,parcel:result.parcel?.key,sources:result.sources.map(s=>s.hash)}).slice(0,20);return result;
  };
  const requiredFollowUps=()=>{
    if(!state.locality)return completed.has('resolve_location')?[]:['resolve_location'];
    if(state.parcelCandidates.length&&!state.parcel)return [];
    const required=[];
    if(!discoveredKinds.has('parcel'))required.push('discover_map_sources: discover parcel sources');
    for(const kind of ['parcel','zoning']){
      const missing=kind==='parcel'?!state.parcel:!state.zones.length&&state.planningSystem.type!=='no-zoning';
      const untried=[...layers].some(([id,l])=>l.kind===kind&&!sourceAttempts.has(id));
      if(missing&&discoveredKinds.has(kind)&&!regionalKinds.has(kind)&&!untried)required.push(`discover_map_sources: retry ${kind} with search_scope regional after local discovery/query returned no usable match`);
    }
    if(!discoveredKinds.has('zoning')&&state.planningSystem.type!=='no-zoning')required.push('discover_map_sources: discover zoning sources');
    if([...layers].some(([id,l])=>l.kind==='zoning'&&!sourceAttempts.has(id))&&!state.zones.length&&state.planningSystem.type!=='no-zoning')required.push('read_map_source: query a discovered zoning source');
    if([...layers].some(([id,l])=>l.kind==='parcel'&&!sourceAttempts.has(id))&&!state.parcel)required.push('read_map_source: query a discovered parcel source');
    if(!completed.has('read_planning_guidance'))required.push('read_planning_guidance');
    if(!completed.has('read_housing_context'))required.push('read_housing_context');
    if(!state.locality.boundaryUncertain&&!state.code.length){
      if(!completed.has('search_code_sections')&&!completed.has('list_chapter_sections'))required.push('search_code_sections or list_chapter_sections: original housing provisions are still needed');
      else if(sections.size||(publishedCodes?.needsRead()??false))required.push('read_code_sections: search titles are not evidence');
    }
    if(chapterTruncated&&!completed.has('search_code_sections'))required.push('search_code_sections: chapter listing was truncated; search for operative housing and development-approval provisions');
    return required;
  };
  const context=()=>{
    const r=snapshot();let chars=0;
    return {status:r.status,assessmentScope:r.assessmentScope,locality:r.locality,selectedSquareMeters:r.selectedArea.squareMeters,parcel:r.parcel?{id:r.parcel.id,address:r.parcel.address,mappedSquareMeters:r.parcel.mappedSquareMeters}:null,parcelCandidates:r.parcelCandidates.map(p=>({id:p.id,key:p.key,address:p.address})),zoning:r.zones.map(z=>({id:z.id,description:z.description})),planningSystem:r.planningSystem.type,housing:r.housing,unresolved:r.gaps,checks:r.checks,completedTools:[...completed],requiredFollowUps:requiredFollowUps(),sources:r.sources.filter(s=>['code-provision','planning-guidance'].includes(s.kind)).filter(s=>{chars+=s.text.length;return chars<=65000;}).map(s=>({id:s.id,title:s.title,url:s.url,publication:s.publication,truncated:s.truncated,passages:evidencePassages(s)})),availableMapSources:[...layers].map(([source_id,l])=>({source_id,kind:l.kind,title:l.item.title,lastOutcome:sourceAttempts.get(source_id)??'not-queried'}))};
  };
  const execute=async(name,args={})=>{
    validateToolArguments(name,args);signal?.throwIfAborted();completed.add(name);
    if(name==='resolve_location'){
      const found=await locate(sourceRead,input.points);if(!found){checks.set('Jurisdiction','unavailable');return {status:'unavailable',coverage:'Connected geographic lookup covers U.S. jurisdictions. Do not substitute a city.'};}
      state.locality=found.locality;addSource(found.evidence);checks.set('Jurisdiction',found.locality.boundaryUncertain?'needs-review':'retrieved');return {locality:state.locality,source:found.evidence};
    }
    if(name==='review_evidence')return context();
    requireLocal();
    if(name==='discover_map_sources'){
      discoveredKinds.add(args.kind);if(args.search_scope==='regional')regionalKinds.add(args.kind);
      const found=await discoverLayers(sourceRead,state.locality,input.points,args.kind,args.search_hint??'',args.search_scope??'local');
      return {kind:args.kind,discovery:found.diagnostics,sources:found.map(l=>{const id=`${args.kind}-${digest(l.url).slice(0,16)}`;layers.set(id,{...l,kind:args.kind});return {source_id:id,kind:args.kind,title:l.item.title,publisher:l.publisher,url:l.url,identifierField:l.identifierField,identifierFields:l.identifierFields,lastOutcome:sourceAttempts.get(id)??'not-queried'};}),note:found.length?'Choose a source of this kind and read it. Catalogue metadata alone does not establish a property match.':`No verified ${args.kind} source was discovered. Sources of a different kind cannot fill this gap. Use official planning guidance or another search hint.`};
    }
    if(name==='read_map_source'){
      const layer=layers.get(args.source_id);if(!layer)throw new Error('Choose a source ID returned by discovery');
      if(args.identifier_field){
        if(args.identifier_field!==layer.identifierField&&(layer.kind!=='parcel'||!layer.identifierFields.some(f=>f.name===args.identifier_field)))throw new Error(`Choose ${layer.identifierField?`identifier_field ${layer.identifierField}, or omit identifier_field`:'a parcel identifier field from this source metadata'}. Do not use a parcel number as a field name.`);
        layer.identifierField=args.identifier_field;
      }
      if(layer.kind==='parcel'&&!layer.identifierField){sourceAttempts.set(args.source_id,'identifier-needed');return {status:'identifier-needed',identifierFields:layer.identifierFields,followUp:'Inspect these source fields and choose a supported parcel identifier using identifier_field. If none is clear, try another source.'};}
      const kind=layer.kind,target=kind==='parcel'?selected:state.parcel?.geometry??selected,diagnostics={};
      const found=await readSpatial(sourceRead,[layer],target,kind,diagnostics);
      const status=found?'retrieved':diagnostics.failedQueries?'source-error':diagnostics.unsupportedQueries?'unsupported-record-format':'no-match';sourceAttempts.set(args.source_id,status);
      if(!found){if(kind==='parcel'&&!state.parcel)checks.set('Parcel',status);return {status,followUp:'Try a different discovered source or another search hint. Do not infer that the property or rules do not exist.'};}
      if(kind==='parcel'){
        if(state.parcel&&found.records.every(r=>r.id!==state.parcel.id)){conflicts.push('A queried parcel source disagrees with the retained match.');return {status:'conflict',note:'This source disagrees with the current parcel match. The existing match is retained; do not claim agreement.',candidates:found.records.map(r=>({id:r.id,address:r.address}))};}
        const oldKey=state.parcel?.key;state.parcelCandidates=found.records.slice(0,20);
        state.parcel=input.parcelKey?found.records.find(p=>p.key===input.parcelKey)??null:found.records.length===1?found.records[0]:null;
        if(oldKey!==state.parcel?.key){for(const [id,l] of layers)if(l.kind==='zoning')sourceAttempts.delete(id);state.zones=[];checks.delete('Planning system');delete state.zoningCoverage;state.sources=state.sources.filter(s=>s.id!=='zoning');}
        addSource(found.evidence);checks.set('Parcel',state.parcel?'retrieved':'needs-review');
        return {status:state.parcel?'matched':'needs-user-choice',zoningRecheckRequired:oldKey!==state.parcel?.key,parcel:state.parcel?{id:state.parcel.id,address:state.parcel.address,mappedSquareMeters:state.parcel.mappedSquareMeters}:null,candidates:state.parcelCandidates.map(p=>({id:p.id,key:p.key,address:p.address,mappedSquareMeters:p.mappedSquareMeters})),source:{id:found.evidence.id,url:found.evidence.url,publisher:found.evidence.publisher}};
      }
      state.zones=found.records;state.zoningCoverage=Math.min(1,overlapArea(union(found.records.map(z=>z.geometry)),target)/multiArea(target));addSource(found.evidence);checks.set('Planning system','zoning-map-retrieved');
      return {zones:found.records.map(z=>({id:z.id,description:z.description,attributes:z.attributes})),coverage:state.zoningCoverage,chapters:registerChapters(),source:{id:found.evidence.id,url:found.evidence.url}};
    }
    if(name==='read_planning_guidance'){
      state.planningSystem=await planningContext(sourceRead,state.locality);for(const s of state.planningSystem.sources)addSource(s);checks.set('Planning guidance',state.planningSystem.sources.length?'retrieved':'unresolved');
      return {planningSystem:state.planningSystem.type,sources:state.planningSystem.sources.map(s=>({id:s.id,title:s.title,url:s.url,passages:evidencePassages(s)})),chapters:registerChapters()};
    }
    if(name==='read_housing_context'){
      const housing=await housingContext(sourceRead,state.locality);state.housing={...housing};delete state.housing.evidence;addSource(housing.evidence);checks.set('Housing context','retrieved');return {housing:state.housing,source:housing.evidence};
    }
    let c;try{c=await catalog();}catch(error){
      if(name==='search_code_sections'){const result=await published().search(args.query);state.codeAccess=result.failures??[];return result;}
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
        if(publishedCodes?.has(id)){const page=await publishedCodes.read(id);for(const source of page.sources){addSource(source);if(!state.code.includes(source.id))state.code.push(source.id);result.push({...source,passages:evidencePassages(source)});}if(page.sections.length)result.push({navigation:page.sections,note:page.note});if(page.status==='source-unavailable')result.push({status:page.status,url:page.url,message:page.message});continue;}
        const entry=sections.get(id);if(!entry)throw new Error('Choose section IDs returned by code search or chapter listing');
        const response=await sourceRead(url(`${muni}/CodesContent`,{productId:entry.product.ProductID,jobId:entry.job.Id,nodeId:entry.node,groupChunks:'false'}));
        for(const doc of response.data.Docs??[]){
          if(doc.DocType!==1||!doc.Content||state.code.length>=10)continue;
          const $=load(doc.Content);$('script,style').remove();$('tr').each((_,row)=>{const cells=$(row).find('th,td').map((_,cell)=>$(cell).text().replace(/\s+/g,' ').trim()).get();$(row).replaceWith($('<p>').text(cells.join(' | ')));});
          const full=$.text().replace(/\s+/g,' ').trim();if(full.length<50)continue;
          const sourceId=`code-${digest(`${entry.product.ProductID}:${doc.Id}`).slice(0,16)}`;
          const source={id:sourceId,kind:'code-provision',title:plain(doc.Title),section:plain(doc.Title),publisher:`${entry.client.ClientName} · ${entry.product.ProductName}`,url:`https://library.municode.com/${state.locality.stateAbbr.toLowerCase()}/${encodeURIComponent(entry.client.ClientName.toLowerCase().replaceAll(' ','_'))}/codes/${encodeURIComponent(entry.product.ProductName.toLowerCase().replaceAll(' ','_'))}?nodeId=${encodeURIComponent(doc.Id)}`,queryUrl:response.url,hash:response.hash,retrievedAt:response.retrievedAt,text:full.slice(0,14000),truncated:full.length>14000,publication:plain(entry.job.BannerText),amendmentsPending:doc.IsAmended===true||(doc.AmendedBy?.length??0)>0};
          addSource(source);if(!state.code.includes(sourceId))state.code.push(sourceId);result.push({id:sourceId,title:source.title,publication:source.publication,truncated:source.truncated,passages:evidencePassages(source)});
        }
      }
      checks.set('Published code',state.code.length?'retrieved':'unavailable');return {sources:result};
    }
    throw new Error('Unknown tool');
  };
  const toolDefinitions=()=>researchTools.flatMap(definition=>{
    const t=structuredClone(definition),name=t.function.name,properties=t.function.parameters.properties;
    const ids=name==='read_map_source'?[...layers.keys()]:name==='read_code_sections'?[...sections.keys(),...(publishedCodes?.ids()??[])]:name==='list_chapter_sections'?[...chapters.keys()]:null;
    if(ids){if(!ids.length)return [];if(name==='read_code_sections')properties.section_ids.items.enum=ids;else properties[name==='read_map_source'?'source_id':'chapter_id'].enum=ids;}
    if(name==='read_map_source'){
      const fields=[...new Set([...layers.values()].flatMap(l=>l.kind==='parcel'?l.identifierFields.map(f=>f.name):[l.identifierField]).filter(Boolean))];
      if(fields.length)properties.identifier_field.enum=fields;else delete properties.identifier_field;
    }
    if(name==='resolve_location'&&state.locality)return [];
    return [t];
  });
  const toolCacheKey=(name,args)=>name==='read_map_source'&&layers.get(args.source_id)?.kind==='zoning'?(state.parcel?.key??'selected-area'):'';
  return {execute,snapshot,context,requiredFollowUps,toolDefinitions,toolCacheKey};
}
