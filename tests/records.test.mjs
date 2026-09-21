import test from 'node:test';
import assert from 'node:assert/strict';
import {createEvidenceClient,isSourceUrl,queryFeatures} from '../scripts/evidence-client.mjs';
import {fromRings,multiArea,overlapArea} from '../scripts/site-geometry.mjs';
import {suitableItem,discoverLayers,readSpatial,housingContext,municipalCode,createRecordsService} from '../scripts/records.mjs';
const square=(x,y,w=.001)=>[[x,y],[x+w,y],[x+w,y+w],[x,y+w],[x,y]];
const envelope=data=>({data,url:'https://example.gov/record',retrievedAt:'2026-09-21T00:00:00Z',hash:'fixture'});
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
 const locality={city:'Example',countyBase:'Sample'};const item={title:'Example Parcels',url:'https://example.gov/FeatureServer',description:'Example'};
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
test('multiple parcels require a choice, and incomplete zoning coverage cannot become a preliminary assessment',async()=>{
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
 const service=createRecordsService({fetchImpl});const first=await service({points});assert.equal(first.status,'needs-parcel');assert.equal(first.parcel,null);assert.equal(first.parcelCandidates.length,2);assert.equal(first.gaps[0].id,'parcel-match');
 const chosen=await service({points,parcelKey:first.parcelCandidates.find(p=>p.id==='A').key});assert.equal(chosen.parcel.id,'A');assert.equal(chosen.status,'partial');assert.ok(chosen.zoningCoverage<.3);assert.ok(chosen.gaps.some(g=>g.id==='zoning-coverage'));
});
