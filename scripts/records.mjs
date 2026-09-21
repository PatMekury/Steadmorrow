import { load } from 'cheerio';
import { createEvidenceClient, queryFeatures, digest, isSourceUrl } from './evidence-client.mjs';
import { selectedGeometry, fromRings, overlapArea, multiArea, union, ringsOf } from './site-geometry.mjs';
import { polygonCenter } from '../geometry.js';

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
  const responses=await Promise.all(positions.map(p=>read(makeUrl('https://geocoding.geo.census.gov/geocoder/geographies/coordinates',{
    x:p.lng.toFixed(6),y:p.lat.toFixed(6),benchmark:'Public_AR_Current',vintage:'Current_Current',layers:'States,Counties,Incorporated Places,County Subdivisions',format:'json',
  }))));
  const unpack=r=>{
    const g=r.data.result?.geographies;
    if (!g?.States?.length || !g?.Counties?.length) return null;
    const state=g.States[0], county=g.Counties[0], city=g['Incorporated Places']?.[0], subdivision=g['County Subdivisions']?.[0];
    return {state:state.NAME,stateAbbr:state.STUSAB,stateId:state.STATE,county:county.NAME,countyBase:county.BASENAME,countyId:county.GEOID,city:city?.BASENAME??null,cityId:city?.GEOID??null,subdivision:subdivision?.NAME??null};
  };
  const locality=unpack(responses[0]);
  if (!locality) return null;
  locality.boundaryUncertain=responses.some(r=>{const j=unpack(r);return !j||j.stateId!==locality.stateId||j.countyId!==locality.countyId||j.cityId!==locality.cityId;});
  locality.label=[locality.city||locality.county,locality.stateAbbr].join(', ');
  return {locality,evidence:source('jurisdiction','Geographic jurisdiction lookup','U.S. Census Bureau',responses[0],{text:`Selected-area center: ${locality.label}; county: ${locality.county}. ${locality.boundaryUncertain?'The corners do not all resolve to the same jurisdiction.':'All four selected corners resolved to the same city/county identifiers.'} Municipal boundary and planning authority still require confirmation if a record conflicts.`,kind:'geographic-reference'})};
}

export function suitableItem(item, kind, locality) {
  const title=plain(item.title);
  if (/draft|proposed|historical|archive|capacity|centroid|point|sample|test\b|copy|future|fire|school|parking zone/i.test(title)) return false;
  if (kind==='parcel' && (!/parcel|cadastr|tax.?lot/i.test(title)||/farmland|preservation|conservation|easement|surplus|vacant|delinquent|foreclos/i.test(title))) return false;
  if (kind==='zoning' && (!/zon(e|ing)/i.test(title)||/overlay|historic|shoreline|station|institution/i.test(title))) return false;
  const years=title.match(/\b20\d{2}\b/g)??[];
  if (years.some(y=>Number(y)<new Date().getUTCFullYear()-2)) return false;
  if (!item.url || !isSourceUrl(item.url.replace(/^http:/,'https:'))) return false;
  const nameTokens=[locality.city,locality.countyBase].filter(Boolean).map(canonical);
  const description=canonical([item.title,item.description,item.snippet,item.accessInformation].join(' '));
  return nameTokens.some(name=>description.includes(name));
}

export async function discoverLayers(read, locality, points, kind) {
  const names=[locality.city,locality.countyBase].filter(Boolean).map(n=>`"${cleanQuery(n)}"`).join(' OR ');
  const term=kind==='parcel'?'(title:parcel OR title:parcels OR title:"tax lots")':'(title:zoning OR title:"land use zoning")';
  const xs=points.map(p=>p.lng),ys=points.map(p=>p.lat);
  const result=await read(makeUrl(`${arc}/search`,{f:'json',q:`(${names}) AND ${term} AND (type:"Feature Service" OR type:"Map Service")`,bbox:[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)].join(','),num:'40',sortField:'numviews',sortOrder:'desc'}));
  const candidates=(result.data.results??[]).filter(i=>suitableItem(i,kind,locality));
  candidates.sort((a,b)=>Number(b.contentStatus==='public_authoritative')-Number(a.contentStatus==='public_authoritative') || (b.modified??0)-(a.modified??0));
  const layers=[];
  // A city name in a title is not enough: require authoritative publisher designation
  // or a government-hosted service, and check its organization against this geography.
  for (const item of candidates.slice(0,6)) {
    if (layers.length>=3) break;
    try {
      const url=item.url.replace(/^http:/,'https:').replace(/\/$/,'');
      const governmentHost=new URL(url).hostname.endsWith('.gov') || /\.(?:state\.[a-z]{2}|(?:co|ci)\.[a-z-]+\.[a-z]{2})\.us$/.test(new URL(url).hostname);
      let publisher=plain(item.accessInformation)||'Government GIS publisher';
      if (!governmentHost) {
        if (item.contentStatus!=='public_authoritative' || !item.orgId) continue;
        const org=await read(`${arc}/portals/${encodeURIComponent(item.orgId)}?f=json`);
        publisher=plain(org.data.name);
        const matches=[locality.city,locality.countyBase].filter(Boolean).some(n=>canonical(publisher).includes(canonical(n)));
        if (!matches || !/city|county|town|borough|government|municipal|planning|regional/i.test(publisher)) continue;
      }
      const service=await read(`${url}?f=json`);
      const options=service.data.fields ? [{url,meta:service.data}] : (service.data.layers??[]).filter(l=>!l.subLayerIds?.length).slice(0,8).map(l=>({url:`${url}/${l.id}`}));
      for (const option of options) {
        const meta=option.meta??(await read(`${option.url}?f=json`)).data;
        if(meta.geometryType!=='esriGeometryPolygon'||!Array.isArray(meta.fields))continue;
        const fields=meta.fields.filter(f=>/objectid|parcel|pin\b|apn|account|acct|address|situs|zone|zoning|district|land.?use|current.?use|unit|building|acre|sqft|area|ordinance|effective|chapter|code.?link/i.test(`${f.name} ${f.alias}`)).map(f=>f.name);
        if (!fields.length) continue;
        layers.push({url:option.url,meta,item,publisher,fields});
        if(layers.length>=3)break;
      }
    } catch { /* Try another published candidate; never promote an unverified mirror. */ }
  }
  return layers;
}

function findField(meta, patterns) {
  for(const pattern of patterns) {const f=meta.fields.find(f=>pattern.test(f.name)||pattern.test(f.alias??'')); if(f)return f;}
  return null;
}
function valueOf(meta, attrs, field) {
  if(!field)return null;
  const raw=attrs[field.name];
  if(raw===null||raw===undefined||String(raw).trim()==='')return null;
  return String(field.domain?.codedValues?.find(c=>String(c.code)===String(raw))?.name??raw).slice(0,240);
}
export async function readSpatial(read,layers,geometry,kind) {
  for (const layer of layers) {
    try {
      const response=await queryFeatures(read,layer.url,ringsOf(geometry),layer.fields.join(','));
      const idField=findField(layer.meta,kind==='parcel'?[/^parcel_?(id|num|number)$/i,/^pin$/i,/^apn$/i,/^acct_no$/i,/^(taxlot|taxlot_id|parcelid)$/i,/parcel|account|tax.?lot/i]:[/^zoning$/i,/^zone_code$/i,/^zoning_?code$/i,/^zoning_ztype$/i,/^base_zone$/i,/^zoning_base$/i,/^zone$/i,/^zone_?class$/i,/^district$/i]);
      if(!idField)continue;
      const address=findField(layer.meta,[/^situs_addr$/i,/^address$/i,/^full_?addr(ess)?$/i,/situs|address/i]);
      const description=findField(layer.meta,[/^zone_description$/i,/^zon(?:e|ing)_?desc$/i,/zoning.*description|district.*name/i]);
      const merged=new Map();
      for(const feature of response.data.features) {
        const id=kind==='zoning'?String(feature.attributes[idField.name]??'').trim():valueOf(layer.meta,feature.attributes,idField);
        if(!id||!feature.geometry?.rings)continue;
        const shape=fromRings(feature.geometry.rings), overlap=overlapArea(shape,geometry);
        if(overlap<0.5)continue;
        const existing=merged.get(id);
        const attributes=Object.fromEntries(Object.entries(feature.attributes).filter(([k,v])=>v!==null&&!/owner|mail|phone|email/i.test(k)).map(([k,v])=>[k,String(v).slice(0,240)]));
        merged.set(id,{id,key:digest(`${layer.item.id}:${id}`).slice(0,20),address:valueOf(layer.meta,feature.attributes,address),description:valueOf(layer.meta,feature.attributes,description)??(kind==='zoning'?valueOf(layer.meta,feature.attributes,idField):null),geometry:existing?union([existing.geometry,shape]):shape,attributes});
      }
      const records=[...merged.values()].map(r=>({...r,overlapSquareMeters:overlapArea(r.geometry,geometry),mappedSquareMeters:multiArea(r.geometry)})).sort((a,b)=>b.overlapSquareMeters-a.overlapSquareMeters);
      if(!records.length)continue;
      const evidence=source(kind,plain(layer.item.title),layer.publisher,response,{
        url:`https://www.arcgis.com/home/item.html?id=${layer.item.id}`,queryUrl:response.url,
        layerUrl:layer.url,sourceUpdatedAt:layer.meta.editingInfo?.lastEditDate?new Date(layer.meta.editingInfo.lastEditDate).toISOString():null,
        catalogUpdatedAt:layer.item.modified?new Date(layer.item.modified).toISOString():null,
        attribution:plain(layer.meta.copyrightText||layer.item.accessInformation),license:plain(layer.item.licenseInfo)||'No reuse licence stated in the catalogue; displayed with source attribution.',
        text:JSON.stringify(records.map(({id,address,description,attributes})=>({id,address,description,attributes}))).slice(0,9000),
        kind:'mapped-record',
      });
      return {records,evidence};
    } catch { /* A truncated, invalid, or failed layer is not a verified empty result. */ }
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

export async function municipalCode(read,locality,zones) {
  if(!locality.stateAbbr||locality.boundaryUncertain)return null;
  const clients=(await read(makeUrl(`${muni}/Clients/stateAbbr`,{stateAbbr:locality.stateAbbr}),{ttl:86400000})).data;
  if(!Array.isArray(clients))return null;
  const wanted=canonical(locality.city||locality.county);
  const matches=clients.filter(c=>canonical(c.ClientName)===wanted && c.State?.StateAbbreviation===locality.stateAbbr);
  if(matches.length!==1)return null;
  const client=matches[0];
  const products=(await read(`${muni}/Products/clientId/${client.ClientID}`)).data;
  const selected=products.filter(p=>p.ContentType?.Id==='CODES').sort((a,b)=>Number(/zoning|land development|unified development/i.test(b.ProductName))-Number(/zoning|land development|unified development/i.test(a.ProductName))).slice(0,2);
  const zoneNames=zones.map(z=>cleanQuery(z.id)).filter(Boolean).slice(0,2);
  const searchTerms=zoneNames.length?zoneNames.map(z=>`"${z}" residential`):['residential housing zoning'];
  const allHits=[];
  for(const term of searchTerms) {
    const search=await read(makeUrl('https://library.municode.com/localapi/search',{clientId:String(client.ClientID),searchText:term,contentTypeId:'CODES',mode:'CLIENTMODE',pageNum:'1',pageSize:'20',fragmentSize:'200',sort:'0',isAdvanced:'false',isAutocomplete:'false',titlesOnly:'false'}));
    allHits.push(...(search.data.hits??[]));
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
    const directPaths=new Set();
    for(const zone of zones)for(const value of Object.values(zone.attributes??{})){
      try{const url=new URL(value);const parts=url.pathname.split('/');if(url.hostname==='library.municode.com'&&parts[1]?.toLowerCase()===locality.stateAbbr.toLowerCase()&&canonical(decodeURIComponent(parts[2]))===canonical(client.ClientName)&&canonical(decodeURIComponent(parts[4]??''))===canonical(product.ProductName)&&url.searchParams.has('nodeId'))directPaths.add(url.searchParams.get('nodeId'));}catch{}
    }
    if(directPaths.size)paths=directPaths;
    if(!paths.size)continue;
    // Public TOC lookup supplies exact node identifiers; no invented chapter URL.
    try {
      const tree=(await read(makeUrl(`${muni}/codesToc/fullTree`,{productId:String(product.ProductID),jobId:String(job.Id)}),{maxBytes:5_000_000})).data;
      const walk=node=>{
        const ancestors=directPaths.size?[...directPaths]:productHits.flatMap(h=>(h.ancestors??[]).filter(a=>/chapter/i.test(a.title)).map(a=>a.nodeId));
        const sections=[];
        const inspect=(n,inChapter=false)=>{
          const active=inChapter||ancestors.includes(n.Id);
          const title=n.Heading??n.Title??'';
          if(active && /permitted|prohibited|allowable|use table|land use requirements|development standards|density|height|setbacks|lot coverage/i.test(title))sections.push({id:n.Id,priority:/permitted|prohibited|allowable|use table|land use requirements/i.test(title)?2:1});
          for(const child of n.Children??[])inspect(child,active);
        };inspect(node);
        sections.sort((a,b)=>b.priority-a.priority);
        if(directPaths.size&&sections.length)paths=new Set(sections.slice(0,6).map(s=>s.id));
        else for(const s of sections){if(paths.size<6)paths.add(s.id);}
      };walk(tree);
    } catch { /* Search-derived sections remain available; completeness stays unresolved. */ }
    const responses=await Promise.all([...paths].slice(0,6).map(node=>settle(read(makeUrl(`${muni}/CodesContent`,{productId:String(product.ProductID),jobId:String(job.Id),nodeId:node,groupChunks:'false'})))));
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
      if(result.locality.boundaryUncertain)gap('boundary','This selection crosses a jurisdiction boundary','The selected corners resolve to different city or county identifiers. One authority’s rules cannot be applied to the whole area.','Adjust the area or confirm the relevant planning authority before interpreting the rules.');
      const [parcelLayers,zoningLayers,housing]=await Promise.all([
        settle(discoverLayers(read,result.locality,input.points,'parcel')),
        settle(discoverLayers(read,result.locality,input.points,'zoning')),
        settle(housingContext(read,result.locality)),
      ]);
      if(housing.ok){result.housing={...housing.value};delete result.housing.evidence;result.sources.push(housing.value.evidence);}
      else gap('housing','Local housing estimates were not available','No housing demand or affordable rent has been inferred from the map.','Retry the statistics source or consult the local housing-needs assessment.');
      result.checks.push({name:'Housing context',status:housing.ok?'retrieved':'unavailable'});
      const parcels=parcelLayers.ok?await readSpatial(read,parcelLayers.value,selected,'parcel'):null;
      if(parcels) {
        result.sources.push(parcels.evidence);
        result.parcelCandidates=parcels.records.slice(0,20);
        if(input.parcelKey){result.parcel=parcels.records.find(p=>p.key===input.parcelKey)??null;if(!result.parcel)gap('selection','The previous parcel match is no longer available','Records or the selected area changed.','Choose a parcel from the current results.');}
        else if(parcels.records.length===1)result.parcel=parcels.records[0];
        if(!result.parcel){result.status='needs-parcel';gap('parcel-match','More than one parcel intersects your selection','Select the parcel to research. Their development capacity has not been combined.','Choose a parcel below or adjust the outline.');}
      } else gap('parcel','A reliable parcel match was not found','The public catalogue did not provide a usable, authoritative parcel polygon for this selection. The blue outline remains an exploration area.','Check the outline or obtain the parcel record from the local assessor.');
      result.checks.push({name:'Parcel',status:result.parcel?'retrieved':parcels?'needs-review':'unavailable'});
      const target=result.parcel?.geometry??selected;
      const zoning=zoningLayers.ok?await readSpatial(read,zoningLayers.value,target,'zoning'):null;
      if(zoning){result.zones=zoning.records;result.sources.push(zoning.evidence);}
      else gap('zoning','The applicable zoning district is unresolved','No authoritative zoning polygon could be matched. This does not mean housing is allowed, prohibited, or that the locality has no zoning.','Confirm the land-use designation with the planning authority.');
      result.checks.push({name:'Zoning map',status:zoning?'retrieved':'unavailable'});
      if(result.zones.length>1)gap('split-zoning','More than one zoning district intersects the site','A single district’s rules cannot safely be applied across this site.','Ask the planning authority which provisions apply to the intended housing area.');
      if(zoning){
        const coverage=overlapArea(union(result.zones.map(z=>z.geometry)),target)/multiArea(target);
        result.zoningCoverage=Math.min(1,coverage);
        if(coverage<0.98)gap('zoning-coverage','The zoning map does not cover the whole site','The matched zoning polygons leave part of the mapped site unresolved. A nearby district cannot fill that gap.','Confirm the missing designation or jurisdiction before interpreting the site’s rules.');
        const flags=result.zones.flatMap(z=>Object.entries(z.attributes).filter(([key,value])=>/^(overlay|historic|contract)$/i.test(key)&&String(value).trim()&&!/^(none|no|n|0)$/i.test(String(value).trim())).map(([key,value])=>`${z.id}: ${key.toLowerCase()} ${value}`));
        if(flags.length)gap('map-conditions','The zoning record flags additional conditions',flags.join('; ')+'. The effect of these mapped flags has not been resolved.','Check the related overlay, historic or contract provisions with planning staff.');
      }
      if(result.status!=='needs-parcel') {
        const code=await settle(municipalCode(read,result.locality,result.zones));
        if(code.ok&&code.value){result.code=code.value.evidence.map(e=>e.id);result.sources.push(...code.value.evidence);}
      }
      result.checks.push({name:'Published code',status:result.code.length?'retrieved':'unavailable'});
      if(!result.code.length)gap('code','The governing provisions have not been retrieved','The connected code publisher did not return usable provisions for this jurisdiction and district. A zoning label alone does not establish permission.','Review the authority’s published code before deciding which housing route to explore.');
      else gap('applicability','Confirm the approval route and site-specific conditions','The retrieved sections are candidates for this district. Uncodified amendments, special overlays and exceptions have not been exhaustively checked.','Confirm the applicable sections and approvals with the local planning authority.');
      gap('capacity','A reliable home count needs more site evidence','Access, lot-edge classification, existing development, easements, environmental constraints and service capacity have not all been established.','Use a site plan and the relevant records to resolve these checks before calculating capacity.');
      gap('affordability','Affordable delivery is not established by zoning','Ownership/control, intended affordability commitments and funding have not been verified.','Explore an appropriate housing partnership and affordability conditions using the church’s stated priorities.');
      result.checks.push({name:'Environmental, access and title checks',status:'not-established'});
      if(result.code.length&&result.parcel&&!result.locality.boundaryUncertain&&result.zones.length===1&&result.zoningCoverage>=0.98)result.status='preliminary';
      const gapOrder=['boundary','parcel-match','selection','parcel','zoning','zoning-coverage','split-zoning','map-conditions','code','applicability','capacity','housing','affordability'];
      result.gaps.sort((a,b)=>gapOrder.indexOf(a.id)-gapOrder.indexOf(b.id));
      result.caseId=digest({key,sources:result.sources.map(s=>s.hash)}).slice(0,20);
      return result;
    })();
    pending.set(key,task);
    try{const value=await task;cache.set(key,{time:now(),value});if(cache.size>32)cache.delete(cache.keys().next().value);return structuredClone(value);}finally{pending.delete(key);}
  };
}
