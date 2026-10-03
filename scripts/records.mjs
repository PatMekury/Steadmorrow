import {parcelStudy} from './parcel-study.mjs';
import {isPrivateRecordField} from '../input-privacy.js';
import {boundaryLocation} from './boundary-location.mjs';
import { load } from 'cheerio';
import {jurisdictionFromGeographies,localityNames,sameJurisdiction} from './jurisdiction.mjs';
import { createEvidenceClient, queryFeatures, digest, isSourceUrl } from './evidence-client.mjs';
import { selectedGeometry, fromRings, overlapArea, multiArea, union, ringsOf } from './site-geometry.mjs';
import { polygonCenter } from '../geometry.js';
import { verifiedProvider,catalogueConnections,connectionMatches } from './source-providers.mjs';
import { planningContext,municipalClient } from './planning-context.mjs';

const parcelIdPatterns=[/^bbl$/i,/^(?:tmk_txt|cty_tmk|tmk|tax_?map_?key|parcel_?number|parcel_?no|parcel_?key|assessor_?parcel_?number|parcelnum|parcelnumb)$/i,/^(?:pams_pin|gis_pin|pin_nodup|newgisid|swis_sbl_id|muni_parcel_id|print_key|sbl)$/i,/^parcel[\s_]*(id|num|number|nbr)$/i,/^pin$/i,/^apn$/i,/^acct_(no|num)$/i,/^(hcad|tax|property|prop)[\s_]*(num|id)$/i,/^pid$/i,/^(taxlot|taxlot_id|parcelid)$/i,/parcel.*(identification|number|id)|account|tax.?lot/i];
const zoneIdPatterns=[/^zoning$/i,/^zone_code$/i,/^zoning_?code$/i,/^zoning_ztype$/i,/^base_zone$/i,/^zoning_base$/i,/^zone$/i,/^zone_?class$/i,/^district$/i,/^zone_?dist(?:rict)?$/i];
const arc = 'https://www.arcgis.com/sharing/rest';
const muni = 'https://library.municode.com/api';
const plain = html => load(String(html ?? '')).text().replace(/\s+/g,' ').trim();
const canonical = text => plain(text).toLowerCase().replace(/[^a-z0-9]/g,'');
const cleanQuery = text => String(text).replace(/[^\p{L}\p{N} .-]/gu,' ').slice(0,100);
const makeUrl = (base, params) => {const u=new URL(base);u.search=new URLSearchParams(params);return u.href;};
const settle = promise => promise.then(value=>({ok:true,value}),()=>({ok:false}));
function source(id,title,publisher,response,extra={}) {
  return {id,title,publisher,url:response.url,retrievedAt:response.retrievedAt,hash:response.hash,kind:'retrieved-record',...extra};
}

export async function locate(read, points) {
  const center=polygonCenter(points);
  const positions=[center,...points];
  const responses=await Promise.all(positions.map(p=>settle(read(makeUrl('https://geocoding.geo.census.gov/geocoder/geographies/coordinates',{
    x:p.lng.toFixed(6),y:p.lat.toFixed(6),benchmark:'Public_AR_Current',vintage:'Current_Current',layers:'States,Counties,Incorporated Places,County Subdivisions',format:'json',
  })))));
  const unpack=r=>jurisdictionFromGeographies(r.ok?r.value.data.result?.geographies:null);
  const centerLocality=unpack(responses[0]);
  const successful=responses.map(unpack).filter(Boolean);
  // Consistent corner lookups can still guide discovery when the center service
  // request fails. They do not prove the missing center or whole jurisdiction.
  const locality=centerLocality||(successful.length>=2&&successful.every(l=>sameJurisdiction(l,successful[0]))?successful[0]:null);
  if (!locality) return boundaryLocation(read,points);
  locality.boundaryLookupIncomplete=responses.some(r=>!unpack(r));
  locality.boundaryUncertain=responses.some(r=>!sameJurisdiction(locality,unpack(r)));
  const response=responses.find(r=>unpack(r))?.value;
  return {locality,evidence:source('jurisdiction','Geographic jurisdiction lookup','U.S. Census Bureau',response,{text:`${centerLocality?'Selected-area center':'Consistent corner locations (center unresolved)'}: ${locality.label}; county: ${locality.county}. ${locality.boundaryUncertain?(locality.boundaryLookupIncomplete?'One or more location lookups could not be completed.':'The corners do not all resolve to the same jurisdiction.'):'All four selected corners resolved to the same municipality, active township/town and county identifiers.'} Census geography guides discovery; it does not establish exclusive planning authority, tribal jurisdiction or land ownership.`,kind:'geographic-reference'})};
}

export function suitableItem(item, kind, locality) {
  const title=plain(item.title);
  if (/draft|proposed|historical|archive|capacity|centroid|point|sample|test\b|copy|future|fire|school|parking zone/i.test(title)) return false;
  if (kind==='parcel' && (!/parcel|cadastr|tax.?lot|mappluto/i.test(title)||/farmland|preservation|conservation|easement|surplus|vacant|delinquent|foreclos|parcel groups|inundation|remediation|basemap|annotation|labels|mineral|\bplss\b|public land survey|survey grid|township grid/i.test(title))) return false;
  if (kind==='zoning' && (!/zoning|land.?use.*zone|zone.*district/i.test(title)||/overlay|historic|shoreline|station|institution|hazard|evacuation|flood|tsunami|moisture|enterprise|trade zone|index/i.test(title))) return false;
  const years=title.match(/\b20\d{2}\b/g)??[];
  if (years.some(y=>Number(y)<new Date().getUTCFullYear()-2)) return false;
  if (!item.url || !isSourceUrl(item.url.replace(/^http:/,'https:'))) return false;
  const nameTokens=localityNames(locality).map(canonical);
  const description=canonical([item.title,item.description,item.snippet,item.accessInformation,item.url,item.publisherName].join(' '));
  return nameTokens.some(name=>description.includes(name));
}

export async function discoverLayers(read, locality, points, kind, searchHint='',scope='local',officialSeeds=[]) {
  const names=localityNames(locality).map(n=>`"${cleanQuery(n)}"`).join(' OR ');
  const baseTerm=kind==='parcel'?'(title:parcel OR title:parcels OR title:"tax lots" OR title:cadastral OR title:MapPLUTO)':'(title:zoning OR title:"land use zoning")';
  const term=searchHint?`(${baseTerm} OR title:"${cleanQuery(searchHint)}")`:baseTerm;
  const xs=points.map(p=>p.lng),ys=points.map(p=>p.lat);
  const bbox=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)].join(',');
  const diagnostics={searches:0,failedSearches:0,candidates:0,checked:0,rejectedPublisher:0,failedServices:0,truncated:false,scope};
  const summaries=[];
  const search=async(q,start=1)=>{
    diagnostics.searches++;
    try {const r=await read(makeUrl(`${arc}/search`,{f:'json',q,bbox,num:'60',start:String(start),sortField:'numviews',sortOrder:'desc'}));summaries.push(...(r.data.results??[]));return r.data.nextStart;}
    catch {diagnostics.failedSearches++;return -1;}
  };
  const type='(type:"Feature Service" OR type:"Map Service")';
  const query=`(${names}) AND ${term} AND ${type}`;
  const next=officialSeeds.length?-1:await search(query);
  // Regional discovery lets the model recover from sparse naming/metadata and
  // page past popular, non-applicable search results. Geometry is still queried.
  if(!officialSeeds.length&&scope==='regional'){
    if(next>0)await search(query,next);
    await search(`${term} AND ${type}`);
  }else if(!officialSeeds.length&&!summaries.length&&names)await search(`${term} AND ${type}`);
  const connected=officialSeeds.length?[]:await Promise.all(catalogueConnections.filter(c=>c.kind===kind&&connectionMatches(c,locality)).map(async c=>{try{return {...(await read(`${arc}/content/items/${c.itemId}?f=json`)).data,connection:c};}catch{return null;}}));
  const candidates=[...new Map([...officialSeeds,...summaries,...connected.filter(Boolean)].filter(i=>i.authorityProof||i.connection||suitableItem(i,kind,locality)).map(i=>[i.url.replace(/^http:/,'https:').replace(/\/$/,''),i])).values()];
  const trustRank=i=>i.connection?4:verifiedProvider(i.url)?3:new URL(i.url).hostname.endsWith('.gov')?2:i.contentStatus==='public_authoritative'?1:0;
  candidates.sort((a,b)=>trustRank(b)-trustRank(a) || (b.modified??0)-(a.modified??0));
  diagnostics.candidates=candidates.length;
  const layers=[],seenLayers=new Set(),limit=scope==='regional'?24:12;
  const inspect=async candidate=>{
    diagnostics.checked++;
    try {
      let item=candidate;
      if(item.id&&!item.authorityProof&&(!item.orgId||!item.contentStatus)){
        try{item={...candidate,...(await read(`${arc}/content/items/${encodeURIComponent(item.id)}?f=json`)).data};}catch{}
      }
      const url=item.url.replace(/^http:/,'https:').replace(/\/$/,'');
      if(!isSourceUrl(url)&&!item.authorityProof)return [];
      const provider=verifiedProvider(url);
      const governmentHost=new URL(url).hostname.endsWith('.gov') || /\.(?:state\.[a-z]{2}|(?:co|ci)\.[a-z-]+\.[a-z]{2})\.us$/.test(new URL(url).hostname);
      let publisher=provider?.publisher||plain(item.accessInformation)||'Government GIS publisher';
      if (!governmentHost&&!provider&&!item.connection&&!item.authorityProof) {
        if (item.contentStatus!=='public_authoritative' || !item.orgId){diagnostics.rejectedPublisher++;return [];}
        const org=await read(`${arc}/portals/${encodeURIComponent(item.orgId)}?f=json`);
        publisher=plain(org.data.name);
        const matches=localityNames(locality).some(n=>canonical(publisher).includes(canonical(n)));
        if (!matches || !/city|county|town|borough|government|municipal|planning|regional|state|geographic|gis|information|natural resources|revenue|assessor|commonwealth/i.test(publisher)){diagnostics.rejectedPublisher++;return [];}
      }
      const service=await read(`${url}?f=json`);
      const thematic=name=>kind==='parcel'?/parcel|cadastr|tax.?lot|mappluto/i.test(name):/zon(e|ing)|district/i.test(name);
      // Service layer IDs may be sparse or nested. Rank the complete leaf list;
      // never assume the relevant layer is among IDs 0 through 7.
      const leaves=(service.data.layers??[]).filter(l=>!l.subLayerIds?.length).sort((a,b)=>Number(thematic(b.name))-Number(thematic(a.name)));
      if(leaves.length>24)diagnostics.truncated=true;
      const options=service.data.fields?[{url,meta:service.data}]:leaves.slice(0,24).map(l=>({url:`${url}/${l.id}`,name:l.name}));
      const found=[];
      for(let offset=0;offset<options.length&&found.length<3;offset+=4){
        const results=await Promise.all(options.slice(offset,offset+4).map(async option=>{
          try{
            const meta=option.meta??(await read(`${option.url}?f=json`)).data;
            if(meta.geometryType!=='esriGeometryPolygon'||!Array.isArray(meta.fields))return null;
            const fields=meta.fields.filter(f=>!isPrivateRecordField(f)&&/objectid|parcel|pin\b|apn|(?:hcad|tax|property)_?(?:num|id)|account|acct|address|situs|zone|zoning|district|land.?use|current.?use|unit|building|bldg|builtfar|residfar|commfar|facilfar|spdist|histdist|landmark|e_desig|acre|sqft|area|ordinance|effective|chapter|code.?link/i.test(`${f.name} ${f.alias}`)).map(f=>f.name);
            const idField=findField(meta,kind==='parcel'?parcelIdPatterns:zoneIdPatterns);
            if(item.authorityProof&&!thematic(option.name||meta.name||item.title))return null;
            if(!idField&&(option.name||meta.name)&&!thematic(option.name||meta.name))return null;
            const identifierFields=meta.fields.filter(f=>!isPrivateRecordField(f)&&/^(esriFieldTypeString|esriFieldTypeInteger|esriFieldTypeDouble|esriFieldTypeSmallInteger)$/.test(f.type??'esriFieldTypeString')&&!/object.?id|global.?id|^fid$|^oid$|shape|geom|owner|mail|phone|email|address|acre|area|length|date|value|created|edited|subdivision|borough|borocode|borocd|census|tract|^lot$|^lot |block|type|description|status|county|municipal|jurisdiction|name|^zone$|^section$|^plat$/i.test(f.name+' '+(f.alias??''))).slice(0,30).map(f=>({name:f.name,alias:f.alias??f.name}));
            if(!idField&&(kind!=='parcel'||!identifierFields.length))return null;
            if(idField&&!fields.includes(idField.name))fields.push(idField.name);
            const addressField=findField(meta,[/^situs_?(addr|address)$/i,/^(?:prop_loc|st_address|parcel_addr)$/i,/^address$/i,/^full_?addr(ess)?$/i,/situs|address/i]);
            if(addressField&&!isPrivateRecordField(addressField)&&!fields.includes(addressField.name))fields.push(addressField.name);
            return {url:option.url,meta,item,publisher,fields,identifierFields,identifierField:idField?.name??null};
          }catch{diagnostics.failedServices++;return null;}
        }));
        found.push(...results.filter(Boolean));
      }
      return found.slice(0,3);
    } catch {diagnostics.failedServices++;return [];}
  };
  for(let offset=0;offset<Math.min(candidates.length,limit)&&layers.length<6;offset+=4){
    const groups=await Promise.all(candidates.slice(offset,Math.min(offset+4,limit)).map(inspect));
    for(const layer of groups.flat())if(!seenLayers.has(layer.url)&&layers.length<6){layers.push(layer);seenLayers.add(layer.url);}
  }
  diagnostics.truncated ||= diagnostics.checked<candidates.length || next>0&&scope!=='regional';
  Object.defineProperty(layers,'diagnostics',{value:diagnostics});
  return layers;
}

// Shape expressions exposed in ArcGIS metadata are not ordinary outFields on
// every service. Request geometry through returnGeometry and measure it locally.
// Keep genuine property attributes (lot area, acreage, use and identifiers).
const geometryAttribute=field=>field?.type==='esriFieldTypeGeometry'||/^(?:shape|geom(?:etry)?)(?:[._]|$)|[()]/i.test(field?.name??field??'');
function findField(meta, patterns) {
  for(const pattern of patterns) {const f=meta.fields.find(f=>!isPrivateRecordField(f)&&(pattern.test(f.name)||pattern.test(f.alias??''))); if(f)return f;}
  return null;
}
function valueOf(meta, attrs, field) {
  if(!field)return null;
  const raw=attrs[field.name];
  if(raw===null||raw===undefined||String(raw).trim()==='')return null;
  return String(field.domain?.codedValues?.find(c=>String(c.code)===String(raw))?.name??raw).slice(0,240);
}
export async function readSpatial(read,layers,geometry,kind,diagnostics={}) {
  diagnostics.completedQueries=0;diagnostics.failedQueries=0;diagnostics.unsupportedQueries=0;
  for (const layer of layers) {
    try {
      const chosen=layer.identifierField?layer.meta.fields.find(f=>f.name===layer.identifierField):null;
      const requestFields=[...new Set([...layer.fields,...(chosen?[chosen.name]:[])])].filter(name=>{const field=layer.meta.fields.find(f=>f.name===name)??name;return !isPrivateRecordField(field)&&!geometryAttribute(field);});
      const response=await queryFeatures(read,layer.url,ringsOf(geometry),requestFields.join(','));
      diagnostics.completedQueries++;
      const idField=chosen??findField(layer.meta,kind==='parcel'?parcelIdPatterns:zoneIdPatterns);
      if(!idField){diagnostics.unsupportedQueries++;continue;}
      const address=findField(layer.meta,[/^situs_?(addr|address)$/i,/^(?:prop_loc|st_address|parcel_addr)$/i,/^address$/i,/^full_?addr(ess)?$/i,/situs|address/i]);
      const description=findField(layer.meta,[/^zone_description$/i,/^zon(?:e|ing)_?desc$/i,/zoning.*description|district.*name/i]);
      const merged=new Map();
      for(const feature of response.data.features) {
        const id=kind==='zoning'?String(feature.attributes[idField.name]??'').trim():valueOf(layer.meta,feature.attributes,idField);
        if(!id||!feature.geometry?.rings)continue;
        const shape=fromRings(feature.geometry.rings), overlap=overlapArea(shape,geometry);
        if(overlap<0.5)continue;
        const existing=merged.get(id);
        const attributes=Object.fromEntries(Object.entries(feature.attributes).filter(([k,v])=>v!==null&&requestFields.includes(k)&&!isPrivateRecordField(layer.meta.fields.find(f=>f.name===k)??k)).map(([k,v])=>[k,String(v).slice(0,240)]));
        merged.set(id,{id,key:digest(`${layer.item.id}:${id}`).slice(0,20),address:valueOf(layer.meta,feature.attributes,address),description:valueOf(layer.meta,feature.attributes,description)??(kind==='zoning'?valueOf(layer.meta,feature.attributes,idField):null),geometry:existing?union([existing.geometry,shape]):shape,attributes});
      }
      const records=[...merged.values()].map(r=>({...r,overlapSquareMeters:overlapArea(r.geometry,geometry),mappedSquareMeters:multiArea(r.geometry)})).sort((a,b)=>b.overlapSquareMeters-a.overlapSquareMeters);
      if(!records.length)continue;
      const evidence=source(kind,plain(layer.item.title),layer.publisher,response,{
        url:layer.item.sourcePage||`https://www.arcgis.com/home/item.html?id=${layer.item.id}`,queryUrl:response.url,authorityProof:layer.item.authorityProof,
        layerUrl:layer.url,sourceUpdatedAt:layer.meta.editingInfo?.lastEditDate?new Date(layer.meta.editingInfo.lastEditDate).toISOString():null,
        catalogUpdatedAt:layer.item.modified?new Date(layer.item.modified).toISOString():null,
        attribution:plain(layer.meta.copyrightText||layer.item.accessInformation),license:plain(layer.item.licenseInfo)||'No reuse licence stated in the catalogue; displayed with source attribution.',
        text:JSON.stringify(records.map(({id,address,description,attributes})=>({id,address,description,attributes}))).slice(0,9000),
        kind:'mapped-record',
      });
      return {records,evidence};
    } catch(error) { diagnostics.failedQueries++;(diagnostics.failures??=[]).push(/Source returned \d+|Source query rejected|Incomplete spatial|Unsupported source|Invalid source/.test(error.message)?error.message:'Source timed out or could not be read'); }
  }
  return null;
}

export async function housingContext(read,locality) {
  const geo=locality.cityId?`16000US${locality.cityId}`:`05000US${locality.countyId}`;
  const response=await read(makeUrl('https://api.censusreporter.org/1.0/data/show/acs2024_5yr',{table_ids:'B25070,B25064',geo_ids:geo}),{ttl:86400000});
  const data=response.data, tables=data.data?.[geo];
  if(data.release?.id!=='acs2024_5yr'||!tables?.B25070)throw new Error('Housing estimates unavailable');
  const estimate=tables.B25070.estimate, error=tables.B25070.error??{};
  const keys=['B25070007','B25070008','B25070009','B25070010'];
  const valid=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
  if(![estimate.B25070001,estimate.B25070011,...keys.map(k=>estimate[k])].every(valid))throw new Error('Suppressed housing estimates');
  const denominator=estimate.B25070001-estimate.B25070011;
  const burdened=keys.reduce((sum,k)=>sum+estimate[k],0);
  if(denominator<=0||burdened>denominator)throw new Error('Invalid housing denominator');
  const percent=Math.round(100*burdened/denominator);
  const rent=tables.B25064?.estimate?.B25064001, rentMoe=tables.B25064?.error?.B25064001;
  const geography=data.geography?.[geo]?.name??locality.label;
  return {
    geography,period:'2020–2024',percent,burdened,denominator,medianRent:valid(rent)?rent:null,medianRentMargin:valid(rentMoe)?rentMoe:null,
    numeratorMargin:keys.every(k=>valid(error[k]))?Math.sqrt(keys.reduce((s,k)=>s+error[k]**2,0)):null,
    evidence:source('housing','Housing cost estimates · ACS 2020–2024','U.S. Census Bureau, distributed by Census Reporter',response,{kind:'statistical-estimate',period:'2020–2024',section:'B25070 and B25064',
      text:`${geography}. Of ${denominator} renter households with a computed rent-to-income ratio, an estimated ${burdened} (${percent}%, rounded) spent at least 30% of household income on gross rent. ${valid(rent)?`Median gross rent: $${rent}${valid(rentMoe)?` (margin of error ±$${rentMoe})`:''}.`:''} ACS five-year estimates, 2020–2024. This is area-wide context, not demand or affordable rent for the selected parcel.`,
      calculation:'B25070 categories 007–010 / (001 − 011). Category 011, ratio not computed, is excluded. Estimates and source margins of error are retained.'}),
  };
}

// Rank provisions by their relevance to a housing site, not by generic words
// such as "prohibited" (which also match parking tickets and street conduct).
export function provisionRank(title) {
  if (/metered|parking meter|overtime|feeding meters|parking for (?:certain|rental)|prohibited activities|commercial vehicles|large vehicles|yard parking|penalt|fee schedule/i.test(title)) return 0;
  let score=0;
  if (/permitted uses|prohibited uses|allowable uses|use table|use regulations|land use requirements/i.test(title)) score=14;
  else if (/building line requirement|minimum lot|lot size|minimum width of a lot|development plat required|parking spaces for.*use classifications/i.test(title)) score=12;
  else if (/development standards|off.street parking|parking requirements|density|setbacks|lot coverage|residential.*(?:standards|development)/i.test(title)) score=9;
  else if (/height|affordable|development plat|floodplain.*(?:development|construction)|development.*floodplain|site plan submittal/i.test(title)) score=6;
  if(score&&/exception|optional|special|additional|reduc|conflict|revocation/i.test(title))score-=3;
  return score;
}
const provisionTopic=title=>/building line|setback/i.test(title)?'setback':/lot size|minimum lot|width of a lot/i.test(title)?'lot':/development plat/i.test(title)?'plat':title;
export function provisionPaths(tree, scopes, fallback=[]) {
  const indexed=new Map();
  const index=(node,parents=[])=>{indexed.set(node.Id,{node,parents});for(const child of node.Children??[])index(child,[...parents,node]);};index(tree);
  const groups=[];
  for(const scope of scopes){
    const entry=indexed.get(scope.id);if(!entry)continue;
    // Some official chapter links point to a section inside the chapter.
    // Resolve the actual ancestor from the publisher's TOC, never guess its ID.
    const root=/chapter/i.test(scope.label??'')?[...entry.parents,entry.node].reverse().find(n=>/chapter/i.test(n.Heading??n.Title??''))??entry.node:entry.node;
    const sections=[];
    const collect=node=>{const score=provisionRank(node.Heading??node.Title??'');if(score&&!node.Children?.length)sections.push({id:node.Id,score,topic:provisionTopic(node.Heading??node.Title??'')});for(const child of node.Children??[])collect(child);};collect(root);
    sections.sort((a,b)=>b.score-a.score);const topics=new Set(),first=[],rest=[];for(const section of sections){(topics.has(section.topic)?rest:first).push(section);topics.add(section.topic);}if(sections.length)groups.push([...first,...rest]);
  }
  // Retain coverage across relevant chapters rather than letting one chapter
  // consume the entire evidence budget.
  const ids=new Set();
  for(let round=0;round<3&&ids.size<8;round++)for(const group of groups){if(group[round]&&ids.size<8)ids.add(group[round].id);}
  if(!ids.size)return [...fallback].slice(0,6);
  return [...ids];
}

export async function municipalCode(read,locality,zones,planning={codeLinks:[]}) {
  if(!locality.stateAbbr||locality.boundaryUncertain)return null;
  const client=await municipalClient(read,locality);
  if(!client)return null;
  const products=(await read(`${muni}/Products/clientId/${client.ClientID}`)).data;
  const selected=products.filter(p=>p.ContentType?.Id==='CODES').sort((a,b)=>Number(/zoning|land development|unified development/i.test(b.ProductName))-Number(/zoning|land development|unified development/i.test(a.ProductName))).slice(0,2);
  const zoneNames=zones.map(z=>cleanQuery(z.id)).filter(Boolean).slice(0,2);
  const searchTerms=zoneNames.length?zoneNames.map(z=>`"${z}" residential`):['residential housing zoning'];
  const allHits=[];
  for(const term of searchTerms) {
    const search=await settle(read(makeUrl('https://library.municode.com/localapi/search',{clientId:String(client.ClientID),searchText:term,contentTypeId:'CODES',mode:'CLIENTMODE',pageNum:'1',pageSize:'20',fragmentSize:'200',sort:'0',isAdvanced:'false',isAutocomplete:'false',titlesOnly:'false'})));
    if(search.ok)allHits.push(...(search.value.data.hits??[]));
  }
  const allowedProductIds=new Set(selected.map(p=>String(p.ProductID)));
  const hits=[...new Map(allHits.filter(h=>allowedProductIds.has(String(h.product?.id))).map(h=>[h.nodeId,h])).values()];
  const rank=h=>{
    const title=plain(h.title), trail=plain((h.ancestors??[]).map(a=>a.title).join(' '));
    if(!/land use|zoning|development|residential|housing|subdivision/i.test(trail+' '+title)||/alarm|penalties|collection fees|police|firearms|licen[cs]e|noise|adult-oriented|advertising|electric vehicle/i.test(title))return -100;
    let score=/permitted|prohibited|allowable|use table|use regulations|land use requirements/i.test(title)?12:0;
    if(/development standards|dimensional|height|setback|density|parking|residential uses/i.test(title))score+=6;
    if(/land use|zoning|development|residential/i.test(trail))score+=4;
    if(/rezone|amendments|purpose|function|definitions|map|overlay|historic|emergency|temporary|nonconform/i.test(title+' '+trail))score-=10;
    return score;
  };
  hits.sort((a,b)=>rank(b)-rank(a));
  // Include a chapter's use section when search hits only its dimensions.
  const pick=hits.filter(h=>rank(h)>0).slice(0,4);
  const evidence=[],seen=new Set(); let ordinal=0;
  for(const product of selected) {
    const job=(await read(`${muni}/Jobs/latest/${product.ProductID}`)).data;
    if(!job?.Id||job.ProductId!==product.ProductID)continue;
    const productHits=pick.filter(h=>String(h.product.id)===String(product.ProductID));
    let paths=new Set(productHits.map(h=>h.nodeId));
    const directPaths=new Map();
    const publishedLinks=[...zones.flatMap(zone=>Object.values(zone.attributes??{})),...(planning.codeLinks??[]).map(link=>link.url)];
    for(const value of publishedLinks){
      try{const url=new URL(value);const parts=url.pathname.split('/');if(url.hostname==='library.municode.com'&&parts[1]?.toLowerCase()===locality.stateAbbr.toLowerCase()&&canonical(decodeURIComponent(parts[2]))===canonical(client.ClientName)&&canonical(decodeURIComponent(parts[4]??''))===canonical(product.ProductName)&&url.searchParams.has('nodeId'))directPaths.set(url.searchParams.get('nodeId'),(planning.codeLinks??[]).find(link=>link.url===value)?.label??'');}catch{}
    }
    if(directPaths.size)paths=new Set(directPaths.keys());
    if(!paths.size)continue;
    // Public TOC lookup supplies exact node identifiers; no invented chapter URL.
    try {
      const tree=(await read(makeUrl(`${muni}/codesToc/fullTree`,{productId:String(product.ProductID),jobId:String(job.Id)}),{maxBytes:5_000_000})).data;
      const scopes=directPaths.size?[...directPaths].map(([id,label])=>({id,label})):productHits.flatMap(h=>(h.ancestors??[]).filter(a=>/chapter/i.test(a.title)).map(a=>({id:a.nodeId,label:a.title})));
      const chosen=provisionPaths(tree,scopes,paths);
      paths=new Set(directPaths.size?chosen:[...paths,...chosen].slice(0,6));
    } catch { /* Search-derived sections remain available; completeness stays unresolved. */ }
    const responses=await Promise.all([...paths].slice(0,8).map(node=>settle(read(makeUrl(`${muni}/CodesContent`,{productId:String(product.ProductID),jobId:String(job.Id),nodeId:node,groupChunks:'false'})))));
    for(const result of responses) {
      if(!result.ok)continue;
      const docs=(result.value.data.Docs??[]).sort((a,b)=>Number(/permitted|prohibited|use regulations|development standards/i.test(b.Title))-Number(/permitted|prohibited|use regulations|development standards/i.test(a.Title)));
      for(const doc of docs) {
        if(doc.DocType!==1||!doc.Content||evidence.length>=8||seen.has(doc.Id))continue;
        seen.add(doc.Id);
        const d=load(doc.Content);d('script,style').remove();
        // Preserve table relationships in the evidence given to Gloo.
        d('tr').each((_,row)=>{const cells=d(row).find('th,td').map((_,cell)=>d(cell).text().replace(/\s+/g,' ').trim()).get();d(row).replaceWith(d('<p>').text(cells.join(' | ')));});
        const full=d.text().replace(/\s+/g,' ').trim();
        if(full.length<50)continue;
        const codeUrl=`https://library.municode.com/${locality.stateAbbr.toLowerCase()}/${encodeURIComponent(client.ClientName.toLowerCase().replaceAll(' ','_'))}/codes/${encodeURIComponent(product.ProductName.toLowerCase().replaceAll(' ','_'))}?nodeId=${encodeURIComponent(doc.Id)}`;
        evidence.push(source(`code-${++ordinal}`,plain(doc.Title),`${client.ClientName} · ${product.ProductName}`,result.value,{
          url:codeUrl,queryUrl:result.value.url,kind:'code-provision',section:plain(doc.Title),
          text:full.slice(0,14000),truncated:full.length>14000,publication:plain(job.BannerText),sourceUpdatedAt:job.OnlineDate??job.PublishDate??null,
          amendmentsPending:doc.IsAmended===true || (doc.AmendedBy?.length??0)>0,
        }));
      }
    }
  }
  return evidence.length?{client:client.ClientName,evidence}:null;
}

export function createRecordsService({fetchImpl=fetch,now=Date.now,timeoutMs}={}) {
  const sourceRead=createEvidenceClient({fetchImpl,now,timeoutMs});
  const cache=new Map(),pending=new Map();let calls=[];
  return async input=>{
    const key=digest({points:input.points,parcelKey:input.parcelKey??null});
    const cached=cache.get(key);
    if(cached&&now()-cached.time<(cached.value.status==='preliminary'||cached.value.status==='needs-parcel'?900000:30000))return structuredClone(cached.value);
    if(pending.has(key))return structuredClone(await pending.get(key));
    calls=calls.filter(t=>now()-t<60000);
    if(calls.length>=12)throw new Error('Public-record request limit reached. Please try again shortly.');
    calls.push(now());
    const task=(async()=>{
      const signal=AbortSignal.timeout(60000);
      const read=(url,options={})=>sourceRead(url,{...options,signal});
      const selected=selectedGeometry(input.points);
      const result={schemaVersion:2,caseId:key.slice(0,20),generatedAt:new Date(now()).toISOString(),status:'partial',evidenceStatus:'retrieved-records',selectedArea:{geometry:selected,squareMeters:multiArea(selected)},locality:null,parcel:null,parcelCandidates:[],zones:[],housing:null,sources:[],gaps:[],code:[],assessment:null,checks:[],capacity:null};
      const gap=(id,title,detail,next)=>result.gaps.push({id,title,detail,next});
      let located;
      try{located=await locate(read,input.points);}catch{located=null;}
      if(!located) {
        result.status='unavailable';
        gap('jurisdiction','The local planning authority could not be established','The connected geographic service covers U.S. jurisdictions and did not return a usable match here. No local rules have been applied.','Check the location or retry. Outside this service’s coverage, obtain records from the relevant local authority.');
        result.checks.push({name:'Jurisdiction',status:'unavailable'});return result;
      }
      result.locality=located.locality; result.sources.push(located.evidence);
      result.checks.push({name:'Jurisdiction',status:located.locality.boundaryUncertain?'needs-review':'retrieved'});
      if(result.locality.boundaryUncertain)gap('boundary','The planning authority needs confirming',result.locality.boundaryLookupIncomplete?'One or more corner lookups failed. The center locality is available, but the authority for the whole outline could not be confirmed.':'The selected corners resolve to different city or county identifiers. One authority’s rules cannot be applied to the whole area.','Adjust the area or confirm the relevant planning authority before interpreting the rules.');
      const [parcelLayers,zoningLayers,housing,planning]=await Promise.all([
        settle(discoverLayers(read,result.locality,input.points,'parcel')),
        settle(discoverLayers(read,result.locality,input.points,'zoning')),
        settle(housingContext(read,result.locality)),
        settle(planningContext(read,result.locality)),
      ]);
      result.planningSystem=planning.ok?planning.value:{type:'unresolved',sources:[],codeLinks:[]};
      result.sources.push(...result.planningSystem.sources);
      if(housing.ok){result.housing={...housing.value};delete result.housing.evidence;result.sources.push(housing.value.evidence);}
      else gap('housing','Local housing estimates were not available','No housing demand or affordable rent has been inferred from the map.','Retry the statistics source or consult the local housing-needs assessment.');
      result.checks.push({name:'Housing context',status:housing.ok?'retrieved':'unavailable'});
      const parcelDiagnostics={};
      const parcels=parcelLayers.ok?await readSpatial(read,parcelLayers.value,selected,'parcel',parcelDiagnostics):null;
      const parcelLookupStatus=parcels?'retrieved':!parcelLayers.ok||(!parcelDiagnostics.completedQueries&&parcelDiagnostics.failedQueries)?'source-error':!parcelLayers.value.length?'no-supported-source':parcelDiagnostics.unsupportedQueries===parcelDiagnostics.completedQueries?'unsupported-record-format':'no-match';
      if(parcels) {
        result.sources.push(parcels.evidence);
        result.parcelCandidates=parcels.records.slice(0,20);
        const collection=parcelStudy(parcels.records,selected,input.parcelKey);result.parcel=collection.parcel;
        if(!result.parcel){result.status='needs-parcel';gap('parcel-match','The mapped records overlap or conflict','Confirm the correct property record. Adjacent parcels can be studied together without combining their legal rights.','Choose the correct overlapping record below.');}
      } else gap('parcel',parcelLookupStatus==='source-error'?'The parcel source could not be reached':'A reliable parcel match was not found',parcelLookupStatus==='source-error'?'The connected parcel lookup failed. This is a source failure, not evidence that no parcel exists.':parcelLookupStatus==='unsupported-record-format'?'A public layer was found, but its parcel identifier could not be interpreted reliably. The record format needs adapter support.':parcelLookupStatus==='no-match'?'The queried public layers did not return a usable parcel polygon intersecting this outline. The blue outline remains an exploration area.':'No supported authoritative parcel layer was discovered for this selection. A local record may still exist outside the connected sources.','Retry the lookup, check the outline, or obtain the parcel record from the local assessor.');
      result.checks.push({name:'Parcel',status:result.parcel?'retrieved':parcels?'needs-review':parcelLookupStatus});
      const target=result.parcel?.geometry??selected;
      const zoning=zoningLayers.ok?await readSpatial(read,zoningLayers.value,target,'zoning'):null;
      if(zoning){result.zones=zoning.records;result.sources.push(zoning.evidence);}
      else if(result.planningSystem.type!=='no-zoning')gap('zoning','The applicable planning controls are not fully established','A zoning polygon could not be matched, and no official statement establishing an alternative planning system was found. Retrieved local provisions can still be reviewed separately.','Confirm the local planning controls and their application to this property.');
      result.checks.push({name:'Planning system',status:result.planningSystem.type==='no-zoning'?'no-zoning-confirmed':zoning?'zoning-map-retrieved':'unresolved'});
      if(result.zones.length>1)gap('split-zoning','More than one zoning district intersects the site','A single district’s rules cannot safely be applied across this site.','Ask the planning authority which provisions apply to the intended housing area.');
      if(zoning){
        const coverage=overlapArea(union(result.zones.map(z=>z.geometry)),target)/multiArea(target);
        result.zoningCoverage=Math.min(1,coverage);
        if(coverage<0.98)gap('zoning-coverage','The zoning map does not cover the whole site','The matched zoning polygons leave part of the mapped site unresolved. A nearby district cannot fill that gap.','Confirm the missing designation or jurisdiction before interpreting the site’s rules.');
        const flags=result.zones.flatMap(z=>Object.entries(z.attributes).filter(([key,value])=>/^(overlay|historic|contract)$/i.test(key)&&String(value).trim()&&!/^(none|no|n|0)$/i.test(String(value).trim())).map(([key,value])=>`${z.id}: ${key.toLowerCase()} ${value}`));
        if(flags.length)gap('map-conditions','The zoning record flags additional conditions',flags.join('; ')+'. The effect of these mapped flags has not been resolved.','Check the related overlay, historic or contract provisions with planning staff.');
      }
      if(result.status!=='needs-parcel') {
        const code=await settle(municipalCode(read,result.locality,result.zones,result.planningSystem));
        if(code.ok&&code.value){result.code=code.value.evidence.map(e=>e.id);result.sources.push(...code.value.evidence);}
      }
      result.checks.push({name:'Published code',status:result.code.length?'retrieved':'unavailable'});
      if(!result.code.length)gap('code','The governing provisions have not been retrieved','The connected code publisher did not return usable provisions for this jurisdiction and district. A zoning label alone does not establish permission.','Review the authority’s published code before deciding which housing route to explore.');
      else gap('applicability','Confirm the approval route and site-specific conditions','The retrieved local provisions are not a complete site review. Uncodified amendments, special controls and exceptions have not been exhaustively checked.','Confirm the applicable sections and approvals with the local planning authority.');
      gap('capacity','A reliable home count needs more site evidence','Access, lot-edge classification, existing development, easements, environmental constraints and service capacity have not all been established.','Use a site plan and the relevant records to resolve these checks before calculating capacity.');
      gap('affordability','Affordable delivery is not established by zoning','Ownership/control, intended affordability commitments and funding have not been verified.','Explore an appropriate housing partnership and affordability conditions using the church’s stated priorities.');
      result.checks.push({name:'Environmental, access and title checks',status:'not-established'});
      if(result.code.length&&result.parcel&&!result.locality.boundaryUncertain&&((result.zones.length===1&&result.zoningCoverage>=0.98)||result.planningSystem.type==='no-zoning'))result.status='preliminary';
      result.assessmentScope=result.status==='preliminary'?'matched-site':'local-rules';
      const gapOrder=['boundary','parcel-match','selection','parcel','zoning','zoning-coverage','split-zoning','map-conditions','code','applicability','capacity','housing','affordability'];
      result.gaps.sort((a,b)=>gapOrder.indexOf(a.id)-gapOrder.indexOf(b.id));
      result.caseId=digest({key,sources:result.sources.map(s=>s.hash)}).slice(0,20);
      return result;
    })();
    pending.set(key,task);
    try{const value=await task;cache.set(key,{time:now(),value});if(cache.size>32)cache.delete(cache.keys().next().value);return structuredClone(value);}finally{pending.delete(key);}
  };
}
