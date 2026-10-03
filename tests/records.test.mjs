import test from 'node:test';
import assert from 'node:assert/strict';
import {createEvidenceClient,isSourceUrl,queryFeatures} from '../scripts/evidence-client.mjs';
import {planningContext} from '../scripts/planning-context.mjs';
import {municipalClient} from '../scripts/planning-context.mjs';
import {jurisdictionFromGeographies,sameJurisdiction} from '../scripts/jurisdiction.mjs';
import {fromRings,multiArea,overlapArea} from '../scripts/site-geometry.mjs';
import {locate,suitableItem,discoverLayers,readSpatial,housingContext,municipalCode,createRecordsService,provisionPaths,provisionRank} from '../scripts/records.mjs';
const square=(x,y,w=.001)=>[[x,y],[x+w,y],[x+w,y+w],[x,y+w],[x,y]];
const envelope=data=>({data,url:'https://example.gov/record',retrievedAt:'2026-09-21T00:00:00Z',hash:'fixture'});

test('metadata geometry expressions cannot break a parcel query; genuine area fields and returned boundaries remain',async()=>{
 const fields=['PARCEL_ID','TOTAL_LAND_AREA','SHAPE_Area','SHAPE.STArea()','Shape.STLength()'];
 const layer={url:'https://example.gov/MapServer/0',item:{id:'fixture',title:'Parcels'},publisher:'Example authority',fields,meta:{fields:fields.map(name=>({name}))}};
 const result=await readSpatial(async target=>{
  const query=new URL(target).searchParams;assert.equal(query.get('outFields'),'PARCEL_ID,TOTAL_LAND_AREA');assert.equal(query.get('returnGeometry'),'true');
  return envelope({features:[{attributes:{PARCEL_ID:'A',TOTAL_LAND_AREA:100},geometry:{rings:[square(-95,29)]}}]});
 },[layer],fromRings([square(-95,29)]),'parcel');
 assert.equal(result.records[0].id,'A');assert.equal(result.records[0].attributes.TOTAL_LAND_AREA,'100');assert.ok(result.records[0].geometry.length);assert.ok(result.records[0].mappedSquareMeters>0);
});

test('an HTTP-success ArcGIS query rejection is not mislabeled as a timeout or a successful empty search',async()=>{
 const read=createEvidenceClient({fetchImpl:async()=>Response.json({error:{code:400,message:'private upstream diagnostic'}})});
 const layer={url:'https://example.gov/MapServer/0',item:{id:'fixture'},fields:['PARCEL_ID'],meta:{fields:[{name:'PARCEL_ID'}]}};
 const diagnostics={};assert.equal(await readSpatial(read,[layer],fromRings([square(-95,29)]),'parcel',diagnostics),null);
 assert.equal(diagnostics.completedQueries,0);assert.equal(diagnostics.failedQueries,1);assert.deepEqual(diagnostics.failures,['Source query rejected (code 400)']);
});

test('parcel requests omit private aliases and discard unsolicited personal attributes before creating evidence',async()=>{
 const layer={url:'https://example.gov/FeatureServer/0',item:{id:'privacy-fixture',title:'Example parcels'},publisher:'Example authority',fields:['PARCEL_ID','PROP_DATA'],meta:{fields:[{name:'PARCEL_ID'},{name:'PROP_DATA',alias:'Owner Name'}]}};
 const found=await readSpatial(async target=>{
  assert.equal(new URL(target).searchParams.get('outFields'),'PARCEL_ID');
  return envelope({features:[{attributes:{PARCEL_ID:'A',PROP_DATA:'Synthetic owner',UNREQUESTED:'Synthetic private detail'},geometry:{rings:[square(-95,29)]}}]});
 },[layer],fromRings([square(-95,29)]),'parcel');
 assert.equal(found.records[0].id,'A');assert.deepEqual(found.records[0].attributes,{PARCEL_ID:'A'});assert.ok(!found.evidence.text.includes('Synthetic'));
});

test('active towns govern discovery; statistical divisions never become municipal governments',async()=>{
 const geography={States:[{NAME:'New York',STUSAB:'NY',STATE:'36'}],Counties:[{NAME:'Ulster County',BASENAME:'Ulster',GEOID:'36111',FUNCSTAT:'A'}],'County Subdivisions':[{NAME:'Woodstock town',BASENAME:'Woodstock',GEOID:'3611183052',FUNCSTAT:'A'}]};
 const town=jurisdictionFromGeographies(geography);assert.equal(town.authority.type,'county-subdivision');assert.equal(town.cityId,null);
 const read=async()=>envelope([{ClientID:1,ClientName:'Town of Woodstock',State:{StateAbbreviation:'NY'}},{ClientID:2,ClientName:'Ulster County',State:{StateAbbreviation:'NY'}}]);
 assert.equal((await municipalClient(read,town)).ClientID,1);
 geography['County Subdivisions'][0].FUNCSTAT='S';const statistical=jurisdictionFromGeographies(geography);assert.equal(statistical.authority.name,'Ulster County');
 geography.Counties[0].FUNCSTAT='S';const unorganized=jurisdictionFromGeographies(geography);assert.equal(unorganized.authority,null);assert.equal(unorganized.authorityUnresolved,true);
 assert.equal(await municipalClient(()=>{throw new Error('Must not infer government');},unorganized),null);
 assert.equal(sameJurisdiction(town,{...town,subdivisionId:'different'}),false);
});

test('statewide sources are discoverable and non-planning zones are never zoning evidence',()=>{
 const local={state:'Hawaii',countyBase:'Hawaii'};const base={url:'https://geodata.hawaii.gov/FeatureServer',description:'Hawaii'};
 assert.equal(suitableItem({...base,title:'Parcels - Hawaii Statewide'},'parcel',local),true);
 assert.equal(suitableItem({...base,title:'County Zoning'},'zoning',local),true);
 for(const title of ['Enterprise Zones','Tsunami Evacuation - All Zones','Moisture Zones','Foreign Trade Zone','Flood Zones','Zoning Index'])assert.equal(suitableItem({...base,title},'zoning',local),false,title);
 for(const title of ['Parcel Viewer Basemap','PLSS Cadastral Reference','Cadastral Public Land Survey'])assert.equal(suitableItem({...base,title},'parcel',local),false,title);
});

test('regional discovery retains local search, follows pagination and returns bounded diagnostics',async()=>{
 const calls=[];const layers=await discoverLayers(async target=>{const u=new URL(target);calls.push(u);
  if(u.pathname.endsWith('/search'))return envelope({nextStart:u.searchParams.get('start')==='1'?61:-1,results:u.searchParams.get('start')==='61'?[{id:'late',title:'Example Parcels',url:'https://example.gov/FeatureServer/0'}]:[]});
  if(u.pathname.includes('/content/'))return envelope({});
  return envelope({geometryType:'esriGeometryPolygon',fields:[{name:'PARCEL_ID'}]});
 },{city:'Example',state:'Washington'},[{lat:29,lng:-95}],'parcel','','regional');
 assert.equal(layers.length,1);assert.ok(calls[0].searchParams.get('q').includes('Example'));assert.ok(calls.some(u=>u.searchParams.get('start')==='61'));assert.equal(layers.diagnostics.searches,3);
});

test('a failed catalogue search does not discard a registered public source',async()=>{
 const layers=await discoverLayers(async target=>{
  if(target.includes('/search?'))throw new Error('offline');
  if(target.includes('/content/items/'))return envelope({id:'fixture',title:'New Jersey Parcels',url:'https://example.gov/FeatureServer/0'});
  return envelope({geometryType:'esriGeometryPolygon',fields:[{name:'PAMS_PIN'}]});
 },{state:'New Jersey',stateId:'34'},[{lat:40,lng:-74}],'parcel');
 assert.equal(layers.length,1);assert.equal(layers.diagnostics.failedSearches,2);
});

test('deep service layers and tax map keys survive discovery without requesting owner fields',async()=>{
 const layers=await discoverLayers(async target=>{
  if(target.includes('/search?'))return envelope({results:[{title:'Example Parcels',url:'https://example.gov/MapServer'}]});
  if(target.endsWith('/MapServer?f=json'))return envelope({layers:[...Array.from({length:30},(_,id)=>({id,name:'Road centerline'})),{id:97,name:'Tax parcels'}]});
  if(target.includes('/97?'))return envelope({geometryType:'esriGeometryPolygon',fields:[{name:'TMK_txt'},{name:'OWNER_NAME'}]});
  return envelope({geometryType:'esriGeometryPolyline',fields:[]});
 },{city:'Example'},[{lat:29,lng:-95}],'parcel');
 assert.equal(layers.length,1);assert.match(layers[0].url,/\/97$/);assert.equal(layers[0].identifierField,'TMK_txt');assert.ok(!layers[0].fields.includes('OWNER_NAME'));
});
test('source client blocks arbitrary targets and redirects, bounds bodies, caches successful responses only',async()=>{
 for(const url of ['http://example.gov','https://127.0.0.1','https://example.gov.evil.com','https://user:password@example.gov','https://example.gov:8080'])assert.equal(isSourceUrl(url),false);
 let calls=0,time=0;const read=createEvidenceClient({now:()=>time,fetchImpl:async(_u,o)=>{calls++;assert.equal(o.redirect,'error');return new Response('{"ok":true}');}});
 await Promise.all([read('https://example.gov/one'),read('https://example.gov/one')]);assert.equal(calls,1);
 time=900001;await read('https://example.gov/one');assert.equal(calls,2);
 await assert.rejects(read('https://example.gov/oversize',{maxBytes:2}));
 await assert.rejects(read('https://evil.example'));assert.equal(calls,3);
 const failed=createEvidenceClient({fetchImpl:async()=>{calls++;return new Response('error',{status:503});}});
 await assert.rejects(failed('https://example.gov/error'));await assert.rejects(failed('https://example.gov/error'));assert.equal(calls,5);
});
test('polygon area respects holes and disjoint parcels; bounding-box overlap is insufficient',()=>{
 const outer=square(-95,29,.004),hole=square(-94.999,29.001,.001),other=square(-94.99,29,.001);
 const multi=fromRings([hole,other,outer]);assert.equal(multi.length,2);
 assert.ok(Math.abs(multiArea(multi)-(multiArea(fromRings([outer]))-multiArea(fromRings([hole]))+multiArea(fromRings([other]))))<.001);
 assert.equal(overlapArea(multi,fromRings([square(-94.9989,29.0011,.0001)])),0);
 assert.throws(()=>fromRings([[[Infinity,0],[1,0],[1,1],[Infinity,0]]]));
});
test('catalogue does not promote historic, specialized, or wrong-geography parcel datasets',()=>{
 const locality={city:'Example',countyBase:'Sample'};const item={title:'Example Parcels',url:'https://records.gov/FeatureServer',description:'Example'};
 assert.equal(suitableItem(item,'parcel',locality),true);
 for(const title of ['Example Parcels 2018','Example Farmland Preservation Parcels','Example Parcel centroids','Unrelated Parcels'])assert.equal(suitableItem({...item,title,description:''},'parcel',locality),false);
});
test('spatial lookup preserves multiple matches, ignores nearby polygons and never uses ZONING_ID as a district',async()=>{
 const geometry=fromRings([square(-95,29,.002)]);const layer={url:'https://example.gov/FeatureServer/0',item:{id:'fixture',title:'Zoning'},publisher:'Example City',fields:['ZONING_ID','ZONING_ZTYPE'],meta:{fields:[{name:'ZONING_ID'},{name:'ZONING_ZTYPE'}]}};
 const result=await readSpatial(async()=>envelope({features:[{attributes:{ZONING_ID:123,ZONING_ZTYPE:'R'},geometry:{rings:[square(-95,29)]}},{attributes:{ZONING_ID:456,ZONING_ZTYPE:'C'},geometry:{rings:[square(-94.999,29)]}},{attributes:{ZONING_ID:999,ZONING_ZTYPE:'X'},geometry:{rings:[square(-94,29)]}}]}),[layer],geometry,'zoning');
 assert.deepEqual(result.records.map(r=>r.id).sort(),['C','R']);
 await assert.rejects(queryFeatures(async()=>envelope({features:[],exceededTransferLimit:true}),layer.url,[]));
});
test('housing calculation excludes uncomputed ratios and refuses suppressed estimates',async()=>{
 const estimates={B25070001:110,B25070011:10,B25070007:10,B25070008:10,B25070009:10,B25070010:20};
 const data={release:{id:'acs2024_5yr'},data:{'16000US123':{B25070:{estimate:estimates,error:{}},B25064:{estimate:{B25064001:1000},error:{B25064001:50}}}},geography:{'16000US123':{name:'Example City'}}};
 const h=await housingContext(async()=>envelope(data),{cityId:'123'});assert.equal(h.percent,50);assert.equal(h.denominator,100);assert.equal(h.medianRentMargin,50);
 estimates.B25070007=null;await assert.rejects(housingContext(async()=>envelope(data),{cityId:'123'}));
});
test('municipal retrieval uses actual provisions, rejects unrelated search hits and never substitutes another city',async()=>{
 const calls=[];const read=async url=>{calls.push(url);const u=new URL(url);
  if(u.pathname.includes('Clients'))return envelope([{ClientID:1,ClientName:'Example',State:{StateAbbreviation:'WA'}}]);
  if(u.pathname.includes('Products'))return envelope([{ProductID:2,ProductName:'Municipal Code',ContentType:{Id:'CODES'}}]);
  if(u.pathname.includes('search'))return envelope({hits:[{nodeId:'bad',title:'False alarm permitted fees',product:{id:2},ancestors:[{title:'Public Safety'}]},{nodeId:'good',title:'Permitted uses',product:{id:2},ancestors:[{title:'Zoning'}],contentFragment:'Invented permission from a search snippet'}]});
  if(u.pathname.includes('Jobs'))return envelope({Id:3,ProductId:2,BannerText:'Codified through 2026'});
  if(u.pathname.includes('fullTree'))return envelope({Id:'root',Children:[]});
  if(u.pathname.includes('CodesContent')){assert.equal(u.searchParams.get('nodeId'),'good');return envelope({Docs:[{Id:'good',DocType:1,Title:'Permitted uses',Content:'<p>Residential uses require approval under the conditions of this section.</p>'}]});}
  throw new Error('Unexpected source');};
 const local={city:'Example',stateAbbr:'WA'};const r=await municipalCode(read,local,[{id:'R'}]);assert.equal(r.evidence.length,1);assert.match(r.evidence[0].text,/require approval/);assert.doesNotMatch(r.evidence[0].text,/Invented permission/);
 assert.equal(await municipalCode(read,{...local,city:'Different'},[{id:'R'}]),null);
});
test('jurisdiction outage produces an explicit gap, never invented local rules',async()=>{
 const service=createRecordsService({fetchImpl:async()=>new Response('offline',{status:503})});
 const r=await service({points:[{lat:1,lng:1},{lat:1,lng:1.001},{lat:.999,lng:1.001},{lat:.999,lng:1}]});
 assert.equal(r.status,'unavailable');assert.deepEqual(r.code,[]);assert.equal(r.capacity,null);assert.equal(r.gaps[0].id,'jurisdiction');
});
test('a matching city name does not authorize an unofficial ArcGIS mirror',async()=>{
 let calls=0;const result=await discoverLayers(async()=>{calls++;return envelope({results:[{title:'Example Parcels',description:'Example',url:'https://services.arcgis.com/unverified/FeatureServer',contentStatus:'',orgId:'unknown'}]});},{city:'Example',countyBase:'Sample'},[{lat:29,lng:-95},{lat:29.001,lng:-94.999}],'parcel');
 assert.deepEqual(result,[]);assert.equal(calls,1);
});
test('direct published chapter links are resolved to actual child provisions',async()=>{
 const read=async url=>{const u=new URL(url);
  if(u.pathname.includes('Clients'))return envelope([{ClientID:1,ClientName:'Example',State:{StateAbbreviation:'WA'}}]);
  if(u.pathname.includes('Products'))return envelope([{ProductID:2,ProductName:'Municipal Code',ContentType:{Id:'CODES'}}]);
  if(u.pathname.includes('search'))return envelope({hits:[]});
  if(u.pathname.includes('Jobs'))return envelope({Id:3,ProductId:2});
  if(u.pathname.includes('fullTree'))return envelope({Id:'root',Children:[{Id:'chapter',Heading:'Residential',Children:[{Id:'uses',Heading:'Permitted uses',Children:[]}]}]});
  if(u.pathname.includes('CodesContent')){assert.equal(u.searchParams.get('nodeId'),'uses');return envelope({Docs:[{Id:'uses',DocType:1,Title:'Permitted uses',Content:'<p>Residential uses require approval under the conditions of this section.</p>'}]});}
  throw new Error('Unexpected');};
 const r=await municipalCode(read,{city:'Example',stateAbbr:'WA'},[{id:'R',attributes:{CHAPTER_LINK:'https://library.municode.com/wa/example/codes/municipal_code?nodeId=chapter'}}]);assert.equal(r.evidence.length,1);assert.match(r.evidence[0].text,/require approval/);
});
test('adjacent parcels form one study, and incomplete zoning coverage cannot become a preliminary assessment',async()=>{
 const points=[{lng:-95,lat:29},{lng:-94.998,lat:29},{lng:-94.998,lat:29.001},{lng:-95,lat:29.001}];
 const fetchImpl=async url=>{const u=new URL(url);let data;
  if(u.hostname==='geocoding.geo.census.gov')data={result:{geographies:{States:[{NAME:'Washington',STUSAB:'WA',STATE:'53'}],Counties:[{NAME:'Sample County',BASENAME:'Sample',GEOID:'53123'}],'Incorporated Places':[{BASENAME:'Example',GEOID:'5312345'}]}}};
  else if(u.hostname==='api.censusreporter.org')return new Response('unavailable',{status:503});
  else if(u.pathname.endsWith('/search')){const kind=u.searchParams.get('q').includes('title:parcel')?'parcel':'zoning';data={results:[{id:kind,title:`Example ${kind==='parcel'?'Parcels':'Zoning'}`,url:`https://example.gov/${kind}/FeatureServer/0`}]};}
  else if(u.hostname==='example.gov'){
   const parcel=u.pathname.includes('/parcel/');
   if(u.pathname.endsWith('/query'))data={features:parcel?[{attributes:{PARCEL_ID:'A'},geometry:{rings:[square(-95,29)]}},{attributes:{PARCEL_ID:'B'},geometry:{rings:[square(-94.999,29)]}}]:[{attributes:{ZONING:'R'},geometry:{rings:[square(-95,29,.0005)]}}]};
   else data={geometryType:'esriGeometryPolygon',fields:[{name:parcel?'PARCEL_ID':'ZONING'}]};
  }else if(u.pathname.includes('Clients'))data=[];
  else throw new Error('Unexpected fixture request');
  return new Response(JSON.stringify(data));};
 const service=createRecordsService({fetchImpl});const first=await service({points});assert.equal(first.status,'partial');assert.equal(first.parcel.members.length,2);assert.equal(first.parcelCandidates.length,2);assert.equal(first.parcel.controlStatus,'unverified');
 const chosen=await service({points,parcelKey:first.parcelCandidates.find(p=>p.id==='A').key});assert.equal(chosen.parcel.members.length,2);assert.equal(chosen.status,'partial');assert.ok(chosen.zoningCoverage<.3);assert.ok(chosen.gaps.some(g=>g.id==='zoning-coverage'));
});

test('verified non-government-domain services are restricted to their verified endpoints',()=>{
 assert.equal(isSourceUrl('https://arcweb.hcad.org/server/rest/services/public/public_query/MapServer/0/query'),true);
 assert.equal(isSourceUrl('https://www.gis.hctx.net/arcgis/rest/services/HCAD/Parcels/MapServer/0'),true);
 for(const url of ['https://arcweb.hcad.org/unknown','https://www.gis.hctx.net/private','https://arcweb.hcad.org.evil.com/server/rest/services/public/public_query/MapServer','https://unverified.org/MapServer'])assert.equal(isSourceUrl(url),false);
});
test('full catalogue metadata resolves a legitimate publisher omitted by search summaries',async()=>{
 const calls=[];const layers=await discoverLayers(async url=>{calls.push(url);
  if(url.includes('/search?'))return envelope({results:[{id:'abc',title:'Example Parcels',url:'https://services.arcgis.com/example/FeatureServer'}]});
  if(url.includes('/content/items/'))return envelope({id:'abc',orgId:'org',contentStatus:'public_authoritative'});
  if(url.includes('/portals/'))return envelope({name:'City of Example'});
  return envelope({geometryType:'esriGeometryPolygon',fields:[{name:'PARCEL_ID'}]});
 },{city:'Example'},[{lat:29,lng:-95}],'parcel');
 assert.equal(layers.length,1);assert.ok(calls.some(url=>url.includes('/content/items/abc')));
});
test('parcel identifiers are distinguished from parcel type and queries recover from a failed provider',async()=>{
 const base={item:{id:'fixture',title:'Parcel records'},publisher:'Public assessor',fields:['parcel_type','HCAD_NUM'],meta:{fields:[{name:'parcel_type'},{name:'HCAD_NUM'}]}};
 const diagnostics={};const result=await readSpatial(async url=>{
  if(url.includes('offline'))throw new Error('offline');
  return envelope({features:[{attributes:{parcel_type:'Real',HCAD_NUM:'000123'},geometry:{rings:[square(-95,29)]}}]});
 },[{...base,url:'https://example.gov/offline'},{...base,url:'https://example.gov/working'}],fromRings([square(-95,29)]),'parcel',diagnostics);
 assert.equal(result.records[0].id,'000123');assert.equal(diagnostics.failedQueries,1);assert.equal(diagnostics.completedQueries,1);
 const failed={};assert.equal(await readSpatial(async()=>{throw new Error('offline');},[{...base,url:'https://example.gov/offline'}],fromRings([square(-95,29)]),'parcel',failed),null);assert.equal(failed.completedQueries,0);assert.equal(failed.failedQueries,1);
});
test('official planning navigation establishes no-zoning only from an explicit statement naming this municipality',async()=>{
 const mock=city=>async url=>{
  if(url.includes('/Clients/'))return envelope([{ClientID:1,ClientName:'Example',State:{StateAbbreviation:'WA'},Website:'https://example.gov'}]);
  if(new URL(url).pathname==='/')return {...envelope('<a href="/departments">Departments</a>'),url};
  if(url.endsWith('/departments'))return {...envelope('<a href="/planning">Planning</a>'),url};
  return {...envelope(`<main><p>The City of ${city} does not have zoning. Development regulations still apply.</p><a href="https://library.municode.com/wa/example/codes/code?nodeId=chapter">Chapter 1 development standards</a></main>`),url};
 };
 const locality={city:'Example',stateAbbr:'WA'};
 const found=await planningContext(mock('Example'),locality);assert.equal(found.type,'no-zoning');assert.match(found.sources[0].statement,/Example/);assert.equal(found.codeLinks.length,1);
 assert.equal((await planningContext(mock('Another'),locality)).type,'unresolved');
});
test('chapter links into sections resolve via the TOC and exclude parking enforcement',()=>{
 const tree={Id:'root',Children:[{Id:'dev',Heading:'Chapter 10 Development',Children:[{Id:'survey',Heading:'Application survey'},{Id:'lots',Heading:'Minimum lot size'},{Id:'line',Heading:'Building line requirement'},{Id:'plat',Heading:'Development plat required'}]},{Id:'parking',Heading:'Chapter 20 Parking',Children:[{Id:'tickets',Heading:'Prohibited activities'},{Id:'meters',Heading:'Designation of metered public off-street parking zones'},{Id:'spaces',Heading:'Parking spaces for certain types of use classifications'}]}]};
 const paths=provisionPaths(tree,[{id:'survey',label:'Chapter 10 Development'},{id:'parking',label:'Chapter 20 Parking'}]);
 for(const id of ['lots','line','plat','spaces'])assert.ok(paths.includes(id));for(const id of ['tickets','meters'])assert.ok(!paths.includes(id));
 assert.equal(provisionRank('Parking for rental goods prohibited'),0);
});

test('property-ID aliases are requested and full situs addresses take precedence over street numbers',async()=>{
 const meta={geometryType:'esriGeometryPolygon',fields:[{name:'PROP_ID',alias:'Property ID'},{name:'situs_num',alias:'Situs Number'},{name:'situs_address',alias:'Situs Address'}]};
 const layers=await discoverLayers(async url=>url.includes('/search?')?envelope({results:[{title:'Example Parcels',url:'https://example.gov/FeatureServer/0'}]}):envelope(meta),{city:'Example'},[{lat:29,lng:-95}],'parcel');
 assert.ok(layers[0].fields.includes('PROP_ID'));
 const record=await readSpatial(async()=>envelope({features:[{attributes:{PROP_ID:123,situs_num:'50',situs_address:'50 Example Street'},geometry:{rings:[square(-95,29)]}}]}),layers,fromRings([square(-95,29)]),'parcel');
 assert.equal(record.records[0].id,'123');assert.equal(record.records[0].address,'50 Example Street');
});

test('one failed corner lookup preserves the center locality while flagging jurisdiction uncertainty',async()=>{
 let calls=0;const result=await locate(async()=>{if(calls++===1)throw new Error('temporary source outage');return envelope({result:{geographies:{States:[{NAME:'Washington',STUSAB:'WA',STATE:'53'}],Counties:[{NAME:'Sample County',BASENAME:'Sample',GEOID:'53123'}],'Incorporated Places':[{BASENAME:'Example',GEOID:'5312345'}]}}});},[{lat:29,lng:-95},{lat:29.001,lng:-95},{lat:29.001,lng:-94.999},{lat:29,lng:-94.999}]);
 assert.equal(result.locality.city,'Example');assert.equal(result.locality.boundaryUncertain,true);
});

test('parcel identifiers include BBL and PAMS_PIN; county boundaries cannot consume parcel source slots',async()=>{
 for(const field of ['BBL','PAMS_PIN']){
  const meta={geometryType:'esriGeometryPolygon',fields:[{name:field},{name:'PROP_LOC'}]};
  const layers=await discoverLayers(async u=>u.includes('/search?')?envelope({results:[{title:'Example Parcels',url:'https://example.gov/FeatureServer'}]}):u.endsWith('/FeatureServer?f=json')?envelope({layers:[{id:0},{id:1}]}):envelope(u.includes('/0?')?{geometryType:'esriGeometryPolygon',fields:[{name:'COUNTY_NAME'},{name:'OBJECTID'}]}:meta),{city:'Example'},[{lat:29,lng:-95}],'parcel');
  assert.equal(layers.length,1);assert.ok(layers[0].url.endsWith('/1'));assert.ok(layers[0].fields.includes(field));assert.ok(layers[0].fields.includes('PROP_LOC'));
  const result=await readSpatial(async()=>envelope({features:[{attributes:{[field]:'verified-id',PROP_LOC:'A mapped address'},geometry:{rings:[square(-95,29)]}}]}),layers,fromRings([square(-95,29)]),'parcel');assert.equal(result.records[0].id,'verified-id');assert.equal(result.records[0].address,'A mapped address');
 }
 assert.equal(suitableItem({title:'Parcel Groups (35 Acres and Above) in Example',url:'https://example.gov/FeatureServer'},'parcel',{city:'Example'}),false);
});
